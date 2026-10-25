/**
 * Parallel Feature Manager
 * @module lib/pdca/feature-manager
 * @version 2.1.10
 *
 * Manages up to MAX_CONCURRENT_FEATURES active features with
 * Do-phase exclusivity (only 1 feature in Do at a time).
 * State stored in .bkit/state/workflows/{feature}.json.
 */

const fs = require('fs');
const path = require('path');

// br041: shared feature-name intake validation
const { normalizeFeatureName, isValidFeatureName } = require('./validate-name');

// Lazy requires to avoid circular dependencies
let _core = null;
function getCore() {
  if (!_core) { _core = require('../core'); }
  return _core;
}

let _status = null;
function getStatus() {
  if (!_status) { _status = require('./status'); }
  return _status;
}

let _statusCleanup = null;
function getStatusCleanup() {
  if (!_statusCleanup) { _statusCleanup = require('./status-cleanup'); }
  return _statusCleanup;
}

// ── Constants ───────────────────────────────────────────────────────

/** @type {number} Maximum concurrent active features */
const MAX_CONCURRENT_FEATURES = 3;

/** @type {number} Only 1 feature in Do phase at a time */
const MAX_CONCURRENT_DO = 1;

/** @type {number} Do lock timeout in ms (default 1 hour) */
const DO_LOCK_TIMEOUT_MS = 3600000;

// ── Do Lock Management ──────────────────────────────────────────────

/**
 * Get path to the global Do lock file
 * @returns {string}
 * @private
 */
function _getDoLockPath() {
  const { PROJECT_DIR } = getCore();
  return path.join(PROJECT_DIR, '.bkit', 'runtime', 'do-lock.json');
}

/**
 * Read the current Do lock state
 * @returns {{feature: string|null, acquiredAt: string|null, acquiredBy: string, timeoutMs: number}}
 */
function getDoLock() {
  const lockPath = _getDoLockPath();
  try {
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      // Check for expired lock
      if (lock.feature && lock.acquiredAt) {
        const elapsed = Date.now() - new Date(lock.acquiredAt).getTime();
        if (elapsed >= (lock.timeoutMs || DO_LOCK_TIMEOUT_MS)) {
          // Lock expired, auto-release
          _writeDoLock({ feature: null, acquiredAt: null, acquiredBy: '', timeoutMs: DO_LOCK_TIMEOUT_MS });
          return { feature: null, acquiredAt: null, acquiredBy: '', timeoutMs: DO_LOCK_TIMEOUT_MS };
        }
      }
      return lock;
    }
  } catch (_) { /* fall through */ }

  return { feature: null, acquiredAt: null, acquiredBy: '', timeoutMs: DO_LOCK_TIMEOUT_MS };
}

/**
 * Acquire the Do lock for a feature
 * @param {string} feature - Feature requesting the lock
 * @param {string} [acquiredBy='auto'] - Lock requester
 * @returns {{acquired: boolean, heldBy: string|null}}
 */
function acquireDoLock(feature, acquiredBy = 'auto') {
  const { debugLog } = getCore();
  const current = getDoLock();

  // Already locked by another feature
  if (current.feature && current.feature !== feature) {
    debugLog('FEAT-MGR', 'Do lock held by another feature', {
      requested: feature,
      heldBy: current.feature,
    });
    return { acquired: false, heldBy: current.feature };
  }

  // Already locked by this feature (re-entrant)
  if (current.feature === feature) {
    return { acquired: true, heldBy: feature };
  }

  // Acquire lock
  _writeDoLock({
    feature,
    acquiredAt: new Date().toISOString(),
    acquiredBy,
    timeoutMs: DO_LOCK_TIMEOUT_MS,
  });

  debugLog('FEAT-MGR', 'Do lock acquired', { feature, acquiredBy });
  return { acquired: true, heldBy: feature };
}

/**
 * Release the Do lock for a feature
 * @param {string} feature - Feature releasing the lock
 * @returns {boolean} True if released
 */
function releaseDoLock(feature) {
  const { debugLog } = getCore();
  const current = getDoLock();

  if (current.feature !== feature) {
    return false; // Not held by this feature
  }

  _writeDoLock({ feature: null, acquiredAt: null, acquiredBy: '', timeoutMs: DO_LOCK_TIMEOUT_MS });
  debugLog('FEAT-MGR', 'Do lock released', { feature });
  return true;
}

/**
 * Write Do lock state to disk
 * @param {Object} lock
 * @private
 */
function _writeDoLock(lock) {
  const { stateStore } = getCore();
  const lockPath = _getDoLockPath();
  try {
    // H1 fix (audit): atomic write of the Do-lock state.
    stateStore.write(lockPath, lock);
  } catch (_) { /* non-critical */ }
}

// ── Feature Workflow State ──────────────────────────────────────────

/**
 * Get path to a feature workflow state file
 * @param {string} feature
 * @returns {string}
 * @private
 */
function _getFeatureWorkflowPath(feature) {
  const core = getCore();
  // M8 fix (audit): validate the path-interpolated feature once at this chokepoint.
  core.validateFeatureName(feature);
  return path.join(core.PROJECT_DIR, '.bkit', 'state', 'workflows', `${feature}.json`);
}

/**
 * Load feature workflow state from disk
 * @param {string} feature - Feature name
 * @returns {Object|null} FeatureWorkflowFile or null
 */
function loadFeatureWorkflow(feature) {
  const filePath = _getFeatureWorkflowPath(feature);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (_) { /* fall through */ }
  return null;
}

/**
 * Save feature workflow state to disk
 * @param {string} feature - Feature name
 * @param {Object} data - FeatureWorkflowFile
 */
function saveFeatureWorkflow(feature, data) {
  const { stateStore } = getCore();
  const filePath = _getFeatureWorkflowPath(feature);
  try {
    data.updatedAt = new Date().toISOString();
    // H1 fix (audit): atomic write of the per-feature workflow state.
    stateStore.write(filePath, data);
  } catch (_) { /* non-critical */ }
}

// ── Core Feature Management API ─────────────────────────────────────

/**
 * FR-06 (br159): the invalid-row shape pushed by BOTH getActiveFeatures
 * degradation branches (invalid name / status-read throw) — extracted from a
 * copy-pasted literal. The flagged row keeps the shape consumers index into.
 * Design Ref: §2 module-2
 * @param {string} name
 * @returns {Object}
 */
function _invalidActiveRow(name) {
  return {
    feature: String(name),
    state: 'invalid',
    workflowId: 'default-pdca',
    isActive: true,
    isPrimary: false,
    lockedBy: '',
    dependsOn: [],
    createdAt: '',
    updatedAt: '',
    flagged: 'invalid-entry',
  };
}

/**
 * Get all active features and their states
 * @returns {{features: Object[], activeCount: number, doPhaseFeature: string|null}}
 */
function getActiveFeatures() {
  const { debugLog } = getCore();
  const { getActiveFeatures: getActive, getFeatureStatus } = getStatus();
  const activeNames = getActive();
  const doLock = getDoLock();

  const features = [];
  for (const name of activeNames) {
    // br151 (FR-03): one junk active entry (e.g. a scoped CLI leftover like
    // "x --scope module-1" that reached activeFeatures) must degrade the
    // dashboard row, never crash the whole reader. Skip-and-flag per name;
    // the flagged row keeps the shape consumers index into.
    try {
      if (!isValidFeatureName(name)) {
        debugLog('FEAT-MGR', 'getActiveFeatures: flagging invalid active name', { name });
        features.push(_invalidActiveRow(name));
        continue;
      }
      const feat = getFeatureStatus(name);
      if (!feat) continue;

      const workflow = loadFeatureWorkflow(name);
      features.push({
        feature: name,
        state: feat.phase || 'idle',
        workflowId: workflow?.workflowId || 'default-pdca',
        isActive: true,
        isPrimary: false, // set below
        lockedBy: doLock.feature === name ? doLock.acquiredBy : '',
        dependsOn: workflow?.dependsOn || [],
        createdAt: feat.timestamps?.started || '',
        updatedAt: feat.timestamps?.lastUpdated || '',
      });
    } catch (e) {
      debugLog('FEAT-MGR', 'getActiveFeatures: skipping invalid entry', {
        name: String(name), error: e.message,
      });
      features.push(_invalidActiveRow(name));
    }
  }

  // Mark primary
  const status = getStatus().getPdcaStatusFull();
  const primaryFeature = status?.primaryFeature || null;
  for (const f of features) {
    if (f.feature === primaryFeature) f.isPrimary = true;
  }

  return {
    features,
    activeCount: features.length,
    doPhaseFeature: doLock.feature || null,
  };
}

/**
 * Check if a new feature can be started
 * @param {string} feature - Feature name
 * @returns {{allowed: boolean, reason: string, activeCount: number}}
 */
function canStartFeature(feature) {
  const { getActiveFeatures: getActive, getFeatureStatus } = getStatus();
  const activeNames = getActive();

  // Already registered
  const existing = getFeatureStatus(feature);
  if (existing && activeNames.includes(feature)) {
    return { allowed: true, reason: 'Feature already active', activeCount: activeNames.length };
  }

  // Check max concurrent
  if (activeNames.length >= MAX_CONCURRENT_FEATURES) {
    return {
      allowed: false,
      reason: `Maximum ${MAX_CONCURRENT_FEATURES} concurrent features reached (active: ${activeNames.join(', ')})`,
      activeCount: activeNames.length,
    };
  }

  return { allowed: true, reason: 'OK', activeCount: activeNames.length };
}

/**
 * Register a new active feature
 * @param {string} feature - Feature name
 * @param {Object} [options] - {workflow, automationLevel, dependsOn}
 * @returns {{registered: boolean, featureState: Object|null, reason?: string}}
 *   reason 'E-NAME-INVALID' — canonical/pdca name grammar failure (FR-02)
 *   reason 'E-DUP-REGISTER' — normalized name already ACTIVE or TERMINAL
 *          (archived/completed, incl. phase-less archivedTo rows) (FR-04/FR-03)
 */
function registerFeature(feature, options = {}) {
  const { debugLog, validateFeatureName } = getCore();
  const { getActiveFeatures: getActive, getFeatureStatus } = getStatus();

  // FR-02 (br155): canonical path-safe name validator BEFORE any registry
  // write. Scoped CLI leftovers ("x --scope module-1") and other grammar
  // failures are refused with E-NAME-INVALID — no write, no throw.
  try {
    validateFeatureName(feature);
  } catch (e) {
    debugLog('FEAT-MGR', `registerFeature: canonical name validation failed: ${e.message}`, { feature });
    return { registered: false, featureState: null, reason: 'E-NAME-INVALID' };
  }

  // br041: malformed name -> reject with NO registry write, NO throw. The
  // registration surface is a CLI argument, not an internal invariant; a
  // warning naming the rejected string is the correct severity.
  const norm = normalizeFeatureName(feature);
  if (!norm.ok) {
    debugLog('FEAT-MGR', `registerFeature: rejecting malformed feature name: ${norm.reason}`, { feature });
    return { registered: false, featureState: null, reason: 'E-NAME-INVALID' };
  }
  feature = norm.name;

  // FR-04 (br155) / FR-03 (br159): duplicate guard — a normalized name
  // matching an existing ACTIVE or TERMINAL row is a re-registration, not a
  // new feature. Warn and refuse (E-DUP-REGISTER); the resume path is
  // /pdca <phase> on the live row, not a second registry entry. The terminal
  // screen mirrors isTerminalRow semantics (status-cleanup) so a COMPLETED
  // (non-archived) row can no longer pass screening, half-register, then hit
  // E-TERMINAL-WRITE on the first phase fire.
  // Design Ref: §2 module-2
  const { isTerminalRow } = getStatusCleanup();
  const existing = getFeatureStatus(feature);
  if (existing && (getActive().includes(feature) || isTerminalRow(existing))) {
    debugLog('FEAT-MGR', 'registerFeature: duplicate registration refused', {
      feature, storedPhase: existing.phase || 'unknown',
    });
    return { registered: false, featureState: null, reason: 'E-DUP-REGISTER' };
  }

  const check = canStartFeature(feature);

  if (!check.allowed) {
    debugLog('FEAT-MGR', 'Cannot register feature', { feature, reason: check.reason });
    return { registered: false, featureState: null };
  }

  const { addActiveFeature, updatePdcaStatus } = getStatus();
  addActiveFeature(feature, check.activeCount === 0); // Set as primary if first

  // Save workflow state
  const workflowData = {
    feature,
    workflowId: options.workflow || 'default-pdca',
    automationLevel: options.automationLevel || 2,
    dependsOn: options.dependsOn || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
  };
  saveFeatureWorkflow(feature, workflowData);

  // FR-07 (br155): stamp the firing session's id onto the feature row so the
  // read-side gate (lib/pdca/session-activity-gate.js) can attribute later
  // Stop emissions. Omitted — never a failure — when the env var is absent.
  // Design Ref: §3.1
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID || null;
  if (sessionId) {
    try {
      const row = getFeatureStatus(feature);
      updatePdcaStatus(feature, row?.phase || 'pm', {
        ownerSession: sessionId,
        ownerSince: new Date().toISOString(),
      }, { requireDocs: false });
    } catch (e) {
      debugLog('FEAT-MGR', 'registerFeature: ownership stamp failed (registration stands)', {
        feature, error: e.message,
      });
    }
  }

  debugLog('FEAT-MGR', 'Feature registered', { feature, activeCount: check.activeCount + 1 });

  return { registered: true, featureState: workflowData };
}

/**
 * Check for feature conflicts (Do phase exclusivity)
 * @param {string} feature - Feature name
 * @param {string} targetPhase - Target phase
 * @returns {{conflict: boolean, conflictWith: string|null, reason: string}}
 */
function checkConflict(feature, targetPhase) {
  if (targetPhase !== 'do') {
    return { conflict: false, conflictWith: null, reason: 'Non-Do phases have no exclusivity' };
  }

  const doLock = getDoLock();

  if (doLock.feature && doLock.feature !== feature) {
    return {
      conflict: true,
      conflictWith: doLock.feature,
      reason: `Do phase locked by "${doLock.feature}" since ${doLock.acquiredAt}`,
    };
  }

  // Check dependency resolution
  const workflow = loadFeatureWorkflow(feature);
  if (workflow?.dependsOn?.length > 0) {
    for (const dep of workflow.dependsOn) {
      const depStatus = getStatus().getFeatureStatus(dep);
      if (depStatus && depStatus.phase !== 'check' && depStatus.phase !== 'report' &&
          depStatus.phase !== 'archived' && depStatus.phase !== 'completed') {
        return {
          conflict: true,
          conflictWith: dep,
          reason: `Dependency "${dep}" has not completed Do phase yet (current: ${depStatus.phase})`,
        };
      }
    }
  }

  return { conflict: false, conflictWith: null, reason: 'No conflict' };
}

/**
 * Release a feature (completed or abandoned)
 * @param {string} feature - Feature name
 * @param {string} reason - Release reason
 */
function releaseFeature(feature, reason) {
  const { debugLog } = getCore();
  const { removeActiveFeature } = getStatus();

  // Release Do lock if held
  releaseDoLock(feature);

  // Remove from active features
  removeActiveFeature(feature);

  debugLog('FEAT-MGR', 'Feature released', { feature, reason });
}

/**
 * Set feature dependencies
 * @param {string} feature - Feature name
 * @param {string[]} dependsOn - Dependency feature names
 * @returns {{success: boolean, reason: string}}
 */
function setDependencies(feature, dependsOn) {
  const validation = validateDependencies(feature, dependsOn);
  if (!validation.valid) {
    return { success: false, reason: `Circular dependency detected: ${validation.cycle.join(' -> ')}` };
  }

  const workflow = loadFeatureWorkflow(feature);
  if (!workflow) {
    return { success: false, reason: 'Feature workflow not found' };
  }

  workflow.dependsOn = dependsOn;
  saveFeatureWorkflow(feature, workflow);
  return { success: true, reason: 'Dependencies updated' };
}

/**
 * Validate feature dependencies (detect cycles)
 * @param {string} feature - Feature name
 * @param {string[]} dependsOn - Proposed dependencies
 * @returns {{valid: boolean, cycle: string[]}}
 */
function validateDependencies(feature, dependsOn) {
  // Build dependency graph
  const graph = new Map();
  graph.set(feature, dependsOn);

  // Load existing dependencies for all active features
  const { getActiveFeatures: getActive } = getStatus();
  for (const name of getActive()) {
    if (name === feature) continue;
    const wf = loadFeatureWorkflow(name);
    if (wf?.dependsOn) {
      graph.set(name, wf.dependsOn);
    }
  }

  // DFS cycle detection
  const visited = new Set();
  const inStack = new Set();
  const cyclePath = [];

  function hasCycle(node) {
    if (inStack.has(node)) {
      cyclePath.push(node);
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);
    cyclePath.push(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (hasCycle(dep)) return true;
    }

    inStack.delete(node);
    cyclePath.pop();
    return false;
  }

  if (hasCycle(feature)) {
    return { valid: false, cycle: cyclePath };
  }

  return { valid: true, cycle: [] };
}

/**
 * Get feature dashboard summary (CLI-formatted)
 * @returns {string}
 */
function getFeatureDashboard() {
  const { features, activeCount, doPhaseFeature } = getActiveFeatures();

  const lines = [
    `Feature Dashboard (${activeCount}/${MAX_CONCURRENT_FEATURES} active)`,
    '─'.repeat(50),
  ];

  if (features.length === 0) {
    lines.push('  No active features');
    return lines.join('\n');
  }

  for (const f of features) {
    const primary = f.isPrimary ? ' *' : '';
    const doLock = f.lockedBy ? ' [Do LOCK]' : '';
    const deps = f.dependsOn.length > 0 ? ` deps:[${f.dependsOn.join(',')}]` : '';
    lines.push(`  ${f.feature}${primary}: ${f.state}${doLock}${deps}`);
  }

  if (doPhaseFeature) {
    lines.push('');
    lines.push(`Do Lock: ${doPhaseFeature}`);
  }

  return lines.join('\n');
}

/**
 * Get parallel feature summary object
 * @returns {{active: number, maxAllowed: number, doLocked: string|null, features: Object[]}}
 */
function getSummary() {
  const { features, activeCount, doPhaseFeature } = getActiveFeatures();
  return {
    active: activeCount,
    maxAllowed: MAX_CONCURRENT_FEATURES,
    doLocked: doPhaseFeature,
    features,
  };
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  // Constants
  MAX_CONCURRENT_FEATURES,
  MAX_CONCURRENT_DO,

  // Core API
  getActiveFeatures,
  canStartFeature,
  registerFeature,
  checkConflict,
  releaseFeature,

  // Do Lock
  acquireDoLock,
  releaseDoLock,
  getDoLock,

  // Dependencies
  setDependencies,
  validateDependencies,

  // Workflow state
  loadFeatureWorkflow,
  saveFeatureWorkflow,

  // Dashboard
  getFeatureDashboard,
  getSummary,
};
