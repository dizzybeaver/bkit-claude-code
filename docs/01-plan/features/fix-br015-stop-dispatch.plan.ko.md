# fix-br015-stop-dispatch 계획 문서

> **요약**: pdca Stop 핸들러를 도달 가능하게 만들기 — 스킬 발화 시점에 `session.lastSkill`을 쓰고 읽기를 정규화합니다.
>
> **Project**: bkit-claude-code
> **Date**: 2026-09-27
> **Status**: Draft (L4 auto-approved)
> **Cycle shape**: bug-fix PDCA (work.md §45.9)

## 요약 (Executive Summary)

| Perspective | Content |
|-------------|---------|
| **Problem** | `getActiveSkill()` reads `session.lastSkill` (unified-stop.js:117-119) but no code writes it; the pdca Stop handler is dead at the dispatch layer in fork-mode sessions, so report→completed and envelope advances never run. |
| **Solution** | Write `session.lastSkill` + `session.lastAgent` at fire time in `lib/orchestrator/skill-invocation-effects.js`; normalize plugin-prefixed skill names (`bkit:pdca` → `pdca`) in `getActiveSkill()`. |
| **Function/UX Effect** | Stop events route to per-skill handlers again; the report→completed advance and envelope derivation become reachable end-to-end. |
| **Core Value** | Closes the root of the br009/br011/br014 Stop-advance family instead of patching handler internals. |

## 컨텍스트 앵커

| Key | Value |
|-----|-------|
| **WHY** | Stop dispatcher reads a field nobody writes — every per-skill Stop handler is unreachable in fork mode. |
| **WHO** | bkit plugin users in fork-mode (`--fork-session`) CC sessions; future PDCA cycles relying on Stop-driven phase advances. |
| **RISK** | Writing lastSkill on non-pdca fires could misroute Stop events for other skills; normalization must not break exact-key skills. |
| **SUCCESS** | Regression test proves fire→lastSkill→pdca-handler chain; jest + full battery green; br015 closed+archived. |
| **SCOPE** | skill-invocation-effects.js (writer), unified-stop.js (normalization), new unit regression suite. |

## 1. 개요

### 1.1 Purpose
Close br015: `session.lastSkill` read-but-never-written, making `pdca-skill-stop.js` unreachable via unified-stop dispatch.

### 1.2 Background
Wave 1 (br009/011) fixed findDoc bilingual defaults; the br014 envelope work fixed action derivation inside the handler. Transcript forensics (18 pdca fires) proved the registry session block never gained `lastSkill` — the dispatch layer itself is broken. Handler-side fixes can never fire.

### 1.3 Related Documents
- PRD: `docs/00-pm/fix-br015-stop-dispatch.prd.en.md`
- br015: `bug_reports/active/br/br015-session-lastskill-read-but-never-written-stop-dispatch-dead.md`

## 2. 범위

### 2.1 In Scope
- [ ] `lib/orchestrator/skill-invocation-effects.js`: write `session.lastSkill` (normalized) + `session.lastAgent` alongside the existing `lastActivity` write at fire time
- [ ] `scripts/unified-stop.js` `getActiveSkill()`: normalize `'bkit:pdca'` → `'pdca'` (strip `plugin:` / `plugin:`-style prefix) to match SKILL_HANDLERS keys
- [ ] New regression suite `test-scripts/unit/stop-dispatch-lastskill.test.js` proving the full chain

### 2.2 Out of Scope
- Handler-internal logic (br005a/br014 already landed)
- Non-pdca skill handlers' routing behavior beyond normalization
- Live-session verification (already-running sessions need restart to load synced hook code — known, documented)

## 3. 요구사항

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | pdca skill fire persists `session.lastSkill` in the registry | High | Pending |
| FR-02 | `session.lastAgent` written symmetrically when agent context present | Medium | Pending |
| FR-03 | `getActiveSkill()` strips plugin prefix so `'bkit:pdca'` maps to `'pdca'` | High | Pending |
| FR-04 | Regression test: fire effect → registry field set → unified-stop resolves pdca handler | High | Pending |

## 4. 성공 기준

- [ ] FR-01..04 implemented; jest suite green
- [ ] Full battery (`node scripts/verify-full-system.js`) OVERALL PASS
- [ ] br015 closed into `bug_reports/completed/BR/` with Resolution addendum; wave archived

## 5. 위험 및 완화

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Registry write fails under G-019/G-020 guards | High | Low | Writer goes through the sanctioned `lib/pdca` status API path already used for `lastActivity`, not raw file writes |
| Normalization over-strips (e.g. names containing ':') | Medium | Low | Strip only a leading `plugin:`-style segment; unit test the exact `'bkit:pdca'` case plus an unprefixed passthrough |
| Stale lastSkill misroutes a later non-pdca Stop | Medium | Low | Write clears/sets per fire; handlers already tolerate unknown skills (no-op path) |

## 6. 영향 분석

### 6.1 Changed Resources

| Resource | Type | Change |
|----------|------|--------|
| `.bkit/state/pdca-status.json` `session` block | Runtime state | Two new fields written at fire time |
| `getActiveSkill()` return value | Hook API | Plugin-prefixed inputs now normalize |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `session.lastActivity` | WRITE | skill-invocation-effects.js fire path | Same write site extended (none/benign) |
| `getActiveSkill()` | READ | unified-stop.js SKILL_HANDLERS dispatch | Needs verification |
| `getActiveSkill()` | READ | any other reader | Needs verification (grep during do) |

## 7. 아키텍처 고려사항

Minimal-change option (A) selected: writer goes where the registry is already mutated at fire time; reader normalizes at the single chokepoint. No new modules, no config.

## 8. 컨벤션 선행조건

Dual-mode hook contract applies to any touched stop script (stdin CLI + `require.main === module` + exported helpers) — regression tests follow the JSON-stdout contract proven in L2-004/L2-006.

## 9. 다음 단계

1. [x] Design document
2. [x] Implementation via scoped agent (BUILD ONLY, testing handoff to MAIN)
3. [x] MAIN tests: jest + battery + probes; close br015; archive
