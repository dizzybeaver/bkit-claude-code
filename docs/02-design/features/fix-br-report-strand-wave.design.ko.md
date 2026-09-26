# fix-br-report-strand-wave 설계 문서

> **요약**: 세 개의 미해결 버그 리포트(br003/br005/br006)를 수정하여 PDCA 사이클이 정체되지 않도록 합니다: data.timestamps 병합, Stop 핸들러에서 primaryFeature 폴백 전 파이어된 피처 바인딩, Task 독립적 report→completed 전환 추가, 아카이브 게이트의 docs-on-disk 팔이 버그픽스 문서 세트를 수용하도록 변경.
>
> **프로젝트**: bkit-claude-code
> **버전**: 2.1.38 (변경 금지)
> **작성자**: dizzybeaver 세션
> **날짜**: 2026-09-25
> **상태**: Draft
> **계획 문서**: [fix-br-report-strand-wave.plan.ko.md](../01-plan/features/fix-br-report-strand-wave.plan.ko.md)

---

## Context Anchor

| 키 | 값 |
|----|-----|
| **WHY** | 버그픽스 사이클(check/qa 생략)과 fork-mode 세션(Task 시스템 부재)은 PDCA 라이프사이클을 완주할 수 없음 — 아카이브 게이트가 영원히 막음(E-ARCH-GATE). |
| **WHO** | CC v2.1.278+ fork-mode 세션에서 PDCA 사이클을 도는 bkit 소비자; updatePdcaStatus에 timestamps를 넘기는 모든 호출자. |
| **RISK** | Stop 핸들러 변경은 최고빈도 훅 경로를 건드림; 회귀 시 phase가 잘못 전진. 완화: 순수 헬퍼 + 양방향 단위 테스트 + 변이 테스트. |
| **SUCCESS** | br003/br005/br006가 실패-후-통과 테스트로 수정; 전체 배터리 그린; 아카이브 CLI가 report-phase 버그픽스 피처를 docs-on-disk로 게이트 통과. |
| **SCOPE** | lib/pdca/status-core.js, scripts/pdca-skill-stop.js, scripts/pdca-archive.js + 테스트; bug_reports 종결; CHANGELOG 항목. |

---

## 1. 개요

### 1.1 설계 목표

- 모든 Stop 핸들러 레지스트리 쓰기는 실제 파이어된 피처에 기록.
- 정당한 전환이 CC Task 시스템 존재에 의존하지 않음.
- updatePdcaStatus의 조용한 데이터 손실 없음 (timestamps 병합).
- 아카이브 게이트의 구제 팔이 실제 버그픽스 사이클 형태(plan+design+report 문서)를 반영.

### 1.2 설계 원칙

- 각 결함 지점에 최소 정확 변경 — 동작 경로 리팩터 금지.
- Fail closed: 새 게이트는 긍정적 증거(스킬 마커 AND 디스크상 문서) 요구.
- 새 로직은 순수 함수로 — 훅 하니스 없이 테스트 가능.

---

## 2. 아키텍처 옵션

| 기준 | 옵션 A: 최소 | 옵션 B: 클린 | 옵션 C: 실용적 (선택) |
|------|:-:|:-:|:-:|
| **접근** | 3곳 한 줄 패치 | 바인딩+전환 모듈 추출 | 현장 수정 + 소비자 근처 소규모 순수 헬퍼 |
| **신규 파일** | 0 | 2-3 | 1 |
| **수정 파일** | 3 | 5+ | 3-4 |
| **복잡도** | Low | High | Medium |
| **유지보수성** | Medium | High | High |
| **노력** | Low | High | Medium |
| **위험** | Low | Medium (핫패스 대형 diff) | Low |

**선택**: 옵션 C — 바인딩 로직과 report→completed 절은 테스트 핵심이므로 새 파일(`lib/pdca/stop-binding.js`)의 순수 헬퍼로; 3개 결함 지점은 이들을 호출하는 최소 편집.

---

## 3. 상세 설계

### 3.1 FR-01 — br003: timestamps 병합 (lib/pdca/status-core.js)

현재(~260행): `timestamps` 재구축이 `...status.features[feature].timestamps` + `lastUpdated`만 포함.

변경:

```js
timestamps: {
  ...status.features[feature].timestamps,
  ...(data.timestamps || {}),
  lastUpdated: new Date().toISOString(),
},
```

`lastUpdated`는 마지막에 유지해 신선도 보장. `data.timestamps` 호출자(lifecycle.archiveFeature)의 archivedAt이 이제 기록됨.

### 3.2 FR-02 — br006: 피처 바인딩 (scripts/pdca-skill-stop.js + 신규 lib/pdca/stop-binding.js)

새 순수 헬퍼 `resolveStopFeature({ inputText, currentStatus, activeSkill })`:

1. 입력 텍스트가 문서경로 템플릿으로 피처를 지칭(기존 `featureFromDocPaths`) → 사용 (기존 동작).
2. 아니면, 레지스트리에서 이 Stop의 action과 일치하는 phase의 최신 히스토리 항목을 가진 피처가 정확히 하나 → 그 피처 바인딩. 피처별 증거: 오바인드는 폴백이 `primaryFeature`로 곧장 건너뛰었기 때문.
3. 아니면 → `primaryFeature` (기존 폴백, 최후 수단).

`pdca-skill-stop.js`는 단일 바인딩 지점(~82행)에서 이 헬퍼 호출. 전달되는 action은 phase가 아닌 스킬 호출 텍스트에서 해결된 action — 마커가 기록된 방식과 일치.

### 3.3 FR-03 — br005a: report→completed 정당한 쓰기 (scripts/pdca-skill-stop.js)

기존 phase 기록 로직 뒤 절 추가: `action === 'report'` AND 바인딩된 피처의 report 문서가 디스크에 존재(아카이브 CLI와 같은 `findDoc('report', feature)` 검사) → `updatePdcaStatus(feature, 'completed', {}, { requireDocs: false })` 호출. 정당한 쓰기 경로 재사용; 레지스트리 수동 편집 없음. Task 경로는 Task가 있는 곳에서 그대로 (같은 phase를 쓰는 중복 no-op).

가드: 피처 현재 phase가 `report`일 때만 전진 (이전 phase에서 건너뛰기 금지).

### 3.4 FR-04 — br005b: 아카이브 게이트 docs 팔 (scripts/pdca-archive.js)

가장 단순한 올바른 형태: `REQUIRED_PHASES`를 `['plan', 'design', 'report']`로 변경하고 `analysis`를 OPTIONAL_PHASES로 이동 — 풀 사이클도 아카이브 가능(analysis 문서는 존재 시 함께 아카이브), 버그픽스 사이클은 게이트 통과.

### 3.5 테스트 설계 (true tests)

- `test/unit/pdca-status-timestamps-merge.test.js` (br003): `timestamps: { archivedAt }`로 updatePdcaStatus 호출; 레지스트리 timestamps.archivedAt 생존 단언. 현재 코드에서 RED, 수정 후 GREEN.
- `test/unit/stop-binding.test.js` (br006): 두 피처 레지스트리(A=primaryFeature, phase do; B=파이어됨, phase report). Stop 입력이 문서경로 없음. 헬퍼가 A가 아닌 B 반환 단언. 변이 검사: 바인딩 순서 되돌림 → RED.
- `test/unit/stop-report-completion.test.js` (br005a): phase=report + 디스크에 report 문서; 완료 절 실행; updatePdcaStatus로 phase=completed 기록 단언. 문서 부재 시 전진 없음도 단언.
- `test/contract/pdca-archive-bugfix-gate.test.js` (br005b): phase=report, plan/design/report 문서 존재, analysis 없는 임시 레지스트리. 드라이런 아카이브 → `gate: 'docs-on-disk'`로 통과. 현재 코드에서 RED.

### 3.6 버그 리포트 종결 (FR-05)

- br006 플레이스홀더를 측정된 메커니즘으로 채움 (근본원인: scripts/pdca-skill-stop.js:82 → extractFeatureFromContext → status-core.js:438 primaryFeature 폴백).
- 세 파일 모두 `bug_reports/completed/BR/<name>.completed.md`로 이동; INDEX.md 갱신.

### 3.7 CHANGELOG (FR-06)

`## [Unreleased]` 아래 `### Fixed` 항목 — br당 한 줄 — 버전 변경 없음.

---

## 4. 오류 처리

- `resolveStopFeature`는 증거가 없으면 '' 반환 (절대 throw 없음) — 다운스트림은 기존 동작 유지.
- report→completed 절은 Stop 핸들러의 기존 try/catch 패턴 사용 (훅이 세션을 죽이면 안 됨).
- 아카이브 CLI 게이트 변경도 fail-closed 유지: report 미만 phase는 절대 통과 불가.

---

## 5. 테스트 계획 요약

| 레벨 | 내용 | 위치 |
|------|------|------|
| L1 단위 | timestamps 병합, stop 바인딩, report 완료 절 | test/unit/*.test.js |
| L1 컨트랙트 | 아카이브 게이트 버그픽스 형태 | test/contract/*.test.js |
| 변이 | 바인딩 순서 되돌림 → RED | 리포트에 기록 |
| 라이브 | report 파이어 후 실제 Stop 1회 → 레지스트리 전환 관측 | 메인 세션, Do 이후 |

---

## 6. 구현 가이드

### 6.1 모듈 맵

| 모듈 | 항목 |
|------|------|
| module-1: status-core timestamps | 3.1 + 테스트 3.5a |
| module-2: stop 바인딩 + report 완료 | 3.2, 3.3 + 테스트 3.5b, 3.5c |
| module-3: 아카이브 게이트 | 3.4 + 테스트 3.5d |
| module-4: 종결 | 3.6, 3.7 (버그 리포트, INDEX, CHANGELOG) |

### 6.2 세션 가이드

단일 세션이 4개 모듈 모두 커버 (소규모, 같은 서브시스템). 순서: module-1 → module-3 → module-2 → module-4 (저위험 우선, 바인딩은 핫패스라 마지막).

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-09-25 | 초기 초안 | dizzybeaver 세션 |
