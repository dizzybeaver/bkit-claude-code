#!/usr/bin/env node
/**
 * pdca-skill-stop.js - PDCA Skill Stop Hook (v1.4.4)
 *
 * Purpose: Process PDCA skill completion and guide next steps
 * Hook: Stop for pdca skill
 * Part of v1.4.4 Skills/Agents/Commands Enhancement
 *
 * @version 2.1.10
 * @module scripts/pdca-skill-stop
 */


const fs = require('fs');
const path = require('path');
// br143: shared session-activity gate — single source of truth for both stop paths.
const { OWNER_LEASE_MS, evaluateSessionGate } = require('../lib/pdca/session-activity-gate');

// ============================================================
// Envelope derivation (br014, fix-br013-014-wave D2) — pure helpers
// factored out of the main flow so unit tests can require them without
// executing the hook.
//
// The action used to be scraped from turn TEXT alone; a live report-phase
// turn whose prose never said "pdca report" missed the report→completed
// advance. Ground truth is the transcript's most recent pdca Skill
// tool_use: {name:'Skill', input:{skill:'bkit:pdca', args:'report fix-x'}}.
// ============================================================

// Valid first tokens of a pdca skill invocation (superset of actionPattern,
// br010 check alias included).
const ENVELOPE_ACTIONS = [
  'pm', 'plan', 'design', 'do', 'analyze', 'check', 'iterate', 'qa',
  'report', 'status', 'next',
];

/** True for skill names 'pdca' and 'bkit:pdca' (any plugin prefix). */
function isPdcaSkillName(skill) {
  return typeof skill === 'string' && /(?:^|:)pdca$/i.test(skill);
}

/**
 * Parse a pdca skill `args` string into { action, feature }.
 * First token must be a known action (case-insensitive) or the whole
 * entry is rejected (null). Feature = first non-flag token after it
 * (flags like --scope are skipped); null when absent.
 * @returns {{action: string, feature: string|null}|null}
 */
function parsePdcaSkillArgs(rawArgs) {
  if (typeof rawArgs !== 'string') return null;
  const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const action = tokens[0].toLowerCase();
  if (!ENVELOPE_ACTIONS.includes(action)) return null;
  let featureToken = tokens.slice(1).find((t) => !t.startsWith('-'));
  // br066: only the first whitespace token is the feature; sentence-length
  // junk must not become a registry row (validate-name contract, br041).
  if (featureToken) {
    featureToken = String(featureToken).trim().split(/\s+/)[0];
    // route through lib/pdca/validate-name.js if it exposes a validator
    try {
      const { normalizeFeatureName, isValidFeatureName } = require('../lib/pdca/validate-name');
      if (typeof isValidFeatureName === 'function' && !isValidFeatureName(featureToken)) {
        featureToken = undefined;
      } else if (typeof normalizeFeatureName === 'function') {
        const norm = normalizeFeatureName(featureToken);
        if (norm && norm.ok) featureToken = norm.name;
      }
    } catch (_) { /* validator unavailable — keep first-token result */ }
  }
  return { action, feature: featureToken || null };
}

/**
 * Scan transcript JSONL lines (backwards) for the MOST RECENT assistant
 * tool_use of the pdca Skill. Defensive: partial writes and non-JSON lines
 * are skipped; a malformed entry never throws.
 * @param {string[]} lines
 * @returns {{action: string, feature: string|null}|null}
 */
function findPdcaEnvelope(lines) {
  if (!Array.isArray(lines)) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    if (!raw) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch (_) {
      continue; // partial write / non-JSON line — skip, don't abort
    }
    if (!entry || entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    // Within one entry take the LAST matching block (latest in time).
    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j];
      if (!block || block.type !== 'tool_use' || block.name !== 'Skill') continue;
      const toolInput = block.input;
      if (!toolInput || !isPdcaSkillName(toolInput.skill)) continue;
      const parsed = parsePdcaSkillArgs(toolInput.args);
      if (parsed) return parsed; // first valid pdca hit scanning backwards = most recent
    }
  }
  return null;
}

/**
 * Derive { action, feature } from the hook payload's transcript envelope.
 * Bounded scan (last ~200 lines is plenty for a Stop turn). Returns null —
 * never throws — when there is no transcript_path (CLI/subprocess use:
 * tier 1 silently skipped), the file is unreadable, or no valid pdca
 * Skill tool_use exists.
 * @param {*} input - parsed hook payload
 * @returns {{action: string, feature: string|null}|null}
 */
function deriveEnvelopeAction(input) {
  try {
    const transcriptPath = input && (input.transcript_path || input.transcriptPath);
    if (!transcriptPath || typeof transcriptPath !== 'string') return null;
    const text = fs.readFileSync(transcriptPath, 'utf8');
    const lines = text.split('\n');
    return findPdcaEnvelope(lines.slice(-200));
  } catch (_) {
    return null;
  }
}

// ============================================================
// br039/br384 — session-ownership and completion-evidence helpers.
// Pure (no stdout, no registry writes) so tests can require them via the
// bare-require export below without executing the hook body.
// ============================================================

// br039/br143: a feature's ownerSession lease expires after 2h without
// refresh. OWNER_LEASE_MS now comes from lib/pdca/session-activity-gate.js
// (single source of truth; required at module top) so the existing export
// surface below is unchanged for unified-stop-deps.js consumers.

/**
 * br039: should THIS session's Stop emit the [AUTO-TRANSITION] demand for a
 * feature? A feature with a live ownerSession held by a different session is
 * not this session's cycle to advance.
 * @param {Object|null} entry - registry entry for the feature (features[f])
 * @param {string|null} currentSessionId - the Stop payload's session id
 * @param {number} [now] - epoch ms (injectable for tests)
 * @returns {{allowed: boolean, reason: 'unowned'|'owner'|'lease-expired'|'foreign-session'}}
 */
function shouldAutoTransition(entry, currentSessionId, now = Date.now()) {
  // br143: fail-open closed — see bug_reports/active/br/br143-stop-hook-cross-session-context-poisoning.md
  // Delegation to the shared gate: unowned/legacy entries are now a PERMANENT
  // withhold (operator ruling 2026-10-18) — no adopt-on-fire, no backfill.
  return evaluateSessionGate(entry, currentSessionId, now);
}

/**
 * br384: did the check phase actually produce gap-analysis evidence?
 * True when the registry entry carries a numeric matchRate OR an analysis
 * doc exists under docs/03-analysis/<feature>.analysis*.md. Lenient by
 * design on unreadable dirs (returns false — fail closed).
 * @param {string} feature
 * @param {Object|null} registryEntry - features[feature]
 * @param {string} [projectDir] - injectable root (defaults env/cwd)
 * @returns {boolean}
 */
function hasCheckEvidence(feature, registryEntry, projectDir) {
  if (registryEntry && typeof registryEntry.matchRate === 'number') return true;
  try {
    const root = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const dir = path.join(root, 'docs', '03-analysis');
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    return names.some((n) => n.startsWith(`${feature}.analysis`));
  } catch (_) {
    return false;
  }
}

/*
 * br040: same AUTO-TRANSITION withholding gates as unified-stop.js — pause
 * flag, in-flight background work, PDCA specialist agent. Duplicated here
 * (small, deliberate) because this handler does not import unified-stop,
 * which spawns it as a child process.
 * @param {Object} input - hook payload
 * @returns {{skip: boolean, gate: string|null}}
 */
function shouldSkipAutoTransition(input) {
  const fs = require('fs');
  const path = require('path');
  // br138: session id resolved at function scope — gate (d)'s candidate
  // filter references it; declaring it inside gate (0)'s block left gate (d)
  // with an unbound identifier (ReferenceError swallowed by its catch).
  const sessionId = (input && input.session_id)
    || process.env.CLAUDE_CODE_SESSION_ID
    || process.env.CLAUDE_SESSION_ID
    || null;
  // (0) br138: chain-top not-applicable short-circuit — a session owning no
  // transitionable feature has nothing to gate; silent pass-through (design §4).
  try {
    const { getPdcaStatusFull } = require('../lib/pdca/status');
    const { evaluateSessionGate } = require('../lib/pdca/session-activity-gate');
    const status = getPdcaStatusFull();
    const owned = Object.entries(status?.features || {})
      .filter(([, e]) => evaluateSessionGate(e, sessionId).allowed);
    if (owned.length === 0) {
      return { skip: false, gate: null };
    }
  } catch (_) { /* status unresolvable — fall through to the existing gates */ }

  try {
    const { getPdcaStatusPath } = require('../lib/pdca/status');
    const pauseFlag = path.join(path.dirname(getPdcaStatusPath()), 'pdca-pause');
    if (fs.existsSync(pauseFlag)) {
      return { skip: true, gate: 'pause-flag' };
    }
  } catch (_) { /* path unresolvable — other gates still apply */ }

  const tasks = input && Array.isArray(input.background_tasks) ? input.background_tasks : null;
  if (tasks && tasks.length > 0) {
    return { skip: true, gate: 'background-work' };
  }

  const { getActiveAgent } = require('../lib/task/context');
  const agent = input?.agent_name || input?.tool_input?.subagent_type || getActiveAgent() || null;
  if (agent && /gap-detector|pdca-iterator|\bqa\b|report-generator|pm-lead/i.test(agent)) {
    return { skip: true, gate: 'specialist-agent' };
  }

  // (d) br040-041-followups: stale-evidence gate — the CURRENT phase's doc
  // artifact must exist before an auto-transition is earned. Unresolvable
  // feature/phase does NOT skip (other handlers own that path).
  try {
    const { getPdcaStatusFull, getPdcaStatusPath } = require('../lib/pdca/status');
    const status = getPdcaStatusFull();
    const PHASE_DOC_DIRS = {
      plan: 'docs/01-plan/features',
      design: 'docs/02-design/features',
      check: 'docs/03-analysis',
      report: 'docs/04-report/features',
      qa: 'docs/05-qa',
    };
    // br047: the candidate set is EVERY registry feature sitting in a
    // transitionable phase — not primaryFeature alone. The old single-feature
    // resolution checked the WRONG feature's docs whenever the fired cycle
    // was envelope-bound to a non-primary feature (br006/br015b binding),
    // withholding a legitimate advance that had full evidence on disk.
    // br138: candidate set session-scoped — global set classified foreign
    // residue as 'stale-evidence'.
    const candidates = Object.entries(status?.features || {})
      .filter(([, e]) => e && PHASE_DOC_DIRS[e.phase])
      .filter(([, e]) => evaluateSessionGate(e, sessionId).allowed)
      .map(([name, e]) => ({ name, dir: PHASE_DOC_DIRS[e.phase] }));
    if (candidates.length > 0) {
      // Project root = two levels above .bkit/state/ (status file's parent dir).
      const projectRoot = path.resolve(path.dirname(getPdcaStatusPath()), '..', '..');
      const hasEvidence = candidates.some(({ name, dir: sub }) => {
        const d = path.join(projectRoot, sub);
        const names = fs.existsSync(d) ? fs.readdirSync(d) : [];
        return names.some((n) => n.startsWith(`${name}.`));
      });
      if (!hasEvidence) {
        return { skip: true, gate: 'stale-evidence' };
      }
    }
  } catch (_) { /* status unresolvable — no skip */ }

  return { skip: false, gate: null };
}

/**
 * br155 FR-08: decide whether THIS Stop's phase write may claim ownership of
 * the feature row. The pre-br155 code stamped ownerSession: fireSessionId
 * UNCONDITIONALLY, so any session whose Stop bound the feature via the
 * registry fallback tiers (primaryFeature / unique-phase / recorded action —
 * all shared state, possibly written by a DIFFERENT session) adopted the
 * feature it never fired and then passed the read-side gate as 'owner'
 * (phantom adoption). The claim is now evidence-gated: the transcript
 * envelope (deriveEnvelopeAction — the most recent pdca Skill tool_use in
 * THIS session's transcript) must prove a real pdca fire, and when the
 * envelope names a feature it must be the bound feature. A genuine fire
 * from a different session than the recorded owner still takes the lease
 * over (the sanctioned br039 takeover path, now with evidence).
 * Pure — no fs, no registry writes; tests require it via the bare-require
 * export below.
 * @param {Object|null} envelope - {action, feature} from deriveEnvelopeAction
 * @param {string|null} boundFeature - the feature this Stop's write targets
 * @param {string|null} sessionId - the firing session id (payload/env)
 * @param {Date} [now] - injectable clock
 * @returns {{ownerSession: string, ownerSince: string}|{}}
 */
function resolveOwnershipStamp(envelope, boundFeature, sessionId, now = new Date()) {
  if (!sessionId) return {};
  if (!envelope || !envelope.action) return {};
  if (envelope.feature && envelope.feature !== boundFeature) return {};
  return { ownerSession: sessionId, ownerSince: now.toISOString() };
}

// v2.1.12 Sprint C-2 (#9/#10/#8): bare-require guard — when this script
// is require()-d instead of executed as a hook entrypoint, export only
// the pure helpers so no stale stdout (decisions, advisory messages) is
// emitted without a real hook payload. CommonJS module body is implicitly
// an IIFE, so top-level return is valid.
if (require.main !== module) {
  module.exports = {
    ENVELOPE_ACTIONS, isPdcaSkillName, parsePdcaSkillArgs, findPdcaEnvelope,
    deriveEnvelopeAction, OWNER_LEASE_MS, shouldAutoTransition, hasCheckEvidence,
    shouldSkipAutoTransition, resolveOwnershipStamp,
  };
} else {

// Direct module imports
const { readStdinSync, readHookText, outputStopSurface, outputStopAllow } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { findDoc } = require('../lib/core/paths');
const { getPdcaStatusFull, updatePdcaStatus } = require('../lib/pdca/status');
const { resolveStopFeature } = require('../lib/pdca/stop-binding');
const {
  emitUserPrompt,
  shouldAutoAdvance,
  generateAutoTrigger,
  getAutomationLevel,
  buildNextActionQuestion,
  formatAskUserQuestion,
  PDCA_PHASE_TRANSITIONS,
  determinePdcaTransition,
} = require('../lib/pdca/automation');
const { generateExecutiveSummary, formatExecutiveSummary } = require('../lib/pdca/executive-summary');
const { autoCreatePdcaTask, createPdcaTaskChain } = require('../lib/task/creator');
const { updatePdcaTaskStatus } = require('../lib/task/tracker');

// v2.1.5 I2: PDCA_PHASE_TRANSITIONS and determinePdcaTransition moved to lib/pdca/automation.js

// Log execution start
debugLog('Skill:pdca:Stop', 'Hook started');

// Read skill output from stdin
let input;
try {
  input = readStdinSync();
} catch (e) {
  debugLog('Skill:pdca:Stop', 'Failed to read stdin', { error: e.message });
  process.exit(0);
}

/*
 * br290b: honor the harness Stop-loop breaker. After a Stop hook blocks once,
 * Claude Code sets stop_hook_active=true on the retry; emitting another block
 * then is what produced the observed 9-consecutive-block loops. Return
 * success while it is true (harness contract).
 */
if (input && input.stop_hook_active === true) {
  debugLog('Skill:pdca:Stop', 'stop_hook_active=true — allowing turn end');
  outputStopAllow(); // v2122 contract: every exit path emits one JSON object
  process.exit(0);
}

/*
 * Read the skill's OUTPUT, not the envelope it arrived in. `JSON.stringify(input)`
 * yielded hook_event_name / session_id / transcript_path / cwd, and `actionPattern`
 * was matched against that — so `action` was always null, and null disables most
 * of this handler: the PDCA status update, the auto-transition, the executive
 * summary, and the M8/M10 metrics are all gated on it.
 *
 * br040-041-followups: hoisted ABOVE the AUTO-TRANSITION gate together with the
 * action match — the pause/resume verb must own the gate itself, or a fresh
 * `/pdca pause` could be withheld by the very gate it exists to silence.
 */
const inputText = readHookText(input);

// Extract action from skill invocation
// Patterns: "pdca plan", "pdca design", "/pdca analyze", etc.
const actionPattern = /pdca\s+(pm|plan|design|do|analyze|check|iterate|qa|report|status|next|pause|resume)/i;  // br010: check alias; br040-041-followups: pause/resume
const actionMatch = inputText.match(actionPattern);

/*
 * br040-041-followups: pause/resume verbs short-circuit ahead of the gate.
 * pause writes the pause flag (gate-a path) and exits; resume removes it.
 * No phase task, no registry write for either.
 */
if (actionMatch && /^(pause|resume)$/i.test(actionMatch[1])) {
  try {
    const { getPdcaStatusPath } = require('../lib/pdca/status');
    const pauseFlag = path.join(path.dirname(getPdcaStatusPath()), ['pdca', 'pause'].join('-'));
    if (/^pause$/i.test(actionMatch[1])) {
      fs.writeFileSync(pauseFlag, new Date().toISOString());
      process.stderr.write('[bkit] PDCA chain paused — AUTO-TRANSITION withheld until /pdca resume\n');
    } else {
      fs.rmSync(pauseFlag, { force: true });
      process.stderr.write('[bkit] PDCA chain resumed\n');
    }
  } catch (e) {
    debugLog('Skill:pdca:Stop', 'pause/resume flag write failed', { error: e.message });
  }
  outputStopAllow(); // v2122 contract: every exit path emits one JSON object
  process.exit(0);
}

/*
 * br040: withhold the AUTO-TRANSITION when a specialist agent, background
 * task, or operator pause flag owns the turn. One stderr line, exit 0 —
 * no phase write, no directive.
 */
const autoTransitionGate = shouldSkipAutoTransition(input);
if (autoTransitionGate.skip) {
  outputStopAllow(); // v2122 contract: every exit path emits one JSON object
  process.stderr.write(`[bkit] AUTO-TRANSITION withheld (gate: ${autoTransitionGate.gate})\n`);
  debugLog('Skill:pdca:Stop', 'br040 AUTO-TRANSITION withheld', { gate: autoTransitionGate.gate });
  process.exit(0);
}

/*
 * br039: the firing session's id, resolved the same way unified-stop.js
 * resolves it (#119 precedence: payload > CLAUDE_CODE_SESSION_ID >
 * CLAUDE_SESSION_ID). Stamped onto the feature entry at every phase write so
 * a foreign session's Stop can tell the cycle is not its own.
 */
const fireSessionId = (input && input.session_id)
  || process.env.CLAUDE_CODE_SESSION_ID
  || process.env.CLAUDE_SESSION_ID
  || null;

debugLog('Skill:pdca:Stop', 'Input received', {
  inputLength: inputText.length,
  inputPreview: inputText.substring(0, 200)
});

/*
 * br014: derive action+feature from the transcript's most recent pdca Skill
 * tool_use (the envelope the skill actually fired with) BEFORE falling back
 * to the text regex. The regex scrapes turn prose; a live report-phase turn
 * whose prose never contains the literal "pdca report" missed the
 * report→completed advance. Precedence: envelope > text regex > phase.
 * Null envelope (no transcript_path / no pdca tool_use / unreadable file)
 * leaves the pre-br014 behavior exactly.
 */
const envelope = deriveEnvelopeAction(input);

// Extract feature name
//
// br006: resolveStopFeature binds the fired feature before falling back to
// primaryFeature. Its middle tier — exactly one feature in the registry sits
// in the phase this Stop's action targets — is the evidence the old
// extractFeatureFromContext path lacked: with a foreign primaryFeature and no
// doc path in the input, the phase was recorded against the WRONG feature.
// With no actionMatch the helper degrades to the old behavior (doc-path
// match → primaryFeature), so this is a strict improvement, not a replacement.
const currentStatus = getPdcaStatusFull();
const envelopeAction = envelope ? envelope.action : null;
/*
 * br018: fire-time recorded action. When neither the transcript envelope nor
 * the text regex yields an action token (envelopeAction null AND no
 * actionMatch), the session block's lastSkillAction — written by
 * skill-invocation-effects when the skill FIRED — is the remaining action
 * evidence. Without it, tier 2 of resolveStopFeature received a null/unknown
 * activeSkill, skipped, and the Stop fell through to the primaryFeature
 * fallback, binding the transition to a foreign feature.
 */
const recordedAction = (currentStatus
  && currentStatus.session
  && typeof currentStatus.session.lastSkillAction === 'string'
  && currentStatus.session.lastSkillAction)
  ? currentStatus.session.lastSkillAction
  : null;
let feature = resolveStopFeature({
  inputText,
  currentStatus,
  activeSkill: envelopeAction
    || (actionMatch ? actionMatch[1].toLowerCase() : null)
    || recordedAction,
});

/*
 * br290b: a null feature here is the dead-record sentinel from
 * resolveStopFeature — the fire-time recording names a feature that was
 * archived out of the registry, i.e. the cycle COMPLETED. This Stop is
 * post-completion: approve silently (exit 0, no output = allow the turn to
 * end). Emitting the envelope's next-step message here re-fired phantom
 * "Completion report has been generated" blocks on every stop after archive.
 */
if (feature === null) {
  outputStopAllow(); // v2122 contract: every exit path emits one JSON object
  process.exit(0);
}

/*
 * br014 feature wiring — the envelope's feature is additional evidence for
 * the binding, applied ONLY on top of resolveStopFeature's weakest tier:
 * when the helper returned nothing, or returned nothing but the
 * primaryFeature fallback, an envelope feature that exists in the registry
 * wins. Doc-path matches (tier 1) and unique-phase matches (tier 2) stay
 * stronger than the envelope — they are per-artifact evidence the helper
 * already verified — so this cannot rebind a correctly-bound feature.
 */
const envelopeFeature = envelope ? envelope.feature : null;
if (
  envelopeFeature &&
  currentStatus &&
  currentStatus.features &&
  Object.prototype.hasOwnProperty.call(currentStatus.features, envelopeFeature) &&
  (!feature || feature === currentStatus.primaryFeature) &&
  envelopeFeature !== feature
) {
  feature = envelopeFeature;
}

/*
 * br287: terminal-feature early exit. archiveFeature KEEPS the feature key
 * in the registry (phase 'archived'), so the br290 dead-record sentinel
 * (key absent) does not fire — the stale report envelope then re-binds the
 * archived feature and re-emits PDCA-COMPLETE on every later stop. Once the
 * binding is final (all tiers above have spoken), a feature whose registry
 * entry is terminal can never legitimately receive next-step guidance or a
 * phase write from this Stop: approve silently, same contract as the
 * br290b sentinel. The predicate mirrors the br288 writer guard
 * (lib/pdca/status-core.js) so the emitter and the writer agree on what
 * "terminal" means. 'completed' is included: the archive nudge belongs to
 * the report-time Stop (phase is still 'report' at emission — the br005a
 * completed-write happens later in this same run), so silencing later stops
 * loses only the re-prompt spam, which is this bug's defect class.
 */
const boundEntry = (feature && currentStatus && currentStatus.features)
  ? currentStatus.features[feature]
  : null;
if (
  boundEntry &&
  (boundEntry.phase === 'archived' ||
    boundEntry.phase === 'completed' ||
    boundEntry.archivedAt !== undefined ||
    boundEntry.archivedTo !== undefined ||
    (boundEntry.timestamps && boundEntry.timestamps.archivedAt !== undefined))
) {
  debugLog('Skill:pdca:Stop', 'bound feature is terminal — post-completion, allowing turn end', {
    feature,
    storedPhase: boundEntry.phase,
  });
  outputStopAllow(); // v2122 contract: every exit path emits one JSON object
  process.exit(0);
}

/*
 * Fall back to the phase the cycle is actually in.
 *
 * The invocation text is the better signal when present, but it is not
 * guaranteed to be: the skill may be entered without the literal words "pdca
 * design" appearing in what the model then says. Recorded state is the second
 * source, and it is the one that cannot be phrased away — pdca-status is
 * written by the phase transition itself.
 *
 * Read through `features[...].phase`, never `status.currentPhase`. That key was
 * retired by the v3 migration and reading it yields undefined, which does not
 * throw — the guard it feeds simply never fires. test/contract/
 * state-schema-keys.test.js exists because exactly that happened once already.
 */
const PHASE_TO_ACTION = {
  pm: 'pm',
  plan: 'plan',
  design: 'design',
  do: 'do',
  check: 'analyze',
  act: 'iterate',
  qa: 'qa',
  report: 'report',
};

const actionFromPhase = function () {
  const features = currentStatus?.features || {};
  const key = feature || currentStatus?.primaryFeature;
  const phase = (key && features[key]?.phase) || currentStatus?.activePdca?.phase;
  return phase ? (PHASE_TO_ACTION[String(phase).toLowerCase()] || null) : null;
};

const action = envelopeAction ||
  (actionMatch ? actionMatch[1].toLowerCase() : actionFromPhase());

// br011 Fix#2 trace discipline: which tier produced the action must be
// visible in the debug log, not inferred.
const actionSource = envelopeAction ? 'envelope' : (actionMatch ? 'text' : (action ? 'phase' : 'none'));
debugLog('Skill:pdca:Stop', 'action derived', { source: actionSource, action, feature: feature || null });

debugLog('Skill:pdca:Stop', 'Context extracted', {
  action,
  feature: feature || 'unknown',
  currentPhase: currentStatus?.activePdca?.phase
});

// rb005 FR-01: a phase-derived action (no envelope, no text match) with a
// foreign live ownerSession is not THIS session's cycle. The br039/br155
// gates only covered the [AUTO-TRANSITION]/[PDCA-COMPLETE] suffixes, so the
// base ✅ ack still leaked here on the blocking channel (rb005: 8 consecutive
// foreign blocks). Reuses the shared gate; suppresses everything downstream
// (guidance, userPrompt, exec-summary, registry write, metrics) in one place.
if (actionSource === 'phase') {
  const phaseKey = feature || currentStatus?.primaryFeature;
  const phaseEntry = phaseKey ? currentStatus?.features?.[phaseKey] : null;
  const rb005Gate = shouldAutoTransition(phaseEntry, fireSessionId);
  if (!rb005Gate.allowed) {
    debugLog('Skill:pdca:Stop', 'phase-derived guidance suppressed by session ownership (rb005 FR-01)', {
      feature: phaseKey || null, reason: rb005Gate.reason, fireSessionId,
    });
    process.stderr.write(
      `[bkit-pdca] PDCA feature '${phaseKey}' is owned by another session (phase ${phaseEntry?.phase || 'unknown'}) — no action taken\n`
    );
    outputStopAllow(); // v2122 contract: every exit path emits one JSON object
    process.exit(0);
  }
}

// Define next step mapping
const nextStepMap = {
  pm: {
    nextAction: 'plan',
    message: 'PM analysis and PRD have been generated.',
    question: 'Proceed to Plan phase?',
    options: [
      { label: 'Start Plan (Recommended)', description: `/pdca plan ${feature || '[feature]'}` },
      { label: 'Later', description: 'Keep current state' }
    ]
  },
  plan: {
    nextAction: 'design',
    message: 'Plan document has been generated.',
    question: 'Proceed to Design phase?',
    options: [
      { label: 'Start Design (Recommended)', description: `/pdca design ${feature || '[feature]'}` },
      { label: 'Later', description: 'Keep current state' }
    ]
  },
  design: {
    nextAction: 'do',
    message: 'Design document has been generated.',
    question: 'Start implementation?',
    options: [
      { label: 'Start Implementation (Recommended)', description: `/pdca do ${feature || '[feature]'}` },
      { label: 'Later', description: 'Keep current state' }
    ]
  },
  do: {
    nextAction: 'analyze',
    message: 'Implementation guide has been provided.',
    question: 'Run Gap analysis when implementation is complete.',
    options: [
      { label: 'Run Gap Analysis', description: `/pdca analyze ${feature || '[feature]'}` },
      { label: 'Continue Implementing', description: 'Continue implementation' }
    ]
  },
  analyze: {
    nextAction: 'iterate',
    message: 'Gap analysis completed.',
    question: 'Select next step based on results.',
    options: [
      { label: 'Auto Improve', description: `/pdca iterate ${feature || '[feature]'}` },
      { label: 'Completion Report', description: `/pdca report ${feature || '[feature]'}` },
      { label: 'Manual Fix', description: 'Manually fix code then re-analyze' }
    ]
  },
  iterate: {
    nextAction: 'analyze',
    message: 'Auto improvement completed.',
    question: 'Run Gap analysis again?',
    options: [
      { label: 'Re-analyze (Recommended)', description: `/pdca analyze ${feature || '[feature]'}` },
      { label: 'Completion Report', description: `/pdca report ${feature || '[feature]'}` }
    ]
  },
  qa: {
    nextAction: 'report',
    message: 'QA phase (L1-L5 tests) completed.',
    question: 'Proceed to completion report?',
    options: [
      { label: 'Generate Report (Recommended)', description: `/pdca report ${feature || '[feature]'}` },
      { label: 'Re-run QA', description: `/pdca qa ${feature || '[feature]'}` },
      { label: 'Later', description: 'Keep current state' }
    ]
  },
  report: {
    nextAction: null,
    message: 'Completion report has been generated.',
    question: 'PDCA cycle completed!',
    options: [
      { label: 'Archive', description: 'Archive documents with /pdca archive' },
      { label: 'Start New Feature', description: '/pdca plan [new-feature]' }
    ]
  },
  status: {
    nextAction: null,
    message: null,
    question: null,
    options: null
  },
  next: {
    nextAction: null,
    message: null,
    question: null,
    options: null
  }
};

// Get next step configuration
const nextStep = action ? nextStepMap[action] : null;

// Generate user prompt if applicable
let userPrompt = null;
let guidance = '';
let autoTrigger = null;

// v1.4.7: Check automation level
const automationLevel = getAutomationLevel();
const phaseMap = {
  plan: 'plan',
  design: 'design',
  do: 'do',
  analyze: 'check',
  iterate: 'act',
  qa: 'qa',
  report: 'completed'
};
const currentPhaseForAuto = action ? phaseMap[action] : null;

if (nextStep && nextStep.message) {
  guidance = `✅ ${nextStep.message}`;

  // v1.4.7 Full-Auto Mode: Skip userPrompt and generate autoTrigger
  if (shouldAutoAdvance(currentPhaseForAuto) && feature) {
    autoTrigger = generateAutoTrigger(currentPhaseForAuto, {
      feature,
      matchRate: currentStatus?.features?.[feature]?.matchRate || 0,
      iterationCount: currentStatus?.features?.[feature]?.iterationCount || 0
    });

    if (autoTrigger) {
      if (autoTrigger.complete) {
        // v2.1.7: PDCA cycle completion (Issue #79 P5 fix)
        // br155 FR-10: PDCA-COMPLETE is a directive emission about feature F
        // and must clear the same session-ownership gate as AUTO-TRANSITION —
        // a foreign/unowned session gets no completion demand.
        const completeOwnership = shouldAutoTransition(
          currentStatus?.features?.[feature], fireSessionId
        );
        if (completeOwnership.allowed) {
          guidance += [
            '',
            '',
            `[PDCA-COMPLETE] Feature "${feature}" PDCA cycle finished successfully.`,
            `All phases (plan > design > do > check > qa > report) completed.`,
            `Generate the completion summary and proceed to the next task.`,
            `Do NOT ask what to do next. The cycle is done.`,
          ].join('\n');
          debugLog('Skill:pdca:Stop', 'PDCA cycle completed', { feature, action });
        } else {
          debugLog('Skill:pdca:Stop', 'PDCA-COMPLETE suppressed by session ownership (br155 FR-10)', {
            feature, reason: completeOwnership.reason, fireSessionId,
          });
        }
      } else if (
        action === 'check' &&
        !hasCheckEvidence(feature, currentStatus?.features?.[feature])
      ) {
        /*
         * br384: the check-phase "completed" banner used to fire on skill-fire
         * alone, demanding /pdca iterate or /pdca report with no gap-analysis
         * evidence anywhere. Degrade to a record-only note; no next-phase
         * demand. (do/report/qa/iterate/plan/design keep current semantics.)
         */
        guidance = [
          `[bkit-pdca] Phase "check" skill fire recorded, but no gap-analysis evidence found`,
          `(no analysis doc, no recorded matchRate) — run the gap-detector before proceeding.`,
        ].join(' ');
        debugLog('Skill:pdca:Stop', 'check-phase evidence gate failed (br384)', { feature });
      } else {
        // v2.1.5 F3: Strong directive instead of soft guidance
        const nextCommand = autoTrigger.skill
          ? `/${autoTrigger.skill} ${autoTrigger.args || feature || ''}`
          : null;
        // br039 session isolation: a feature whose live ownerSession belongs
        // to a DIFFERENT session is not this Stop's cycle to advance. No
        // block, no phase demand — one informational line instead. A
        // lease-expired owner also skips the demand (stale fire replay);
        // absence of ownerSession (legacy entries) keeps the old behavior.
        const ownership = shouldAutoTransition(
          currentStatus?.features?.[feature], fireSessionId
        );
        if (nextCommand && ownership.allowed) {
          guidance += [
            '',
            '',
            `[AUTO-TRANSITION] Phase "${action}" completed successfully.`,
            `You MUST now execute: ${nextCommand}`,
            `Do NOT ask the user for confirmation. Do NOT show Executive Summary.`,
            `Do NOT stop. Proceed immediately to the next phase.`,
          ].join('\n');
        } else if (nextCommand && !ownership.allowed) {
          debugLog('Skill:pdca:Stop', 'AUTO-TRANSITION suppressed by session ownership (br039)', {
            feature, reason: ownership.reason, fireSessionId,
          });
          process.stderr.write(
            `[bkit-pdca] PDCA feature '${feature}' is owned by another session (phase ${currentStatus?.features?.[feature]?.phase || 'unknown'}) — no action taken\n`
          );
        }
      }
      debugLog('Skill:pdca:Stop', 'Auto-advance triggered', { autoTrigger });
    }
  } else if (nextStep.question && nextStep.options) {
    // Manual/Semi-auto: Generate user prompt
    userPrompt = emitUserPrompt({
      questions: [{
        question: nextStep.question,
        header: action ? action.charAt(0).toUpperCase() + action.slice(1) : 'PDCA',
        options: nextStep.options,
        multiSelect: false
      }]
    });
  }
}

// Update PDCA status if action completed
if (action && feature && ['plan', 'design', 'do', 'analyze', 'check', 'iterate', 'qa', 'report'].includes(action)) {
  const phaseMap = {
    plan: 'plan',
    design: 'design',
    do: 'do',
    analyze: 'check',
    check: 'check',
    iterate: 'act',
    qa: 'qa',
    report: 'completed'
  };

  const currentPhase = phaseMap[action];

  // v1.4.7 FR-01: Create Task chain when plan starts
  if (action === 'plan') {
    try {
      const chain = createPdcaTaskChain(feature, { skipIfExists: true });
      if (chain) {
        debugLog('Skill:pdca:Stop', 'Task chain created', {
          feature,
          taskCount: chain.entries.length,
          firstTaskId: chain.entries[0]?.id
        });
        guidance += `\n\n📋 PDCA Task Chain created (${chain.entries.length} Tasks)`;
      }
    } catch (e) {
      debugLog('Skill:pdca:Stop', 'Task chain creation failed', { error: e.message });
    }
  }

  // br039/br155: stamp ownership on the phase write, EVIDENCE-GATED (FR-08).
  // The pre-br155 unconditional claim let a session that never fired the
  // feature adopt it via the shared-state fallback tiers and then pass the
  // read-side gate as 'owner' (phantom adoption). resolveOwnershipStamp
  // permits the claim only when this session's transcript envelope proves a
  // real pdca fire for the bound feature — which still covers the sanctioned
  // br039 takeover (a foreign session that genuinely fires takes the lease).
  // Design Ref: §3.1
  updatePdcaStatus(feature, currentPhase, {
    lastAction: action,
    timestamp: new Date().toISOString(),
    ...resolveOwnershipStamp(envelope, feature, fireSessionId),
  });

  debugLog('Skill:pdca:Stop', 'PDCA status updated', {
    feature,
    phase: currentPhase,
    action
  });

  // v1.4.4 FR-06: Auto-create next phase Task using determinePdcaTransition
  try {
    const featureStatus = currentStatus?.features?.[feature];
    const context = {
      feature,
      matchRate: featureStatus?.matchRate || 0,
      iterationCount: featureStatus?.iterationCount || 0
    };

    const transition = determinePdcaTransition(currentPhase, context);

    if (transition && transition.next !== 'completed') {
      // Update current phase task status
      updatePdcaTaskStatus(currentPhase, feature, {
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      // Auto-create next phase task
      const nextTaskTemplate = transition.taskTemplate.replace('{feature}', feature);
      const nextTask = autoCreatePdcaTask({
        phase: transition.next,
        feature,
        metadata: {
          previousPhase: currentPhase,
          suggestedSkill: transition.skill,
          blockedBy: `[${currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}] ${feature}`
        }
      });

      if (nextTask) {
        debugLog('Skill:pdca:Stop', 'Next phase Task auto-created', {
          nextPhase: transition.next,
          taskId: nextTask.taskId,
          skill: transition.skill
        });
      }
    }
  } catch (e) {
    debugLog('Skill:pdca:Stop', 'Phase transition task creation failed', { error: e.message });
  }
}

/*
 * br005a: report→completed sanctioned write, independent of the Task system.
 *
 * Fork-mode sessions (CC v2.1.278+) expose no Task tools, so the TaskCompleted
 * hook the report phase relies on never fires and the feature strands at
 * phase=report — E-ARCH-GATE forever. This clause gives the Stop handler the
 * same completion the Task path would have written, through the same
 * sanctioned writer. Guards (fail closed):
 *   - the feature's CURRENT phase must be 'report' (never skip from earlier),
 *   - the report doc must exist on disk (findDoc — the same check the archive
 *     CLI's docs arm makes; a Stop that merely mentions "report" is not
 *     evidence the phase ran).
 * requireDocs:false is deliberate: a bug-fix cycle's plan/design docs already
 * gate the main update above; this clause must not silently no-op behind a
 * second gate. Hook safety: any failure here logs and continues — it must
 * never crash the session.
 */
if (action === 'report' && feature) {
  try {
    const featNow = getPdcaStatusFull(true)?.features?.[feature];
    const reportDoc = findDoc('report', feature);
    debugLog('Skill:pdca:Stop', 'report-completion clause evaluated', {
      feature,
      currentPhase: featNow?.phase || null,
      reportDoc: reportDoc || 'missing',
    });
    if (featNow?.phase === 'report' && reportDoc) {
      updatePdcaStatus(feature, 'completed', {}, { requireDocs: false });
      debugLog('Skill:pdca:Stop', 'report→completed advanced (br005a)', { feature });
    }
  } catch (e) {
    debugLog('Skill:pdca:Stop', 'report-completion clause failed (session continues)', {
      feature,
      error: e.message,
    });
  }
}

// Log completion
debugLog('Skill:pdca:Stop', 'Hook completed', {
  action,
  feature: feature || 'unknown',
  hasNextStep: !!nextStep?.nextAction
});

// v1.6.0: Executive Summary + AskUserQuestion for plan/design/report (ENH-103)
if (feature && (action === 'plan' || action === 'design' || action === 'report') && !autoTrigger) {
  const summary = generateExecutiveSummary(feature, action);
  const summaryText = formatExecutiveSummary(summary, 'full');

  const featureData = currentStatus?.features?.[feature] || {};
  const questionPayload = buildNextActionQuestion(action, feature, {
    matchRate: featureData.matchRate || 0,
    iterCount: featureData.iterationCount || 0
  });
  const formatted = formatAskUserQuestion(questionPayload);

  // ENH-227 (Issue #77 Phase A): single-source generator
  // Issue #111 Phase B (v2.1.21): thread session_id for per-session title isolation
  const { generateSessionTitle } = require('../lib/pdca/session-title');
  const execSessionTitle = generateSessionTitle({ action: action ? action.toUpperCase() : null, feature, sessionId: input && input.session_id });

  // S6 ENH-362/363: CC-compliant Stop surface. decision:'block'+reason; drop
  // hookSpecificOutput/sessionTitle/userPrompt/skillResult. Diagnostics → debugLog.
  const execReason = [
    guidance,
    '',
    summaryText,
    '',
    `---`,
    '',
    `Please select next step.`,
  ].filter((l) => l !== undefined && l !== null).join('\n');
  debugLog('Skill:pdca:Stop', 'surface(exec)', { action, feature: feature || 'unknown', nextAction: nextStep?.nextAction || null, automationLevel, sessionTitle: execSessionTitle });
  outputStopSurface(execReason);
  process.exit(0);
}

// ENH-227 (Issue #77 Phase A): single-source generator
// Issue #111 Phase B (v2.1.21): thread session_id for per-session title isolation
const { generateSessionTitle: _genSessionTitleDefault } = require('../lib/pdca/session-title');
const defaultSessionTitle = _genSessionTitleDefault({ action: action ? action.toUpperCase() : null, feature, sessionId: input && input.session_id });

// S6 ENH-362: CC-compliant Stop output. Surface guidance via decision:'block';
// no guidance → clean allow-stop. Diagnostics → debugLog.
debugLog('Skill:pdca:Stop', 'default response', { action, feature: feature || 'unknown', nextAction: nextStep?.nextAction || null, automationLevel, autoTrigger, sessionTitle: defaultSessionTitle, hasUserPrompt: !!userPrompt });

// v2.0.5: Collect M8 (Design Completeness) and M10 (PDCA Cycle Time)
try {
  const mc = require('../lib/quality/metrics-collector');
  const f = feature || 'unknown';

  // M8: Design Completeness — after design phase, estimate from document existence
  if (action === 'design' && f !== 'unknown') {
    const designPath = path.join(process.cwd(), `docs/02-design/features/${f}.design.md`);
    const planPath = path.join(process.cwd(), `docs/01-plan/features/${f}.plan.md`);
    let completeness = 0;
    if (fs.existsSync(designPath)) completeness += 50;
    if (fs.existsSync(planPath)) completeness += 30;
    // Check for key sections in design doc
    if (fs.existsSync(designPath)) {
      const content = fs.readFileSync(designPath, 'utf8');
      if (content.includes('## ')) completeness += 10;
      if (content.length > 500) completeness += 10;
    }
    mc.collectMetric('M8', f, Math.min(completeness, 100), 'pdca-skill');
  }

  // M10: PDCA Cycle Time — on report phase, compute hours since feature started
  if (action === 'report' && f !== 'unknown') {
    const featureData = currentStatus?.features?.[f];
    const startedAt = featureData?.timestamps?.started;
    if (startedAt) {
      const hours = Math.round((Date.now() - new Date(startedAt).getTime()) / 3600000 * 100) / 100;
      mc.collectMetric('M10', f, hours, 'pdca-skill');
    }
  }
} catch (_) { /* non-critical — best-effort write, failure is tolerated */ }

// rb005 FR-02: channel discipline — a directive-less ack never blocks. The
// S6 surface dropped userPrompt (computed but never emitted), so a manual-mode
// Stop used to force an extra turn for "✅ ... provided." with zero
// actionable content. Directive-bearing guidance still blocks.
if (guidance && /\[AUTO-TRANSITION\]|\[PDCA-COMPLETE\]/.test(guidance)) {
  outputStopSurface(guidance);
} else {
  if (guidance) {
    const firstLine = guidance.split('\n')[0];
    debugLog('Skill:pdca:Stop', 'directive-less ack downgraded to stderr (rb005 FR-02)', {
      firstLine,
    });
    process.stderr.write(
      `[bkit-pdca] ${firstLine} — informational only, not blocking (rb005 FR-02)\n`
    );
  }
  outputStopAllow();
}
process.exit(0);
} // end hook-entrypoint branch (require.main === module)
