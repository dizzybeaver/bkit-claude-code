# PRD — br045-scope-advisory-fixes (한국어)

**파일:** docs/00-pm/br045-scope-advisory-fixes.prd.ko.md (한국어 버전; 영어 SoT: `br045-scope-advisory-fixes.prd.en.md`)
**버전:** 0.1.0 (Plan 단계용 초안)
**날짜:** 2026-10-10
**목적:** br045 결함 수정 PRD — 오염된 control-state 기준값과 스코프 리미터 허용목록 계층 누락으로 인한 "not in allowed scope for L0" 오탐 어드바이저리.
**레인:** PDCA 버그픽스 웨이브(§45.9) — 최소 PRD, 시장 분석 섹션 N/A.
**원인 결함:** `bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md`

## 요약 (Executive Summary)

| 관점 | 요약 |
|------|------|
| 문제 | 모든 정상 서브에이전트 Edit에서 "Scope limit: ... not in allowed scope for L0" 오탐이 출력됨: 배터리 픽스처가 저장된 컨트롤 레벨을 0으로 오염시켰고, L2(moderate) / L3-4(wide) 허용목록에는 저장소의 실제 QA 디렉터리(`tests/`)와 루트 `*.md` 문서가 빠져 있음. |
| 가치 | 스코프 게이트의 신뢰성 회복 — 보안 인접 PreToolUse 훅의 오탐 노이즈 제거, 저장된 자동화 레벨이 세션의 실제 운영 레벨(4)과 재동기화. |
| 위험 | 낮음. 게이트는 어드바이저리 전용(ENH-398: NOT_IN_SCOPE는 경고만 하고 차단하지 않음)이므로 현재 차단되는 쓰기는 없음. 수정은 픽스처 파일 1개, 허용목록 테이블 1개, 승인된 setLevel 복원 호출 1회에 국한. |

표준 PM 섹션(페르소나, 경쟁사, TAM/SAM/SOM, JTBD / 가치 제안, 비치헤드, ICP/GTM): **N/A — 내부 결함 수정 웨이브.**

## 배경 (br045 증거)

- 디스패치된 픽스 에이전트들이 qa-aggregate-red-fixes의 3회 Do 라운드 전체에서 모든 Edit마다 L0 스코프 어드바이저리를 수신 — 대시보드는 "L2 Semi-Auto"를 표시 중이었고 `work/work.md`는 운영 레벨 4를 선언.
- 라이브 상태: `.bkit/runtime/control-state.json` = `{currentLevel: 0, level: "manual", setBy: "runtime"}`, `previousLevel: 4`, `levelChangeReason: "L2-001 restore"`; 파일 mtime이 마지막 배터리 실행 완료 시각과 일치.
- `pre-write.js` 스테이지 8(`scripts/pre-write.js:366`)이 모든 편집에 L0/L1 strict 허용목록(`docs/**` + `.bkit/**` 만)을 적용하여 어드바이저리를 생성.
- ENH-398이 NOT_IN_SCOPE를 어드바이저리 전용으로 유지하므로 편집은 여전히 반영됨 — 이 결함은 차단이 아닌 오탐 노이즈 + 저장 레벨 불일치.

## 문제 정의 — 독립적인 2개 근본 계층

### 계층 A — 샌드박스 없는 픽스처가 유발한 control-state 오염

`tests/qa/v2112-deep-qa-fixes.test.js` 픽스처(L1-001..L1-004+)가 실제 `.bkit/runtime/control-state.json`에 대해 실제 `ctrl.setLevel(0, ...)`을 호출 — hermetic 샌드박스 없음 — 이후 베어 `ctrl.setLevel(before.currentLevel, ...)` 한 줄로 복원:

- set과 restore 사이에서 어설션이 실패하면(try/finally 없음) 예외가 restore 줄을 건너뛰어 라이브 파일이 레벨 0으로 남음.
- "복원"이 이미 오염된 파일에서 기준값을 읽으므로, 이후 모든 배터리 실행이 영원히 0으로 복원(자가 증식 오염).

### 계층 B — 허용목록 계층 누락(올바른 레벨에서도 발화)

`lib/control/scope-limiter.js` `LEVEL_SCOPE_OVERRIDES` (51행):

- `moderate`(L2, 62행)에 `test/**`(단수형 — 실제로 존재하지 않는 디렉터리)은 있으나 `tests/**`(저장소의 실제 QA 디렉터리)과 루트 `*.md`(`AI-NATIVE-DEVELOPMENT.md`, `CUSTOMIZATION-GUIDE.md`, `README.md` 등)가 없음. br109가 `tools/ work/ bug_reports/`를 추가했으나 이것들은 누락.
- `wide`(L3-4, 69행)는 `DEFAULT_SCOPE.allowedPaths`(19행)를 별칭으로 사용하며, 여기에도 `tests/**`과 `*.md` 모두 없음.

해당 경로에 대한 일반적인 저장소 내 편집은 레벨 2 이상에서 동일한 어드바이저리를 발생.

## 범위

**포함 (IN)**

1. `tests/qa/v2112-deep-qa-fixes.test.js`의 픽스처 hermetic 샌드박스(R1) + try/finally 방어(R2).
2. `lib/control/scope-limiter.js`의 moderate·wide 계층에 `tests/**` + 루트 `*.md` 허용목록 추가(R3).
3. 공개 `ctrl.setLevel` API를 통한 라이브 레벨 4 일회성 복원(R4).

**제외 (OUT)**

- ENH-398 어드바이저리-대-차단 시맨틱 변경.
- `pre-write.js` 동작 변경(레벨이 올바르면 스테이지 8 조회도 올바름).
- ZfeatA 레지스트리 정크 — 별도 관심사/캐리 항목(동일한 무샌드박스 픽스처 클래스).

## 요구사항

| ID | 요구사항 |
|----|----------|
| R1 | **Hermetic 픽스처 샌드박스.** `v2112-deep-qa-fixes.test.js`의 automation-controller 픽스처가 저장소의 `.bkit/runtime/control-state.json`이 아닌 임시 디렉터리 상태 파일로 실행. 메커니즘: `CLAUDE_PROJECT_DIR`을 임시 디렉터리로 교체, 대상 모듈의 require 캐시 퍼지 — `deleteMatchingCache(/lib\/(core\/(platform|cache|config)|control\/automation-controller)/)` — 후 재요구. `tests/qa/bkit-deep-system.test.js` A2-1/A2-5에서 확립된 패턴. |
| R2 | **try/finally 방어.** 해당 픽스처의 모든 set-level/restore 쌍을 try/finally로 감싸 어설션 예외가 복원을 건너뛸 수 없게 함. R1 뒤의 심층 방어. |
| R3 | **허용목록 추가.** `LEVEL_SCOPE_OVERRIDES.moderate.allowedPaths`와 wide 계층에 `'tests/**'`와 `'*.md'`(루트 문서; 리미터의 glob에서 `*`는 비재귀이므로 `*.md`는 루트 고정) 추가. 참고: wide는 `DEFAULT_SCOPE.allowedPaths`(`scope-limiter.js:69`)로 위임하므로 wide 계층 편집은 `DEFAULT_SCOPE`(19행)에 반영됨. |
| R4 | **라이브 레벨 복원.** 승인된 공개 API를 통한 저장 레벨 복원 — `ctrl.setLevel(4, { setBy: 'operator-work-md', ... })` — `work/work.md`가 선언한 운영 레벨 4와 일치. `.bkit/runtime/control-state.json`은 런타임 상태이지 PDCA 레지스트리가 아니며, `setLevel`이 그 공개 기록자. `.bkit/runtime/` 수동 편집 금지. |

## 성공 기준

| ID | 기준 | 검증 |
|----|------|------|
| SC-1 | 전체 배터리 실행 후 `.bkit/runtime/control-state.json`의 `currentLevel`이 배터리 사전 값에서 불변. | 배터리 전 값 기록 후 비교; 동일해야 함(R4 반영 후 4와 동일). |
| SC-2 | L2 계층-누락 프로브: `checkPathScope('tests/foo.test.js', 2)`와 `checkPathScope('README.md', 2)`가 모두 `allowed: true` 반환. | `lib/control/scope-limiter.js` 대상 직접 `node -e` 프로브. |
| SC-3 | 24단계 contract-check 배터리 전체 그린. | 배터리 실행 출력. |

## 위험

| 위험 | 상세 | 완화 |
|------|------|------|
| require 캐시 퍼지 불완전 | `PROJECT_DIR`은 모듈 로드 시점 const; 퍼지가 `lib/core/platform.js`(또는 `lib/control/automation-controller.js`)를 놓치면 재요구된 컨트롤러가 임시 디렉터리를 무시하고 픽스처가 다시 실제 상태에 조용히 기록. | 퍼지 정규식이 platform, cache, config, automation-controller 모두 포함(A2-1/A2-5 기준); SC-1 재확인으로 잔여 오염 포착. |
| 복원 순서 | `setLevel`은 전이 메타데이터도 기록(`lastAutoTransition: "trust-downgrade"` 라이브 관찰); R4 복원은 픽스 배치의 최종 상태 변경이어야 함. | 복원을 마지막에 실행; SC-1은 명세대로 `currentLevel`만 비교. |
| 형제 격차(메모 전용, 범위 외) | wide 계층(`DEFAULT_SCOPE`)에는 br109에서 moderate에 추가된 `tools/**`, `work/**`, `bug_reports/**`, `.bkit/**`도 없음 — 여기에 표시만 하고 수정하지 않음. | 운영자가 후속 보고서 파일 여부를 결정. |

## 비목표 (Non-Goals)

- 스코프 리미터의 어드바이저리-대-차단 동작 시맨틱 변경 없음(ENH-398 유지).
- `scripts/pre-write.js` 변경 없음.
- ZfeatA 레지스트리 정크 정리 없음(별도 추적).
- 시장/사용자 리서치 산출물 없음 — 요약 아래 N/A 노트 참조.
