/**
 * Quality Metrics Collector - 16 Quality Metrics (M1-M16)
 * @module lib/quality/metrics-collector
 * @version 2.1.10
 *
 * Collects, stores, and analyzes quality metrics across PDCA cycles.
 * Supports snapshot storage and time-series history with trend analysis.
 *
 * Design: docs/02-design/features/bkit-v200-enhancement.design.md Section 2.8
 * Plan: docs/01-plan/features/bkit-v200-enhancement.plan.md Section 11
 */

const path = require('path');
const stateStore = require('../core/state-store');
const { STATE_PATHS } = require('../core/paths');
const { MAX_QUALITY_HISTORY } = require('../core/constants');

// ============================================================
// Metric Specifications (M1-M16)
// ============================================================

/**
 * @typedef {Object} MetricSpec
 * @property {string} id - Metric identifier (M1-M16)
 * @property {string} name - Human-readable metric name
 * @property {string} collector - Agent/source that collects this metric
 * @property {string} unit - Unit of measurement (%, count, 0-100, ms, hours, %p/iteration)
 * @property {'higher'|'lower'} direction - Whether higher or lower is better
 */

/** @type {Record<string, MetricSpec>} */
const METRIC_SPECS = {
  M1: { id: 'M1', name: 'Match Rate', collector: 'gap-detector', unit: '%', direction: 'higher' },
  M2: { id: 'M2', name: 'Code Quality Score', collector: 'code-analyzer', unit: '0-100', direction: 'higher' },
  M3: { id: 'M3', name: 'Critical Issue Count', collector: 'code-analyzer', unit: 'count', direction: 'lower' },
  M4: { id: 'M4', name: 'API Compliance Rate', collector: 'gap-detector', unit: '%', direction: 'higher' },
  M5: { id: 'M5', name: 'Runtime Error Rate', collector: 'qa-monitor', unit: '%', direction: 'lower' },
  M6: { id: 'M6', name: 'P95 Response Time', collector: 'qa-monitor', unit: 'ms', direction: 'lower' },
  M7: { id: 'M7', name: 'Convention Compliance', collector: 'code-analyzer', unit: '%', direction: 'higher' },
  M8: { id: 'M8', name: 'Design Completeness', collector: 'design-validator', unit: '0-100', direction: 'higher' },
  M9: { id: 'M9', name: 'Iteration Efficiency', collector: 'pdca-iterator', unit: '%p/iteration', direction: 'higher' },
  M10: { id: 'M10', name: 'PDCA Cycle Time', collector: 'computed', unit: 'hours', direction: 'lower' },

  // v2.1.1: QA Phase Metrics
  M11: { id: 'M11', name: 'QA Pass Rate', collector: 'qa-lead', unit: '%', direction: 'higher' },
  M12: { id: 'M12', name: 'Test Coverage L1', collector: 'qa-test-generator', unit: '%', direction: 'higher' },
  M13: { id: 'M13', name: 'E2E Scenario Coverage', collector: 'qa-lead', unit: '%', direction: 'higher' },
  M14: { id: 'M14', name: 'Runtime Error Count', collector: 'qa-debug-analyst', unit: 'count', direction: 'lower' },
  M15: { id: 'M15', name: 'Data Flow Integrity', collector: 'qa-lead', unit: '%', direction: 'higher' },

  /*
   * M16 — the gate's second QA pass condition had no metric behind it.
   *
   * gate-manager's `qa` gate has required `qaCriticalCount === 0` since v2.1.1,
   * but no M-ID ever mapped to that name, so `toGateFormat` could not produce
   * the key. `_evaluateCondition` treats an absent metric as not satisfied, so
   * `passCount < totalPass` held on every run and the qa gate could never
   * return 'pass' — QA was structurally unable to advance to Report regardless
   * of how the tests actually went. The metric, not the gate, was missing.
   */
  M16: { id: 'M16', name: 'QA Critical Count', collector: 'qa-lead', unit: 'count', direction: 'lower' },
};

// ============================================================
// Schema Bridge: M-ID ↔ Gate-Manager friendly names
// ============================================================

/**
 * Mapping from metric ID (M1-M16) to gate-manager metric names.
 * gate-manager uses these keys in GATE_DEFINITIONS conditions.
 * @type {Record<string, string>}
 */
const METRIC_ID_TO_GATE_NAME = {
  M1: 'matchRate',
  M2: 'codeQualityScore',
  M3: 'criticalIssueCount',
  M4: 'apiComplianceRate',
  M5: 'runtimeErrorRate',
  M6: 'p95ResponseTime',
  M7: 'conventionCompliance',
  M8: 'designCompleteness',
  M9: 'iterationEfficiency',
  M10: 'pdcaCycleTimeHours',
  M11: 'qaPassRate',
  M12: 'testCoverageL1',
  M13: 'e2eScenarioCoverage',
  M14: 'runtimeErrorCount',
  M15: 'dataFlowIntegrity',
  M16: 'qaCriticalCount',
};

/** @type {Record<string, string>} */
const GATE_NAME_TO_METRIC_ID = Object.fromEntries(
  Object.entries(METRIC_ID_TO_GATE_NAME).map(([k, v]) => [v, k])
);

/**
 * Convert collected metrics (keyed by M1-M16) to gate-manager format
 * (keyed by friendly names like matchRate, codeQualityScore).
 *
 * @param {string} feature - Feature name
 * @returns {Record<string, number>|null} Flat object for gate-manager, or null
 */
function toGateFormat(feature) {
  const snapshot = readCurrentMetrics(feature);
  if (!snapshot || !snapshot.metrics) return null;

  const result = {};
  for (const [metricId, gateName] of Object.entries(METRIC_ID_TO_GATE_NAME)) {
    const entry = snapshot.metrics[metricId];
    if (entry && entry.value != null) {
      result[gateName] = entry.value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Convert collected metrics to pdca-status.json metrics sub-object format.
 *
 * @param {string} feature - Feature name
 * @returns {Object|null} Object matching pdca-status feat.metrics shape
 */
function toPdcaStatusFormat(feature) {
  const gateMetrics = toGateFormat(feature);
  if (!gateMetrics) return null;

  return {
    qualityScore: gateMetrics.codeQualityScore ?? null,
    conventionCompliance: gateMetrics.conventionCompliance ?? null,
    apiCompliance: gateMetrics.apiComplianceRate ?? null,
    cycleTimeMs: gateMetrics.pdcaCycleTimeHours != null
      ? Math.round(gateMetrics.pdcaCycleTimeHours * 3600000)
      : null,
    iterationEfficiency: gateMetrics.iterationEfficiency ?? null,
  };
}

// ============================================================
// Storage Paths
// ============================================================

/**
 * Get path to quality metrics snapshot file.
 * @returns {string}
 */
function _metricsPath() {
  return path.join(STATE_PATHS.state(), 'quality-metrics.json');
}

/**
 * Get path to quality history time-series file.
 * @returns {string}
 */
function _historyPath() {
  return path.join(STATE_PATHS.state(), 'quality-history.json');
}

// ============================================================
// Metric Collection
// ============================================================

/**
 * @typedef {Object} QualityMetrics
 * @property {string} feature - Feature name
 * @property {string} phase - PDCA phase when collected
 * @property {string} projectLevel - Project level
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {Record<string, {value: number, collector: string, collectedAt: string}>} metrics - Metric values
 */

/**
 * Collect a single metric value.
 * Updates the current metrics snapshot for the feature.
 *
 * @param {string} metricId - Metric identifier (M1-M16)
 * @param {string} feature - Feature name
 * @param {number} value - Measured value
 * @param {string} [collector] - Override collector name (defaults to spec)
 */
function collectMetric(metricId, feature, value, collector) {
  const spec = METRIC_SPECS[metricId];
  if (!spec) return;

  const filePath = _metricsPath();
  // H2 fix (audit): locked RMW so concurrent collectors don't clobber each other's
  // updates — the bare read→mutate→write lost the loser's delta silently.
  stateStore.lockedUpdate(filePath, (current) => {
    const next = current && typeof current === 'object' ? current : {};

    if (!next[feature]) {
      next[feature] = {
        feature,
        phase: null,
        projectLevel: null,
        timestamp: new Date().toISOString(),
        metrics: {},
      };
    }

    next[feature].metrics[metricId] = {
      value,
      collector: collector || spec.collector,
      collectedAt: new Date().toISOString(),
    };
    next[feature].timestamp = new Date().toISOString();

    return next;
  });
}

/**
 * Collect all available metrics for a PDCA phase.
 * This is typically called by check/act agents after analysis completes.
 *
 * @param {string} phase - PDCA phase name
 * @param {string} feature - Feature name
 * @param {string} [projectLevel='Dynamic'] - Project level
 * @returns {QualityMetrics|null} Current metrics snapshot for the feature, or null
 */
function collectPhaseMetrics(phase, feature, projectLevel) {
  const filePath = _metricsPath();
  // H2 fix (audit): locked RMW — preserves the no-op-when-absent contract
  // (returns null without writing when the feature has no metrics yet).
  let result = null;
  stateStore.lockedUpdate(filePath, (current) => {
    const next = current && typeof current === 'object' ? current : {};
    if (!next[feature]) {
      result = null;
      return next; // feature absent — no-op write, return snapshot null below
    }
    next[feature].phase = phase;
    next[feature].projectLevel = projectLevel || 'Dynamic';
    next[feature].timestamp = new Date().toISOString();
    result = next[feature];
    return next;
  });
  return result;
}

// ============================================================
// Storage Operations
// ============================================================

/**
 * Save a complete metrics snapshot (overwrite for feature).
 * @param {QualityMetrics} metrics - Full metrics object to save
 */
function saveMetrics(metrics) {
  if (!metrics || !metrics.feature) return;

  const filePath = _metricsPath();
  // br031: locked RMW — same concurrency fix as collectMetric (H2 audit).
  // The bare read→mutate→write pair could drop a concurrent collector's entry.
  stateStore.lockedUpdate(filePath, (current) => {
    const next = current && typeof current === 'object' ? current : {};
    next[metrics.feature] = metrics;
    return next;
  });
}

/**
 * Append a data point to quality history (time series).
 * Enforces FIFO with MAX_QUALITY_HISTORY limit (100 points).
 *
 * @param {Object} dataPoint - Data point to append
 * @param {string} dataPoint.feature - Feature name
 * @param {string} dataPoint.phase - PDCA phase
 * @param {number} dataPoint.cycle - PDCA iteration number
 * @param {string} dataPoint.timestamp - ISO 8601 timestamp
 * @param {Record<string, number>} dataPoint.values - Metric values keyed by metric ID
 */
function appendHistory(dataPoint) {
  const filePath = _historyPath();
  // br031: locked RMW — same concurrency fix as collectMetric (H2 audit).
  stateStore.lockedUpdate(filePath, (current) => {
    const history = current && typeof current === 'object' && Array.isArray(current.points)
      ? current
      : { points: [] };

    history.points.push(dataPoint);

    // FIFO: keep last MAX_QUALITY_HISTORY entries
    if (history.points.length > MAX_QUALITY_HISTORY) {
      history.points = history.points.slice(-MAX_QUALITY_HISTORY);
    }

    history.lastUpdated = new Date().toISOString();
    return history;
  });
}

/**
 * Read current metrics snapshot for a feature.
 * @param {string} feature - Feature name
 * @returns {QualityMetrics|null}
 */
function readCurrentMetrics(feature) {
  const filePath = _metricsPath();
  const current = stateStore.read(filePath);
  if (!current || !current[feature]) return null;
  return current[feature];
}

/**
 * Read recent history data points, optionally filtered by feature.
 * @param {number} [cycles=10] - Number of recent cycles to retrieve
 * @param {string} [feature] - Filter by feature name (null = all features)
 * @returns {Object[]} Array of QualityDataPoint objects
 */
function readRecentHistory(cycles, feature) {
  const filePath = _historyPath();
  const history = stateStore.read(filePath);
  if (!history || !history.points) return [];

  let points = history.points;
  if (feature) {
    points = points.filter(p => p.feature === feature);
  }

  const limit = cycles || 10;
  return points.slice(-limit);
}

// ============================================================
// Trend Analysis
// ============================================================

/**
 * @typedef {Object} AlarmCondition
 * @property {string} type - Alarm type identifier
 * @property {string} message - Human-readable alarm message
 * @property {string} recommendation - Recommended action
 */

/**
 * @typedef {Object} TrendAnalysis
 * @property {number} cycles - Number of cycles analyzed
 * @property {Record<string, number>} movingAverages - 3-cycle moving averages per metric
 * @property {'improving'|'stable'|'declining'} trend - Overall quality trend
 * @property {AlarmCondition[]} alarms - Triggered alarm conditions
 */

/**
 * Analyze quality trends for a feature based on history.
 * Checks 6 alarm conditions for early warning.
 *
 * @param {string} feature - Feature name
 * @returns {TrendAnalysis}
 */
function analyzeTrend(feature) {
  const points = readRecentHistory(20, feature);

  const result = {
    cycles: points.length,
    movingAverages: {},
    trend: /** @type {'improving'|'stable'|'declining'} */ ('stable'),
    alarms: [],
  };

  if (points.length < 2) return result;

  // Compute 3-cycle moving averages for key metrics
  const metricIds = ['M1', 'M2', 'M3', 'M7', 'M9', 'M10'];
  for (const mid of metricIds) {
    const values = points
      .filter(p => p.values && p.values[mid] != null)
      .map(p => p.values[mid]);
    if (values.length >= 3) {
      const last3 = values.slice(-3);
      result.movingAverages[mid] = Math.round((last3[0] + last3[1] + last3[2]) / 3 * 100) / 100;
    }
  }

  // Determine overall trend from matchRate (M1)
  const matchRates = points
    .filter(p => p.values && p.values.M1 != null)
    .map(p => p.values.M1);

  if (matchRates.length >= 3) {
    const recent = matchRates.slice(-3);
    const earlier = matchRates.slice(-6, -3);
    if (earlier.length >= 3) {
      const recentAvg = (recent[0] + recent[1] + recent[2]) / 3;
      const earlierAvg = (earlier[0] + earlier[1] + earlier[2]) / 3;
      if (recentAvg > earlierAvg + 2) {
        result.trend = 'improving';
      } else if (recentAvg < earlierAvg - 2) {
        result.trend = 'declining';
      }
    }
  }

  // ---- 6 Alarm Conditions ----

  // Alarm 1: 3-cycle consecutive matchRate decline
  if (matchRates.length >= 3) {
    const last3 = matchRates.slice(-3);
    if (last3[2] < last3[1] && last3[1] < last3[0]) {
      result.alarms.push({
        type: 'matchRate_consecutive_decline',
        message: 'Match rate declined for 3 consecutive cycles',
        recommendation: 'Architecture review recommended. Check if design docs are diverging from implementation.',
      });
    }
  }

  // Alarm 2: Critical issues 2+ consecutive cycles
  const criticalCounts = points
    .filter(p => p.values && p.values.M3 != null)
    .map(p => p.values.M3);
  if (criticalCounts.length >= 2) {
    const last2 = criticalCounts.slice(-2);
    if (last2[0] > 0 && last2[1] > 0) {
      result.alarms.push({
        type: 'critical_issues_persistent',
        message: 'Critical issues present in 2+ consecutive cycles',
        recommendation: 'Regression alert: investigate root cause of persistent critical issues.',
      });
    }
  }

  // Alarm 3: Quality Score moving avg < 75
  if (result.movingAverages.M2 != null && result.movingAverages.M2 < 75) {
    result.alarms.push({
      type: 'quality_score_low',
      message: `Code quality score moving average is ${result.movingAverages.M2} (< 75)`,
      recommendation: 'Refactoring recommended. Focus on code structure and best practices.',
    });
  }

  // Alarm 4: Iteration efficiency < 3%p
  if (result.movingAverages.M9 != null && result.movingAverages.M9 < 3) {
    result.alarms.push({
      type: 'iteration_efficiency_low',
      message: `Iteration efficiency is ${result.movingAverages.M9}%p (< 3%p)`,
      recommendation: 'Strategy review needed. Each iteration should improve matchRate by at least 3%p.',
    });
  }

  // Alarm 5: Cycle time > 150% budget
  // Budget heuristic: 4 hours for standard feature
  const cycleTimes = points
    .filter(p => p.values && p.values.M10 != null)
    .map(p => p.values.M10);
  if (cycleTimes.length >= 1) {
    const lastCycleTime = cycleTimes[cycleTimes.length - 1];
    const budgetHours = 4;
    if (lastCycleTime > budgetHours * 1.5) {
      result.alarms.push({
        type: 'cycle_time_exceeded',
        message: `Cycle time ${lastCycleTime}h exceeds 150% of ${budgetHours}h budget`,
        recommendation: 'Consider splitting the task into smaller features for faster iteration.',
      });
    }
  }

  // Alarm 6: Convention compliance -10%p drop
  const conventions = points
    .filter(p => p.values && p.values.M7 != null)
    .map(p => p.values.M7);
  if (conventions.length >= 2) {
    const prev = conventions[conventions.length - 2];
    const curr = conventions[conventions.length - 1];
    if (prev - curr >= 10) {
      result.alarms.push({
        type: 'convention_compliance_drop',
        message: `Convention compliance dropped by ${prev - curr}%p (from ${prev}% to ${curr}%)`,
        recommendation: 'Run linter check. New code may be violating established conventions.',
      });
    }
  }

  return result;
}

// ============================================================
// Sanctioned Recording Entry — br159 FR-02-alt
// ============================================================

/*
 * recordAnalysisMetrics(feature, metrics, source)
 *
 * WHY THIS EXISTS (pinned 2026-10-25, br159 live verification):
 * a gap-detector / code-analyzer dispatched via the Agent tool completes with
 * "Overall Match Rate: 95.8%" in its final report, yet the registry matchRate
 * stays null and the MCP gap-analysis store reads analyzedAt:null — because no
 * hook event ever reaches the parsers:
 *
 *   1. The subagent's own completion fires SubagentStop ->
 *      scripts/subagent-stop-handler.js, which records team status/progress
 *      only and never dispatches to gap-detector-stop.js / analysis-stop.js.
 *   2. The main-session Stop fires scripts/unified-stop.js, whose
 *      AGENT_HANDLERS dispatch needs detectActiveAgent() — and for an
 *      Agent-tool dispatch every source is dead: Stop payloads carry no
 *      agent_name/tool_input.subagent_type, getActiveAgent() is in-process
 *      memory (null in a fresh hook process), and session.lastAgent is written
 *      only by the Skill-tool fire path (skill-invocation-effects step-6).
 *
 * That gap is harness-side wiring, not a parser bug — so the sanctioned fix is
 * this exported entry, callable by the orchestrating session with the agent's
 * MEASURED values plus a source citation. It records ONLY the values it is
 * given: no fabricated baselines (the M2=75 / M7=80 class), no proxy
 * substitutions.
 */

/** Gate-name key -> metric ID for the values this entry accepts. */
const RECORDABLE_METRIC_IDS = {
  matchRate: 'M1',
  codeQualityScore: 'M2',
  criticalIssueCount: 'M3',
  apiComplianceRate: 'M4',
  conventionCompliance: 'M7',
};

/**
 * Record analysis metrics measured by a dispatched agent.
 *
 * @param {string} feature - Registry feature the analysis was about
 * @param {Object} metrics - Measured values (gate-name keys from
 *   RECORDABLE_METRIC_IDS). Only provided, finite numbers are recorded.
 * @param {string} source - Source citation (e.g. 'gap-detector agent report
 *   2026-10-25') used as the metric collector tag.
 * @returns {{success: boolean, feature?: string, recorded?: string[], matchRate?: number|null, reason?: string}}
 *   success:false + reason on refusal (E-BAD-ARGS / E-UNKNOWN-METRIC /
 *   E-INVALID-METRICS / E-NO-METRICS / E-UNKNOWN-FEATURE).
 */
function recordAnalysisMetrics(feature, metrics, source) {
  // Design Ref: §2 module-1 — sanctioned recording entry, measured values only
  if (typeof feature !== 'string' || !feature.trim() ||
      !metrics || typeof metrics !== 'object' ||
      typeof source !== 'string' || !source.trim()) {
    return { success: false, reason: 'E-BAD-ARGS' };
  }

  const keys = Object.keys(metrics);
  const unknown = keys.filter((k) => !(k in RECORDABLE_METRIC_IDS));
  if (unknown.length > 0) {
    return { success: false, reason: 'E-UNKNOWN-METRIC', unknown };
  }
  const invalid = keys.filter((k) => typeof metrics[k] !== 'number' || !Number.isFinite(metrics[k]));
  if (invalid.length > 0) {
    return { success: false, reason: 'E-INVALID-METRICS', invalid };
  }
  if (keys.length === 0) {
    return { success: false, reason: 'E-NO-METRICS' };
  }

  // Wrong-feature guard, same invariant as gap-detector-stop Fix 4c: a
  // resolved feature is recordable only if it exists in the PDCA registry.
  let status = null;
  try {
    const { getPdcaStatusFull } = require('../pdca/status');
    status = getPdcaStatusFull();
  } catch (_e) {
    status = null;
  }
  const known = !!status && !!status.features && feature in status.features;
  if (!known) {
    return { success: false, reason: 'E-UNKNOWN-FEATURE', feature };
  }

  for (const key of keys) {
    collectMetric(RECORDABLE_METRIC_IDS[key], feature, metrics[key], source);
  }

  // Registry matchRate, mirroring the hook's own write
  // (scripts/gap-detector-stop.js updatePdcaStatus block, requireDocs:false).
  if (metrics.matchRate != null) {
    try {
      const { updatePdcaStatus } = require('../pdca/status');
      updatePdcaStatus(feature, 'check', {
        matchRate: metrics.matchRate,
        measured: true,
        analysisDoc: `docs/03-analysis/${feature}.analysis.md`,
      }, { requireDocs: false });
    } catch (_e) {
      // Metric series already recorded; the registry write is best-effort and
      // surfaced via the return shape below.
    }
  }

  // MCP bkit_gap_analysis store (.bkit/state/gap-analysis.json) — nothing in
  // lib/ or scripts/ ever wrote it, so analyzedAt was structurally null.
  // Design Ref: §2 module-1
  const analyzedAt = new Date().toISOString();
  stateStore.lockedUpdate(
    path.join(STATE_PATHS.state(), 'gap-analysis.json'),
    (current) => {
      const next = current && typeof current === 'object' ? current : {};
      if (!next.byFeature || typeof next.byFeature !== 'object') {
        next.byFeature = {};
      }
      next.byFeature[feature] = {
        matchRate: metrics.matchRate != null ? metrics.matchRate : null,
        gaps: [],
        analyzedAt,
        source,
      };
      next.analyzedAt = analyzedAt;
      if (metrics.matchRate != null) {
        next.matchRate = metrics.matchRate;
      }
      return next;
    }
  );

  return {
    success: true,
    feature,
    recorded: keys.map((k) => RECORDABLE_METRIC_IDS[k]),
    matchRate: metrics.matchRate != null ? metrics.matchRate : null,
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  METRIC_SPECS,
  METRIC_ID_TO_GATE_NAME,
  GATE_NAME_TO_METRIC_ID,
  collectMetric,
  collectPhaseMetrics,
  saveMetrics,
  appendHistory,
  readCurrentMetrics,
  readRecentHistory,
  analyzeTrend,
  toGateFormat,
  toPdcaStatusFormat,
  recordAnalysisMetrics,
};
