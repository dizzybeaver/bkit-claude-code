#!/usr/bin/env node
/**
 * team-idle-handler.js - TeammateIdle Hook Handler (v1.5.1)
 *
 * When a teammate becomes idle:
 * 1. Check current PDCA status
 * 2. If pending tasks exist, guide to next task
 * 3. If all tasks complete, guide to team cleanup
 */


// v2.1.12 Sprint C-2 (#9/#10/#8): bare-require guard — when this script
// is require()-d instead of executed as a hook entrypoint, return
// immediately so no stale stdout (decisions, advisory messages) is emitted
// without a real hook payload. CommonJS module body is implicitly an IIFE,
// so top-level return is valid.
if (require.main !== module) { module.exports = {}; return; }

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
const { getPdcaStatusFull } = require('../lib/pdca/status');

let teamModule = null;
try {
  teamModule = require('../lib/team');
} catch (e) {
  // Team module not available - graceful degradation
}

function main() {
  debugLog('TeammateIdle', 'Hook started');

  // Ignore if not in Team Mode
  if (!teamModule || !teamModule.isTeamModeAvailable()) {
    if (isAdvisoryEnabled('ackMessages')) { // br144: default false = silent
      outputAllow('TeammateIdle processed (no team mode).', 'TeammateIdle');
    } else {
      outputEmpty();
    }
    return;
  }

  let hookContext = {};
  try {
    const input = readStdinSync();
    hookContext = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) {
    debugLog('TeammateIdle', 'Failed to parse context', { error: e.message });
    if (isAdvisoryEnabled('ackMessages')) { // br144: default false = silent
      outputAllow('TeammateIdle processed.', 'TeammateIdle');
    } else {
      outputEmpty();
    }
    return;
  }

  // Plan FR-09 (rb038, wave1028 module-7): a payload with no teammate/agent id
  // has no roster row to update. The old 'unknown' fallback wrote ghost 'idle'
  // rows and ran queue transitions for a teammate that does not exist — skip
  // the team-state writes instead and say so in the response.
  const rawTeammateId = hookContext.teammate_id || hookContext.agent_id || null;
  const teammateId = rawTeammateId || 'unknown';

  // v1.5.9: ENH-74 explicit agent_id/agent_type extraction
  const agentId = hookContext.agent_id || teammateId;
  const agentType = hookContext.agent_type || 'unknown';

  const pdcaStatus = getPdcaStatusFull();

  debugLog('TeammateIdle', 'Teammate became idle', {
    teammateId,
    primaryFeature: pdcaStatus?.primaryFeature
  });

  // Use handleTeammateIdle for task-queue integration (identified teammates
  // only — Plan FR-09/rb038)
  const idleResult = rawTeammateId
    ? teamModule.handleTeammateIdle(rawTeammateId, pdcaStatus)
    : null;

  // State writer: record idle status (v1.5.3 Team Visibility)
  try {
    if (rawTeammateId && teamModule.updateTeammateStatus) {
      teamModule.updateTeammateStatus(rawTeammateId, 'idle', null);
    }
  } catch (e) {
    debugLog('TeammateIdle', 'State write failed (non-fatal)', { error: e.message });
  }

  // Plan FR-09 (rb038): hookSpecificOutput here was inert — TeammateIdle is
  // not in CONTEXT_CHANNEL_EVENTS and the event documents no
  // additionalContext channel, so the nested assignment/idle text was never
  // read. Dropped; the meaningful fields (nextTask, ids) stay top-level.
  // ENH-75 continuation: continue:false now carries the stopReason it always
  // required — a bare continue:false with no reason gave the runtime nothing
  // to show the teammate.
  const response = {
    systemMessage: `Teammate ${teammateId} is idle`,
    teammateId,
    agentId,
    agentType,
    nextTask: idleResult?.nextTask || null,
  };
  if (!idleResult?.nextTask) {
    response.continue = false;
    response.stopReason = rawTeammateId
      ? 'No pending tasks for this teammate'
      : 'TeammateIdle payload carried no teammate id; team state not updated';
  }

  console.log(JSON.stringify(response));
  process.exit(0);
}

main();
