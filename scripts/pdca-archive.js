#!/usr/bin/env node
'use strict';
/**
 * pdca-archive.js — the sanctioned archive path (registry-lockdown FR-02).
 *
 * Replaces the hand edits the pdca skill's archive action used to prescribe:
 * verification gates, document moves, the archive index, and the registry
 * write all happen here, through lib writers (`lib/pdca/lifecycle.js`
 * `archiveFeature` / status-cleanup) — never a direct agent file edit of
 * `.bkit/state/pdca-status.json` (G-020 denies that on the Write/Edit path).
 *
 * Usage:
 *   node scripts/pdca-archive.js <feature> [--summary] [--apply]
 *
 * Dry-run is the DEFAULT: it evaluates gates and lists what would move,
 * mutating nothing. `--apply` is required to move documents and write the
 * registry. Exit codes: 0 ok · 2 feature-not-found · 3 gate-failed ·
 * 4 required-docs-missing.
 *
 * @module scripts/pdca-archive
 * @version 2.1.39
 * @since 2.1.39
 */

const fs = require('fs');
const path = require('path');

const { getFeatureStatus, deleteFeatureFromStatus, archiveFeatureToSummary } = require('../lib/pdca');
const { archiveFeature } = require('../lib/pdca/lifecycle');
const { findDoc } = require('../lib/core/paths');

const EXIT = { OK: 0, NOT_FOUND: 2, GATE: 3, DOCS: 4 };

/** Phases whose documents MUST exist before an archive may proceed. */
const REQUIRED_PHASES = ['plan', 'design', 'analysis', 'report'];
/** Optional phase documents — archived when present, never required. */
const OPTIONAL_PHASES = ['pm', 'qa'];

function usage() {
  process.stderr.write('usage: node scripts/pdca-archive.js <feature> [--summary] [--apply]\n');
}

/**
 * Discover the phase documents that exist for a feature.
 * @param {string} feature
 * @returns {{ found: Array<{phase:string,src:string}>, missing: string[] }}
 */
function discoverDocs(feature) {
  const found = [];
  const missing = [];
  for (const phase of REQUIRED_PHASES) {
    const p = findDoc(phase, feature);
    if (p) found.push({ phase, src: p });
    else missing.push(phase);
  }
  for (const phase of OPTIONAL_PHASES) {
    const p = findDoc(phase, feature);
    if (p) found.push({ phase, src: p });
  }
  return { found, missing };
}

/**
 * Move a file, tolerating cross-device renames (EXDEV) via copy+unlink.
 * @param {string} src
 * @param {string} dst
 */
function moveFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.renameSync(src, dst);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(src, dst);
    fs.unlinkSync(src);
  }
}

/**
 * Append (or create) the feature's entry in docs/archive/YYYY-MM/_INDEX.md.
 * @param {string} indexPath
 * @param {string} feature
 * @param {string} relArchiveDir
 */
function updateArchiveIndex(indexPath, feature, relArchiveDir) {
  const entry = `- ${feature} — archived ${new Date().toISOString().slice(0, 10)} → ${relArchiveDir}/`;
  let body = '';
  try {
    body = fs.readFileSync(indexPath, 'utf8');
  } catch (_e) { /* new index */ }
  if (!body.includes(`- ${feature} —`)) {
    if (!body.endsWith('\n') && body.length > 0) body += '\n';
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, body + entry + '\n');
  }
}

/**
 * Run the archive flow.
 * @param {string[]} argv - args after the script name
 * @returns {number} exit code
 */
function run(argv) {
  const feature = argv.find((a) => !a.startsWith('--'));
  if (!feature) {
    usage();
    return EXIT.NOT_FOUND;
  }
  const apply = argv.includes('--apply');
  const summaryMode = argv.includes('--summary');

  const feat = getFeatureStatus(feature);
  if (!feat) {
    process.stdout.write(JSON.stringify({ error: 'E-ARCH-NOTFOUND', feature, archived: false }) + '\n');
    return EXIT.NOT_FOUND;
  }

  // Gate: terminal state or measured quality (design §4.1). Fail closed —
  // no filesystem change before the gate passes.
  const gatePassed = feat.phase === 'completed'
    || (typeof feat.matchRate === 'number' && feat.matchRate >= 90);
  if (!gatePassed) {
    process.stdout.write(JSON.stringify({
      error: 'E-ARCH-GATE', feature, phase: feat.phase,
      matchRate: typeof feat.matchRate === 'number' ? feat.matchRate : null,
      archived: false,
    }) + '\n');
    return EXIT.GATE;
  }

  const { found, missing } = discoverDocs(feature);
  if (missing.length > 0) {
    process.stdout.write(JSON.stringify({
      error: 'E-ARCH-DOCS', feature, missingPhases: missing, archived: false,
    }) + '\n');
    return EXIT.DOCS;
  }

  // Resolve the archive destination from the same SSoT lifecycle uses.
  const archiveDir = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    'docs', 'archive', new Date().toISOString().slice(0, 7), feature);

  if (!apply) {
    process.stdout.write(JSON.stringify({
      feature, gatePassed: true, dryRun: true, summaryMode,
      docsFound: found.map((d) => d.phase), archiveDir,
    }, null, 2) + '\n');
    return EXIT.OK;
  }

  // --apply: registry first, then documents. ORDER MATTERS: archiveFeature's
  // internal updatePdcaStatus is requireDocs-gated (issue #89) — moving the
  // docs away before the registry write would fail the gate and silently
  // skip the archived transition. All registry writes flow through the
  // sanctioned lib writers.
  const result = archiveFeature(feature);
  for (const doc of found) {
    moveFile(doc.src, path.join(archiveDir, path.basename(doc.src)));
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  updateArchiveIndex(path.join(path.dirname(archiveDir), '_INDEX.md'), feature,
    path.relative(projectDir, archiveDir) || path.basename(archiveDir));

  if (summaryMode) {
    archiveFeatureToSummary(feature);
  } else {
    deleteFeatureFromStatus(feature);
  }

  process.stdout.write(JSON.stringify({
    archived: result.archived, feature, archiveDir, summaryMode,
    docsMoved: found.map((d) => path.basename(d.src)),
  }) + '\n');
  return result.archived ? EXIT.OK : EXIT.NOT_FOUND;
}

module.exports = { run, discoverDocs, EXIT };

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}
