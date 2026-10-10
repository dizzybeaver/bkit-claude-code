# br045-close-registry-junk — 결함 수정 PRD

**버전:** 1.0 · **날짜:** 2026-10-10
**레인:** §45.9 버그 수정/자잘한 정리 작업 (최소 PRD) · **SoT:** `docs/00-pm/br045-close-registry-junk.prd.en.md` (본 파일은 번역본)

## 요약 (Executive Summary)

br045 사이클의 자잘한 정리 부채 2건, 모두 2026-10-10에 검증됨: (1) br045 버그 리포트는 수정·검증이
완료되었으나(commit 9c599e8) 문서화된 마감 절차를 거치지 않아 `bug_reports/active/br/`에 여전히 open
상태로 남아 있음; (2) `.bkit/state/pdca-status.json`의 `activeFeatures`에 정크 행 8개가 존재 — 기능명
검증에 실패하는 5개 항목과 2026년 6월의 테스트 픽스처 고아 3개. 두 부채 모두 정당한 경로로만 마감한다:
버그 리포트 마감 절차와 `lib/pdca`의 export된 레지스트리 API 2개. 레지스트리 수동 편집 금지, 신규 툴링
없음. 이 사이클은 BUILD ONLY — 모든 검증은 MAIN이 실행한다.

## 프로덕트 디스커버리 (Product Discovery)

**N/A** — §45.9 결함 수정/자잘한 정리 레인. 페르소나, 시장 규모, OST, 린 캔버스,
GTM은 리포트 마감 및 레지스트리 정리 작업에 적용되지 않는다.

## 배경 (Background)

- br045 (스코프 리미터 L0 오염된 컨트롤 상태)는 `fix-br045-scope-advisory-fixes`
  사이클에서 수정·검증됨: commit 9c599e8; SC-1 레벨 일관성 4→4 (전체 배터리);
  SC-2 프로브 4/4; SC-3 계약 검사 24단계 모두 통과; qa-aggregate 7179/0/0;
  플러그인 캐시 동기화 완료. 그러나 리포트 파일
  `bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md`는
  `bug_reports/instructions.md`의 마감 절차를 거치지 않아 open 상태로 남아 있음
  (`active/br/INDEX.md`의 Open 행).
- `.bkit/state/pdca-status.json`의 `activeFeatures`에 정크 행 8개 누적:
  - `fix-br060-065-audit-pdca` 긴 이름 변형 4개 — 프롬프트 전체 문자열이 기능명으로
    캡처됨; 실제 짧은 이름의 사이클은 정상 아카이브됨.
  - `ZfeatA` — 배터리 픽스처 정크.
  - `test-feature`, `test-feature-sync`, `test-module-chain` — 2026년 6월
    픽스처 잔재 (active + non-terminal + plan/design 문서 없음 = BR-001 정당한
    고아 경로).
- 레지스트리 쓰기는 export된 `lib/pdca` API로만 수행 (locked RMW, br030). JSON 수동 편집은 금지
  (G-020 유사). 두 API 모두 `lib/pdca`의 필수 export (`index.js` 재-export):
  `cleanupOrphanActiveFeatures()`와 `deleteFeatureFromStatus(name)`.

## 문제 정의 (Problem Statement)

1. **부채 1 — br045 리포트 수정됐으나 open 상태.** 수정은 배포·검증되었으나 리포트의 open 상태는
   현실과 다르다: open 리포트 INDEX와 디렉터리 배치가 미수정 결함을 주장하는 셈. 이를 위한 마감
   절차가 존재하는데도 생략됨.
2. **부채 2 — 정크 레지스트리 행 8개.** 정크 `activeFeatures` 항목들은 모든 PDCA 상태 뷰를 오염시키고,
   phase 리더를 혼란시킬 위험(primaryFeature, active 카운트)이 있으며, 진행 중인 작업을 왜곡한다.
   각 항목에는 검증된 정당한 제거 경로가 있으나 아무것도 실행되지 않았다.

## 범위 (Scope)

**포함 (IN):**
- `bug_reports/instructions.md` "Closing procedure"에 따라 br045 마감 (5단계, R1).
- `lib/pdca` `cleanupOrphanActiveFeatures()`로 `fix-br060-065-audit-pdca`
  긴 이름 변형 4개 + `ZfeatA` 제거 (R2).
- `lib/pdca` `deleteFeatureFromStatus(name)`로 `test-feature`,
  `test-feature-sync`, `test-module-chain` 제거 (R3).
- 정리 후 레지스트리 리드백: 8개 제거 확인, 정상 행 보존 확인 (R4).

**제외 (OUT):**
- 아카이브된 기능의 히스토리 행 (정상 데이터 — 유지).
- 신규 툴링 또는 신규 lib/pdca 함수.
- 아카이브 요약에 대한 `/pdca cleanup`.

## 요구사항 (Requirements)

- **R1 — br045 마감 절차.** 파일을 건드리기 전 br045 SC 프로브(SC-1 레벨
  일관성, SC-2 프로브, SC-3 계약 검사)의 세션 내 재검증을 포함한 전체 마감
  절차 실행: `## Resolution` 추가 첨부; `completed/BR/br045-...completed.md`로
  `mv`; `active/br/INDEX.md`에서 `## Open` 행 제거; `## Recently Closed` 맨 앞에
  `- br045-scope-limiter-l0-poisoned-control-state.completed.md — 한 줄 수정 요약 (Medium; closed 2026-10-10, fix-br045-scope-advisory-fixes)` 형식으로 추가.
- **R2 — 고아명 정리.** `cleanupOrphanActiveFeatures()`를 1회 호출; 결과
  (제거된 이름 + 개수)를 리포트에 기록. 예상: `fix-br060-065-audit-pdca`
  변형 4개 + `ZfeatA`.
- **R3 — 고아 기능 정리.** `test-feature`, `test-feature-sync`,
  `test-module-chain` 각각에 대해 `deleteFeatureFromStatus(name)` 호출;
  각 호출의 결과 기록. 고아 가드가 거부하면 해당 이름은 거부 사실을 보고하고
  중단 — 강제하지 않음.
- **R4 — 리드백.** R2+R3 이후 정당한 뷰를 통해 레지스트리를 읽어 정크명 8개가 모두 사라졌고 정상 행이 보존되었음을 확인.

## 성공 기준 (Success Criteria)

- **SC-1:** `bug_reports/active/br/`에 br045 파일 없음;
  `completed/BR/br045-*.completed.md`가 `## Resolution` 추가와 함께 존재;
  INDEX에서 br045는 `## Recently Closed`에만 존재.
- **SC-2:** 레지스트리 리드백 — 정크명 8개 부재; `br045-scope-advisory-fixes` 등
  정상 행 보존; `primaryFeature`가 실제 기능.
- **SC-3:** `pdca status` 뷰가 오류 없이 로드 + 훅 스모크 테스트 통과.

## 리스크 (Risks)

- **API 거부:** 어느 API의 고아 가드가 분류와 불일치하면(예: `test-*` 이름에
  문서가 생김) 호출이 거부된다. 거부 사실을 그대로 보고; 강제하지 않고
  JSON을 수동 편집하지 않음.

## 논골 (Non-Goals)

- `lib/pdca` 코드, 검증 규칙, 레지스트리 포맷 변경 없음.
- R1에 명시된 br045 SC 프로브 이상의 재검증 없음.
- 아카이브된 기능 요약 또는 docs/archive 내용 정리 없음.
- 정상 active 기능의 이름 변경/마이그레이션 없음.
