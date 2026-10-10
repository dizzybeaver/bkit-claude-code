/**
 * Hook output emitters.
 * Sub-module of lib/core/io.js; import from lib/core/io.js, not from this file directly.
 *
 * I/O Utilities
 * @module lib/core/io
 * @version 2.1.10
 *
 * Claude Code 전용 플러그인으로 단순화 (v1.5.0). Tag synced to 2.0.0 per ENH-263 (2026-04-21).
 */

const { MAX_CONTEXT_LENGTH, truncateContext } = require('./shared');

// Lazy require to avoid a circular dependency (debug.js -> platform.js is a
// separate chain; io.js -> debug.js is one-way). Needed so H5 can surface
// stdin parse failures via debugLog instead of swallowing them silently.
let _debug = null;
function getDebug() {
  if (!_debug) {
    _debug = require('../debug');
  }
  return _debug;
}

/*
 * ENH-466 (v2.1.37) — the permission-mode policy, loaded lazily for the same reason
 * `debug` is: this module is required at the top of all 28 hook scripts, and a
 * load-time require chain is one more thing that can fail before a handler has
 * read its payload. The policy is a pure lookup table with no dependencies of its
 * own, so the lazy handle costs nothing on the hot path.
 */
let _permissionModePolicy = null;
function getPermissionModePolicy() {
  if (!_permissionModePolicy) {
    _permissionModePolicy = require('../../domain/policy/permission-mode-policy');
  }
  return _permissionModePolicy;
}

/**
 * Cursor IDE 런타임 감지 (GitHub issue #118).
 *
 * Cursor의 Claude plugin bridge는 PreToolUse hook runner에서 Claude Code와는
 * 다른 JSON 스키마를 기대한다:
 *   allow: {"permission":"allow","agent_message":...}
 *   deny:  {"permission":"deny","user_message":...,"agent_message":...}
 * CURSOR_VERSION env는 Cursor hook runtime이 주입한다. 빈 문자열("")은
 * 미설정과 동급으로 취급하여 truthy 여부로 판별한다.
 * @returns {boolean}
 */
function isCursorRuntime() {
  return !!process.env.CURSOR_VERSION;
}

/**
 * Hook events whose plain stdout Claude Code shows to the model.
 *
 * ENH-433 (v2.1.37). Measured from code.claude.com/docs/en/hooks, not assumed.
 * The general rule is stated once — "For most events, stdout is written to the
 * debug log but not shown to Claude" — and exactly two events say otherwise:
 *
 *   SessionStart      "plain stdout already reaches Claude for this event"
 *   UserPromptSubmit  "any non-JSON text written to stdout is added as context"
 *
 * Anything printed bare on any other event is written to a log nobody reads
 * during the session. Do not add an event here without a line in the docs
 * saying so; the whole point of this constant is that the rule stopped being
 * guessed one call site at a time.
 */
const STDOUT_REACHES_MODEL = new Set(['SessionStart', 'UserPromptSubmit']);

/**
 * Hook events that document a `hookSpecificOutput.additionalContext` field.
 *
 * ENH-433 (v2.1.37). Measured the same way — these are the nine events whose
 * "decision control" table in the Claude Code hooks reference lists
 * `additionalContext`. For an event in this set a message HAS somewhere to go,
 * even when bare stdout would be discarded.
 */
const CONTEXT_CHANNEL_EVENTS = new Set([
  'SessionStart', 'Setup', 'UserPromptSubmit', 'UserPromptExpansion',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch',
  'SubagentStart',
]);

/**
 * ENH-374 — Report whether a Stop-family hook payload still has background work
 * in flight.
 *
 * Why this exists: `cleanupAgentState()` wipes the team roster, and until now
 * the only guard on it was `state.enabled`. That was correct while subagents
 * ran in the foreground and always finished before the main turn did. Two CC
 * changes broke the assumption — v2.1.218 made `/code-review` a background
 * subagent, and v2.1.219 made subagents spawn nested subagents to depth 3 by
 * default — so the main turn now routinely ends while subagents are alive.
 * Reproduced on CC v2.1.220: the Stop hook fired mid-flight, cleared the
 * roster, and every subsequent `SubagentStop` logged "Teammate not found for
 * status update" (4/4 spawns orphaned).
 *
 * CC supplies the signal needed to tell the two cases apart. `background_tasks`
 * is documented upstream as: "In-flight background work (running/pending +
 * backgrounded) registered in this session. Lets hooks distinguish 'session is
 * done' from 'session is paused waiting for background work to wake it'. Empty
 * array when nothing is in flight."
 *
 * That last sentence is the contract this function relies on: emptiness — not
 * any particular `status` value — is the signal. Enumerating an allowlist of
 * in-flight statuses would risk missing one and cleaning up early, which is the
 * failure being fixed; deferring cleanup one turn longer is harmless by
 * comparison.
 *
 * Backward compatible: CC before v2.1.218 sends no `background_tasks`, so an
 * absent or non-array value returns `false` and those runtimes keep the
 * historical cleanup behaviour unchanged.
 *
 * @param {*} hookContext - Parsed Stop / SubagentStop / SessionEnd hook payload
 * @returns {boolean} true when at least one background task is still registered
 */
function hasInFlightBackgroundWork(hookContext) {
  if (!hookContext || typeof hookContext !== 'object') return false;
  const tasks = hookContext.background_tasks;
  if (!Array.isArray(tasks)) return false;
  return tasks.length > 0;
}

/**
 * 허용 결정 출력.
 * - Cursor: {"permission":"allow","agent_message":...}
 * - Claude Code: SessionStart/UserPromptSubmit → {success,message} JSON;
 *   an event with an additionalContext channel → hookSpecificOutput;
 *   anything else → the debug log, because nothing else would be delivered.
 * @param {string} [context]
 * @param {string} [hookEvent]
 */
function outputAllow(context, hookEvent) {
  const truncated = truncateContext(context);

  if (isCursorRuntime()) {
    // Cursor IDE PreToolUse allow 스키마.
    const payload = { permission: 'allow' };
    if (truncated) {
      payload.agent_message = truncated;
    }
    console.log(JSON.stringify(payload));
    return;
  }

  if (STDOUT_REACHES_MODEL.has(hookEvent)) {
    console.log(JSON.stringify({
      success: true,
      message: truncated || undefined,
    }));
    return;
  }

  if (!truncated) return;

  /*
   * ENH-433 (v2.1.37) — the message had nowhere to go on most events.
   *
   * The `else` branch here printed bare text to stdout for every event that is
   * not SessionStart or UserPromptSubmit. Claude Code's contract
   * (code.claude.com/docs/en/hooks): "For most events, stdout is written to the
   * debug log but not shown to Claude", and only two events say otherwise —
   * SessionStart ("plain stdout already reaches Claude for this event") and
   * UserPromptSubmit ("any non-JSON text written to stdout is added as context").
   *
   * Measured across bkit: 26 call sites passed a NON-empty message to an event
   * in neither set. Recovery guidance, guardrail attribution, PDCA context —
   * composed, truncated, printed, discarded.
   *
   * Nine events do have a context channel, and for those the message can simply
   * be delivered: `hookSpecificOutput.additionalContext` is what it was always
   * meant to be. That recovers eight of the call sites centrally, without
   * editing eight files — the shape ENH-466 settled on for the same reason, that
   * a per-site fix leaves the next call site to rediscover the rule.
   *
   * For an event with no channel there is nothing honest to emit, so the message
   * goes to the debug log under its own name. Bare stdout would land in the same
   * place while looking like output.
   */
  if (CONTEXT_CHANNEL_EVENTS.has(hookEvent)) {
    outputContext(truncated, hookEvent);
    return;
  }

  /*
   * No channel exists for this event, so this text cannot reach the model. It is
   * still printed, and that is deliberate rather than an oversight:
   *
   *   - Claude Code writes it to the debug log, so it remains available when
   *     diagnosing a hook, and printing costs nothing.
   *   - bkit's own integration tests read this line as the Stop family's
   *     liveness signal. A hook that prints nothing is hard to tell from a hook
   *     that crashed, which is the failure mode the crash recorder below exists
   *     to end.
   *
   * What changed is the belief, not the bytes. The debug entry states plainly
   * that the message was not delivered, so the next person composing a careful
   * sentence for a Stop hook finds out here rather than from its absence.
   *
   * ENH-482 records the consequence for the Stop family specifically: the
   * next-action hint in unified-stop.js is composed and never seen, and the only
   * channel that WOULD deliver it — `outputStopSurface`'s
   * `{decision:'block', reason}` — forces the turn to continue. Turning every
   * clean stop into a continuation is a product decision, not a bug fix, so it
   * is left for the maintainer rather than made here as a side effect.
   */
  try {
    getDebug().debugLog(hookEvent || 'unknown', 'outputAllow message not delivered to the model', {
      reason: 'this event has neither model-visible stdout nor an additionalContext channel',
      message: truncated,
    });
  } catch (_) { /* the debug channel must never break a hook's exit path */ }

  console.log(truncated);
}

/**
 * 차단 결정 출력.
 * - Cursor: {"permission":"deny","user_message":...,"agent_message":...}
 * - Claude Code: {"decision":"block","reason":...}
 * 두 runtime 모두 graceful deny이므로 exit(0).
 * @param {string} reason
 */
function outputBlock(reason) {
  if (isCursorRuntime()) {
    // Cursor IDE PreToolUse deny 스키마. reason을 사용자/에이전트 양쪽에 노출.
    console.log(JSON.stringify({
      permission: 'deny',
      user_message: reason,
      agent_message: reason,
    }));
  } else {
    console.log(JSON.stringify({
      decision: 'block',
      reason: reason,
    }));
  }
  process.exit(0);
}

/**
 * ENH-264 (bkit v2.1.10): Block a tool use while surfacing alternatives.
 *
 * Leverages CC v2.1.110+ PreToolUse `hookSpecificOutput.additionalContext`
 * to feed Claude a structured list of safer alternatives so the agent can
 * propose a recovery path instead of simply reporting "blocked".
 *
 * @param {string} reason - Short reason shown in the block message
 * @param {string[]} [alternatives] - Array of concrete safer commands / rephrasings
 * @param {string} [hookEvent='PreToolUse'] - CC hook event name
 */
function outputBlockWithContext(reason, alternatives, hookEvent) {
  const alts = Array.isArray(alternatives) && alternatives.length
    ? alternatives
    : [];

  if (isCursorRuntime()) {
    // Cursor IDE PreToolUse deny 스키마. 대체안을 agent_message에 함께 노출하여
    // 에이전트가 더 안전한 경로를 제안받도록 한다 (CC hookSpecificOutput 대체품).
    const agentMessage = alts.length
      ? `${reason}\n\nSafer alternatives you can try instead:\n${alts.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n\nReformulate the command using one of the alternatives above or ask the user for an explicit confirmation.`
      : reason;
    console.log(JSON.stringify({
      permission: 'deny',
      user_message: reason,
      agent_message: agentMessage,
    }));
    process.exit(0);
    return;
  }

  const context = alts.length
    ? `Blocked: ${reason}\n\nSafer alternatives you can try instead:\n${alts.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n\nReformulate the command using one of the alternatives above or ask the user for an explicit confirmation.`
    : `Blocked: ${reason}`;
  const payload = {
    decision: 'block',
    reason: reason,
    hookSpecificOutput: {
      hookEventName: hookEvent || 'PreToolUse',
      additionalContext: context,
    },
  };
  console.log(JSON.stringify(payload));
  process.exit(0);
}

/**
 * PreToolUse: hand the decision to the user instead of allowing or denying.
 *
 * v2.1.34 (D9). bkit had only two outcomes — block or allow — so every rule had
 * to be either catastrophic or invisible. G-001 chose catastrophic and refused
 * `rm -rf` on any target at all, including a scoped temporary directory, while
 * advising the user to "scope the command to a specific path" — advice the rule
 * made impossible to act on. Grading such a command down to `allow` would have
 * been a silent relaxation; `ask` is what the situation actually calls for.
 *
 * Uses `hookSpecificOutput.permissionDecision`, which is the documented shape
 * for PreToolUse (`allow` / `deny` / `ask` / `defer`).
 *
 * Scope of verification, stated precisely because the shape is the whole point:
 * the emitted payload is asserted by unit test, and PreToolUse itself is
 * confirmed to dispatch against a real runtime (test/contract/host-integration/
 * last-live-run.json). What is NOT verified is a live session actually
 * rendering the confirmation prompt — reaching that path needs an interactive
 * TTY, and the PTY this harness would need is unavailable in the sandbox
 * (`tcgetattr: Operation not supported on socket`). Do not upgrade this comment
 * to "verified end to end" without that run.
 *
 * ENH-466 (v2.1.37) — the third parameter. An `ask` is only worth emitting where someone
 * can answer it. In `bypassPermissions`, `dontAsk` and `acceptEdits` nobody can,
 * and the host turns the request into a refusal: measured on CC v2.1.231, a
 * minimal ask-returning hook produced `permission_denials` of 1 in all three.
 * So the tier that exists to avoid refusing a scoped operation was, in exactly
 * the modes where being proportionate matters most, refusing it.
 *
 * This is the SECOND of two checks. Call sites consult
 * `permission-mode-policy.isAskSuppressed()` themselves, because that is where
 * the audit context lives (rule ids, confidence, the command). The check here
 * catches a call site added later that forgets to — the "forgotten eleventh
 * site" failure that made a per-site-only design the wrong shape for this.
 *
 * The mode is normalized inside the policy, so an absent third argument means
 * `default`, which emits — every existing two-argument call keeps its behaviour.
 *
 * @param {string} reason - why confirmation is being requested
 * @param {string[]} [alternatives] - safer routes worth considering first
 * @param {string} [permissionMode] - host permission mode from the hook payload
 * @returns {boolean|void} `false` when the ask was suppressed and control returns
 *   to the caller; otherwise the process exits and nothing is returned
 */
function outputAsk(reason, alternatives, permissionMode) {
  const alts = Array.isArray(alternatives) ? alternatives : [];
  const detail = alts.length
    ? `${reason}\n\nBefore confirming, consider:\n${alts.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}`
    : reason;

  if (getPermissionModePolicy().isAskSuppressed(permissionMode)) {
    /*
     * Suppressed, not silent. The model is told what was observed and why no
     * confirmation was raised, so a session transcript still shows that a guard
     * looked at this command — a guard that goes quiet without a trace is
     * indistinguishable from a guard that is broken, which is the failure mode
     * the crash recorder further down this file exists to end.
     *
     * The durable record is the caller's audit entry; this line is the
     * in-context one.
     */
    outputAllow(
      `${reason}\n\nNo confirmation was requested: the session is running in a permission mode `
      + 'that suppresses confirmation prompts. Proceeding.',
      'PreToolUse'
    );
    return false;
  }

  if (isCursorRuntime()) {
    /*
     * Cursor's PreToolUse schema, as used everywhere else in this file, carries
     * `permission: 'allow' | 'deny'`. There is no third tier we can point at,
     * and emitting an undocumented `'ask'` risks the host rejecting the whole
     * payload as malformed — which fails OPEN, letting the destructive command
     * run with no prompt at all. That is the worst available outcome.
     *
     * So on a host with no ask tier, a confirmation request degrades to a
     * refusal that says how to proceed. Fails closed, and stays inside a schema
     * we can actually name.
     */
    console.log(JSON.stringify({
      permission: 'deny',
      user_message: reason,
      agent_message: `${detail}\n\nThis host cannot show a confirmation prompt from a hook, `
        + 'so the command is refused rather than run unprompted. Ask the user to confirm '
        + 'explicitly, then re-issue it.',
    }));
    process.exit(0);
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: detail,
    },
  }));
  process.exit(0);
}

/**
 * Feed text to the model from a non-blocking hook.
 *
 * v2.1.34. `outputAllow()` prints bare text on every event except SessionStart
 * and UserPromptSubmit. On PreToolUse that is fine. On PostToolUse it is not:
 * plain stdout from a PostToolUse hook goes to the transcript only, and the
 * model never sees it. Any handler that used `outputAllow(msg, 'PostToolUse')`
 * to say something was writing into a void — the identical class of defect as
 * ENH-410, where a block reason was computed and then dropped.
 *
 * `hookSpecificOutput.additionalContext` is the field that reaches the model,
 * so a hook with something to say must use this instead.
 *
 * @param {string} context - text to place in the model's context
 * @param {string} hookEvent - the event name, e.g. 'PostToolUse'
 */
function outputContext(context, hookEvent) {
  const truncated = truncateContext(context);
  if (!truncated) return;

  if (isCursorRuntime()) {
    // Cursor has no additionalContext channel; agent_message is the equivalent.
    console.log(JSON.stringify({ permission: 'allow', agent_message: truncated }));
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: hookEvent || 'PostToolUse',
      additionalContext: truncated,
    },
  }));
}

/**
 * 빈 출력 (Claude Code는 아무것도 출력하지 않음)
 */
function outputEmpty() {
  // Claude Code는 빈 출력 시 아무것도 출력하지 않음
}

/**
 * CC Stop hook — surface content and force Claude to continue (S6, ENH-364).
 *
 * CC's current strict Stop validator rejects `decision:'allow'`,
 * `hookSpecificOutput` (no Stop variant), and any non-schema root field
 * (`skillResult`/`autoTrigger`/...). The only schema-valid way for a Stop
 * hook to feed content back to the model AND keep the turn going is
 * `{ decision: 'block', reason: <content> }`. Claude receives `reason` as the
 * next-turn instruction and renders it (executive summary + AskUserQuestion
 * next-step options serialized into the text). This preserves the v2.1.21
 * #113 Stop-output-enforcement intent in a fully CC-compliant shape.
 *
 * @param {string} reason - Executive summary + next-step options (plain text)
 */
function outputStopSurface(reason) {
  console.log(JSON.stringify({ decision: 'block', reason: String(reason || '').trim() }));
}

/**
 * CC Stop hook — allow a clean stop with no forced continuation (S6, ENH-364).
 * Emits an empty object: every Stop schema field is optional, so `{}` is the
 * canonical "no opinion, let it stop" output. Used for read-only actions and
 * error fallbacks where surfacing a summary is not warranted.
 */
function outputStopAllow() {
  console.log(JSON.stringify({}));
}

/**
 * XML 특수문자 이스케이프
 * @param {string} content
 * @returns {string}
 */
function xmlSafeOutput(content) {
  if (!content) return '';
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  MAX_CONTEXT_LENGTH,
  truncateContext,
  isCursorRuntime,
  hasInFlightBackgroundWork,
  outputAllow,
  outputBlock,
  outputBlockWithContext,
  outputAsk,
  outputContext,
  outputEmpty,
  outputStopSurface,
  outputStopAllow,
  xmlSafeOutput,
};