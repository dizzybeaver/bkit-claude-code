# br046-carry-zero 계획 문서

> **요약**: 두 캐리 항목을 모두 종결 — G-019 읽기-전용 거짓 양성 면제(br046)와 ~35개 문서-증거 역사 기능의 스크립트 아카이빙 — 캐리오버 제로 달성.
>
> **Project**: bkit-claude-code (v2.1.40) · **Author**: dizzybeaver (메인 세션) · **Date**: 2026-10-10 · **Status**: 초안
> **Lane**: §45.9 버그수정 사이클 · **Directive**: 30분 운영자 루프(작업 b82a8598) — 메모로 남는 발견 없음

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | G-019가 브로커-상태 경로를 언급하는 읽기-전용 명령을 거부(오늘 2건 실측 거짓 양성); ~35개 역사 기능의 단계 문서가 미아카이브 상태로 남아 모든 상태 뷰에서 유령 활성 기능으로 구체화됨. |
| **Solution** | detect()에서 docTargetExempt 옆에 구조화된 읽기-용도 면제(cp/mv 소스-위치 + 인터프리터 읽기-호출 맥락, 쓰기-마커 존재 시 거부); 문서 세트의 스크립트 dry-run→apply 아카이빙(docs/archive/YYYY-MM/로). |
| **Function/UX Effect** | 백업과 API readback이 차단 없이 작동; 상태 뷰가 실제 레지스트리 기능만 나열. |
| **Core Value** | 캐리오버 제로: 두 "나중을 위한 메모" 항목이 수정-및-검증됨. |

---

## Context Anchor

| 키 | 값 |
|-----|-----|
| **WHY** | 운영자 지시: 모든 것 해결, 캐리 항목 없음; br045 사이클이 정확히 2개를 남김. |
| **WHO** | 유지보수자, 디스패치된 에이전트(G-019가 가장 크게 타격), 대시보드. |
| **RISK** | 면제 과잉-폭이 CRITICAL 가드 약화 — 필수 레드-팀 벡터로 게이트; 문서 이동이 카운트 계약 파괴 — 배터리 9/21단계로 게이트. |
| **SUCCESS** | SC-1 허용/거부 행렬 + REDTEST 녹색; SC-2 features 디렉터리 비음 + 유령 0; SC-3 24단계 배터리 녹색. |
| **SCOPE** | lib 파일 1개 + 면제 벡터 스위트; 아카이빙 스크립트 실행 1회(~170 파일); G-019 정규식 의미 변경 없음. |

---

## 2. 범위

### 2.1 범위 내
- [ ] R1: detect()의 `stateReadExempt`(destructive-detector.js) — cp/mv 토큰-소스 위치 검사; 인터프리터 읽기-호출 맥락 검사; 쓰기-마커 존재 시 거부; G-019 전용
- [ ] R2: 면제 회귀 벡터(허용: cp-소스, node 읽기-문자열; 거부: cp-대상, writeFileSync 페이로드, sort -o, 리다이렉트, 글로브) + 기존 REDTEST 스위트 녹색 유지
- [ ] R3: 아카이빙 스크립트(tools/ 또는 scripts/) — 목록 → 레지스트리-활성 기능 제외 → dry-run 계획 → apply(docs/archive/YYYY-MM/로 mtime 시대별 mv, 이중언어 형제 함께, _INDEX.md 갱신)
- [ ] R4: 사후-상태 readback(features 디렉터리 비음; 뷰 유령 0)

### 2.2 범위 외
- 면제를 넘어선 G-019 패턴 의미; G-020; 아카이브-이력 편집; 뷰 구체화 로직 자체

---

## 3. 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | stateReadExempt: (a) 명령 토큰화; cp/mv에서 모든 브로커-토큰 발생이 마지막 경로 인자 엄격 이전 AND 명령 전체에 `>>`/`tee`/`-o`/`of=` 형태 없음 → 면제; (b) node/python3/perl: 토큰이 인용 세그먼트 내에서만 발생하고 그 앞 60자 내 읽기-호출 마커(`readFileSync\|readFile\|createReadStream\|statSync\|accessSync`) 존재 AND 명령 전체에 쓰기-호출 마커 0개 → 면제; 면제는 규칙 G-019에만 적용(G-020 제외) | High | Pending |
| FR-02 | 벡터 스위트(신규 또는 확장): 2개 FP 형태 허용; ≥5개 거부 형태 여전히 거부(원본 PDCA_GUARD_REDTEST 벡터 전부 포함) | High | Pending |
| FR-03 | 필수 dry-run 기본 + 백업 아카이빙 스크립트; 안전 제외 = 레지스트리에 비-아카이브로 존재하는 기능; 시대는 plan 문서 mtime | High | Pending |
| FR-04 | 터치한 모든 JS에 node --check; 직접 레지스트리 쓰기 없음; 커밋 없음(MAIN 소유) | High | Pending |

---

## 4. 성공 기준

- [ ] SC-1: `cp .bkit/state/pdca-status.json /tmp/x` 허용; `cp /tmp/x .bkit/state/pdca-status.json` 거부; `node -e "…writeFileSync('.bkit/state/pdca-status.json'…)"` 거부; 벡터 스위트 + REDTEST 녹색
- [ ] SC-2: `ls docs/{01-plan,02-design,03-analysis,04-report}/features/` 비음(또는 레지스트리-제외 활성만 — 없을 것으로 예상); 뷰 활성 = 레지스트리-추적 + 이 사이클만
- [ ] SC-3: 24단계 contract-check 배터리 녹색(docs-code-sync 단계가 카운트 계약이 이동을 견딤을 증명)
- [ ] Report + archive 완료; br046 카탈로그 절차에 따라 종결

---

## 5. 리스크

| 리스크 | 영향 | 가능성 | 완화 |
|--------|------|--------|------|
| 면제 과잉-폭 | High | Medium | FR-02 거부 벡터 게이트; diff 레드-팀 검토 |
| 문서 이동이 docs-code-sync / component-inventory 카운트 파괴 | Medium | Medium | 배터리 9/21/3단계가 포착; 같은 사이클에서 카운트 수정 |
| 이동된 문서가 라이브 문서의 위키-링크 파괴 | Low | Medium | 배터리 + features/ 디렉터리로의 링크 grep |

---

## 7. 아키텍처 — 옵션 A + 스크립트 배치(automate-repetitive-work에 따라)

## 9. 다음 단계
1. [x] PRD 2. [ ] 설계 3. [ ] Do(범위 지정 에이전트, 10분 기한) 4. [ ] MAIN SC-1..3 5. [ ] Report + archive + br046 종결

---

## 버전 이력

| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
|-----|------------|------|-------------|
