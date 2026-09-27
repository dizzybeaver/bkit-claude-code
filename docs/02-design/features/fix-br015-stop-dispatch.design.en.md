# fix-br015-stop-dispatch Design Document

**Date:** 2026-09-27
**Architecture:** Option A — Minimal Changes (pre-selected at L4; AskUserQuestion banned)
**Context Anchor:** WHY=Stop dispatcher reads a field nobody writes; SCOPE=writer + read normalization + regression test

## 1. Overview

Make `pdca-skill-stop.js` reachable through unified-stop dispatch by (a) persisting `session.lastSkill`/`session.lastAgent` into the PDCA registry at skill-fire time, and (b) normalizing plugin-prefixed skill names at the registry read.

## 2. Current State (verified this session)

- Reader: `scripts/unified-stop.js:115-119` — legacy fallback `if (pdcaStatus?.session?.lastSkill) return pdcaStatus.session.lastSkill;` (inside `getActiveSkill()`'s local definition in unified-stop; primary paths are hook context, tool_input, the active-skill-marker file).
- Writer: NONE. `lib/pdca/status-migration.js:41,84` sets `session.lastActivity` only. `lib/orchestrator/skill-invocation-effects.js` mutates the registry at fire time (lastActivity path) — this is the sanctioned write chokepoint.
- Grep for `getActiveSkill` readers: `lib/task/context.js:67` (in-memory + marker file — unaffected), `scripts/unified-stop.js:97` (caller).
- `SKILL_HANDLERS` in unified-stop.js keys on bare names (`'pdca'`); skill fires arrive as `'bkit:pdca'` (plugin-qualified).

## 3. Architecture Options

| | A — Minimal (selected) | B — Clean | C — Pragmatic |
|---|---|---|---|
| Shape | Extend existing fire-time write + normalize at read | New `session-skill-recorder` module + event bus | Writer in fire path, normalization in a shared lib helper |
| Files touched | 2 + 1 test | 4+ | 3 |
| Risk | Low | Medium (new seams) | Low-Med |
| Chosen because | The registry is already mutated at this exact site; single reader to normalize | Over-engineered for 2 fields | Shared helper unneeded — single read site |

## 4. Detailed Design

### 4.1 Writer — `lib/orchestrator/skill-invocation-effects.js`

At the fire-time effect where `lastActivity` is written (the `lib/pdca/status-migration.js` / status-core session path), also set:

```js
status.session.lastSkill = normalizeSkillName(skillName); // strip 'plugin:' prefix
if (agentName) status.session.lastAgent = agentName;
```

Follow the exact mutation pattern of `status-migration.js:84` (`newStatus.session.lastActivity = now;`) — same persistence call, no raw file writes.

### 4.2 Reader normalization — `scripts/unified-stop.js`

At the `session.lastSkill` fallback read (~L115-119), strip a plugin-qualified prefix before returning:

```js
const raw = pdcaStatus?.session?.lastSkill;
if (raw) return raw.replace(/^[^:]+:/, '') === raw && raw.includes(':') ? raw : raw.replace(/^[^:]+:/, '');
```

Final form to be the simple, testable: `raw.includes(':') ? raw.split(':').pop() : raw` — wait, names can't contain ':' except the plugin separator; use `raw.slice(raw.lastIndexOf(':') + 1)` guarded to `'bkit:pdca'`→`'pdca'`, passthrough for bare names. Implementation agent picks the cleanest of these equivalents; contract is: `'bkit:pdca'`→`'pdca'`, `'pdca'`→`'pdca'`, unknown-prefixed `'x:y'`→`'y'`.

### 4.3 Regression suite — `test-scripts/unit/stop-dispatch-lastskill.test.js`

Dual-mode contract (JSON-parse stdout; property-presence, not function-equality — per L2-004/L2-006 lessons):

1. Writer test: invoke the fire-time effect with skill `'bkit:pdca'` → registry session block gains `lastSkill === 'pdca'` (normalized) + `lastAgent` when agent present.
2. Reader test: `getActiveSkill`-equivalent read path in unified-stop with a temp registry containing `lastSkill: 'bkit:pdca'` resolves handler key `'pdca'` (SKILL_HANDLERS hit).
3. Chain test: fire → read → `SKILL_HANDLERS['pdca']` resolves to the pdca-skill-stop module path.
4. Passthrough: bare `'sprint'` stays `'sprint'`.

## 5. Implementation Guide

### 11.3 Session Guide

| Module | Files | Est. lines |
|--------|-------|-----------|
| module-1 (writer) | lib/orchestrator/skill-invocation-effects.js | ~10 |
| module-2 (reader) | scripts/unified-stop.js | ~5 |
| module-3 (test) | test-scripts/unit/stop-dispatch-lastskill.test.js | ~120 |

Single scoped agent (exclusive scope: those 3 files). BUILD ONLY — testing handoff to MAIN per work.md §45.10.

## 6. Test Plan

- jest new suite green
- `npx jest` full (30 existing + new)
- battery `node scripts/verify-full-system.js` OVERALL PASS

## 7. Risks

- G-019/G-020 guard registry writes → writer uses sanctioned lib path (same as lastActivity).
- Over-stripping skill names containing ':' → contract-pinned by test 4.
