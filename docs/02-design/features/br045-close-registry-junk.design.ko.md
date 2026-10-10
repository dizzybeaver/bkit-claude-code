# br045-close-registry-junk 설계 문서

> **요약**: 정확한 절차적 설계 — 리포트 종결 단계 + 증거 캡처가 동반된 두 번의 승인된 레지스트리 API 호출. 옵션 A (절차적, 코드 없음).
>
> **Project**: bkit-claude-code (v2.1.40) · **Date**: 2026-10-10 · **Status**: Draft
> **Planning Doc**: [plan](../../01-plan/features/br045-close-registry-junk.plan.ko.md)

---

## Context Anchor

| 키 | 값 |
|-----|-----|
| **WHY** | br045 열림-但-수정됨 + 8개 정크 레지스트리 행 — 상태가 모든 소비자에게 거짓말. |
| **WHO** | 유지보수자, PDCA 대시보드, 향후 세션의 primaryFeature 해석. |
| **RISK** | API 고아-가드 거부 → 차단 리포트, 절대 강제 금지. |
| **SUCCESS** | SC-1 카탈로그 종결; SC-2 레지스트리 readback 깨끗; SC-3 상태 뷰 + 훅 스모크 정상. |
| **SCOPE** | 리포트 종결 1건(절차) + API 호출 2건 + readback. lib/ 변경 없음. |

---

## 2. 아키텍처 — 옵션 A (절차적)

설계를 닻는 검증 사실:
- 두 API는 실제 내보내기: `lib/pdca/index.js:72` (deleteFeatureFromStatus), `:81` (cleanupOrphanActiveFeatures).
- `cleanupOrphanActiveFeatures()`는 `isValidFeatureName`에 실패하는 활성 행을 locked RMW(br030)로 제거하고, `junk_active_feature_cleaned` 이력 항목을 기록하며, 필요시 primaryFeature를 다시 선택.
- `deleteFeatureFromStatus(name)`은 BR-001 승인된 고아 경로를 존중: 활성 + 비-종단 + 디스크에 plan/design 문서 없음 → 삭제 가능.
- 종결 절차(bug_reports/instructions.md): 세션 내 재검증 → `## Resolution` 부기 → `completed/BR/*.completed.md`로 `mv` → INDEX 행 교체.

## 8. 테스트 계획 (MAIN 실행)

| 확인 | 방법 |
|------|------|
| SC-2 프로브 재실행 (종결 절차 1단계) | `checkPathScope('tests/x.js',2)` / `('README.md',2)` 허용; `('tests/x.js',0)` 거부; control-state currentLevel 여전히 4 |
| SC-1 | `ls bug_reports/active/br/` (br045 없음) + completed 파일 존재 + Resolution 존재 + INDEX 행 정확 |
| SC-2 | 레지스트리 readback: 8개 정크 이름 부재, `br045-scope-advisory-fixes` 등 정당한 행 무결, primaryFeature 실제 |
| SC-3 | `getPdcaStatusView()` 로드; 훅 스모크 오류 없음 |

## 11. 구현 가이드 (Do 에이전트를 위한 정확한 단계)

| # | 단계 | 세부 |
|---|------|------|
| 1 | 재검증 (부기용 증거) | 4개 SC-2 범위 프로브 + control-state currentLevel 읽기; 출력을 그대로 캡처 |
| 2 | br045 리포트에 `## Resolution` 부기 | 변경 사항(커밋 9c599e8, 10-스위트 상태-쓰기 샌드박스 + 허용 목록 수정), 1단계의 검증 증거 |
| 3 | 이동 | `mv bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md bug_reports/completed/BR/br045-scope-limiter-l0-poisoned-control-state.completed.md` |
| 4 | INDEX 교체 | `## Open`에서 br045 행 제거; `## Recently Closed` 앞에 추가: `- br045-scope-limiter-l0-poisoned-control-state.completed.md — allowlist tiers + 10-suite state-write sandboxing; L0 advisories gone (Medium; closed 2026-10-10, fix-br045-scope-advisory-fixes)` |
| 5 | 레지스트리 정리 A | `node -e "const r=require('./lib/pdca').cleanupOrphanActiveFeatures(); console.log(JSON.stringify(r))"` — removed = 5개 항목 예상(긴 fix-br060-065 변형 4개 + ZfeatA) |
| 6 | 레지스트리 정리 B | `node -e "for (const n of ['test-feature','test-feature-sync','test-module-chain']) console.log(n, JSON.stringify(require('./lib/pdca').deleteFeatureFromStatus(n)))"` — 호출당 success 예상; 거부 시 → 그대로 두고 차단 리포트 |
| 7 | Readback | activeFeatures + primaryFeature를 나열하는 레지스트리 JSON readback |

### 11.2 순서: 1→7 순차. 11.3 세션: module-1, 에이전트 1회 디스패치.

## 버전 이력

| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
|-----|------------|------|-------------|
