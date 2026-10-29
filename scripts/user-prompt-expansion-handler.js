#!/usr/bin/env node
'use strict';
/**
 * user-prompt-expansion-handler.js — UserPromptExpansion Hook (Issue #132)
 *
 * Wires bkit's orchestrator side-effects to the NATIVE slash-command path.
 * When a user types `/bkit:<skill> <args>`, CC fires UserPromptExpansion with
 * { command_source:'plugin', command_name:'bkit:<skill>', command_args:'<args>',
 *   session_id, prompt }. This handler filters to bkit's own plugin commands,
 * resolves the skill, and runs the SAME shared effects module the Skill-tool
 * path uses — recording a `skill_invoked` audit action, decision trace, PDCA
 * status update, active-skill marker, and next-skill guidance.
 *
 * FAIL-OPEN CONTRACT: the ENTIRE body is wrapped in try/catch. Any error →
 * process.exit(0). This handler NEVER emits `decision:"block"` — a handler bug
 * must never block a user's slash command. UserPromptExpansion injects STDOUT
 * as context (NOT hookSpecificOutput.additionalContext), so guidance is written
 * as plain text to stdout.
 *
 * @module scripts/user-prompt-expansion-handler
 * @version 2.1.27
 * @since 2.1.27
 */

/**
 * Format returned suggestions into a human-readable next-skill guidance string.
 * @param {Object} suggestions
 * @returns {string}
 */
function formatGuidance(suggestions) {
  if (!suggestions || typeof suggestions !== 'object') return '';
  const parts = [];
  if (suggestions.nextSkill && suggestions.nextSkill.name) {
    parts.push(`Next: /${suggestions.nextSkill.name}${suggestions.nextSkill.message ? ' — ' + suggestions.nextSkill.message : ''}`);
  }
  if (suggestions.suggestedAgent) {
    parts.push(`Suggested agent: ${suggestions.suggestedAgent}${suggestions.suggestedMessage ? ' — ' + suggestions.suggestedMessage : ''}`);
  }
  return parts.join('\n');
}

try {
  const { readStdinSync } = require('../lib/core/io');
  const { debugLog } = require('../lib/core/debug');
  const { normalizeSkillName } = require('../lib/core/skill-name');
  const orch = require('../lib/skill-orchestrator');

  const input = readStdinSync() || {};

  // Filter 1: only bkit's own plugin slash commands (e.g. /simplify has a
  // different command_source and must be a no-op here).
  if (input.command_source !== 'plugin') {
    process.exit(0);
  }

  // Filter 2: the command must resolve to a real bkit skill.
  const skillName = normalizeSkillName(input.command_name || '');
  if (!skillName || !orch.getSkillConfig(skillName)) {
    process.exit(0);
  }

  // Parse command_args (a STRING, e.g. "do login") using the SAME split logic
  // skill-post.js uses: action = first token, feature = the rest.
  const argsStr = typeof input.command_args === 'string' ? input.command_args : '';
  const args = {};
  if (argsStr) {
    const parts = argsStr.trim().split(/\s+/);
    if (parts.length > 0 && parts[0]) {
      args.action = parts[0];
    }
    if (parts.length > 1) {
      args.feature = parts.slice(1).join(' ');
    }
  }

  const { runSkillInvocationEffects } = require('../lib/orchestrator/skill-invocation-effects');
  const dedupeKey = `${input.session_id || ''}:${skillName}:${args.action || ''}:${args.feature || ''}`;

  /*
   * rb040 (hook-audit-1028): the effects are now AWAITED within the hook
   * budget, not fire-and-forget. CC may kill the hook process the moment the
   * event loop drains — an unawaited promise race meant torn/lost expansion
   * state that reads as "never ran" (debug-trace-first trap). Racing a budget
   * timer keeps the fail-open contract (never block the slash command) while
   * giving the writes the process's full remaining lifetime to land.
   */
  const HOOK_BUDGET_MS = 8000;
  const budget = new Promise((resolve) => setTimeout(resolve, HOOK_BUDGET_MS));
  const effects = runSkillInvocationEffects(skillName, args, { source: 'slash-command', dedupeKey });

  Promise.race([effects, budget])
    .then((result) => {
      // result is undefined when the budget timer won the race — the effects
      // are still in flight and CC will kill them; that is the documented
      // fail-open ceiling, but it is now VISIBLE in debugLog.
      if (result === undefined) {
        debugLog('PromptExpansion', 'Hook budget elapsed before effects settled', {
          skillName, dedupeKey,
        });
        process.exit(0);
      }
      const guidance = formatGuidance(result && result.suggestions);
      if (guidance) {
        // UserPromptExpansion injects stdout as context.
        process.stdout.write(guidance + '\n');
      }
      process.exit(0);
    })
    .catch((e) => {
      // rb040: log-and-continue, not silent exit 0 — failure must be
      // diagnosable even though the slash command still proceeds.
      debugLog('PromptExpansion', 'Skill invocation effects failed', {
        skillName, dedupeKey, error: e instanceof Error ? e.message : String(e),
      });
      process.exit(0);
    });
} catch (_e) {
  // Fail-open: never block the slash command.
  process.exit(0);
}
