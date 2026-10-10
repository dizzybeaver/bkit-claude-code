/**
 * Quality Module — Entry point re-exporting all quality sub-modules
 * @module lib/quality
 * @version 2.1.5
 *
 * Sub-modules:
 *   - gate-manager: Quality gate definitions and evaluation
 *   - metrics-collector: Metric collection and trend analysis
 *   - regression-guard: Regression detection from iteration results
 *   - match-rate: Match-rate measurement helpers (br093: was missing from barrel)
 *   - sqm-calculator: SQM composite score computation (br093: was missing)
 *   - sqm-history: SQM history append/read (br093: was missing)
 */

const gateManager = require('./gate-manager');
const metricsCollector = require('./metrics-collector');
const regressionGuard = require('./regression-guard');
// br093: these three were missing from the barrel. Export-name collision check
// (2026-10-10, grep of all six module.exports blocks): zero overlapping names,
// so plain spreads are safe.
const matchRate = require('./match-rate');
const sqmCalculator = require('./sqm-calculator');
const sqmHistory = require('./sqm-history');

module.exports = {
  ...gateManager,
  ...metricsCollector,
  ...regressionGuard,
  ...matchRate,
  ...sqmCalculator,
  ...sqmHistory,
};
