# qa-aggregate-red-fixes — 결함 수정 PRD

**Version:** 1.0
**Date:** 2026-10-10
**Purpose:** 브랜치 `fix/patches_102026`에서 실패하는 qa-aggregate 게이트 검증 6건을 해결하여 CI 통과
**Category:** PDCA PM 단계 — 버그 수정 레인 (work/work.md §45.9). 영문 `.en.md`가 SoT이며 이 파일은 번역본.

---

## 1. 요약 (Executive Summary)

| 관점 | 요약 |
|---|---|
| 문제 | `.github/workflows/contract-check.yml` CI 사전 실행이 RED: 8개 파일에서 6건의 검증 실패 (7158 PASS / 6 FAIL / 7166 TC). 원인은 최근 작업 파도에서 남은 5개 근본 결함 (br050 io 분할, lib 증가, MCP 포트 증가, 미진단 1건의 동작 변경). |
| 가치 | 녹색 CI 기준선을 복원하여 브랜치 병합이 가능해지고 contract-check 사전 실행을 다시 신뢰할 수 있게 함. |
| 기능/UX 효과 | 최종 사용자에게는 없음 — 모든 수정이 내부 일관성 (버전 태그, 문서 카운트, 마커 위치, 포트 기대값, enforce 경로 동작 1건). |
| 핵심 가치 | CI 무결성: 집계 게이트는 낡은 기대값이나 어긋난 문서가 아니라 검증된 현재 현실을 반영해야 함. |
| 리스크 | 중하. F1-F3는 기계적 수정. F4-F5는 "어느 쪽이 틀렸는지 검증"을 먼저 요구 — 실제 회귀를 덮어쓰지 않기 위함. |

## 2. 배경 (Background)

- 브랜치 `fix/patches_102026`; 근거는 2026-10-10 라이브 실행에서 검증됨 (사전 소화된 브리프 — 신뢰, 재도출 안 함).
- 게이트: qa-aggregate, `.github/workflows/contract-check.yml` 사전 실행으로 수행. 결과: 8개 파일에서 7158 PASS / 6 FAIL / 7166 TC.
- 6건의 실패는 5개 근본 원인으로 묶임 (§3). F1-F4는 최근 감사/리팩터 파도의 일관성 드리프트. F5는 동작 문제로 수정 전 진단 필요.

## 3. 문제 정의 — RED 검증 6건, 근본 원인 5개

| # | 검증 (수트) | 근본 원인 |
|---|---|---|
| F1a | L3-006 "@version 누락 파일 0개" (`test/contract/v2112-deep-qa-invariants.contract.test.js`) | `lib/core/io.js`에 `@version` 헤더 태그 없음 — br050 `_io` 분할이 태그 없이 파일 생성 |
| F1b | L1-016 "@version 누락 파일 0개" (`tests/qa/v2112-deep-qa-fixes.test.js`) | `lib/core/_io/shared.js` — F1a와 동일 원인 |
| F2 | `lib/core/io.js` 내용 정규식 `/STDOUT_REACHES_MODEL/` (`test/regression/enh-433-hook-output-visibility.test.js`) | br050 분할이 마커를 `lib/core/_io/*` 하위 모듈로 이동; 수트는 래퍼(`_io/` 재노출)를 읽어 정규식 실패 |
| F3 | CI-INV x2: lib 모듈 수 (`test/contract/component-inventory.test.js`) | `AI-NATIVE-DEVELOPMENT.md`는 lib 모듈 203개 기술; 저장소는 현재 207개 (감사 파도에서 lib 증가, 문서 미갱신) |
| F4 | MCP 포트 수 strictEqual: 실제 16 vs 기대 13 (`test/contract/mcp-port.test.js`) | 신규 port↔adapter 쌍 3개 추가 (v2.1.40 시대, "8 Port↔Adapter pairs") — 수트 기대값 미갱신, 또는 의도하지 않은 포트; 어느 쪽인지 검증 필요 |
| F5 | EN-06 "enforce가 content 필드 검사": 기대 true !== 실제 false (`tests/qa/v2114-defense-memory-enforcer.test.js`) | 동작 문제: `lib/defense/memory-enforcer.js` enforce 경로가 content 필드 검사를 더 이상 수행하지 않거나, 픽스처가 enforcement 동작과 불일치 — 진단 필요 |

## 4. 범위 (Scope)

**포함 (IN)**
- 위 5개 발견 (F1-F5)과 같은 수트 내 형제 검증.
- 최소 편집만: 누락 태그, 마커 위치, 문서 카운트, 포트 기대값, enforcer 동작 — 각 항목에서 검증상 틀린 쪽.

**제외 (OUT)**
- 수정 중 우연히 발견한 다른 문제: out-of-scope 규칙(`~/.claude/rules/verification/verification-scope.md`)에 따라 `bug_reports/`에 파일링; 이번 웨이브에서 수정하지 않음.
- 마커/태그 수정 외의 `lib/core/io.js` / `lib/core/_io/` 리팩터.
- qa-aggregate 스크립트, 게이트 임계값, CI 워크플로우 변경.

## 5. 요구사항 (Requirements)

| ID | 요구사항 | 인수 기준 (해당 수트 green) |
|---|---|---|
| R1 | `lib/core/io.js`와 `lib/core/_io/shared.js`에 누락된 `@version` 헤더 태그 추가 — 기존 규격 lib 파일의 태그 형식을 그대로 복사 | `test/contract/v2112-deep-qa-invariants.contract.test.js` L3-006 green AND `tests/qa/v2112-deep-qa-fixes.test.js` L1-016 green (`@version` 누락 0개) |
| R2 | enh-433 계약을 위해 `STDOUT_REACHES_MODEL` 가시성 복원 — 마커가 래퍼에 (또는 래퍼가 참조) 돌아가야 하거나, 수트가 `_io` 모듈을 읽어야 함; 편의가 아닌 검증된 현실로 판단 | `test/regression/enh-433-hook-output-visibility.test.js` green |
| R3 | `AI-NATIVE-DEVELOPMENT.md`의 lib 모듈 수를 검증된 저장소 카운트(현재 207)와 일치 | `test/contract/component-inventory.test.js` CI-INV 2건 모두 green |
| R4 | MCP port↔adapter 수 일치. 먼저 어느 쪽이 틀렸는지 검증: 신규 쌍 3개가 의도된 것(v2.1.40 노트)이면 기대값 13→16 갱신; 우발적이면 코드 수정. 숫자를 맹목적으로 갱신하지 않음 | `test/contract/mcp-port.test.js` green, verify-first 판단을 수정 보고서에 기록 |
| R5 | EN-06 진단: `lib/defense/memory-enforcer.js`가 content 필드 검사를 잃었는지(코드 회귀) 또는 픽스처가 enforcement 동작에서 드리프트했는지(수트 드리프트) 판별하고 틀린 쪽을 수정 | `tests/qa/v2114-defense-memory-enforcer.test.js` EN-06 green; EN-06는 true test 유지 — content 필드 검사가 제거되면 실패해야 함 |

## 6. 성공 기준 (Success Criteria)

- **SC-1:** `node test/contract/scripts/qa-aggregate.js`가 0 FAIL로 exit 0 (7166/7166 TC green).
- **SC-2:** 24단계 contract-check 사전 실행(`.github/workflows/contract-check.yml`)이 브랜치 `fix/patches_102026`에서 전부 green.

## 7. 리스크 (Risks)

| 리스크 | 완화 |
|---|---|
| 수트 기대값 갱신이 실제 회귀를 덮어씀 (F4 포트 수, F5 enforcer에서 최고 위험) | verify-first 의무: F4와 F5는 편집 전에 어느 쪽(코드/수트)이 틀렸는지 증명하고 판단을 기록. 잘못된 쪽의 수트 갱신은 수정이 아니라 가면 |
| `@version` 태그를 잘못된 형식으로 추가해 동일 불변식 재실패 | 기존 규격 lib 파일에서 태그를 그대로 복사 |
| 문서 카운트(R3)가 lib 성장으로 재드리프트 | 수정 시점의 검증된 카운트 사용; CI-INV가 매 실행 재검증하여 드리프트 즉시 포착 |
| R5의 픽스처 변경이 수트를 우회로 약화 | EN-06는 true test 유지: 고유 효과(content 필드 검사)를 단언, enforcement가 깨지면 red |
| 수정 중 발견한 형제 결함으로 범위 확산 | out-of-scope 발견은 같은 액션에서 `bug_reports/`에 파일링 후 이번 웨이브에서 제외 |

## 8. N/A — 제품 디스커버리 섹션

내부 결함 수정 웨이브 (§45.9 버그 수정 레인). 다음 전부 **N/A — internal defect-fix wave (§45.9 bug-fix lane)**:

- 페르소나 — N/A
- 경쟁사 — N/A
- 시장 규모 (TAM/SAM/SOM) — N/A
- 비치헤드 세그먼트 — N/A
- GTM (시장 진입) — N/A
- JTBD / 가치 제안 — N/A

외부 PM 프레임워크 미적용. 발견 내용은 2026-10-10 라이브 실행에서 사전 소화되었으며 브리프에 따라 그대로 신뢰함.
