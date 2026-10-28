# br-rb-wave-1027 설계 문서

> **요약**: rb006, br164/br166, br165을 닫는 세 가지 최소 범위 수정 + 양방향 웨이브 프로브 스위트.
>
> **Project**: bkit-claude-code
> **Version**: 2.1.40 (no bump)
> **Author**: dizzybeaver (agent session)
> **Date**: 2026-10-27
> **Status**: Draft
> **기획 문서**: [br-rb-wave-1027.plan.ko.md](../01-plan/features/br-rb-wave-1027.plan.ko.md)

---

## 컨텍스트 앵커

| Key | Value |
|-----|-------|
| **WHY** | False failure labels, unarchivable registry debris, and prose-blocking write gates each cost turns and degrade real signal. |
| **WHO** | Every Claude Code session running bkit hooks. |
| **RISK** | Over-suppression — probes cover both directions per fix (FP silenced AND true positive retained). |
| **SUCCESS** | Wave probes pass; suites + battery green; 4 reports archived; plugin synced; branch pushed. |
| **SCOPE** | 3 files + 1 probe file + docs/reports; no dispatcher or schema changes. |

---

## 1. 개요

### 1.1 설계 목표

- 각 수정은 참양성을 가리지 않고 오탐을 죽이는 최소 증거 강화다.
- 세 개의 배타적 파일 스코프 — 병렬 에이전트 dispatch 안전.
- 모든 억제는 debugLog 흔적을 남긴다(FR-04).

### 1.2 설계 원칙

- 증거가 없거나 해석 불가하면 오늘의 동작으로 fail-open(새 실패 모드 없음).
- 새 파싱 로직 대신 기존 검증기(`lib/pdca/validate-name.js`) 재사용.

---

## 2. 아키텍처 옵션

| 기준 | 옵션 A: 최소 (선택) | 옵션 B: 클린 | 옵션 C: 절충 |
|----------|:-:|:-:|:-:|
| **접근** | 3개 현장 증거 가드 + 단일 쓰기 지점 정규화 | 모든 훅이 쓰는 공유 exit-code/의도 분류기 모듈 | A + 남겨진 형제 키 병합 |
| **신규 파일** | 1(프로브 스위트) | 2+ + 재배선 | 1 + 레지스트리 수술 |
| **위험** | 낮음 | 중간(모든 훅 동작 드리프트) | 중간(G-020 레지스트리 쓰기) |
| **판정** | 핫픽스급, 가장 작은 올바른 변경 | 두 번째 소비자가 필요할 때 보류 | 범위 외(정당 경로로는 키 병합 불가) |

---

## 3. 데이터 모델

해당 없음 — 스키마 변경 없음. 레지스트리 키는 앞으로 계약에 맞는 단일 토큰이 되고, 기존에 남겨진 키는 문서화만 하고 마이그레이션하지 않는다.

---

## 4. API 명세

해당 없음 — 훅 스크립트. 출력 계약 불변(`outputEmpty`/`outputAllow`/기존 JSON 형태).

---

## 5. UI/UX 설계

해당 없음.

---

## 6. 오류 처리

| 사례 | 동작 |
|------|----------|
| FR-01: 입력에 해석 가능한 exit code 없음 | 기존 분류 유지(오늘 기준 fail-open) |
| FR-01: exit code가 0으로 해석 | 실패 가이드 없음, `outputEmpty`류 allow, debugLog `exit0-suppressed (wave1027 FR-01)` |
| FR-02: feature 인자가 이미 단일 토큰 | 바이트 단위 동일(정규화는 항등) |
| FR-02: feature 인자 누락/무효 | 기존 폴백(primaryFeature) 불변 |
| FR-03: G-010b 미적중 페이로드 | 통과(불변) |

---

## 7. 보안 고려사항

- FR-01은 실패 분류기를 강화한다 — 변화 방향은 오탐 감소이며, 진짜 실패(0이 아닌 해석 가능한 코드)는 불변이다.
- FR-03은 한정사 가드로 G-010b을 강화한다 — WHERE 없는 `DELETE FROM <table>`은 계속 탐지된다(프로브 강제).
- 새 입력원 없음; 어떤 억제도 실제 파괴 작업을 allow로 바꾸지 못한다.

---

## 8. 테스트 계획

웨이브 프로브 파일 `tools/brfix-wave-probes/wave1027_probes.js`(`rb005_probes.js`의 spawn 스타일; tmpdir 픽스처; `CLAUDE_PROJECT_DIR`/`CLAUDE_PLUGIN_DATA` 격리):

| ID | 수정 | 시나리오 | 기대 |
|----|-----|----------|----------|
| T1 | FR-01 | 훅 입력: Bash, 에러 문자열에 "non-zero" 포함하나 해석 가능한 exit code 0 (`exit code: 0`) | exit_nonzero 복구 가이드 없음, empty/allow 출력 |
| T2 | FR-01 | 진짜 `exit code: 1` 에러 문자열 | exit_nonzero 가이드 유지 |
| T3 | FR-01 | "non-zero" 언급하지만 코드 없음(오늘의 모호한 형태) | 기존 동작(분류됨) |
| T4 | FR-02 | args `plan myfeature — some prose notes`로 스킬 발화 → 상태 쓰기 | 키 하나 `myfeature`, "— " 포함 키 없음 |
| T5 | FR-02 | args `do myfeature`(클린) | 키 `myfeature` 불변(항등) |
| T6 | FR-03 | G-010b 패턴 테스트: "config key create/delete from the dashboard" | 미적중 |
| T7 | FR-03 | `DELETE FROM audit_log;`(WHERE 없음) | 계속 적중 |
| T8 | FR-03 | `DELETE FROM audit_log WHERE id=1` | 미적중(WHERE 존재) |
| T9 | FR-03 | br165 재현 페이로드의 새 .md Write 전체 | 쓰기 거부 없음 |
| T10 | 문법 | `node --check` × 3 파일 | exit 0 |
| T11 | FR-01 라이브 | 이번 세션 표본의 에러 문자열 형태("Bash command exited with non-zero status." — 코드 숫자 없음) | 코드 없으면 T3대로 분류됨 — 문서화된 결과 |

추가: 3개 파일을 건드리는 대상 스위트(tests/에서 이름 검색) + 전체 배터리.

---

## 9. 클린 아키텍처

해당 없음 — 현장 가드.

---

## 10. 코딩 컨벤션 참조

- 주석 태그: `// rb006:`, `// br164/br166:`, `// br165:`(형제 스타일).
- `const`만 사용; skill-invocation-effects의 `validate-name` 외 새 require 없음(저장소 다른 곳에서 이미 사용).

---

## 11. 구현 가이드

### 11.1 모듈 맵(배타적 스코프 — 병렬 3 에이전트)

| 모듈 | 파일(배타적) | 변경 |
|--------|------------------|--------|
| M1 | `scripts/tool-failure-handler.js` | `classifyFailure`의 FR-01 증거 가드 |
| M2 | `lib/orchestrator/skill-invocation-effects.js` | 146행 직후 `invocationArgs.feature` 1회 정규화(FR-02) |
| M3 | `lib/control/destructive-detector.js` | FR-03 G-010b 한정사 가드(216행 패턴) + T9에 필요하면 markdown 대상 면제 |

### 11.2 구현 순서(모듈별)

1. **M1**: (a) TRIAGE — at hook start, debugLog the RAW input JSON (tool_name, error, keys of tool_input/tool_response if present) so the next live firing records the true payload shape (rb006's own triage prescription). (b) before the `exit_nonzero` return, extract code via `/exit (?:code|status)[:\s]*(\d+)/i` from the error string (also check `input.tool_response` for an exit field if present). Code === 0 → return a `success_suppressed` no-op classification (empty guidance, debugLog). Code non-zero or absent → unchanged. Live specimen note: the observed error string ('Bash command exited with non-zero status.') carries NO digits — T11 documents this staying classified until the triage capture proves a safer evidence source.
2. **M2**: after `const invocationArgs = args || {};` (line 146), if `invocationArgs.feature` is a string, normalize: `String.split(/\s+/)[0]`, strip em-dash fragments, route through `require('../../pdca/validate-name').normalizeFeatureName` when available; drop invalid → undefined (existing fallbacks apply). debugLog when normalization changed the value.
3. **M3**: modify the G-010b pattern (line 216) to add a negative lookahead for English determiners/possessives after FROM: `(?!the\b|a\b|an\b|this\b|that\b|these\b|those\b|my\b|our\b|your\b|its\b)`. Verify T6/T7/T8 against the pattern directly; if T9 (full Write repro) still denies via a DIFFERENT rule (G-005 companion), extend the guard to that rule's prose path with the same evidence bar and note it in the module report.
4. 세 수정 착지 후 MAIN이 프로브 스위트 + 스위트 + 배터리 실행(테스팅 핸드오프).

### 11.3 세션 가이드

| 모듈 | 에이전트 | 기한 |
|--------|-------|----------|
| M1 | 수정 에이전트 A | 10분(cron 무장) |
| M2 | 수정 에이전트 B | 10분(cron 무장) |
| M3 | 수정 에이전트 C | 10분(cron 무장) |

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|---------|------|---------|--------|
| 0.1 | 2026-10-27 | 웨이브 설계 — 옵션 A, 배타적 3 스코프 | dizzybeaver (에이전트) |
