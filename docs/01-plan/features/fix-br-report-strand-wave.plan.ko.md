# fix-br-report-strand-wave 계획 문서

> **요약**: 증상이 같은 세 개의 미해결 버그 리포트(br003/br005/br006)를 해결합니다 — PDCA 사이클이 `report`에서 정체되고 아카이브 게이트(E-ARCH-GATE)에 막히는 문제 — 타임스탬프 병합, Stop 핸들러의 피처 바인딩, report→completed 전환 + 아카이브 게이트의 docs-on-disk 팔을 수정함으로써.
>
> **프로젝트**: bkit-claude-code
> **버전**: 2.1.38 (변경 금지)
> **작성자**: dizzybeaver 세션
> **날짜**: 2026-09-25
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **문제** | 세 개의 미해결 결함이 PDCA 사이클을 정체시킵니다: (br003) `updatePdcaStatus`가 `data.timestamps`를 조용히 버림; (br006) pdca-skill Stop 핸들러가 훅 입력에 피처명이 없을 때 잘못된 피처(`primaryFeature`)를 바인딩해 다른 피처의 phase를 전진시킴; (br005) report→completed 전환이 fork-mode 세션에 없는 Task 시스템에 의존하고, 아카이브 게이트의 docs-on-disk 구제 팔은 버그픽스 사이클이 만들지 않는 `analysis` 문서를 필수로 요구. |
| **해법** | 각 근본 원인 수정: status-core에서 `data.timestamps` 병합; `primaryFeature` 폴백 전에 활성 스킬파이어 마커(피처별 레지스트리 증거)로 피처 바인딩; Stop 핸들러에 Task 독립적인 report→completed 경로 제공; docs-on-disk 게이트 팔에서 `analysis`를 무조건 필수에서 제외. |
| **기능/UX 효과** | fork-mode 세션에서도 사이클이 완료·아카이브됨; 레지스트리 타임스탬프(archivedAt 등)가 정확히 기록됨; phase가 `primaryFeature`가 아닌 실제 파이어된 피처에 기록됨. |
| **핵심 가치** | PDCA 장부 시스템이 자기일관성을 가짐: Stop 핸들러가 관측한 모든 정당한 스킬 파이어가 올바른 레지스트리 전환으로 이어지고, 영구 E-ARCH-GATE 정체가 없어짐. |

---

## Context Anchor

| 키 | 값 |
|----|-----|
| **WHY** | 버그픽스 사이클(check/qa 생략)과 fork-mode 세션(Task 시스템 부재)은 현재 PDCA 라이프사이클을 완주할 수 없음 — 아카이브 게이트가 영원히 막음(E-ARCH-GATE). |
| **WHO** | CC v2.1.278+ fork-mode 세션(Task 도구 없음)에서 PDCA 사이클을 도는 bkit 소비자; `updatePdcaStatus`에 `timestamps`를 넘기는 모든 호출자. |
| **RISK** | Stop 핸들러 변경은 최고빈도 훅 경로를 건드림; 회귀 시 phase가 잘못 전진됨. 완화: 순수 헬퍼 추출 + 단위 테스트 + 실제 Stop 관측. |
| **SUCCESS** | br003/br005/br006가 실패-후-통과 테스트와 함께 수정; 전체 배터리 그린; 아카이브 CLI가 report-phase 피처를 docs-on-disk로 게이트 통과. |
| **SCOPE** | lib/pdca/status-core.js, scripts/pdca-skill-stop.js, scripts/pdca-archive.js + 테스트; bug_reports 갱신; CHANGELOG 항목. |

---

## 1. 개요

### 1.1 목적

`bug_reports/active/br/`의 미해결 버그 리포트 3건을 모두 종결하고, 작업 중 발견된 범위 외/기존 결함도 함께 처리(운영자 지시).

### 1.2 배경

- **br003** (Low): `lib/pdca/status-core.js`의 `updatePdcaStatus`는 `...data`를 스프레드하지만 그 뒤 `timestamps`를 기존 레코드 + `lastUpdated`만으로 재구축 — `data.timestamps`가 병합되지 않음. `lib/pdca/lifecycle.js`의 `archiveFeature`가 `timestamps: { archivedAt: now }`를 넘기지만 조용히 버려짐.
- **br006** (High): `scripts/pdca-skill-stop.js`가 `extractFeatureFromContext({ agentOutput, currentStatus })`를 호출. Stop 훅 입력 텍스트가 피처의 문서 경로를 언급하지 않으면 `featureFromDocPaths`가 ''를 반환하고 헬퍼는 `currentStatus.primaryFeature`로 폴백. 이질적 `primaryFeature`(예: tools-agents-blocks가 파이어된 상태에서 sima-kg-port)가 있으면 `updatePdcaStatus`가 잘못된 피처를 전진시킴. br006의 근본원인 필드는 플레이스홀더 — 이 사이클이 측정된 메커니즘(file:line)으로 채움.
- **br005** (High): report 페이즈 문서는 report→completed가 "`[Report] {feature}` Task가 completed로 표시될 때 TaskCompleted 훅을 통해" 전진한다고 기술. fork-mode CC v2.1.278+ 세션에는 Task 도구가 없어 아무것도 파이어되지 않음. 이 사이클에서 추가 근본원인 발견: 아카이브 CLI의 docs-on-disk 게이트 팔(`scripts/pdca-archive.js:131`)이 `REQUIRED_PHASES = ['plan','design','analysis','report']`를 요구 — 버그픽스 사이클은 Check를 건너뛰므로 `analysis`가 항상 없고 구제 팔은 절대 통과 불가.

### 1.3 관련 문서

- 버그 리포트: `bug_reports/active/br/br003-*.md`, `br005-*.md`, `br006-*.md`
- 인덱스: `bug_reports/active/br/INDEX.md`

---

## 2. 범위

### 2.1 범위 내

- [ ] FR-01 (br003): `updatePdcaStatus`에서 `data.timestamps`를 기존 timestamps 객체에 병합.
- [ ] FR-02 (br006): Stop 핸들러가 `primaryFeature` 폴백 전에 활성 피처별 스킬파이어 증거로 피처를 바인딩; br006의 플레이스홀더 필드를 측정된 메커니즘으로 채움.
- [ ] FR-03 (br005a): Stop 핸들러가 report-phase 스킬 파이어 관측 + 같은 바인딩된 피처의 report 문서가 디스크에 존재할 때 report→completed 전진 (Task 독립적 정당한 쓰기).
- [ ] FR-04 (br005b): 아카이브 CLI docs-on-disk 팔이 `analysis`를 무조건 요구하지 않음 — 버그픽스 사이클(plan+design+report 문서)도 아카이브 가능.
- [ ] FR-05: 세 버그 리포트를 `.completed` 상태로 갱신(`bug_reports/completed/BR/`로 이동), INDEX.md 갱신.
- [ ] FR-06: CHANGELOG.md에 `[Unreleased]` 항목 추가(버전 bump 없음).
- [ ] FR-07: 사이클 중 발견된 범위 외/기존 결함: br/rb 리포트 제출 + 이 사이클 내 수정 (root-cause-first 규칙).

### 2.2 범위 외

- 버전 bump (프로젝트 CLAUDE.md 기준 메인테이너 소관).
- Task 시스템 경로 재작성 (Task가 있는 곳에서는 주 전환 메커니즘으로 유지).
- 레지스트리 수동 편집 (G-020이 거부; 모든 쓰기는 정당한 lib API로).

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | `updatePdcaStatus`가 `data.timestamps`를 기존 timestamps에 병합 | High | Pending |
| FR-02 | Stop 핸들러가 primaryFeature 폴백 전에 파이어된 피처를 바인딩 | High | Pending |
| FR-03 | Task 독립적 report→completed 정당한 쓰기 | High | Pending |
| FR-04 | 아카이브 게이트 docs-on-disk 팔이 버그픽스 문서 세트 수용 | High | Pending |
| FR-05 | 버그 리포트 종결 + INDEX 갱신 | Medium | Pending |
| FR-06 | CHANGELOG 항목 (버전 bump 없음) | Medium | Pending |
| FR-07 | 범위 외 발견: 사이클 내 제출 + 수정 | Medium | Pending |

### 3.2 비기능 요구사항

| 카테고리 | 기준 | 측정 방법 |
|----------|------|-----------|
| 성능 | Stop 훅이 5초 예산 내 유지 | 기존 훅 비용 프로브 |
| 호환성 | 레지스트리 스키마 변경 없음; v3 상태 형식 유지 | 테스트 스위트 |
| 안전 | 모든 변경은 정당한 lib API로만 | 코드 리뷰 + G-020 |

---

## 4. 성공 기준

### 4.1 완료 정의

- [ ] 각 수정에 사전 코드에서 FAIL하고 사후 PASS하는 테스트 (true test)
- [ ] 전체 테스트 배터리 그린 (메인 에이전트 실행; testing-handoff 프로토콜)
- [ ] 세 버그 리포트 모두 9필드 내용을 채워 completed로 이동 (br006 플레이스홀더를 측정된 메커니즘으로 교체)
- [ ] 아카이브 CLI 드라이런이 시뮬레이션된 report-phase 버그픽스 피처를 docs-on-disk로 게이트 통과
- [ ] CHANGELOG를 [Unreleased] 아래 갱신; 버전 필드 무변경

### 4.2 품질 기준

- [ ] 수정된 모든 파일 린트 클린
- [ ] 새 bare except / 린트 억제 없음
- [ ] FR-02 수정의 변이 검사 (wrong-feature 바인딩이 RED여야 함)

---

## 5. 위험 및 완화

| 위험 | 영향 | 가능성 | 완화 |
|------|------|--------|------|
| Stop 핸들러 회귀가 phase를 잘못 전진 | High | Medium | 순수 헬퍼 추출 + 양방향 단위 테스트 + 변이 테스트 |
| report→completed 자동 전진이 허위로 발화 (문서는 있으나 report가 실제로 미완) | Medium | Low | Stop 입력의 report-phase 활성 스킬 마커 + 디스크상 문서 모두 요구 — 아카이브 CLI가 검사하는 것과 같은 조건 |
| analysis 문서 완화로 미완료 풀 사이클이 아카이브됨 | Medium | Low | 풀 사이클은 레지스트리에 check phase가 기록됨; 게이트는 completed 미만의 구제 팔로만 docs-on-disk 사용 |

---

## 6. 영향 분석

### 6.1 변경 자원

| 자원 | 유형 | 변경 내용 |
|------|------|-----------|
| `lib/pdca/status-core.js` (updatePdcaStatus) | lib API | timestamps 병합 |
| `scripts/pdca-skill-stop.js` | 훅 스크립트 | 피처 바인딩 + report→completed 자동 전진 |
| `scripts/pdca-archive.js` | CLI | docs-on-disk 팔의 REQUIRED_PHASES 처리 |

### 6.2 현재 소비자

| 자원 | 작업 | 코드 경로 | 영향 |
|------|------|-----------|------|
| updatePdcaStatus | WRITE | lib/pdca/lifecycle.js archiveFeature (timestamps) | 수정됨 (버려짐 → 병합) |
| updatePdcaStatus | WRITE | 모든 phase Stop 핸들러 | 없음 (병합은 가법적) |
| extractFeatureFromContext | READ | scripts/pdca-skill-stop.js, scripts/analysis-stop.js | 바인딩 순서 변경 — 기존 호출자 검증 |
| REQUIRED_PHASES | READ | scripts/pdca-archive.js discoverDocs/게이트 | 한 팔의 완화; completed/matchRate 팔 불변 |

### 6.3 검증

- [ ] 모든 소비자는 전체 배터리로 검증
- [ ] 수정 후 실제 Stop 관측 (실제 phase 파이어 1회)

---

## 7. 아키텍처 고려사항

### 7.1 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| report→completed 기록자 | TaskCompleted 훅만 / Stop 핸들러 절 / 아카이브 게이트 수용 | Stop 핸들러 절 (+ 게이트는 docs 팔 보유) | Stop 핸들러가 이미 전환을 기록; 같은 스킬마커 증거를 이미 읽음 |
| timestamps 병합 | 스프레드 순서 변경 / 명시적 병합 | 명시적 `{...existing, ...data.timestamps, lastUpdated}` | lastUpdated 신선도 보장 유지 |
| 피처 바인딩 | 입력만 / 레지스트리 마커 우선 | 문서경로 상호검증이 있는 레지스트리 마커 우선 | 마커는 피처별이며 조용히 폴백 불가 |

---

## 8. 컨벤션 전제조건

- [x] ESLint 설정 존재; 수정 파일 린트 통과 필요
- [x] 테스트 설정 존재 (test/unit, test/contract, tests/qa)
- [x] Conventional Commits; co-author 트레일러 없음

---

## 9. 다음 단계

1. [ ] 설계 문서 (`fix-br-report-strand-wave.design.md`)
2. [ ] testing-handoff 프로토콜로 구현 (빌드 에이전트 빌드, 메인 테스트)
3. [ ] 리포트 + 아카이브, 버그 리포트 종결, CHANGELOG, GitHub 동기화, 플러그인 업데이트

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-09-25 | 초기 초안 | dizzybeaver 세션 |
