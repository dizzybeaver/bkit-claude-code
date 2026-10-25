#!/usr/bin/env node
/**
 * analysis-stop.js - Guide report generation after gap analysis
 *
 * Purpose: Provide guidance after gap analysis completion
 * Hook: Stop for phase-8-review skill (gap analysis component)
 *
 * Converted from: scripts/analysis-stop.sh
 */

const { outputAllow } = require('../lib/core/io');

// Output guidance for next steps after gap analysis
const message = `📊 Gap Analysis completed.

Next steps:
1. Save report to docs/03-analysis/
2. If match rate < 70%: Run /pdca-iterate for auto-fix
3. If match rate >= 90%: Proceed to next phase
4. Update design doc if implementation differs intentionally`;

// v2.0.5: Comprehensive metrics collection (M1, M2, M3, M7)
try {
  const { readStdinSync, readHookText } = require('../lib/core/io');
  const mc = require('../lib/quality/metrics-collector');
  const { extractFeatureFromContext, getPdcaStatusFull } = require('../lib/pdca/status');
  const currentStatus = getPdcaStatusFull();
  const feature = extractFeatureFromContext({ currentStatus });
  const f = feature || 'unknown';
  const matchRate = currentStatus.features?.[feature]?.matchRate || 0;

  // M1: Match Rate (from pdca-status, set by gap-detector)
  if (matchRate > 0) {
    mc.collectMetric('M1', f, matchRate, 'code-analyzer');
  }

  /*
   * Read the ANALYZER's output, not our own.
   *
   * `message` is the guidance string declared at the top of this file. Matching
   * the M2/M3/M7 patterns against it can only ever fail, so every metric below
   * has always been written at its hardcoded default — M2 at the 75 baseline
   * regardless of what code-analyzer actually reported. `readStdinSync` was
   * already imported here and never called.
   */
  let agentOutput = '';
  try { agentOutput = readHookText(readStdinSync()); } catch (_) { agentOutput = ''; }

  /*
   * br159: collect only what the analyzer actually REPORTED. The 75/0/80
   * fallbacks fabricated a measurement out of a parse failure — a gate then
   * read codeQualityScore 75 that no analyzer ever produced, which is the
   * same false-assurance class as the fabricated-0 match rate (v2.1.34).
   * Design Ref: §2 module-1
   */
  // M2: Code Quality Score — extract from code-analyzer output
  const qualityPattern = /(Quality|quality)\s*(Score|score|점수)[^0-9]*(\d+)/i;
  const qualityMatch = agentOutput.match(qualityPattern);
  if (qualityMatch) {
    mc.collectMetric('M2', f, parseInt(qualityMatch[3], 10), 'code-analyzer');
  }

  // M3: Critical Issue Count — extract from output
  const criticalPattern = /(Critical|critical|심각|重大)[^0-9]*(\d+)/i;
  const criticalMatch = agentOutput.match(criticalPattern);
  if (criticalMatch) {
    mc.collectMetric('M3', f, parseInt(criticalMatch[2], 10), 'code-analyzer');
  }

  // M7: Convention Compliance — extract from output
  const conventionPattern = /(Convention|convention|컨벤션|규약)\s*(Compliance|compliance|준수율)?[^0-9]*(\d+)/i;
  const conventionMatch = agentOutput.match(conventionPattern);
  if (conventionMatch) {
    mc.collectMetric('M7', f, parseInt(conventionMatch[3], 10), 'code-analyzer');
  }
} catch (_) {}

// v1.4.0: Stop hook에 맞는 스키마 사용
outputAllow(message, 'Stop');
