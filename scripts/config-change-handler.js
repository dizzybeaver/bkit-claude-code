#!/usr/bin/env node
/**
 * config-change-handler.js - ConfigChange Hook Handler
 * Logs configuration changes and checks for dangerous permission modifications.
 *
 * Input: { source, file_path }
 * Output: none (audit + security warning)
 *
 * @version 2.1.10
 * @module scripts/config-change-handler
 */

const fs = require('fs');
const { readStdinSync, outputEmpty } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');

// Dangerous config patterns that should be flagged.
//
// Defense-in-Depth Architecture (2026-04-21, ENH-254):
//   Layer 1 (CC runtime sandbox):
//     - CC v2.1.113 #23: `dangerouslyDisableSandbox` can no longer bypass sandbox without permission prompt
//     - CC v2.1.116 S1: Sandbox auto-allow no longer bypasses dangerous-path safety for rm/rmdir on /, $HOME, critical dirs
//     - CC v2.1.113 #14/#15/#16: Bash deny rule wrapper hardening (env/sudo/setsid), find -exec, /private/* rm
//   Layer 2 (bkit config-change hook, this file):
//     - Detects these 5 patterns in config file writes and flags as SECURITY WARNING
//     - Complements CC runtime defense; provides early detection at settings layer
//   IMPORTANT: Both layers together do NOT guarantee user data safety.
//   Users must NOT rely on either layer alone. See docs/03-analysis/security-architecture.md.
const DANGEROUS_PATTERNS = [
  'dangerouslyDisableSandbox',      // CC v2.1.113 #23 hardened at runtime (2026-04-17)
  'excludedCommands',                // Sandbox bypass mechanism
  'autoAllowBashIfSandboxed',        // Auto-allow without permission (v2.1.116 S1 tightened)
  'chmod 777',                       // World-writable permissions
  'allowRead',                       // Broad read access grants
];

let input;
try {
  input = readStdinSync();
} catch (e) {
  // Plan FR-07 (rb027): a stdin failure means the change payload is lost and
  // can never be audited. Emit an explicit unaudited row (outcome vocabulary —
  // not a block, not a success) before exiting, instead of exiting silently
  // as if no change had occurred.
  debugLog('ConfigChange', 'Failed to read stdin', { error: e.message });
  try {
    const { writeAuditLog } = require('../lib/audit/audit-logger');
    writeAuditLog({
      actor: 'hook',
      actorId: 'config-change-handler',
      action: 'config_changed',
      category: 'config',
      target: 'unknown',
      targetType: 'config',
      details: { reason: 'stdin read failed; change payload never captured' },
      result: 'unaudited',
    });
  } catch (_) { /* non-critical */ }
  outputEmpty();
  process.exit(0);
}

const source = input.source || '';
const filePath = input.file_path || input.filePath || '';

debugLog('ConfigChange', 'Hook started', { source, filePath });

// Plan FR-07 (rb027): single-snapshot read. The old flow audited the change
// first and then RE-READ the file for the pattern scan, so the audited row and
// the scanned bytes could be two different versions of the file (TOCTOU).
// Read once; detection and audit both cite this snapshot.
let content = null;
let readError = null;
try {
  if (filePath && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
} catch (e) {
  readError = e.message;
  debugLog('ConfigChange', 'Config file read failed', { filePath, error: e.message });
}

// Plan FR-07 (rb027): substring includes() matched these tokens inside prose
// and inside longer identifiers (e.g. "chmod 7770", a doc sentence quoting
// "chmod 777"). Word-boundary regexes match the real tokens only.
const DANGEROUS_PATTERN_RES = DANGEROUS_PATTERNS.map((pattern) => ({
  pattern,
  regex: new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
}));

const dangers = [];
if (content !== null) {
  for (const { pattern, regex } of DANGEROUS_PATTERN_RES) {
    if (regex.test(content)) {
      dangers.push(pattern);
    }
  }
}

if (dangers.length > 0) {
  debugLog('ConfigChange', 'SECURITY WARNING: Dangerous config detected', {
    patterns: dangers,
    filePath,
  });
}

// Step 1: single audit row for the change.
//
// Plan FR-07 (rb027): this is a NON-BLOCKING hook — ConfigChange has no deny
// path and this handler always exits 0 — so the old warning row (action
// 'destructive_blocked', result 'blocked', destructiveOperation, blastRadius
// high) recorded a block that never happened. Outcome vocabulary:
// 'annotated' when dangerous patterns were found, 'observed' otherwise;
// blocking claims belong to channels that can actually block.
try {
  const { writeAuditLog } = require('../lib/audit/audit-logger');
  writeAuditLog({
    actor: 'hook',
    actorId: 'config-change-handler',
    action: dangers.length > 0 ? 'dangerous_config_annotated' : 'config_changed',
    category: 'config',
    target: filePath || source || 'unknown',
    targetType: 'config',
    details: {
      source,
      filePath,
      dangerousPatterns: dangers,
      patternScan: content !== null ? 'performed' : 'skipped',
      ...(readError ? { readError } : {}),
    },
    result: dangers.length > 0 ? 'annotated' : 'observed',
    ...(dangers.length > 0
      ? { reason: `Dangerous config patterns found: ${dangers.join(', ')}` }
      : {}),
  });
  debugLog('ConfigChange', 'Audit log written');
} catch (e) {
  debugLog('ConfigChange', 'Audit write failed (non-critical)', { error: e.message });
}

debugLog('ConfigChange', 'Hook completed', { source, filePath });
outputEmpty();
process.exit(0);
