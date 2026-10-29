#!/usr/bin/env node
/**
 * subagent-stop-handler.js - SubagentStop Hook Handler (v1.5.3)
 *
 * When a subagent terminates:
 * 1. updateTeammateStatus(name, "completed"|"failed")
 * 2. Call updateProgress()
 * 3. Check session end when all teammates complete
 *
 * Design Reference: docs/02-design/features/team-visibility.design.md Section 5.2
 */


// ============================================================
// br162: analyzer dispatch bridge (pure, testable — no top-level lib I/O)
//
// SubagentStop is the only event that fires with the dispatched analyzer's
// OWN transcript in hand, yet the handler never fed it to the analysis
// parsers — so a gap-detector that completed with "Overall Match Rate:
// 95.8%" left the registry matchRate null (br159 forensics; harness-side
// wiring gap). This bridge hands the agent's final report to br159's
// sanctioned recording entry. Parsers and the entry are reused UNCHANGED.
// ============================================================

// Design Ref: §2 — O(1) type gate, checked before any I/O. Both forms are
// accepted: the live harness sends the plugin-prefixed agent_type (observed
// 'bkit:gap-detector' in .bkit/runtime/hook-dispatch.ndjson, 2026-10-25),
// while older versions sent the bare name.
const ANALYZER_TYPES = new Set([
  'bkit:gap-detector', 'bkit:code-analyzer',
  'gap-detector', 'code-analyzer',
]);

// Report markers per analyzer family. A trailing assistant line without one
// of these is not a measurement report and is skipped.
const ANALYZER_REPORT_MARKER = /Overall Match Rate|codeQualityScore/;

// rb024: a full-transcript readFileSync + split('\n') inside a 5s hook
// silently killed the handler on the CC timeout when a subagent transcript
// grew large (dead-hook class — no partial output, no error surface). Cap
// every transcript read at ~2MB: head cap for the dispatch prompt (the
// binding first-user line lives at the top), tail cap for the report
// (measurement lines live at the end). The line at the cut edge is
// possibly partial and is dropped.
const TRANSCRIPT_CAP_BYTES = 2 * 1024 * 1024;

function _readTranscriptLines(transcriptPath, fromTail) {
  const fs = require('fs');
  let fd = null;
  try {
    const size = fs.statSync(transcriptPath).size;
    const cap = Math.min(size, TRANSCRIPT_CAP_BYTES);
    const buf = Buffer.alloc(cap);
    fd = fs.openSync(transcriptPath, 'r');
    fs.readSync(fd, buf, 0, cap, fromTail ? size - cap : 0);
    const lines = buf.toString('utf8').split('\n');
    if (size > TRANSCRIPT_CAP_BYTES) {
      if (fromTail) lines.shift();
      else lines.pop();
    }
    return lines;
  } catch (_) {
    return [];
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) { /* already closed */ }
    }
  }
}

/** Scan the last ~50 JSONL lines for the last assistant message carrying a metric marker. */
function _extractAnalyzerReport(transcriptPath) {
  const lines = _readTranscriptLines(transcriptPath, true);
  const start = Math.max(0, lines.length - 51);
  for (let i = lines.length - 1; i >= start; i--) {
    const line = lines[i];
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
    if (text && ANALYZER_REPORT_MARKER.test(text)) return text;
  }
  return null;
}

/**
 * br167: the dispatched agent's BINDING lives in its transcript's first user
 * line — the dispatch prompt ("You are the gap-detector for PDCA Check phase,
 * feature `rb005-...` ...") — not in the final report, which regularly names
 * the feature only in a next-step footer the extractors can't see. Scan from
 * the TOP for the first user message and return its text.
 */
function _extractDispatchPrompt(transcriptPath) {
  const lines = _readTranscriptLines(transcriptPath, false);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || entry.type !== 'user') continue;
    const content = entry.message && entry.message.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
    if (text) return text;
  }
  return null;
}

/**
 * br167: a parsed measurement that could NOT be recorded was debugLog-only,
 * i.e. invisible in production (BKIT_DEBUG off) — the rb005/wave1027 matchRate
 * black hole surfaced only at archive time. One stderr line per denied record
 * makes the miss observable without changing the hook's exit behavior.
 */
function _warnDeny(reason, agentType) {
  try {
    process.stderr.write(
      `[bkit-subagent-stop] analyzer metric NOT recorded (${reason}): ${agentType}\n`
    );
  } catch (_) { /* stderr unavailable — stay silent, exit behavior unchanged */ }
}

/**
 * br162 bridge: record a dispatched analyzer's measured metrics from its
 * SubagentStop payload. Deny-biased — any failure means NO record.
 *
 * @param {Object} hookContext - SubagentStop payload
 * @param {string} agentType - extracted agent_type ('unknown' when absent)
 * @returns {{dispatched: boolean, recorded?: boolean, reason?: string}}
 */
function dispatchAnalyzerMetrics(hookContext, agentType) {
  // Design Ref: §2 — the gate runs before any I/O; a non-analyzer stop never
  // reaches a single read.
  if (!ANALYZER_TYPES.has(agentType)) return { dispatched: false };
  try {
    const transcriptPath = hookContext && hookContext.transcript_path;
    if (typeof transcriptPath !== 'string' || !transcriptPath) {
      return { dispatched: true, recorded: false, reason: 'no-transcript' };
    }
    const report = _extractAnalyzerReport(transcriptPath);
    if (!report) return { dispatched: true, recorded: false, reason: 'no-report' };

    // br159 surfaces, reused unchanged: parsers + sanctioned recording entry.
    const { parseMatchRate, extractFeatureFromText, recordAnalysisMetrics } =
      require('./gap-detector-stop');
    const { getPdcaStatusFull } = require('../lib/pdca/status');
    const source = `subagent-stop dispatch ${new Date().toISOString().slice(0, 10)}`;
    const statusFull = getPdcaStatusFull();

    // br167: Feature resolution order — report text, then the dispatch
    // prompt's agent binding (first user line of the same transcript; the
    // report itself regularly names the feature only where the extractors
    // can't see it, which is how the rb005 completion recorded nothing),
    // then registry primaryFeature. Unresolvable → deny (no wrong-key write).
    let feature = extractFeatureFromText(report);
    if (!feature) feature = extractFeatureFromText(_extractDispatchPrompt(transcriptPath));
    // rb024: the primaryFeature fallback is REMOVED. An unresolved feature
    // must never land a matchRate on the wrong registry key — deny and
    // record 'unresolved-feature' (the deny-bias the surrounding comment
    // already claimed but the code contradicted).
    if (!feature) {
      _warnDeny('unresolved-feature', agentType);
      return { dispatched: true, recorded: false, reason: 'unresolved-feature' };
    }

    const isGapDetector = /gap-detector/.test(agentType);
    if (isGapDetector) {
      const matchRate = parseMatchRate(report);
      if (matchRate === null) {
        return { dispatched: true, recorded: false, reason: 'no-rate' };
      }
      // br167: never clobber an existing higher registry matchRate —
      // recordAnalysisMetrics routes to updatePdcaStatus, which blind-assigns,
      // so a weaker re-measurement used to overwrite a stronger recorded rate.
      const existingRate = statusFull?.features?.[feature]?.matchRate;
      if (typeof existingRate === 'number' && matchRate < existingRate) {
        return { dispatched: true, recorded: false, reason: 'existing-higher-rate' };
      }
      const r = recordAnalysisMetrics(feature, { matchRate }, source);
      // br167: a refused record (E-UNKNOWN-FEATURE class) was invisible with
      // debug logging off — the dead-matchRate black hole this wave closes.
      if (r.success !== true) _warnDeny(r.reason, `${agentType} feature=${feature}`);
      return { dispatched: true, recorded: r.success === true, reason: r.reason };
    }

    // code-analyzer: M2/M3/M4 markers (same patterns as scripts/analysis-stop.js).
    const metrics = {};
    const q = report.match(/(Quality|quality)\s*(Score|score|점수)[^0-9]*(\d+)/);
    if (q) metrics.codeQualityScore = parseInt(q[3], 10);
    // rb024: 'critical' count needs a word boundary (CJK alternatives
    // excepted) and a plausible range — any adjacent number used to be
    // parsed as the issue count (metric integrity).
    const c = report.match(
      /(?:\b(?:criticalIssueCount|critical(?:\s+issues?)?)\b|심각|重大)[^0-9]{0,40}(\d{1,4})\b/i
    );
    if (c) {
      const criticalCount = parseInt(c[1], 10);
      if (criticalCount >= 0 && criticalCount <= 999) {
        metrics.criticalIssueCount = criticalCount;
      }
    }
    const a = report.match(/(API|api)\s*(Compliance|compliance)[^0-9]*(\d+)/i);
    if (a) metrics.apiComplianceRate = parseInt(a[a.length - 1], 10);
    if (Object.keys(metrics).length === 0) {
      return { dispatched: true, recorded: false, reason: 'no-metrics' };
    }
    const r = recordAnalysisMetrics(feature, metrics, source);
    if (r.success !== true) _warnDeny(r.reason, `${agentType} feature=${feature}`); // br167
    return { dispatched: true, recorded: r.success === true, reason: r.reason };
  } catch (e) {
    // Defensive: any error → silent skip. The SubagentStop surface must keep
    // its original behavior; only debugLog witnesses the miss.
    try {
      require('../lib/core/debug').debugLog('SubagentStop', 'analyzer dispatch failed', {
        error: e.message,
      });
    } catch { /* debugLog unavailable — still silent */ }
    return { dispatched: true, recorded: false, reason: 'error' };
  }
}

// v2.1.12 Sprint C-2 (#9/#10/#8): bare-require guard — when this script
// is require()-d instead of executed as a hook entrypoint, return
// immediately so no stale stdout (decisions, advisory messages) is emitted
// without a real hook payload. CommonJS module body is implicitly an IIFE,
// so top-level return is valid.
if (require.main !== module) {
  module.exports = { ANALYZER_TYPES, dispatchAnalyzerMetrics };
  return;
}

const { readStdinSync, outputAllow, outputEmpty } = require('../lib/core/io');

// br144: advisory ack emitters are gated by hooks.advisory.ackMessages
// (default false = silent). Strict boolean true restores; see bkit.config.json.
let _br144AckCache = null;
function isAdvisoryEnabled(name) {
  try {
    if (_br144AckCache === null) {
      const { getConfig } = require('../lib/core/config');
      _br144AckCache = getConfig('hooks.advisory', {}) || {};
    }
    return _br144AckCache[name] === true;
  } catch (_) { return false; }
}
const { debugLog } = require('../lib/core/debug');

function main() {
  debugLog('SubagentStop', 'Hook started');

  let hookContext = {};
  try {
    const input = readStdinSync();
    hookContext = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) {
    debugLog('SubagentStop', 'Failed to parse context', { error: e.message });
    if (isAdvisoryEnabled('ackMessages')) { // br144: default false = silent
      outputAllow('SubagentStop processed.', 'SubagentStop');
    } else {
      outputEmpty();
    }
    return;
  }

  let teamModule = null;
  try {
    teamModule = require('../lib/team');
  } catch (e) {
    if (isAdvisoryEnabled('ackMessages')) { // br144: default false = silent
      outputAllow('SubagentStop processed.', 'SubagentStop');
    } else {
      outputEmpty();
    }
    return;
  }

  // v1.5.9: ENH-74 agent_id/agent_type extraction
  //
  // ENH-376: SubagentStop carries `agent_id` and `agent_type` but no
  // `agent_name` (verified against CC v2.1.220), so the old fallback chain
  // always produced the opaque id. Address the roster row by id — the same
  // identity SubagentStart registers — and keep the readable type for display.
  const agentId = hookContext.agent_id || null;
  const agentType = hookContext.agent_type || 'unknown';
  const agentName = agentType !== 'unknown' ? agentType : (agentId || 'unknown');

  // br162: analyzer-typed completions feed their final report to the analysis
  // parsers. Non-analyzer stops: existing flow, byte-identical (the gate
  // returns before any I/O). Design Ref: §2
  const analyzerDispatch = dispatchAnalyzerMetrics(hookContext, agentType);
  if (analyzerDispatch.dispatched) {
    debugLog('SubagentStop', 'analyzer dispatch', analyzerDispatch);
  }

  // rb024: success requires an EXPLICIT exit_code === 0. transcript_path
  // presence and an undefined exit_code both used to count as success,
  // which hid failed subagents from teammate status (failure visibility
  // lost — rb006 misclassification class).
  const isSuccess = hookContext.exit_code === 0;
  const status = isSuccess ? 'completed' : 'failed';

  // Update status
  try {
    teamModule.updateTeammateStatus({ id: agentId, name: agentName }, status, null);
  } catch (e) {
    debugLog('SubagentStop', 'Status update failed (non-fatal)', { error: e.message });
  }

  // Update progress
  try {
    const state = teamModule.readAgentState();
    if (state && state.feature) {
      const progress = teamModule.getTeamProgress(state.feature, state.pdcaPhase);
      teamModule.updateProgress(progress);
    }
  } catch (e) {
    debugLog('SubagentStop', 'Progress update failed (non-fatal)', { error: e.message });
  }

  // v2.1.10 Sprint 5.5: cc-regression attribution (fail-silent)
  try {
    const cc = require('../lib/cc-regression');
    const ccVersion = cc.detectCCVersion();
    if (ccVersion) {
      cc.recordEvent({
        hookEvent: 'SubagentStop',
        ccVersion,
        sessionId: hookContext.session_id || null,
        timestamp: new Date().toISOString(),
        context: { agentType, status },
      });
    }
  } catch (_e) { /* fail-silent */ }

  // v2.1.14 Sub-Sprint 1 (ENH-292): caching-cost.port emit for sub-agent
  // dispatch warmup detection. Fail-silent — sub-agent-dispatcher tolerates
  // missing samples (cold-start safety branch). See lib/orchestrator/
  // cache-cost-analyzer.js MIN_SAMPLES_FOR_TREND.
  try {
    const usage = hookContext.usage || hookContext.token_usage || null;
    if (usage && (usage.cache_creation_input_tokens != null || usage.cache_read_input_tokens != null)) {
      const { createCachingCostCli, buildMetrics } = require('../lib/infra/caching-cost-cli');
      const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const port = createCachingCostCli({ projectRoot });
      const sessionHash = String(hookContext.session_id || hookContext.session_hash || '');
      const metrics = buildMetrics({
        cacheCreationTokens: Number(usage.cache_creation_input_tokens) || 0,
        cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
        requestTokens: Number(usage.input_tokens) || 0,
        sessionHash,
        agent: agentType,
        dispatchMode: hookContext.dispatch_mode || 'sequential',
      });
      // Fire-and-forget — port.emit is fail-silent on IO errors.
      port.emit(metrics).catch(() => { /* fail-silent */ });
    }
  } catch (_e) { /* fail-silent */ }

  // v2.1.10 Sprint 7c (G-J-06): Next Action suggestion on SubagentStop
  let nextActionHint = null;
  try {
    const { generateSubagentStop } = require('../lib/orchestrator/next-action-engine');
    const { getPdcaStatusFull } = require('../lib/pdca/status');
    const pdcaStatus = (typeof getPdcaStatusFull === 'function') ? getPdcaStatusFull() : null;
    nextActionHint = generateSubagentStop({ agentName, status, pdcaStatus });
  } catch (_e) { /* fail-silent */ }

  const response = {
    /*
     * registry-lockdown follow-up (field report 2026-09-08): the next-action
     * hint stays on the systemMessage (orchestrator/user surface) ONLY.
     * It used to also ride additionalContext, which CC injects into the
     * STOPPING SUBAGENT's own context — and no PDCA subagent has the Skill
     * tool (gap-detector is Read/Glob/Grep/Explore), so "Next: /pdca …" was
     * un-actionable where it landed. The gap-detector in the field declined
     * the identical suggestion six times across six stop→re-prompt cycles.
     * The orchestrator, which CAN fire skills, still sees the hint once per
     * subagent stop via systemMessage.
     *
     * rb024: the per-stop ack is now br144-gated (hooks.advisory.ackMessages,
     * default false = silent) — one "Subagent X stopped" line on EVERY
     * SubagentStop was advisory spam. With advisories off, the hint (if any)
     * degrades to debugLog so it is never fully lost.
     */
    ...(isAdvisoryEnabled('ackMessages')
      ? {
        systemMessage: `Subagent ${agentName} stopped (${status})${nextActionHint ? '\n' + nextActionHint : ''}`,
      }
      : {}),
    hookSpecificOutput: {
      hookEventName: "SubagentStop",
      agentId,
      agentName,
      agentType,
      status,
    }
  };

  if (!response.systemMessage && nextActionHint) {
    debugLog('SubagentStop', 'next-action hint suppressed from systemMessage (advisories off, rb024)', {
      agentName,
      hint: nextActionHint,
    });
  }

  console.log(JSON.stringify(response));
  process.exit(0);
}

main();
