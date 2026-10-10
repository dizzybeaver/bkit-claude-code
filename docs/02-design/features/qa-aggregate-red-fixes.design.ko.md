# qa-aggregate-red-fixes 설계 문서

> **요약**: qa-aggregate 게이트를 녹색으로 복원하는 5개 근본 원인 수정의 정확한 편집 설계 — 테스트/문서/헤더 측만, 런타임 변경 없음.
>
> **프로젝트**: bkit-claude-code (bkit Vibecoding Kit v2.1.40)
> **버전**: 2.1.40
> **작성자**: dizzybeaver (메인 세션)
> **날짜**: 2026-10-10
> **상태**: 초안
> **기획 문서**: [qa-aggregate-red-fixes.plan.md](../../01-plan/features/qa-aggregate-red-fixes.plan.ko.md)

---

## Context Anchor

> 계획 문서에서 복사됨. Design→Do 핸드오프에서 전략 컨텍스트가 살아남도록 보장.

| 키 | 값 |
|-----|-----|
| **WHY** | qa-aggregate 게이트가 fix/patches_102026에서 레드 상태(6 어설션 / 5 근본 원인)이며 CI 병합을 차단함. |
| **WHO** | 유지보수자(dizzybeaver) + CI contract-check 파이프라인. |
| **RISK** | 기대치 갱신이 실제 회귀를 덮어버릴 수 있음 — 모든 반전은 검증된 현재-현실 증거를 인용해야 함. |
| **SUCCESS** | SC-1 `node test/contract/scripts/qa-aggregate.js` 종료 코드 0, 0 FAIL. SC-2 24단계 contract-check 사전 실행 전체 녹색. |
| **SCOPE** | 5개 수정 / 6개 파일: lib 헤더 2개, 테스트 파일 3개, 문서 수 1개. 런타임 로직 변경 없음. |

---

## 1. 개요

### 1.1 설계 목표

- 검증된 최소 diff로 6개 레드 어설션을 녹색으로 전환.
- 각 편집은 반전 전에 어느 쪽이 잘못됐는지(코드 또는 기대치) 검증된 근거를 인용.

### 1.2 설계 원칙

- 테스트/문서 측만: 5개 사례 모두에서 런타임 코드는 검증된 의도적 올바름.
- 사전 소화된 증거: 아래 모든 수정은 file:line과 MAIN이 2026-10-10에 이미 수행한 검증을 포함.

---

## 2. 아키텍처 옵션

### 2.0 아키텍처 비교

| 옵션 | 설명 | 복잡도 | 유지보수성 | 노력 | 리스크 | 선택 |
|------|------|--------|-----------|------|--------|:----:|
| **A — 최소 변경** | 6개 파일에 대한 지점 편집; 재구조화 없음 | 매우 낮음 | 높음 (기존 패턴 일치) | ~1시간 | 낮음 | ✅ |
| **B — Clean Architecture** | 5개 스위트가 소비하는 생성된 기대치/SoT 모듈 도입 | 높음 | 장기적으로 높으나 수정 웨이브에 과잉 | ~1일 | 중간 (새 결합) | ☐ |
| **C — 실용적 균형** | A + CI-INV용 공유 모듈-카운트 헬퍼 추출 | 중간 | 중간 | ~3시간 | 낮음 | ☐ |

**선택: 옵션 A** (Checkpoint 3는 work.md 운영 레벨 4 비대화 규칙으로 해소; 옵션 A는 결함 수정 레인에 객관적으로 올바른 크기이기도 함 — B/C는 드리프트에 대한 기능 규모 대응이며 실제 해결은 구조가 아닌 프로세스임).

---

## 3. 데이터 모델 — N/A (데이터 변경 없음)

## 4. API 명세 — N/A (API 변경 없음)

## 5. UI/UX 설계 — N/A (UI 없음)

---

## 6. 오류 처리 — N/A (새 오류 경로 없음; 모든 편집은 정적)

---

## 7. 보안 고려사항

어떤 편집도 강제 코드를 건드리지 않음. FR-05는 `enforce()`의 *의도적 축소*(br105)를 단언함: `content`의 지시문 텍스트는 인용이지 실행이 아님 — `command`/`file_path`/`args`에 대한 거부 경로의 보안 태세는 변함없으며 EN-07이 여전히 커버함.

---

## 8. 테스트 계획

### 8.1 테스트 범위

| 레벨 | 범위 | 실행자 |
|------|------|--------|
| L1 (계약 집계) | SC-1: `node test/contract/scripts/qa-aggregate.js` — 종료 코드 0, 0 FAIL | MAIN (테스트 핸드오프) |
| L2 (CI 동등성) | SC-2: `.github/workflows/contract-check.yml`과 동일한 명령/순서의 전체 24단계 | MAIN |

### 8.2 수정별 수용 기준

| 수정 | 녹색이 되어야 할 스위트 |
|------|------------------------|
| FR-01 | `test/contract/v2112-deep-qa-invariants.contract.test.js` (L3-006), `tests/qa/v2112-deep-qa-fixes.test.js` (L1-016) |
| FR-02 | `test/regression/enh-433-hook-output-visibility.test.js` |
| FR-03 | `test/contract/component-inventory.test.js` (CI-INV ×2) |
| FR-04 | `test/contract/mcp-port.test.js` |
| FR-05 | `tests/qa/v2114-defense-memory-enforcer.test.js` (EN-06) |

---

## 9. Clean Architecture

### 9.4 이 기능의 레이어 할당

모든 편집은 기존 레이어에 위치: lib 헤더(`lib/core/`), 테스트(`test/`, `tests/qa/`), 문서(`AI-NATIVE-DEVELOPMENT.md`). 새 모듈 없음, import 변경 없음.

---

## 10. 코딩 컨벤션 참조

- JSDoc `@version` 태그 패턴: `lib/core/_io/output.js:7`에서 복사
- Co-Authored-By 트레일러 없음; 코드/주석은 영어만

---

## 11. 구현 가이드

### 11.1 파일 구조 (정확한 편집)

| # | 파일 | 편집 |
|---|------|------|
| 1 | `lib/core/io.js` | 기존 상단 JSDoc 블록 내에 `* @version 2.1.40` 줄 추가 (`output.js` 배치 컨벤션과 일치) |
| 2 | `lib/core/_io/shared.js` | 상단 JSDoc 블록 내에 `* @version 2.1.40` 추가 |
| 3 | `test/regression/enh-433-hook-output-visibility.test.js` | STDOUT_REACHES_MODEL 어설션(~107줄)의 소스 읽기 경로를 `lib/core/io.js`에서 `lib/core/_io/output.js`로 변경; 어설션 텍스트는 불변 |
| 4 | `AI-NATIVE-DEVELOPMENT.md` (198줄) | `lib/ (203 modules)` → `lib/ (207 modules)` — 먼저 component-inventory 검사기 자체 카운터로 실제 수 재검증 |
| 5 | `test/contract/mcp-port.test.js` (152-153줄) | 먼저 MCP 서버 소스에서 실제 읽기 도구 열거; 16 확인 시에만 `assert.equal(reads.length, 13)` → `16` 및 `// 10 pdca read + 3 analysis read = 13` 주석을 실제 내역으로 갱신 |
| 6 | `tests/qa/v2114-defense-memory-enforcer.test.js` (EN-06, 121-126줄) | `assert.equal(r.allowed, false)` → `true`로 반전; 테스트명을 `EN-06: enforce ignores content field (br105)`로 변경; br105 인용 주석(content = 인용, 실행 아님); 거부는 EN-07이 여전히 단언 |

### 11.2 구현 순서

단일 패스, 범위 지정된 에이전트 1개: 수정 1-2 (헤더) → 3 → 4 → 5 → 6. 상호 의존성 없음.

### 11.3 세션 가이드

| 모듈 | 파일 | 세션 |
|------|------|------|
| module-1 (전체) | 위 6개 파일 | 1세션 (~10분 에이전트 디스패치) |

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
