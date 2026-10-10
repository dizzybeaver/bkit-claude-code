# qa-aggregate-red-fixes 계획 문서

> **요약**: qa-aggregate의 6개 실패 어설션(5개 근본 원인)을 수정하여 fix/patches_102026 브랜치가 contract-check CI 게이트를 통과하도록 함.
>
> **프로젝트**: bkit-claude-code (bkit Vibecoding Kit v2.1.40)
> **버전**: 2.1.40
> **작성자**: dizzybeaver (메인 세션)
> **날짜**: 2026-10-10
> **상태**: 초안
> **레인**: §45.9 버그수정 사이클 (pm → plan → design → do → report → archive; gap/iterate/qa 생략 — Do 단계 자체 증거가 검증)

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | CI 사전 실행(2026-10-10)에서 qa-aggregate 레드: 8개 파일에 걸쳐 6개 어설션 실패 (7158 PASS / 6 FAIL / 7166 TC). 브랜치를 병합할 수 없음. |
| **Solution** | 근본 원인이 확인된 5개의 표적 수정: 누락된 `@version` 태그 2개 추가, 회귀 테스트 1개를 분할 후 구현 파일로 재지정, 오래된 문서 모듈 수 1개 갱신, 오래된 MCP 읽기 도구 기대치 1개 갱신, 의도적 br105 동작에 맞게 오래된 어설션 1개 반전. |
| **Function/UX Effect** | contract-check CI가 완전히 녹색(24/24 단계)으로 복귀; 런타임 동작 변화 없음 — 5개 중 4개는 테스트/문서 측 수정만. |
| **Core Value** | 집계 게이트가 실제 회귀에만 실패하도록 의미를 회복함 — 출하된 코드와 오래된 테스트/문서 기대치 사이의 드리프트가 아님. |

---

## Context Anchor

> Executive Summary에서 자동 생성. Design/Do 문서로 전파되어 컨텍스트 연속성 유지.

| 키 | 값 |
|-----|-----|
| **WHY** | qa-aggregate 게이트가 fix/patches_102026에서 레드 상태(6 어설션 / 5 근본 원인)이며 CI 병합을 차단함. |
| **WHO** | 유지보수자(dizzybeaver) + CI contract-check 파이프라인. |
| **RISK** | 기대치 갱신이 실제 회귀를 덮어버릴 수 있음 — 모든 반전은 검증된 현재-현실 증거를 인용해야 함 (어느 쪽이 잘못됐는지). |
| **SUCCESS** | SC-1 `node test/contract/scripts/qa-aggregate.js` 종료 코드 0, 0 FAIL. SC-2 24단계 contract-check 사전 실행 전체 녹색. |
| **SCOPE** | 5개 수정 / 6개 파일: lib 헤더 2개, 테스트 파일 3개, 문서 수 1개. 런타임 로직 변경 없음. |

---

## 1. 개요

### 1.1 목적

브랜치 자체 커밋(br050 `_io` 분할, MCP 도구 증가, lib 증가, br105 강제 변경)이 도입한 6개 실패 어설션을 수정하여 `fix/patches_102026`의 qa-aggregate 계약 게이트를 녹색으로 복원.

### 1.2 배경

2026-10-10 contract-check 사전 실행(CI와 동일한 명령/순서로 24개 워크플로 단계 전체 로컬 실행)이 23/24 통과. 18단계(`qa-aggregate.js`) 실패: 6 어설션, 8 파일, 7166 TC. 5개 근본 원인 모두 이 브랜치의 커밋 또는 테스트가 갱신되지 않은 이전의 의도적 결정에서 비롯됨.

### 1.3 관련 문서

- 요구사항: [qa-aggregate-red-fixes PRD](../../00-pm/qa-aggregate-red-fixes.prd.ko.md)
- 증거: 로컬 사전 실행 로그(`/tmp/ccrun-17.log` 요약: 7158/6/7166)

---

## 2. 범위

### 2.1 범위 내

- [ ] R1: `lib/core/io.js`와 `lib/core/_io/shared.js`에 `@version` JSDoc 태그 추가
- [ ] R2: `test/regression/enh-433-hook-output-visibility.test.js`를 `lib/core/_io/output.js`로 재지정
- [ ] R3: `AI-NATIVE-DEVELOPMENT.md`의 lib 모듈 수 갱신 (203 → 실제)
- [ ] R4: 도구 목록 열거 후 `test/contract/mcp-port.test.js`의 MCP 읽기 도구 기대치 갱신 (13 → 검증된 실제 값)
- [ ] R5: `tests/qa/v2114-defense-memory-enforcer.test.js`의 EN-06을 br105 동작(content 필드는 강제 haystack에서 제외)을 단언하도록 반전

### 2.2 범위 외

- 6개 실패 집합에 없는 다른 레드/오래된 어설션 (수정 중 발견 시 → verification-scope 규칙에 따라 bug_reports)
- `lib/defense/memory-enforcer.js`의 런타임 로직 변경 (코드는 br105에 따라 의도적으로 올바름)
- ZfeatA / test-feature 레지스트리 정크 정리 (별개 관심사, 기록됨)

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | `lib/core/io.js`, `lib/core/_io/shared.js`의 JSDoc 헤더에 `* @version 2.1.40` 추가 (패턴: `lib/core/_io/output.js:7`) | High | Pending |
| FR-02 | `enh-433` 테스트가 재내보내기 래퍼 `lib/core/io.js` 대신 `lib/core/_io/output.js`(`STDOUT_REACHES_MODEL`이 70번 줄에 존재)를 읽도록 수정 | High | Pending |
| FR-03 | `AI-NATIVE-DEVELOPMENT.md`의 lib 모듈 수가 실제 저장소 수와 일치 (CI-INV 검사 자체 카운터로 검증: 207) | High | Pending |
| FR-04 | `mcp-port.test.js`의 읽기 도구 수가 열거된 MCP 도구 목록과 일치 (실제 16; 주석에 읽기 도구 명시) | High | Pending |
| FR-05 | EN-06이 `content` 필드에만 존재하는 지시문 텍스트에 대해 `allowed === true`를 단언하고 br105를 인용하는 주석 추가; 동일 텍스트가 `command`/`args`에 있으면 여전히 거부하는 반려 어설션(EN-07이 이미 커버) | High | Pending |

### 3.2 비기능 요구사항

| 범주 | 기준 | 측정 방법 |
|------|------|-----------|
| 정확성 | 런타임 동작 변화 없음 (FR-01/02/03/04/05는 헤더/테스트/문서만) | git diff 범위 검토 |
| 진짜 테스트 | 반전된 각 기대치는 편의가 아닌 검증된 현재 현실을 인용 | 검토자 + 재실행 |
| 프로세스 | 테스트 핸드오프: 수정 에이전트는 빌드만; MAIN이 모든 테스트 실행 | 프로토콜 준수 |

---

## 4. 성공 기준

### 4.1 완료 정의

- [ ] FR-01..FR-05 전체 구현
- [ ] SC-1: `node test/contract/scripts/qa-aggregate.js` 종료 코드 0, 0 FAIL (MAIN 실행)
- [ ] SC-2: 24단계 contract-check 사전 실행 전체 녹색 (MAIN 실행)
- [ ] Report + archive 단계 완료

### 4.2 품질 기준

- [ ] 수정 파일에 린트 오류 없음
- [ ] 이중언어 문서 규칙 준수 (plan/design/report를 .en.md/.ko.md 쌍으로)

---

## 5. 리스크 및 완화

| 리스크 | 영향 | 가능성 | 완화 |
|--------|------|--------|------|
| 기대치 반전이 실제 회귀를 덮음 (FR-04/FR-05) | High | Medium | 수정자는 편집 전 어느 쪽이 잘못됐는지 반드시 검증: 소스에서 MCP 읽기 열거; EN-06은 br105 주석 + git 이력 확인. 사전 소화된 증거가 이미 Do 브리프에 포함됨. |
| `@version` 태그 형식 드리프트 (FR-01) | Low | Low | `lib/core/_io/output.js:7`에서 정확한 패턴 복사. |
| 수정 후 동일 스위트의 형제 어설션이 여전히 레드 | Medium | Medium | 수정 웨이브 후 MAIN이 전체 집계 재실행; 새 실패 발생 시 동일 에이전트로 2차 디스패치 (테스트 핸드오프 루프). |

---

## 6. 영향 분석

### 6.1 변경 리소스

| 리소스 | 유형 | 변경 내용 |
|--------|------|-----------|
| `lib/core/io.js`, `lib/core/_io/shared.js` | Lib 모듈 헤더 | `@version` JSDoc 태그 추가 (주석만) |
| `test/regression/enh-433-hook-output-visibility.test.js` | 회귀 테스트 | 읽기 경로 → `_io/output.js` |
| `AI-NATIVE-DEVELOPMENT.md` | 문서 | 모듈 수 203 → 207 |
| `test/contract/mcp-port.test.js` | 계약 테스트 | 기대 읽기 수 13 → 16 |
| `tests/qa/v2114-defense-memory-enforcer.test.js` | QA 테스트 | EN-06 어설션 반전 + 주석 |

### 6.2 현재 소비자

| 리소스 | 작업 | 코드 경로 | 영향 |
|--------|------|-----------|------|
| `lib/core/io.js` 헤더 | comment | 모든 `require('./io')` / `require('../core/io')` 소비자 | 없음 (주석만) |
| enh-433 테스트 | READ | CI 집계 + qa-aggregate.js | 녹색 |
| CI-INV 수 검사 | READ | component-inventory.test.js | 녹색 |
| mcp-port 검사 | READ | mcp-port.test.js | 녹색 |
| EN-06 | READ | v2114 스위트 | 녹색 |

### 6.3 검증

- [ ] 위 소비자 전부 SC-1/SC-2 실행으로 검증 (MAIN 실행)
- [ ] 런타임 코드 경로 미접촉

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨 선택

기존 Enterprise 레벨 Clean Architecture 플러그인 코드베이스 — N/A (새 구조 없음).

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| 수정 형태 | 항목별 테스트 측 vs 코드 측 | 전 5개 테스트/문서 측 | 각 사례에서 코드는 검증된 의도적 올바름 (br105, _io 분할, 도구 증가); 테스트/문서가 드리프트됨. |

---

## 8. 컨벤션 전제조건

- 헤더 태그는 기존 JSDoc `@version` 컨벤션 준수 (SoT: `lib/core/_io/output.js`)
- 모든 신규 docs/ 파일에 이중언어 `.en.md`/`.ko.md` 형제 파일 (프로젝트 규칙)
- Co-Authored-By 트레일러 없음 (운영자 상설 규칙)

---

## 9. 다음 단계

1. [x] PRD (pm 단계) — 2026-10-10 완료
2. [ ] 설계 문서 작성 (`qa-aggregate-red-fixes.design.{en,ko}.md`)
3. [ ] Do 단계: 범위 지정된 수정 에이전트 1개 (6개 파일, 배타적 범위, 10분 기한)
4. [ ] MAIN이 SC-1/SC-2 실행
5. [ ] Report + archive

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
