#!/usr/bin/env node
'use strict';
/**
 * Unit Tests — PDCA-doc advisory skill-owned-cycle suppression (br153 FR-02)
 *
 * The PreToolUse Write/Edit hook fired '[PDCA COMPLIANCE] ... Use /pdca
 * command instead of direct Write/Edit' on EVERY write under the PDCA doc
 * dirs — including writes that ARE the skill's own document-creation
 * instructions. Fix option (a): suppress when the registry shows skill-fire
 * evidence (a live cycle owned by THIS session at the phase the doc belongs
 * to). Deny-biased: missing row, missing ownerSession, absent env var,
 * foreign session, or phase mismatch → the advisory still emits.
 *
 * Isolation: CLAUDE_PROJECT_DIR=TMP_ROOT before any lib/ require (lib/core/
 * platform captures the env at first import), so registry reads land in a
 * throwaway tmp root — never the repo's real .bkit.
 *
 * Design Ref: §2 module-2 (docs/02-design/features/br047-153-156-hook-policy-fixes)
 *
 * @module test/unit/advisory-br153
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-advisory-br153-'));
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.on('exit', () => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const { assert, skip, summary } = require('../helpers/assert');

// eslint-disable-next-line no-console -- test output convention
console.log('\n=== advisory-br153.test.js ===\n');

let preWrite, STATE_PATHS, migration;
try {
  preWrite = require('../../scripts/pre-write'); // bare-require export surface
  STATE_PATHS = require('../../lib/core/paths').STATE_PATHS;
  migration = require('../../lib/pdca/status-migration');
} catch {
  preWrite = null;
}
const moduleLoaded = preWrite !== null;

const DESIGN_DOC = path.join(TMP_ROOT, 'docs/02-design/features/feat-br153.design.md');

const iso = () => new Date().toISOString();

function seedRow({ phase, ownerSession, ownerSince }) {
  const statusPath = STATE_PATHS.pdcaStatus();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  const status = migration.createInitialStatusV2();
  status.features = {
    'feat-br153': {
      phase,
      phaseNumber: 2,
      matchRate: null,
      iterationCount: 0,
      requirements: [],
      documents: {},
      timestamps: { started: iso(), lastUpdated: iso() },
      ...(ownerSession ? { ownerSession, ownerSince: ownerSince || iso() } : {}),
    },
  };
  status.activeFeatures = ['feat-br153'];
  status.primaryFeature = 'feat-br153';
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  // status-core keeps a 3s read cache — force-refresh so the suppression
  // check (getPdcaStatusFull(true)) and any cached reader see this seed.
  const { getPdcaStatusFull } = require('../../lib/pdca/status');
  getPdcaStatusFull(true);
}

function clearRegistry() {
  const statusPath = STATE_PATHS.pdcaStatus();
  if (fs.existsSync(statusPath)) fs.rmSync(statusPath);
  const { getPdcaStatusFull } = require('../../lib/pdca/status');
  getPdcaStatusFull(true);
}

const ADVISORY = '[PDCA COMPLIANCE]';
const CURRENT_SESSION = 'sess-br153-current';
const OTHER_SESSION = 'sess-br153-foreign';

// The skill-name env short-circuit must never interfere with these probes.
delete process.env.CLAUDE_SKILL_NAME;

// ============================================================
// TC-01 (guard): doc-path write, NO registry evidence → advisory present
// ============================================================
{
  if (moduleLoaded) {
    clearRegistry();
    process.env.CLAUDE_CODE_SESSION_ID = CURRENT_SESSION;
    const verdict = preWrite.runPdcaBypassDetection({ filePath: DESIGN_DOC });
    assert('TC-01',
      typeof verdict === 'string' && verdict.includes(ADVISORY),
      `no registry row → advisory still emits (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-01', 'Module not loaded');
  }
}

// ============================================================
// TC-02 (fix): row ownerSession === CLAUDE_CODE_SESSION_ID at the
// matching phase (design doc, row.phase 'design') → advisory suppressed
// ============================================================
{
  if (moduleLoaded) {
    seedRow({ phase: 'design', ownerSession: CURRENT_SESSION });
    process.env.CLAUDE_CODE_SESSION_ID = CURRENT_SESSION;
    const verdict = preWrite.runPdcaBypassDetection({ filePath: DESIGN_DOC });
    assert('TC-02',
      verdict === null,
      `owner-session row at matching phase → advisory suppressed (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-02', 'Module not loaded');
  }
}

// ============================================================
// TC-03 (cross-session guard): row owned by a DIFFERENT session →
// advisory present
// ============================================================
{
  if (moduleLoaded) {
    seedRow({ phase: 'design', ownerSession: OTHER_SESSION });
    process.env.CLAUDE_CODE_SESSION_ID = CURRENT_SESSION;
    const verdict = preWrite.runPdcaBypassDetection({ filePath: DESIGN_DOC });
    assert('TC-03',
      typeof verdict === 'string' && verdict.includes(ADVISORY),
      `foreign-session row → advisory still emits (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-03', 'Module not loaded');
  }
}

// ============================================================
// TC-04 (deny-bias): CLAUDE_CODE_SESSION_ID absent → advisory present
// even though a live row exists
// ============================================================
{
  if (moduleLoaded) {
    seedRow({ phase: 'design', ownerSession: CURRENT_SESSION });
    delete process.env.CLAUDE_CODE_SESSION_ID;
    const verdict = preWrite.runPdcaBypassDetection({ filePath: DESIGN_DOC });
    assert('TC-04',
      typeof verdict === 'string' && verdict.includes(ADVISORY),
      `env var absent → advisory still emits (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-04', 'Module not loaded');
  }
}

// ============================================================
// TC-05 (deny-bias): legacy row without ownerSession (br143 unowned) →
// advisory present
// ============================================================
{
  if (moduleLoaded) {
    seedRow({ phase: 'design' }); // no ownerSession stamped
    process.env.CLAUDE_CODE_SESSION_ID = CURRENT_SESSION;
    const verdict = preWrite.runPdcaBypassDetection({ filePath: DESIGN_DOC });
    assert('TC-05',
      typeof verdict === 'string' && verdict.includes(ADVISORY),
      `unowned legacy row → advisory still emits (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-05', 'Module not loaded');
  }
}

// ============================================================
// TC-06 (deny-bias): phase mismatch (row.phase 'do', design doc) →
// advisory present — the cycle is live but not AT this doc's phase
// ============================================================
{
  if (moduleLoaded) {
    seedRow({ phase: 'do', ownerSession: CURRENT_SESSION });
    process.env.CLAUDE_CODE_SESSION_ID = CURRENT_SESSION;
    const verdict = preWrite.runPdcaBypassDetection({ filePath: DESIGN_DOC });
    assert('TC-06',
      typeof verdict === 'string' && verdict.includes(ADVISORY),
      `phase mismatch → advisory still emits (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-06', 'Module not loaded');
  }
}

// ============================================================
// TC-07 (baseline): non-PDCA-doc path → no advisory regardless of
// registry state (pre-existing behavior unchanged)
// ============================================================
{
  if (moduleLoaded) {
    seedRow({ phase: 'design', ownerSession: CURRENT_SESSION });
    process.env.CLAUDE_CODE_SESSION_ID = CURRENT_SESSION;
    const verdict = preWrite.runPdcaBypassDetection({
      filePath: path.join(TMP_ROOT, 'src/components/Button.tsx'),
    });
    assert('TC-07',
      verdict === null,
      `non-doc path → no advisory (got ${JSON.stringify(verdict)})`);
  } else {
    skip('TC-07', 'Module not loaded');
  }
}

summary();
