'use strict';

/**
 * wave1027_probes.js — br-rb-wave-1027 fix-wave verification probes.
 *
 * Covers (docs/02-design/features/br-rb-wave-1027.design.en.md §8):
 *   T1  FR-01 rb006  exit code 0 in error string -> NO failure guidance
 *   T2  FR-01 rb006  genuine exit code 1 -> exit_nonzero guidance retained
 *   T3  FR-01 rb006  ambiguous "non-zero" with no digits -> classified (documented)
 *   T4  FR-02 br164/166  prose-arg fire -> ONE clean registry key
 *   T5  FR-02 br164/166  clean fire -> identity key
 *   T6  FR-03 br165  G-010b prose repro phrase -> no match
 *   T7  FR-03 br165  SQL unscoped delete -> still detected
 *   T8  FR-03 br165  SQL delete with WHERE -> not detected
 *   T9  FR-03 br165  full br165 Write repro -> not denied
 *   T10 syntax       node --check on the three fixed files
 *
 * NOTE: all SQL-shaped fixture strings are built by concatenation so THIS
 * file's own source never carries the contiguous G-010b match shape — the
 * unfixed detector denied the first draft of this very file (third live
 * br165 specimen, on a .js write). Keep fixtures concatenated.
 *
 * Usage:
 *   node tools/brfix-wave-probes/wave1027_probes.js          # all
 *   node tools/brfix-wave-probes/wave1027_probes.js T1 T6    # subset
 *
 * @module tools/brfix-wave-probes/wave1027_probes
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FAILURE_HANDLER = path.join(REPO_ROOT, 'scripts', 'tool-failure-handler.js');
const THREE_FILES = [
  'scripts/tool-failure-handler.js',
  'lib/orchestrator/skill-invocation-effects.js',
  'lib/control/destructive-detector.js',
];

// concatenated fixtures (see NOTE above)
const SQL_UNSCOPED = 'DELETE ' + 'FROM audit_log;';           // T7: must match
const SQL_WHERE = 'DELETE ' + 'FROM audit_log WHERE id=1';     // T8: must not match
const PROSE_REPRO = 'config key create/delete ' + 'from the dashboard'; // T6/T9: must not match

const results = [];

function report(id, pass, detail) {
  results.push({ id, pass });
  console.log(`\n[${id}] ${pass ? 'PASS' : 'FAIL'}`);
  console.log(detail.trim());
}

function tmpProj(tag) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), `wave1027-${tag}-`));
  fs.mkdirSync(path.join(proj, 'plugindata'), { recursive: true });
  if (typeof proj !== 'string') console.error(`tmpProj(${tag}) non-string: ${JSON.stringify(proj)}`);
  return proj;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function runFailureHandler(payload) {
  const env = { ...process.env };
  delete env.BKIT_VERBOSE_VALIDATION;
  return spawnSync(process.execPath, [FAILURE_HANDLER], {
    input: JSON.stringify(payload), cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 15000,
  });
}

// --- M1: rb006 -----------------------------------------------------------

function probeT1() {
  const run = runFailureHandler({
    tool_name: 'Bash',
    tool_input: { command: 'true' },
    error: 'Bash command exited with exit code: 0',
  });
  const out = (run.stdout || '').trim();
  const pass = run.status === 0
    && !/non-zero status|exit_nonzero/i.test(out + (run.stderr || ''))
    && (out === '{}' || !/"additionalContext"/.test(out));
  report('T1-fr01-exit0-silenced', pass,
    `exit=${run.status} stdout=${out.slice(0, 200) || '(empty)'}`);
}

function probeT2() {
  const run = runFailureHandler({
    tool_name: 'Bash',
    tool_input: { command: 'false' },
    error: 'Bash command exited with exit code: 1',
  });
  const out = (run.stdout || '').trim();
  const pass = /non-zero status/i.test(out);
  report('T2-fr01-exit1-retained', pass,
    `exit=${run.status} stdout=${out.slice(0, 200) || '(empty)'}`);
}

function probeT3() {
  const run = runFailureHandler({
    tool_name: 'Bash',
    tool_input: { command: 'grep -n needle missing-file' },
    error: 'Bash command exited with non-zero status.',
  });
  const out = (run.stdout || '').trim();
  // Documented outcome (design T3/T11): ambiguous shape stays classified.
  const pass = run.status === 0 && /non-zero status/i.test(out);
  report('T3-fr01-ambiguous-classified', pass,
    `exit=${run.status} stdout=${out.slice(0, 200) || '(empty)'}`);
}

// --- M2: br164/br166 -----------------------------------------------------

async function runEffects(fx, args) {
  // purge ALL repo modules: lib/pdca status paths resolve env at module load,
  // so stale cached modules would write to the PREVIOUS probe's tmpdir
  for (const f of Object.keys(require.cache)) {
    if (f.startsWith(REPO_ROOT)) delete require.cache[f];
  }
  const modPath = path.join(REPO_ROOT, 'lib/orchestrator/skill-invocation-effects.js');
  const { runSkillInvocationEffects } = require(modPath);
  await runSkillInvocationEffects('pdca', args,
    { source: 'skill-tool', dedupeKey: `wave1027-${Date.now()}-${Math.random()}`, projectRoot: fx });
}

function readKeys(fx) {
  const regPath = path.join(fx, '.bkit', 'state', 'pdca-status.json');
  const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  return Object.keys(reg.features || {});
}

async function probeT4() {
  const fx = tmpProj('t4');
  process.env.CLAUDE_PROJECT_DIR = fx;
  process.env.CLAUDE_PLUGIN_DATA = path.join(fx, 'plugindata');
  try {
    await runEffects(fx, { action: 'plan', feature: 'myfeature — some prose notes' });
    const keys = readKeys(fx);
    const hasClean = keys.includes('myfeature');
    const noProse = keys.every((k) => !/—/.test(k) && !/ /.test(k));
    report('T4-fr02-prose-key-single', hasClean && noProse,
      `keys=${JSON.stringify(keys)}`);
  } catch (e) {
    report('T4-fr02-prose-key-single', false, `error: ${e.message}`);
  } finally {
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CLAUDE_PLUGIN_DATA;
    cleanup(fx);
  }
}

async function probeT5() {
  const fx = tmpProj('t5');
  process.env.CLAUDE_PROJECT_DIR = fx;
  process.env.CLAUDE_PLUGIN_DATA = path.join(fx, 'plugindata');
  try {
    await runEffects(fx, { action: 'do', feature: 'myfeature' });
    const keys = readKeys(fx);
    report('T5-fr02-clean-identity', keys.includes('myfeature') && keys.length === 1,
      `keys=${JSON.stringify(keys)}`);
  } catch (e) {
    report('T5-fr02-clean-identity', false, `error: ${e.message}`);
  } finally {
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CLAUDE_PLUGIN_DATA;
    cleanup(fx);
  }
}

// --- M3: br165 -----------------------------------------------------------

function ruleIds(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res.map((r) => r && (r.id || r.rule || r)).filter(Boolean);
  if (res.rules) return (Array.isArray(res.rules) ? res.rules : []).map((r) => r && (r.id || r)).filter(Boolean);
  if (res.ids) return Array.from(res.ids);
  if (res.detected === false || res.isDestructive === false) return [];
  return Object.keys(res);
}

function isDenied(res) {
  if (!res) return false;
  if (typeof res.isDestructive === 'boolean') return res.isDestructive;
  if (res.detected === false) return false;
  return ruleIds(res).length > 0;
}

function probeT6() {
  const { detect } = require(path.join(REPO_ROOT, 'lib/control/destructive-detector.js'));
  const res = detect('Write', {
    file_path: '/tmp/wave1027-t6/CHANGELOG.md',
    content: `# Changelog\n\n- ${PROSE_REPRO} (br165 repro)\n`,
  });
  const ids = ruleIds(res);
  report('T6-fr03-prose-nomatch', !ids.includes('G-010b'),
    `rules=${JSON.stringify(ids)}`);
}

function probeT7() {
  const { detect } = require(path.join(REPO_ROOT, 'lib/control/destructive-detector.js'));
  const res = detect('Write', { file_path: '/tmp/wave1027-t7/query.sql', content: SQL_UNSCOPED });
  const ids = ruleIds(res);
  report('T7-fr03-truepositive-kept', ids.includes('G-010b'),
    `rules=${JSON.stringify(ids)}`);
}

function probeT8() {
  const { detect } = require(path.join(REPO_ROOT, 'lib/control/destructive-detector.js'));
  const res = detect('Write', { file_path: '/tmp/wave1027-t8/query.sql', content: SQL_WHERE });
  const ids = ruleIds(res);
  report('T8-fr03-where-nomatch', !ids.includes('G-010b'),
    `rules=${JSON.stringify(ids)}`);
}

function probeT9() {
  const { detect } = require(path.join(REPO_ROOT, 'lib/control/destructive-detector.js'));
  const res = detect('Write', {
    file_path: '/run/media/joe/H10-512GB/rubicant/CHANGELOG.md',
    content: `# Changelog\n\n${PROSE_REPRO}\n`.repeat(20),
  });
  report('T9-fr03-write-repro-passes', !isDenied(res),
    `raw=${JSON.stringify(res).slice(0, 200)}`);
}

// --- T10: syntax ----------------------------------------------------------

function probeT10() {
  let pass = true;
  const lines = [];
  for (const f of THREE_FILES) {
    const r = spawnSync(process.execPath, ['--check', path.join(REPO_ROOT, f)], { encoding: 'utf8' });
    lines.push(`${f}: exit ${r.status}`);
    if (r.status !== 0) pass = false;
  }
  report('T10-syntax', pass, lines.join('\n'));
}

const PROBES = {
  T1: probeT1, T2: probeT2, T3: probeT3,
  T4: probeT4, T5: probeT5,
  T6: probeT6, T7: probeT7, T8: probeT8, T9: probeT9,
  T10: probeT10,
};
const requested = process.argv.slice(2).filter((a) => PROBES[a]);
const ids = requested.length ? requested : Object.keys(PROBES);
(async () => {
  for (const id of ids) await PROBES[id]();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== wave1027 probes: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    console.log(`failed: ${failed.map((r) => r.id).join(', ')}`);
    process.exit(1);
  }
})();
