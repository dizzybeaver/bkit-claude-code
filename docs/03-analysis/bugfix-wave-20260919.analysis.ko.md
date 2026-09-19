# bugfix-wave-20260919 갭 분석 (Check 단계)

**피처:** bugfix-wave-20260919 · **날짜:** 2026-09-19 · **단계:** check · **전체 매치율: 94%**

## Context Anchor

| 키 | 값 |
|----|-----|
| WHY | 게이트/훅 결함이 정당한 작업을 차단 — 집행 레이어가 자기 사용자를 실패시킴. |
| WHO | 에이전트 오케스트레이션 PDCA 사이클을 돌리는 bkit 사용자, 집행 레이어 자체. |
| RISK | 탐지기 변경이 실제 보호 약화, 게이트 완화가 불완전 사이클 통과. |
| SUCCESS | 6건 모두 회귀 테스트로 검증, CHANGELOG 기록, 설치 플러그인 동기화. |
| SCOPE | 6개 수정: G-001/G-013 targetFields, 아카이브 쓰기 순서, 고아 행 정리, matchRate 기록 + 게이트 완화, 피처 해석, StopFailure 파싱. |

## 축별 점수

| 축 | 점수 | 근거 |
|----|------|------|
| 구조적 | 98% | 6개 설계 수정 모두 지정 앵커에 실제 변경으로 매핑 (targetFields 43/259행, requireDocs:false 155행, 고아 경로 43-68행, parseMatchRate/extractFeatureFromText/isKnownFeature, 3-절 게이트, parseFailurePayload) |
| 기능 깊이 | 92% | 설계에 부합하는 실제 로직. 감점: 문자열 형식 Write 잔여 오탐 경로 미테스트, 미지정 동작(게이트 상한, archivedAt 병합) |
| 계약 | 95% | 5개 신규 스위트가 모든 설계 동작 단정, 48 신규 TC, 전체 배터리 1980/1980 |
| **종합 (0.2S+0.4F+0.4C)** | **94%** | 90% 게이트 초과 — QA 진행 |

## 구조 상세

| 수정 | 위치 | 판정 |
|------|------|------|
| 1 G-001/G-013 targetFields | lib/control/destructive-detector.js:43,259 | ✅ |
| 2 requireDocs:false | lib/pdca/lifecycle.js:155 | ✅ |
| 3 고아 정리 | lib/pdca/status-cleanup.js:43-68 | ✅ |
| 4 파서 + 가드 | scripts/gap-detector-stop.js:74,150-163 | ✅ |
| 4 아카이브 게이트 | scripts/pdca-archive.js:125,139 | ✅ (편차: +phase<archived 상한 — 설계보다 엄격, 안전) |
| 5 StopFailure 페이로드 | scripts/stop-failure-handler.js:170-179 | ✅ |

## 편차

| # | 심각도 | 항목 | 평가 |
|---|--------|------|------|
| 1 | Minor | 게이트에 `phase < archived` 상한 추가(설계에 없음) | 더 엄격, fail-closed 강화 — 수용 |
| 2 | Minor | classifyError에 'exit_code' 신규 카테고리(설계에 없음) | 'Exit code 2'를 non-unknown으로 만들기 위해 필요, 테스트됨 — 수용 |
| 3 | Minor | 문자열 형식 Write 입력은 여전히 전체-입력 매칭(잔여 오탐 경로) | 설계 테스트 범위 밖. 후속 RB 후보로 추적 |
| 4 | Minor | 수정-1 테스트가 독립 파일(추가가 아님) | 동등 커버리지, 형제 패턴 부합 — 수용 |
| 5 | Minor | updatePdcaStatus 병합이 archivedAt 유실(기존 결함) | br003으로 파일됨. 이번 웨이브 범위 밖 |

## 계획 성공 기준 (코드 측)

- FR-09 수정별 회귀 테스트: ✅ (수정 클러스터당 1개, 5개 스위트)
- 린트: Do 중 post-edit 품질 훅 실행됨. 본 정적 분석에서 재검증 안 함(명시적으로 기록)

## 결정

matchRate 94% ≥ 90% 게이트 → QA 단계 진행. 반복 불필요. 잔여 minor 항목 추적됨(편차 3 → 후속 RB 후보, 편차 5 → br003).
