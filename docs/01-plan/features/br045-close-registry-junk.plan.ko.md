# br045-close-registry-junk 계획 문서

> **요약**: 수정 완료되었지만 열려 있는 br045 리포트를 카탈로그 절차에 따라 닫고, PDCA 레지스트리에서 검증된 8개 정크 행을 제거 — 모두 승인된 경유로만.
>
> **Project**: bkit-claude-code (v2.1.40) · **Author**: dizzybeaver (메인 세션) · **Date**: 2026-10-10 · **Status**: 초안
> **Lane**: §45.9 버그수정/정리 사이클

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | br045는 수정+검증 완료였지만 `active/br/`에 열려 있음; PDCA 레지스트리에 8개 정크 activeFeatures 행(픽스처 잔해 + 프롬프트-문자열 오염)이 대시보드와 primary-feature 선택을 오염시킴. |
| **Solution** | br045에 대해 문서화된 종결 절차 실행(재검증 → Resolution 부기 → completed/BR 이동 → INDEX 교체), 그리고 8개 행을 두 개의 내보낸 라이프사이클 API로 제거(이름-무효 5개는 cleanupOrphanActiveFeatures, 문서-없는 고아 3개는 deleteFeatureFromStatus). |
| **Function/UX Effect** | 버그 카탈로그가 진짜 열린 집합(열린 BR 0개)을 보여줌; 세션 대시보드가 ZfeatA/정크를 primary feature로 표시하는 것을 중단. |
| **Core Value** | 레지스트리와 카탈로그가 감사-진실성을 회복; 모든 변경이 기록을 남기는 승인된 경로에서만 발생. |

---

## Context Anchor

| 키 | 값 |
|-----|-----|
| **WHY** | br045 열림-但-수정됨 + 8개 정크 레지스트리 행 — 상태가 모든 소비자에게 거짓말. |
| **WHO** | 유지보수자, PDCA 대시보드, 향후 세션의 primaryFeature 해석. |
| **RISK** | API 고아-가드 거부(가드가 우리의 고아 판단과 불일치) → 차단 리포트, 절대 강제 금지. |
| **SUCCESS** | SC-1 카탈로그 올바르게 종결; SC-2 레지스트리 readback 깨끗함(8개 사라짐, 정당한 행 무결); SC-3 상태 뷰 + 훅 스모크 정상. |
| **SCOPE** | 리포트 종결 1건(절차) + API 호출 2건 + readback. lib/ 변경 없음, 신규 도구 없음. |

---

## 2. 범위

### 2.1 범위 내
- [ ] R1: bug_reports/instructions.md 절차에 따른 br045 종결(세션 내 재검증, `## Resolution` 부기, `completed/BR/br045-*.completed.md` 이동, INDEX 행 교체)
- [ ] R2: `cleanupOrphanActiveFeatures()` — 이름-무효 5개 행 제거(`fix-br060-065` 프롬프트-문자열 변형 4개 + `ZfeatA`)
- [ ] R3: `deleteFeatureFromStatus(name)` × 3 — `test-feature`, `test-feature-sync`, `test-module-chain`(BR-001 승인된 고아 경로)
- [ ] R4: 정리 후 레지스트리 readback(정크 사라짐, `br045-scope-advisory-fixes` 등 정당한 행 무결, primaryFeature가 실제 기능으로 해석)

### 2.2 범위 외
- 아카이브된 기능 이력 행(정당한 요약; `/pdca cleanup`은 별도 운영자 결정)
- 모든 lib/pdca 코드 변경; 신규 도구; bug_reports 재번호화

---

## 3. 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | instructions.md에 기재된 대로 정확한 종결 절차 1-4단계(부기에 실제 재검증 출력 포함 — SC-2 프로브 재실행) | High | Pending |
| FR-02 | API 전용 레지스트리 쓰기(cleanupOrphanActiveFeatures, deleteFeatureFromStatus); 각 호출의 반환값을 증거로 캡처 | High | Pending |
| FR-03 | API가 항목을 거부하면 그대로 두고 차단 리포트(강제 금지, 수동 편집 금지) | High | Pending |

---

## 4. 성공 기준

- [ ] SC-1: `bug_reports/active/br/`에 br045 파일 없음; `completed/BR/br045-scope-limiter-l0-poisoned-control-state.completed.md`가 실제 재검증 출력을 담은 `## Resolution` 섹션과 함께 존재; INDEX 갱신(Open 행 제거, Recently Closed 행 앞에 추가)
- [ ] SC-2: 레지스트리 readback — 8개 정크 이름 없음; 정당한 기능 무결; primaryFeature가 실제 기능(또는 활성 정크 없이 null)
- [ ] SC-3: pdca 상태 뷰가 깨끗하게 로드 + 하나의 훅 스모크 통과

---

## 5. 리스크

| 리스크 | 영향 | 가능성 | 완화 |
|--------|------|--------|------|
| 고아 가드가 test-feature* 거부(문서 검사 불일치) | Medium | Low | 차단 리포트; 항목 유지; 운영자에게 보고 |
| 배터리 픽스처가 나중에 정크 행 재생성 | Medium | Medium | 별개 근본(control-state 픽스터 샌드박스 클래스는 이미 수정; ZfeatA를 만드는 픽스처는 레지스트리 작성자 — 재발 시 1줄 carry 메모) |

---

## 7. 아키텍처 — 옵션 A (절차적; 코드 없음)

## 9. 다음 단계
1. [x] PRD 2. [ ] 설계 3. [ ] Do(범위 지정 에이전트) 4. [ ] MAIN이 SC-1..3 검증 5. [ ] Report + archive

---

## 버전 이력

| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
|-----|------------|------|-------------|
