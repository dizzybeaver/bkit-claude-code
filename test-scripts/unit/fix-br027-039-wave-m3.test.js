/**
 * fix-br027-039-wave M3 — br028 archive parent-doc fallback.
 *
 * Scope note (2026-10-08): the L2 scope gate flagged scripts/pdca-archive.js
 * mid-flight; only the discoverDocs() parent-fallback change landed (verified
 * on disk). The br028 CLI plumbing (--parent arg parse, run() call sites,
 * dry-run parentUsed output) and the br039/br384 helpers (shouldAutoTransition,
 * hasCheckEvidence in pdca-skill-stop.js) are NOT yet in the tree, so their
 * suites are intentionally absent from this file — tests asserting
 * non-existent exports would ship guaranteed-red.
 *
 * Covered here (subprocess-isolated, mirroring the br025 regression pattern —
 * findAllDocs pins PROJECT_DIR at require time, so each probe runs as its own
 * node -e child with CLAUDE_PROJECT_DIR pointed at a throwaway tmpdir):
 *   T1  child with no own docs + parent with all three → found via parent,
 *       missing empty, parentUsed lists plan/design/report.
 *   T2  child's own doc beats the parent's for that phase (parentUsed only
 *       carries the phases actually satisfied by fallback).
 *   T3  no parent arg → legacy behavior: all three phases missing.
 *   T4  parent missing too → phase still counts as missing (fail closed).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(ROOT, 'scripts', 'pdca-archive.js');

const DOC_FILES = {
  plan: 'docs/01-plan/features',
  design: 'docs/02-design/features',
  report: 'docs/04-report/features',
};

function seedDoc(tmp, feature, phase) {
  const dir = path.join(tmp, DOC_FILES[phase]);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${feature}.${phase}.md`);
  fs.writeFileSync(file, `# ${feature} ${phase}\n`);
  return file;
}

/** Run discoverDocs(feature, parent) in a child process with tmp as the project root. */
function probe(tmp, feature, parent) {
  const script = [
    `const { discoverDocs } = require(${JSON.stringify(CLI)});`,
    `console.log(JSON.stringify(discoverDocs(${JSON.stringify(feature)}, ${JSON.stringify(parent)})));`,
  ].join('\n');
  const out = execFileSync('node', ['-e', script], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    cwd: tmp,
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
}

describe('br028: archive discoverDocs parent-doc fallback', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br028-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('T1 child with no own docs falls back to parent docs for all required phases', () => {
    for (const phase of ['plan', 'design', 'report']) seedDoc(tmp, 'parent-feat', phase);
    const r = probe(tmp, 'child-feat', 'parent-feat');
    expect(r.missing).toEqual([]);
    expect(r.parentUsed.sort()).toEqual(['design', 'plan', 'report']);
    expect(r.found).toHaveLength(3);
    for (const d of r.found) expect(d.src).toContain('parent-feat');
  });

  test('T2 own docs win; parentUsed only lists phases satisfied by fallback', () => {
    for (const phase of ['plan', 'design', 'report']) seedDoc(tmp, 'parent-feat', phase);
    const ownPlan = seedDoc(tmp, 'child-feat', 'plan');
    const r = probe(tmp, 'child-feat', 'parent-feat');
    expect(r.missing).toEqual([]);
    expect(r.parentUsed.sort()).toEqual(['design', 'report']);
    const planEntry = r.found.find((d) => d.phase === 'plan');
    expect(planEntry.src).toBe(ownPlan);
  });

  test('T3 no parent arg keeps legacy single-feature behavior (all missing)', () => {
    const r = probe(tmp, 'lone-feat', null);
    expect(r.missing.sort()).toEqual(['design', 'plan', 'report']);
    expect(r.parentUsed).toEqual([]);
    expect(r.found).toEqual([]);
  });

  test('T4 parent supplied but parent docs absent -> phase stays missing (fail closed)', () => {
    seedDoc(tmp, 'child-feat', 'plan');
    const r = probe(tmp, 'child-feat', 'ghost-parent');
    expect(r.missing.sort()).toEqual(['design', 'report']);
    expect(r.parentUsed).toEqual([]);
    expect(r.found.map((d) => d.phase)).toEqual(['plan']);
  });
});

describe('br039: shouldAutoTransition session-ownership guard', () => {
  const { shouldAutoTransition, OWNER_LEASE_MS } =
    require(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'));
  const NOW = Date.parse('2026-10-08T12:00:00.000Z');

  test('matching owner session -> allowed', () => {
    const entry = { ownerSession: 'sess-A', ownerSince: new Date(NOW - 1000).toISOString() };
    expect(shouldAutoTransition(entry, 'sess-A', NOW))
      .toEqual({ allowed: true, reason: 'owner' });
  });

  test('foreign live owner -> blocked as foreign-session', () => {
    const entry = { ownerSession: 'sess-B', ownerSince: new Date(NOW - 1000).toISOString() };
    expect(shouldAutoTransition(entry, 'sess-A', NOW))
      .toEqual({ allowed: false, reason: 'foreign-session' });
  });

  test('no ownerSession (legacy entry) -> withheld (br143 fail-closed)', () => {
    // br143 (operator ruling 2026-10-18) superseded the pre-br143 allow this
    // test used to record as "old behavior": unowned/legacy entries are a
    // PERMANENT withhold (no adopt-on-fire, no backfill), and a missing entry
    // is withheld as no-activity. See lib/pdca/session-activity-gate.js.
    expect(shouldAutoTransition({ phase: 'design' }, 'sess-A', NOW))
      .toEqual({ allowed: false, reason: 'unowned' });
    expect(shouldAutoTransition(null, 'sess-A', NOW))
      .toEqual({ allowed: false, reason: 'no-activity' });
  });

  test('foreign owner but lease expired -> blocked as lease-expired (>2h)', () => {
    const entry = {
      ownerSession: 'sess-B',
      ownerSince: new Date(NOW - OWNER_LEASE_MS - 1).toISOString(),
    };
    expect(shouldAutoTransition(entry, 'sess-A', NOW))
      .toEqual({ allowed: false, reason: 'lease-expired' });
  });

  test('lease exactly at boundary (not yet >2h) stays foreign-session', () => {
    const entry = {
      ownerSession: 'sess-B',
      ownerSince: new Date(NOW - OWNER_LEASE_MS).toISOString(),
    };
    expect(shouldAutoTransition(entry, 'sess-A', NOW).reason).toBe('foreign-session');
  });
});

describe('br384: hasCheckEvidence completion-evidence gate', () => {
  const { hasCheckEvidence } =
    require(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'));

  test('numeric matchRate in registry entry -> true', () => {
    expect(hasCheckEvidence('any-feat', { matchRate: 95 })).toBe(true);
    expect(hasCheckEvidence('any-feat', { matchRate: 0 })).toBe(true);
  });

  test('no matchRate + no analysis doc -> false (fail closed)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br384-'));
    try {
      expect(hasCheckEvidence('no-evidence-feat', { matchRate: null }, tmp)).toBe(false);
      expect(hasCheckEvidence('no-evidence-feat', null, tmp)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('analysis doc on disk -> true (glob covers plain + bilingual siblings)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br384-'));
    try {
      const analysisDir = path.join(tmp, 'docs', '03-analysis');
      fs.mkdirSync(analysisDir, { recursive: true });
      fs.writeFileSync(path.join(analysisDir, 'doc-feat.analysis.md'), '# analysis\n');
      expect(hasCheckEvidence('doc-feat', {}, tmp)).toBe(true);
      fs.writeFileSync(path.join(analysisDir, 'doc-feat.analysis.en.md'), '# analysis\n');
      fs.writeFileSync(path.join(analysisDir, 'doc-feat.analysis.ko.md'), '# analysis\n');
      expect(hasCheckEvidence('doc-feat', {}, tmp)).toBe(true);
      expect(hasCheckEvidence('other-feat', {}, tmp)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('unreadable analysis dir -> false (never throws)', () => {
    expect(hasCheckEvidence('x', {}, path.join(os.tmpdir(), 'bkit-does-not-exist-zz'))).toBe(false);
  });
});
