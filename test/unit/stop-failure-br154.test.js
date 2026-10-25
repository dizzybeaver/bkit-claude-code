#!/usr/bin/env node
'use strict';
/**
 * Regression tests for br154: classifyError must categorize the underscore
 * token `server_error` that Claude Code StopFailure payloads carry.
 * Tests the REAL export from scripts/stop-failure-handler.js (not a replica).
 */

const { assert, summary, reset } = require('../helpers/assert');
reset();
const { classifyError } = require('../../scripts/stop-failure-handler');

console.log('\n=== stop-failure-br154.test.js (3 TC) ===\n');

// br154-1: underscore token classifies as server_error (the live 12:44 entry shape)
assert('br154-1', classifyError('unknown', 'server_error').category === 'server_error',
  'underscore token "server_error" → category server_error');

// br154-2: spaced variant still matches (guard against regression of the old behavior)
assert('br154-2', classifyError('unknown', 'upstream server error').category === 'server_error',
  'spaced "server error" still → server_error');

// br154-3: classification carries the expected severity/recovery shape
const c = classifyError('unknown', 'server_error');
assert('br154-3', c.severity === 'medium' && typeof c.recovery === 'string' && c.recovery.length > 0,
  'server_error classification carries severity medium + recovery hint');

summary('stop-failure br154 Regression');
