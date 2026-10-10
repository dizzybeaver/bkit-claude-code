#!/usr/bin/env node
/**
 * br046-carry-zero W2 — feature-doc archival script.
 * @module tools/doc-archive/archive-features
 * @version 1.0.0
 *
 * Moves completed-cycle feature docs into docs/archive/<era>/<feature>/.
 *
 *   1. Inventory: docs/{01-plan,02-design,03-analysis,04-report}/features/*
 *      plus docs/00-pm[/features], docs/05-qa[/features] and docs/03-analysis
 *      (flat), grouped by feature name (strip
 *      .plan|.design|.analysis|.report|.master-plan|.iterate|.prd|.qa-report
 *      and .en|.ko suffixes).
 *   2. Safety exclusion: a feature whose name exists in the PDCA registry
 *      (lib/pdca API — NEVER the file) with phase NOT in {archived, completed}
 *      is SKIPPED; unknown names (doc-evidence phantoms) are eligible.
 *   3. Era: YYYY-MM from the feature's OLDEST doc mtime.
 *   4. Dry-run default: prints the full move plan. `--apply`: git mv each file
 *      to docs/archive/<era>/<feature>/ and appends a row per feature to the
 *      era's _INDEX.md (docs/archive/<era>/_INDEX.md — the format the existing
 *      era indexes use).
 *   5. Post: summary (features, files, excluded).
 *
 * USAGE: node tools/doc-archive/archive-features.js [--apply]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..', '..');
const FEATURE_DIRS = [
  'docs/01-plan/features',
  'docs/02-design/features',
  'docs/03-analysis/features',
  'docs/04-report/features',
  // br046 round 3-4: the view's doc-evidence scan also materializes features
  // from these locations — historical sprint PRDs (00-pm), QA reports (05-qa),
  // and flat .analysis.md files in 03-analysis.
  'docs/00-pm',
  'docs/00-pm/features',
  'docs/05-qa',
  'docs/05-qa/features',
  'docs/03-analysis',
  'docs/04-report',
];
const NAME_SUFFIX = /\.(plan|design|analysis|report|master-plan|iterate|prd|qa-report)(?:\.(en|ko))?\.md$/;

// ── 1. Inventory ────────────────────────────────────────────────────────────
/** feature -> [{ rel, abs }] */
const features = new Map();
for (const dir of FEATURE_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!f.endsWith('.md')) continue;
    const name = f.replace(NAME_SUFFIX, '');
    if (!name || name === f) continue; // does not match the feature-suffix shape
    const rel = path.join(dir, f);
    if (!features.has(name)) features.set(name, []);
    features.get(name).push({ rel, abs: path.join(ROOT, rel) });
  }
}

// ── 2. Safety exclusion via the sanctioned API (never the registry file) ───
let registryPhases = {};
try {
  const pdca = require(path.join(ROOT, 'lib', 'pdca'));
  const status = pdca.getPdcaStatusFull();
  registryPhases = Object.fromEntries(
    Object.entries(status.features || {}).map(([k, v]) => [k, v && v.phase])
  );
} catch (e) {
  console.error(`WARN: registry API unavailable (${e.message}) — proceeding with docs-only eligibility`);
}

const eligible = [];
const excluded = [];
for (const [name, files] of [...features.entries()].sort()) {
  const phase = registryPhases[name];
  if (phase !== undefined && phase !== 'archived' && phase !== 'completed') {
    excluded.push({ name, reason: `registry phase "${phase}" — active cycle` });
    continue;
  }
  eligible.push({ name, files });
}

// ── 3. Era from the oldest doc mtime ────────────────────────────────────────
for (const e of eligible) {
  const oldest = Math.min(...e.files.map((f) => fs.statSync(f.abs).mtimeMs));
  e.era = new Date(oldest).toISOString().slice(0, 7);
  e.targetDir = path.join('docs', 'archive', e.era, e.name);
}
eligible.sort((a, b) => (a.era + a.name).localeCompare(b.era + b.name));

// ── 4. Plan ─────────────────────────────────────────────────────────────────
console.log(`archive-features.js — ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
let fileCount = 0;
for (const e of eligible) {
  console.log(`${e.name}  ->  ${e.targetDir}/  [${e.files.length} file(s)]`);
  for (const f of e.files) {
    fileCount++;
    console.log(`    ${f.rel}`);
  }
}

// ── 5. Apply + summary ──────────────────────────────────────────────────────
const indexPath = (era) => path.join(ROOT, 'docs', 'archive', era, '_INDEX.md');
const today = new Date().toISOString().slice(0, 10);

if (APPLY) {
  const indexRows = new Map(); // era -> [rows]
  for (const e of eligible) {
    const destAbs = path.join(ROOT, e.targetDir);
    fs.mkdirSync(destAbs, { recursive: true });
    for (const f of e.files) {
      execFileSync('git', ['mv', f.rel, path.join(e.targetDir, path.basename(f.rel))], { cwd: ROOT });
    }
    const row = `- ${e.name} — archived ${today} → ${e.targetDir}/`;
    if (!indexRows.has(e.era)) indexRows.set(e.era, []);
    indexRows.get(e.era).push(row);
  }
  for (const [era, rows] of indexRows) {
    const idx = indexPath(era);
    fs.appendFileSync(idx, rows.join('\n') + '\n');
  }
}

console.log(`\n--- Summary ---`);
console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`features inventoried: ${features.size}`);
console.log(`features eligible: ${eligible.length}`);
console.log(`files to move: ${fileCount}`);
console.log(`excluded: ${excluded.length}`);
for (const x of excluded) console.log(`  - ${x.name}: ${x.reason}`);
if (!APPLY) console.log('\nDRY-RUN ONLY — re-run with --apply to move files.');
process.exit(0);
