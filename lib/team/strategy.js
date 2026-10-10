/**
 * Team Strategy Module
 * @module lib/team/strategy
 * @version 2.1.10
 *
 * Level-based Agent Teams strategy definitions with CTO-Led Team support.
 */

// br128: strategy phaseStrategy and orchestrator's DEFAULT_PHASE_PATTERN_MAP
// must cover the same phase key set — sourced from ONE constant so qa/report
// cannot go missing from either again.
const PDCA_PHASE_ORDER = ['pm', 'plan', 'design', 'do', 'check', 'act', 'qa', 'report', 'archived', 'completed'];

const TEAM_STRATEGIES = {
  Starter: null, // Team Mode not supported (single session sufficient)

  Dynamic: {
    teammates: 3,
    ctoAgent: 'cto-lead',
    roles: [
      {
        name: 'developer',
        description: 'Backend implementation and coding',
        agents: ['bkend-expert'],
        phases: ['do', 'act'],
      },
      {
        name: 'frontend',
        description: 'UI architecture and component implementation',
        agents: ['frontend-architect'],
        phases: ['design', 'do'],
      },
      {
        name: 'qa',
        description: 'Testing, gap analysis, and QA verification',
        agents: ['qa-monitor', 'gap-detector', 'qa-lead'],
        phases: ['check', 'qa'],
      },
    ],
    // br128: full phase key set from PDCA_PHASE_ORDER; qa keeps its own
    // role mapping (falls back to the qa role, not leader)
    phaseStrategy: Object.fromEntries(
      PDCA_PHASE_ORDER.map(p => [p, ({
        pm: 'single', plan: 'single', design: 'single',
        do: 'parallel', check: 'parallel', act: 'parallel', qa: 'parallel',
        report: 'single', archived: 'single', completed: 'single',
      })[p]])
    ),
  },

  Enterprise: {
    teammates: 6,
    ctoAgent: 'cto-lead',
    roles: [
      {
        name: 'pm',
        description: 'PM analysis and PRD generation',
        agents: ['pm-lead'],
        phases: ['pm'],
      },
      {
        name: 'architect',
        description: 'System architecture and infrastructure design',
        agents: ['enterprise-expert', 'infra-architect'],
        phases: ['design'],
      },
      {
        name: 'developer',
        description: 'Backend and frontend implementation',
        agents: ['bkend-expert', 'frontend-architect'],
        phases: ['do', 'act'],
      },
      {
        name: 'qa',
        description: 'Quality strategy, verification, and QA testing',
        agents: ['qa-strategist', 'qa-monitor', 'gap-detector', 'qa-lead', 'qa-test-planner', 'qa-test-generator', 'qa-debug-analyst'],
        phases: ['check', 'qa'],
      },
      {
        name: 'reviewer',
        description: 'Code review and design validation',
        agents: ['code-analyzer', 'design-validator'],
        phases: ['check', 'act'],
      },
      {
        name: 'security',
        description: 'Security architecture and vulnerability analysis',
        agents: ['security-architect'],
        phases: ['design', 'check'],
      },
    ],
    // br128: full phase key set from PDCA_PHASE_ORDER
    phaseStrategy: Object.fromEntries(
      PDCA_PHASE_ORDER.map(p => [p, ({
        pm: 'single', plan: 'single', design: 'council',
        do: 'swarm', check: 'council', act: 'watchdog', qa: 'council',
        report: 'single', archived: 'single', completed: 'single',
      })[p]])
    ),
  },
};

/**
 * Get teammate roles for a project level
 * @param {string} level
 * @returns {Array} roles
 */
function getTeammateRoles(level) {
  const strategy = TEAM_STRATEGIES[level];
  return strategy?.roles || [];
}

module.exports = {
  TEAM_STRATEGIES,
  getTeammateRoles,
};
