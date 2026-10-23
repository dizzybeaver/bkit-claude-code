# br146-advisory-gating-expansion — Design (EN)

**Version:** 1.0 · **Date:** 2026-10-19 · **Feature:** br146-advisory-gating-expansion

## 1. Overview

Extend the br144 config-gate mechanism (`bkit.config.json hooks.advisory`,
absent/false = silent, strict boolean true = inject) to ALL remaining
advisory-only context injectors, per the census in
`bug_reports/active/br/br146-stale-hook-context-replayed-after-fix.md`
(Expanded Scope section).

## 2. Gates Added (all default false = silent)

| Key | Emitter | Injects when true |
|---|---|---|
| `hooks.advisory.dashboard` | `hooks/session-start.js` | PDCA dashboard sections (progress bar / workflow map / impact view / agent panel / control panel); `ui.dashboard.enabled` still applies |
| `hooks.advisory.onboarding` | `hooks/startup/session-context.js` | Onboarding text section |
| `hooks.advisory.cwdChangeNote` | `scripts/cwd-changed-handler.js` | "Project changed: …" note |
| `hooks.advisory.pdcaStatusEcho` | `scripts/notification-handler.js` | PDCA/Sprint enrichment of idle notifications |
| `hooks.advisory.sizeClassifier` | `scripts/pre-write.js` runPdcaGuidance | "Minor change (N lines). PDCA optional." guidance family |
| `hooks.advisory.scopeLimitAdvisory` | `scripts/pre-write.js` runScopeLimiter | Soft `NOT_IN_SCOPE`/`PATH_TRAVERSAL` "Scope limit: …" text |

## 3. Not Gated (functional)

- HARD_DENY_RULES branch in `runScopeLimiter` (DENIED_PATH / SYMLINK_ESCAPE /
  NULL_BYTE) — security decisions, unaffected by the gate.
- ENH-264 alternatives riding DENY decisions (`unified-bash-pre.js`).
- PDCA state restore (`post-compaction.js`, `context-compaction.js`),
  auto-advance (`pdca-task-completed.js`), tool-failure recovery guidance,
  session-start header, preflight stale/backup warnings, permission-request
  decision output (functional, not advisory).
- `ccVersionAdvisory` section: already default-silent — br144 gated it under
  `hooks.advisory.forkModeAdvisory` (default false); no code change needed.
- Subagent start/stop handlers: already br144-gated via `ackMessages`.

## 4. Implementation Notes

- Same idiom as br144: lazy `require('../lib/core/config')` +
  `getConfig('hooks.advisory.<key>') !== true` → silent exit / empty return.
- `bkit.config.json` `hooks.advisory` gains the 6 keys, all `false`.
- No version bump (maintainer's call). CHANGELOG entry optional.

## 5. Verification

1. `node --check` on all 5 edited JS files; JSON parse of config.
2. br144 contract suite (`node --test test/contract/br144-advisory-gating.test.js`) — green.
3. Live smoke: `cwd-changed-handler.js` with gated config → empty output, exit 0.
4. Sync to plugin cache (`tools/brfix-wave-probes/sync_plugin_cache.sh --apply`)
   so live hooks pick up the gates on next session start.
