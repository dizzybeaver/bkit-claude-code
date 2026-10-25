/**
 * PDCA Status — Cleanup functions (delete, enforce limit, archive summary).
 *
 * Design Ref: bkit-v2110-integrated-enhancement.design.md §4.1
 * Plan SC: Sprint 1 status.js 872→3파일 분할 — cleanup 로직 별도 모듈.
 *
 * Split from `lib/pdca/status.js` (v2.1.9 baseline).
 *
 * @module lib/pdca/status-cleanup
 *
 * @version 2.1.12
 */

// Lazy imports to avoid circular deps.
let _core = null;
function getCore() {
  if (!_core) _core = require('../core');
  return _core;
}
let _coreStatus = null;
/** Project-scoped cache key — mirrors status-core's _getCacheKey (#48). */
function _statusCacheKey() {
  try {
    const { PROJECT_DIR } = require('../core/platform');
    return `pdca-status:${PROJECT_DIR}`;
  } catch {
    return 'pdca-status';
  }
}

function getStatusCore() {
  if (!_coreStatus) _coreStatus = require('./status-core');
  return _coreStatus;
}

/**
 * Design Ref: §6/§11 (FR-06, br152) — disposal matches archived rows by
 * phase; `archivedTo` is a fallback marker only when the phase is absent,
 * so archived-without-archivedTo rows are reachable by the deletion surface
 * while phase-less parked rows still count as terminal.
 * @param {object} f - Feature row
 * @returns {boolean}
 */
function isTerminalRow(f) {
  if (!f) return false;
  if (f.phase) return f.phase === 'archived' || f.phase === 'completed';
  return f.archivedTo !== undefined;
}

/**
 * Delete feature completely from PDCA status
 * @param {string} feature - Feature name to delete
 * @returns {{ success: boolean, reason?: string, deletedFeature?: string }}
 */
function deleteFeatureFromStatus(feature) {
  const { debugLog } = getCore();
  const { getPdcaStatusFull } = getStatusCore();
  let status = getPdcaStatusFull(true);

  if (!status) return { success: false, reason: 'Status not found' };
  if (!status.features[feature]) return { success: false, reason: 'Feature not found' };

  const featureStatus = status.features[feature];
  // Design Ref: §3 Fix 3 (BR-001) — sanctioned orphan path. An active-feature
  // row with a NON-terminal phase whose plan/design docs are both gone is an
  // orphan; it must be removable. Live features with docs on disk stay refused.
  const isTerminal = isTerminalRow(featureStatus);
  const isOrphan = !isTerminal && !hasPlanOrDesignDoc(feature);
  if (status.activeFeatures.includes(feature) && !isTerminal && !isOrphan) {
    return { success: false, reason: 'Cannot delete active feature' };
  }

  delete status.features[feature];
  status.activeFeatures = status.activeFeatures.filter((f) => f !== feature);
  if (status.primaryFeature === feature) {
    status.primaryFeature = getStatusCore().pickPrimarySuccessor(status);
  }

  // br030: locked RMW — the read→mutate→savePdcaStatus pair was unlocked, so
  // concurrent writers could clobber each other's feature entries.
  const { stateStore, globalCache } = getCore();
  status = stateStore.lockedUpdate(getStatusCore().getPdcaStatusPath(), (current) => {
    if (!current) return status;
    delete current.features[feature];
    current.activeFeatures = current.activeFeatures.filter((f) => f !== feature);
    if (current.primaryFeature === feature) {
      current.primaryFeature = getStatusCore().pickPrimarySuccessor(current);
    }
    current.history.push({
      timestamp: new Date().toISOString(),
      action: isOrphan ? 'orphan_feature_deleted' : 'feature_deleted',
      feature: feature,
    });
    if (current.history.length > 100) current.history = current.history.slice(-100);
    return current;
  });
  if (status) globalCache.set(_statusCacheKey(), status);
  debugLog('PDCA', `Feature deleted: ${feature}${isOrphan ? ' (orphan-removed)' : ''}`);
  return {
    success: true,
    deletedFeature: feature,
    ...(isOrphan ? { reason: 'orphan-removed (docs missing)' } : {}),
  };
}

/**
 * Design Ref: §3 Fix 3 — does the feature have a plan or design doc on disk?
 * Reuses the phase module's findPlanDoc/findDesignDoc (same doc resolution the
 * shouldUpdate gate uses) instead of hardcoding paths.
 * @param {string} feature
 * @returns {boolean}
 */
function hasPlanOrDesignDoc(feature) {
  try {
    const { findPlanDoc, findDesignDoc } = require('./phase');
    return !!findPlanDoc(feature) || !!findDesignDoc(feature);
  } catch {
    // Design Ref: §6/§11 (FR-01, br150) — a name the path-safe validator
    // rejects can never match a doc path: that lookup throw is a clean miss
    // (no docs), keeping the orphan path reachable. Any other lookup failure
    // (fs/permission) keeps the conservative refuse.
    try {
      require('../core/name-validator').validateFeatureName(feature);
    } catch {
      return false;
    }
    return true;
  }
}

/**
 * Enforce maximum feature count, delete oldest archived features
 * @param {number} maxFeatures - Maximum features to keep (default: 50)
 * @returns {{ success: boolean, deletedCount: number, deleted: string[], remaining: number }}
 */
function enforceFeatureLimit(maxFeatures = 50) {
  const { debugLog } = getCore();
  const { getPdcaStatusFull } = getStatusCore();
  let status = getPdcaStatusFull(true);

  if (!status) return { success: false, deletedCount: 0, deleted: [], remaining: 0 };

  const featureNames = Object.keys(status.features);
  const featureCount = featureNames.length;
  if (featureCount <= maxFeatures) {
    return { success: true, deletedCount: 0, deleted: [], remaining: featureCount };
  }

  // FR-05 (br159): terminal screen via isTerminalRow (third disposal site) —
  // the inline 'archived'||'completed' phase filter made phase-less
  // archivedTo-marker rows invisible to auto-cleanup.
  // Design Ref: §2 module-2
  const archived = Object.entries(status.features)
    .filter(([, f]) => isTerminalRow(f))
    .sort((a, b) => {
      const dateA = new Date(a[1].timestamps?.archivedAt || a[1].timestamps?.lastUpdated || 0);
      const dateB = new Date(b[1].timestamps?.archivedAt || b[1].timestamps?.lastUpdated || 0);
      return dateA - dateB;
    });

  const toDeleteCount = featureCount - maxFeatures;
  const deleted = [];

  for (let i = 0; i < Math.min(toDeleteCount, archived.length); i++) {
    const featureName = archived[i][0];
    delete status.features[featureName];
    status.activeFeatures = status.activeFeatures.filter((f) => f !== featureName);
    deleted.push(featureName);
  }

  if (deleted.length === 0) {
    debugLog('PDCA', 'Feature limit exceeded but no archived features to delete');
    return {
      success: true,
      deletedCount: 0,
      deleted: [],
      remaining: Object.keys(status.features).length,
    };
  }

  // br030: locked RMW — apply the planned deletions under the state lock.
  const { stateStore, globalCache } = getCore();
  status = stateStore.lockedUpdate(getStatusCore().getPdcaStatusPath(), (current) => {
    if (!current) return status;
    for (const featureName of deleted) {
      delete current.features[featureName];
      current.activeFeatures = current.activeFeatures.filter((f) => f !== featureName);
    }
    current.history.push({
      timestamp: new Date().toISOString(),
      action: 'auto_cleanup',
      deletedCount: deleted.length,
      deleted: deleted,
    });
    if (current.history.length > 100) current.history = current.history.slice(-100);
    if (deleted.includes(current.primaryFeature)) {
      current.primaryFeature = getStatusCore().pickPrimarySuccessor(current);
    }
    return current;
  });
  if (status) globalCache.set(_statusCacheKey(), status);
  debugLog('PDCA', `Auto cleanup: deleted ${deleted.length} features`, { deleted });
  return {
    success: true,
    deletedCount: deleted.length,
    deleted,
    remaining: Object.keys(status.features).length,
  };
}

/**
 * Get list of archived or completed features
 * @returns {string[]} Feature names
 */
function getArchivedFeatures() {
  const { getPdcaStatusFull } = getStatusCore();
  const status = getPdcaStatusFull();
  if (!status) return [];
  return Object.entries(status.features)
    .filter(([, f]) => isTerminalRow(f))
    .map(([name]) => name);
}

/**
 * Cleanup specific archived features or all archived
 * @param {string[]|null} features - Feature names to delete (optional, all if not specified)
 * @returns {{ success: boolean, deletedCount: number, deleted: string[], remaining: number }}
 */
function cleanupArchivedFeatures(features = null) {
  const { debugLog } = getCore();
  const { getPdcaStatusFull } = getStatusCore();
  let status = getPdcaStatusFull(true);

  if (!status) return { success: false, deletedCount: 0, deleted: [], remaining: 0 };

  const targets = features || getArchivedFeatures();
  const deleted = [];

  for (const feature of targets) {
    const featureStatus = status.features[feature];
    if (!featureStatus || !isTerminalRow(featureStatus)) {
      continue;
    }
    delete status.features[feature];
    status.activeFeatures = status.activeFeatures.filter((f) => f !== feature);
    deleted.push(feature);
  }

  if (deleted.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      deleted: [],
      remaining: Object.keys(status.features).length,
    };
  }

  // br030: locked RMW — apply the planned deletions under the state lock.
  const { stateStore, globalCache } = getCore();
  status = stateStore.lockedUpdate(getStatusCore().getPdcaStatusPath(), (current) => {
    if (!current) return status;
    for (const featureName of deleted) {
      delete current.features[featureName];
      current.activeFeatures = current.activeFeatures.filter((f) => f !== featureName);
    }
    current.history.push({
      timestamp: new Date().toISOString(),
      action: 'feature_deleted',
      deletedCount: deleted.length,
      deleted: deleted,
    });
    if (current.history.length > 100) current.history = current.history.slice(-100);
    if (deleted.includes(current.primaryFeature)) {
      current.primaryFeature = getStatusCore().pickPrimarySuccessor(current);
    }
    return current;
  });
  if (status) globalCache.set(_statusCacheKey(), status);
  debugLog('PDCA', `Manual cleanup: deleted ${deleted.length} features`);
  return {
    success: true,
    deletedCount: deleted.length,
    deleted,
    remaining: Object.keys(status.features).length,
  };
}

/**
 * br040-041-followups: purge legacy junk rows from activeFeatures (br041
 * intake guard landed after arbitrary argument sentences already flowed in).
 * Partitions activeFeatures by the shared shape validator; each invalid name
 * loses its features[] row (if any) and its active slot. Primary promotion
 * follows the existing pickPrimarySuccessor semantics. Locked save (br030).
 * @returns {{ success: boolean, removed: string[], remaining: number }}
 */
function cleanupOrphanActiveFeatures() {
  const { debugLog } = getCore();
  const { getPdcaStatusFull } = getStatusCore();
  let status = getPdcaStatusFull(true);

  if (!status) return { success: false, removed: [], remaining: 0 };

  const { isValidFeatureName } = require('./validate-name');
  const removed = (status.activeFeatures || []).filter((f) => !isValidFeatureName(f));

  if (removed.length === 0) {
    return { success: true, removed: [], remaining: Object.keys(status.features).length };
  }

  // br030: locked RMW — apply the purge against the latest on-disk state so
  // a concurrent writer's changes survive.
  const { stateStore, globalCache } = getCore();
  status = stateStore.lockedUpdate(getStatusCore().getPdcaStatusPath(), (current) => {
    if (!current) return status;
    for (const name of removed) {
      delete current.features[name];
      current.activeFeatures = (current.activeFeatures || []).filter((f) => f !== name);
    }
    if (removed.includes(current.primaryFeature)) {
      current.primaryFeature = getStatusCore().pickPrimarySuccessor(current);
    }
    current.history.push({
      timestamp: new Date().toISOString(),
      action: 'junk_active_feature_cleaned',
      deletedCount: removed.length,
      deleted: removed,
    });
    if (current.history.length > 100) current.history = current.history.slice(-100);
    return current;
  });
  if (status) globalCache.set(_statusCacheKey(), status);
  debugLog('PDCA', `Junk active-feature cleanup: removed ${removed.length}`, { removed });
  return {
    success: true,
    removed,
    remaining: status ? Object.keys(status.features).length : 0,
  };
}

/**
 * FR-04: Archive feature to summary (preserve minimal info).
 *
 * @param {string} feature - Feature name to convert
 * @returns {{ success: boolean, reason?: string, summarizedFeature?: string }}
 */
function archiveFeatureToSummary(feature) {
  const { debugLog } = getCore();
  const { getPdcaStatusFull } = getStatusCore();
  let status = getPdcaStatusFull(true);

  if (!status) return { success: false, reason: 'Status not found' };
  if (!status.features[feature]) return { success: false, reason: 'Feature not found' };

  const full = status.features[feature];
  if (full.phase !== 'archived' && full.phase !== 'completed') {
    return { success: false, reason: 'Feature must be archived or completed' };
  }

  status.features[feature] = {
    phase: 'archived',
    matchRate: full.matchRate,
    iterationCount: full.iterationCount || 0,
    startedAt: full.timestamps?.started || null,
    archivedAt: full.timestamps?.archivedAt || new Date().toISOString(),
    archivedTo: full.archivedTo || null,
  };

  status.activeFeatures = status.activeFeatures.filter((f) => f !== feature);
  if (status.primaryFeature === feature) {
    status.primaryFeature = getStatusCore().pickPrimarySuccessor(status);
  }

  // br030: locked RMW — re-apply the summary conversion against the latest
  // on-disk state so a concurrent writer's changes survive.
  const { stateStore, globalCache } = getCore();
  status = stateStore.lockedUpdate(getStatusCore().getPdcaStatusPath(), (current) => {
    if (!current) return status;
    const latest = current.features[feature] || full;
    if (latest.phase !== 'archived' && latest.phase !== 'completed') return status;
    current.features[feature] = {
      phase: 'archived',
      matchRate: latest.matchRate,
      iterationCount: latest.iterationCount || 0,
      startedAt: latest.timestamps?.started || null,
      archivedAt: latest.timestamps?.archivedAt || new Date().toISOString(),
      archivedTo: latest.archivedTo || null,
    };
    current.activeFeatures = current.activeFeatures.filter((f) => f !== feature);
    if (current.primaryFeature === feature) {
      current.primaryFeature = getStatusCore().pickPrimarySuccessor(current);
    }
    current.history.push({
      timestamp: new Date().toISOString(),
      action: 'feature_summarized',
      feature: feature,
    });
    if (current.history.length > 100) current.history = current.history.slice(-100);
    return current;
  });
  if (status) globalCache.set(_statusCacheKey(), status);
  debugLog('PDCA', `Feature summarized: ${feature}`);
  return { success: true, summarizedFeature: feature };
}

module.exports = {
  isTerminalRow,
  deleteFeatureFromStatus,
  enforceFeatureLimit,
  getArchivedFeatures,
  cleanupArchivedFeatures,
  cleanupOrphanActiveFeatures,
  archiveFeatureToSummary,
};
