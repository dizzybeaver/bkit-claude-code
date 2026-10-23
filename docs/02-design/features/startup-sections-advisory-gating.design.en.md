# startup-sections-advisory-gating — Design (EN)

**Version:** 1.0 · **Date:** 2026-10-19 · **Feature:** startup-sections-advisory-gating

## 1. Overview

Operator decision (2026-10-19, br146 follow-up): gate the REMAINING
SessionStart context-injection sections — the `_ciSections` stack in
`hooks/startup/session-context.js` — under `bkit.config.json
hooks.advisory`, default false (silent), strict boolean true = inject.
Same mechanism and idiom as br144/br146.

## 2. Gates Added (all default false = silent)

| Key | Section builder |
|---|---|
| `hooks.advisory.agentTeams` | `buildAgentTeamsContext` (CTO-Led Agent Teams + stability note) |
| `hooks.advisory.outputStyles` | `buildOutputStylesAndMemoryContext` (output styles + memory systems) |
| `hooks.advisory.bkendMcp` | `buildBkendMcpContext` |
| `hooks.advisory.enterpriseBatch` | `buildEnterpriseBatchContext` |
| `hooks.advisory.pdcaCoreRules` | `buildPdcaCoreRules` |
| `hooks.advisory.automation` | `buildAutomationContext` (trigger table) |
| `hooks.advisory.versionEnhancements` | `buildVersionEnhancementsContext` |

`ui.contextInjection.enabled/sections` (ENH-238) continues to apply on top:
a section injects only when BOTH the ENH-238 gate and its advisory key are true.

Already gated (no change): `ccVersionAdvisory` (via `forkModeAdvisory`),
`onboarding` (br146).

Not gated: the one-line header (feature name + version) — the minimal
functional session marker; and all functional emitters (PDCA state restore,
auto-advance, preflight failure/staleness warnings).

## 3. Implementation

`hooks/startup/session-context.js` `buildCoreInjectionContext()`: each
remaining section line gains `&& getConfig('hooks.advisory.<key>') === true`
(getConfig already imported from the br146 edit). `bkit.config.json`
`hooks.advisory` gains the 7 keys, all `false`.

## 4. Verification

1. `node --check` on the edited file; config JSON parses.
2. Smoke: run live-cache `hooks/session-start.js` — header present, all 7
   sections absent in default config.
3. br144 gating contract suite stays green.
4. Sync via `tools/brfix-wave-probes/sync_plugin_cache.sh --apply`.
