/**
 * Stop-handler feature binding — br006.
 *
 * The Stop handler must record the phase against the feature that was actually
 * fired, not whichever feature happens to be `primaryFeature`. The misbind
 * (br006): with a foreign primaryFeature in the registry, hook input that
 * carried no doc path fell through `featureFromDocPaths` straight to the
 * `primaryFeature` fallback, and the fired feature's report never landed —
 * E-ARCH-GATE on archive despite a completed report doc.
 *
 * `resolveStopFeature` adds a middle tier of evidence: the registry itself. If
 * exactly ONE feature sits in the phase this Stop's action targets, that
 * feature is the one being driven — per-feature evidence instead of a
 * project-wide pointer.
 *
 * Pure module: no fs/network calls of its own (doc-path matching delegates to
 * `featureFromDocPaths`, which does its own existence checks). Never throws —
 * on any internal failure it returns '' so the caller keeps its existing
 * behavior.
 *
 * @module lib/pdca/stop-binding
 * @version 2.1.40
 * @since 2.1.40
 */

/**
 * action → phase, the inverse of the Stop handler's PHASE_TO_ACTION map
 * (scripts/pdca-skill-stop.js). The action comes from the skill invocation
 * text; the registry stores phases.
 */
const ACTION_TO_PHASE = {
  pm: 'pm',
  plan: 'plan',
  design: 'design',
  do: 'do',
  analyze: 'check',
  iterate: 'act',
  qa: 'qa',
  report: 'report',
};

/**
 * Resolve which feature a PDCA skill Stop event belongs to.
 *
 * Resolution order (first hit wins):
 *   1. Doc-path match in the input text (`featureFromDocPaths` — a path in the
 *      phase's own output names the feature it produced; existence-checked and
 *      unambiguous by that function's own guards).
 *   2. Exactly one feature in `currentStatus.features` whose phase matches the
 *      action's target phase (ACTION_TO_PHASE).
 *   3. `currentStatus.primaryFeature` (last resort — the fallback that caused
 *      br006, kept because it is still right when it is the ONLY evidence).
 *
 * @param {Object} args
 * @param {string} [args.inputText] - the Stop hook's text (skill output)
 * @param {Object} [args.currentStatus] - loaded pdca-status
 * @param {string} [args.activeSkill] - the action from the skill invocation
 *   text ('plan'|'design'|'do'|'analyze'|'iterate'|'qa'|'report'|'pm')
 * @returns {string} feature name, or '' when no evidence matches (never throws)
 */
function resolveStopFeature({ inputText, currentStatus, activeSkill } = {}) {
  try {
    // 1. Doc-path evidence in the invocation/agent output text.
    if (typeof inputText === 'string' && inputText) {
      const recorded = currentStatus?.primaryFeature || '';
      const fromDocPath = require('./status-core').featureFromDocPaths(inputText, recorded);
      if (fromDocPath) return fromDocPath;
    }

    // 2. Exactly one feature in the action's target phase.
    const phase = activeSkill ? ACTION_TO_PHASE[String(activeSkill).toLowerCase()] : null;
    if (phase) {
      const features = currentStatus?.features || {};
      const inPhase = Object.keys(features).filter(
        (name) => features[name]?.phase === phase
      );
      if (inPhase.length === 1) return inPhase[0];
    }

    // 3. Recorded pointer, last resort.
    return currentStatus?.primaryFeature || '';
  } catch {
    return '';
  }
}

module.exports = {
  ACTION_TO_PHASE,
  resolveStopFeature,
};
