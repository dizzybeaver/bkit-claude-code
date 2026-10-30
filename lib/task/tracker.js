/**
 * Task Tracking Module
 * @module lib/task/tracker
 * @version 2.1.10
 */

// Lazy require
let _core = null;
function getCore() {
  if (!_core) {
    _core = require('../core');
  }
  return _core;
}

let _pdca = null;
function getPdca() {
  if (!_pdca) {
    _pdca = require('../pdca');
  }
  return _pdca;
}

/**
 * Save PDCA task ID for persistence
 * @param {string} feature
 * @param {string} phase
 * @param {string} taskId
 * @param {Object} options
 */
function savePdcaTaskId(feature, phase, taskId, options = {}) {
  const { debugLog } = getCore();
  const { getPdcaStatusFull, savePdcaStatus } = getPdca();

  const status = getPdcaStatusFull(true);
  if (!status) return;

  if (!status.features[feature]) {
    status.features[feature] = {
      phase: phase,
      timestamps: { started: new Date().toISOString() }
    };
  }

  if (!status.features[feature].tasks) {
    status.features[feature].tasks = {};
  }

  status.features[feature].tasks[phase] = taskId;
  status.features[feature].currentTaskId = taskId;

  savePdcaStatus(status);
  debugLog('task', 'Saved task ID', { feature, phase, taskId });
}

/**
 * Get PDCA task ID
 * @param {string} feature
 * @param {string} phase
 * @param {Object} options
 * @returns {string|null}
 */
function getPdcaTaskId(feature, phase, options = {}) {
  const { getPdcaStatusFull } = getPdca();

  const status = getPdcaStatusFull();
  if (!status?.features?.[feature]?.tasks) return null;

  return status.features[feature].tasks[phase] || null;
}

/**
 * Get task chain status
 * @param {string} feature
 * @returns {Object}
 */
function getTaskChainStatus(feature) {
  const { getPdcaStatusFull, PDCA_PHASES } = getPdca();

  const status = getPdcaStatusFull();
  if (!status?.features?.[feature]) {
    return { exists: false, tasks: {} };
  }

  const featureStatus = status.features[feature];
  const tasks = featureStatus.tasks || {};

  const phases = ['plan', 'design', 'do', 'check', 'act', 'report'];
  const chainStatus = {};

  for (const phase of phases) {
    chainStatus[phase] = {
      taskId: tasks[phase] || null,
      status: featureStatus.phase === phase ? 'in_progress' :
              phases.indexOf(phase) < phases.indexOf(featureStatus.phase) ? 'completed' : 'pending'
    };
  }

  return {
    exists: true,
    feature,
    currentPhase: featureStatus.phase,
    matchRate: featureStatus.matchRate,
    tasks: chainStatus
  };
}

/**
 * Find PDCA status path
 * @returns {string|null}
 */
function findPdcaStatus() {
  const fs = require('fs');
  const { getPdcaStatusPath } = getPdca();
  const statusPath = getPdcaStatusPath();
  return fs.existsSync(statusPath) ? statusPath : null;
}

/**
 * Get current PDCA phase for feature
 * @param {string} feature
 * @returns {string|null}
 */
function getCurrentPdcaPhase(feature) {
  const { getPdcaStatusFull } = getPdca();

  const status = getPdcaStatusFull();
  return status?.features?.[feature]?.phase || null;
}

module.exports = {
  savePdcaTaskId,
  getPdcaTaskId,
  getTaskChainStatus,
  findPdcaStatus,
  getCurrentPdcaPhase,
};
