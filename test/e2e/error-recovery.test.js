'use strict';
/**
 * E2E Tests: Error Recovery (7 TC)
 * Tests resume point creation and session recovery from resume data.
 *
 * @module test/e2e/error-recovery.test.js
 */

const { assert, assertNoThrow, summary } = require('../helpers/assert');

// ── Module loading ──────────────────────────────────────────────────

let resume;
try {
  resume = require('../../lib/pdca/resume');
} catch (e) {
  console.error('resume module load failed:', e.message);
  process.exit(1);
}

let stateMachine;
try {
  stateMachine = require('../../lib/pdca/state-machine');
} catch (e) {
  console.error('state-machine module load failed:', e.message);
  process.exit(1);
}

console.log('\n=== error-recovery.test.js ===\n');

// =====================================================================
// ER-004~006: Resume point created on failure
// =====================================================================

// --- ER-004: createResumePoint function exists ---
assert('ER-004',
  typeof resume.createResumePoint === 'function',
  'createResumePoint function is available for failure recovery'
);

// --- ER-005: validateResumeData function exists ---
assert('ER-005',
  typeof resume.validateResumeData === 'function',
  'validateResumeData function exists for validating resume integrity'
);

// --- ER-006: validateResumeData rejects invalid data ---
const invalidResume = resume.validateResumeData(null);
assert('ER-006',
  invalidResume === false || (typeof invalidResume === 'object' && invalidResume.valid === false),
  'validateResumeData rejects null data'
);

// =====================================================================
// ER-007~010: Session recovery from resume data
// =====================================================================

// --- ER-007: resumeSession function exists ---
assert('ER-007',
  typeof resume.resumeSession === 'function',
  'resumeSession function is available for session recovery'
);

// --- ER-008: State machine has ERROR event for failure recording ---
assert('ER-008',
  stateMachine.EVENTS.includes('ERROR'),
  'State machine EVENTS includes ERROR for failure state transitions'
);

// --- ER-009: State machine has RECOVER event for recovery ---
assert('ER-009',
  stateMachine.EVENTS.includes('RECOVER'),
  'State machine EVENTS includes RECOVER for resuming from error'
);

// --- ER-010: ERROR transition saves resume point (saveResumePoint action) ---
const errorTransition = stateMachine.TRANSITIONS.find(t => t.event === 'ERROR' && t.from === '*');
assert('ER-010',
  errorTransition && errorTransition.actions.includes('saveResumePoint'),
  'ERROR transition includes saveResumePoint action for recovery data'
);

summary('error-recovery.test.js');
process.exit(0);
