# br045-scope-advisory-fixes 완료 보고서

> **Status**: Complete
>
> **Project**: bkit-claude-code
> **Author**: report-generator
> **Completion Date**: 2026-10-10
> **PDCA Cycle**: defect-fix wave §45.9 (br045)
> **비고**: 영문 보고서(`br045-scope-advisory-fixes.report.en.md`)가 원본(SoT)이며, 본 문서는 이를 한국어로 동기화한 버전입니다.

---

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 내용 |
|------|------|
| Feature | br045-scope-advisory-fixes (버그 수정 레인 §45.9) |
| 시작일 | 2026-10-10 |
| 종료일 | 2026-10-10 |
| 기간 | 단일 세션 (pm → plan → design → do 8라운드 → report) |
| 에이전트 | pm-lead (~97K), implement-feature "br045-impl" (웜컨텍스트 8라운드, 총 ~1.3M); 테스트·계측은 MAIN이 직접 실행 |

### 1.2 결과 요약

```
┌─────────────────────────────────────────────┐
│  완료율: 100% (SC 3/3)                      │
├─────────────────────────────────────────────┤
│  ✅ 완료:        3 / 3 성공 기준            │
│  ⏳ 보류:         1건 (운영자 판단 대기)     │
│  ❌ 취소:         0건                       │
└─────────────────────────────────────────────┘
```

### 1.3 전달 가치

| 관점 | 내용 |
|------|------|
| **문제** | 정상 Edit마다 "not in allowed scope for L0" 어드바이저리가 발생하고, 컨트롤 상태 레벨이 세션과 동기 해제됨. |
| **해결** | 3개 계층의 근본 원인 규명: 실제 `.bkit/runtime/control-state.json`을 쓰던 샌드박스 미적용 테스트 픽스처, 어노우리스트 티어 공백, 수정으로 드러난 레벨 의존 회귀 스위트 — 이후 10개 writer 스위트 샌드박싱 및 어노우리스트 공백 해소. |
| **기능/UX 효과** | 정상 Edit(tests/**, 루트 *.md)에 경고 없음; SC-1 레벨 정합성 전체 배터리에서 pre=4/post=4; qa-aggregate 7179 PASS / 0 FAIL / exit 0. |
| **핵심 가치** | 스코프 어드바이저리 신뢰 회복 — 어드바이저리가 다시 의미 있게 작동하며, strict 티어는 온전히 유지됨. |

### 1.4 성공 기준 최종 상태

| # | 기준 | 상태 | 근거 |
|---|------|:----:|------|
| SC-1 | 전체 배터리에서 컨트롤 상태 레벨 정합성 | ✅ 달성 | 405파일 전체 실행에서 pre=4, post=4 (라운드 걸쳐 6회 실패 후 통과); 라이브 레벨은 public setLevel로 4 복원 |
| SC-2 | 어노우리스트 티어 정확성, strict 미변경 | ✅ 달성 | 프로브: tests/foo.test.js @L2 허용; README.md @L2 허용; tests/foo.js @L0 거부; .env @L4 거부 |
| SC-3 | 전체 스위트 그린 | ✅ 달성 | contract-check 24단계 전부 그린; qa-aggregate 7179 PASS / 0 FAIL / 0 errored / exit 0 |

**달성률**: 3/3 기준 달성 (100%)

### 1.5 의사결정 기록 요약

| 출처 | 의사결정 | 준수 여부 | 결과 |
|------|----------|:--------:|------|
| [PRD] | defect-fix wave §45.9 범위 | ✅ | 문서대로 준수 |
| [Plan] | Option A 최소 편집 | ✅ (정직한 성장 포함) | 계획 1회 대비 8라운드; 각 라운드는 검증된 writer 클래스를 닫은 것이지 재작업이 아님 (masked-sibling 경제성) |
| [Design] | 샌드박스 관용구 + 검증된 glob 시맨틱 | ✅ | 준수; barrel 메모이제이션 발견은 계획 외였으나 필수적 확장이었음 |

---

## 2. 관련 문서

| 단계 | 문서 | 상태 |
|------|------|------|
| PM | br045-scope-advisory-fixes.prd.ko.md / .en.md (docs/00-pm/) | ✅ 확정 |
| Plan | br045-scope-advisory-fixes.plan.ko.md / .en.md (docs/01-plan/features/) | ✅ 확정 |
| Design | br045-scope-advisory-fixes.design.ko.md / .en.md (docs/02-design/features/) | ✅ 확정 |
| Report | 현재 문서 (+ .en.md 원본) | ✅ 완료 |

---

## 3. 완료 항목

### 3.1 근본 원인 수정 (3개 계층, 모두 라이브 검증)

| # | 근본 원인 | 수정 | 상태 |
|---|----------|------|:----:|
| RC-1 | 실제 `.bkit/runtime/control-state.json`을 쓰는 샌드박스 미적용 테스트 픽스처 | 10개 테스트 파일 샌드박싱 (§3.3의 2가지 관용구) | ✅ |
| RC-2 | 어노우리스트 티어 공백: moderate + DEFAULT_SCOPE에 `tests/**`, 루트 `*.md` 누락 | `lib/control/scope-limiter.js` 어노우리스트 확장 (strict 티어 미변경); `*.md`는 `_globMatch` `*`→`[^/]*`로 루트 전용 검증 | ✅ |
| RC-3 | 레벨 의존 회귀 스위트가 push ALLOWED를 단언 — 오염된 낮은 레벨에서만 참 | test/regression/bash-pre-decision.test.js + test/regression/enh-459-463-hook-path-guards.test.js를 올바른 L4의 ENH-298 push 가드 기대로 갱신 | ✅ |

### 3.2 최종 Writer 목록 (8개 스위트, 어트리뷰션 검증)

- tests/qa/v2112-deep-qa-fixes.test.js — setLevel, try/finally 없음; 오염 베이스라인 자기영속
- tests/qa/bkit-deep-system.test.js — A5-3/A5-4
- test/unit/automation-controller.test.js — AC-007..010, AC-021..024 (manual→0 포함)
- test/philosophy/automation-first-v2.test.js — AF-008
- test/philosophy/security-by-default-v2.test.js — SB-004
- test/unit/trust-engine-reconcile.test.js — reconcile→syncToControlState
- test/e2e/permission-mode-matrix.test.js — 실제 환경 CLAUDE_PROJECT_DIR로 스폰된 훅 자식 147개
- test/controllable-ai/always-interruptible.test.js — AI-002/003/017 emergencyStop/Resume 쌍 + AI-004/005/018 setLevel (1라운드 grep은 `setLevel(`만 매칭하여 emergencyStop/Resume을 놓침)

### 3.3 핵심 기술 발견 — require 캐시 barrel이 샌드박스를 무력화

`lib/core/index.js`는 `require('../core')`를 메모이즈하는 BARREL이며, automation-controller는 첫 로드 시 해석된 platform 인스턴스를 보유합니다. platform/cache/config 모듈 키만 제거하는 샌드박스는 barrel이 실제 PROJECT_DIR을 고정한 채 남겨 리다이렉트를 조용히 무력화합니다.

**수정**: barrel 포함 제거 정규식 `/lib\/(core\/|control\/(automation-controller|trust-engine))/`. 수정 에이전트가 프로브로 검증.

### 3.4 확립된 샌드박스 패턴 (2가지)

1. **인프로세스**: env 교체 + require 캐시 제거(barrel 포함) + 재요구 + 결손 허용 바이트 동일 증명.
2. **시드 샌드박스**: 스폰 자식용 — 자식 env CLAUDE_PROJECT_DIR → 레벨 2(= DEFAULT_LEVEL)의 control-state로 시드된 mkdtemp, 의사결정 시맨틱 보존.

### 3.5 산출물

| 산출물 | 위치 | 상태 |
|--------|------|------|
| 어노우리스트 수정 + br045 주석 | lib/control/scope-limiter.js | ✅ |
| 샌드박싱된 스위트 (10개 파일) | test/…, tests/… (git status 참조) | ✅ |
| 라이브 레벨 복원 | public setLevel → 4 (work.md 기준 setBy operator-work-md) | ✅ |
| PM/Plan/Design 문서 (이중언어) | docs/00-pm, 01-plan, 02-design | ✅ |

---

## 4. 미완료 항목

### 4.1 다음 사이클로 이관 (운영자 판단)

| 항목 | 사유 | 우선순위 |
|------|------|----------|
| DEFAULT_SCOPE에 moderate가 가진 tools/**, work/**, bug_reports/**, .bkit/** 누락 | br109 형제 항목; PRD 리스크에 한 줄 기록됨 | 낮음 |
| ZfeatA 레지스트리 정크 정리 | 보류, br045와 무관 | 낮음 |

### 4.2 취소/보류

| 항목 | 사유 | 대안 |
|------|------|------|
| - | - | - |

---

## 5. 품질 지표

### 5.1 검증 (MAIN 실행)

| 확인 | 결과 |
|------|------|
| SC-1 레벨 정합성 | 전체 배터리에서 pre=4 post=4 — PASS (라운드 걸쳐 6회 실패 후) |
| SC-2 어노우리스트 프로브 | 설계대로 4/4 (허용/허용/거부/거부) |
| SC-3 contract-check | 24단계 전부 그린 |
| SC-3 qa-aggregate | 7179 PASS / 0 FAIL / 0 errored / exit 0 |
| 어트리뷰션 | 405파일 전체 순차 실행 + mtime 워처 → writer 집합 완전 열거; 최종 실행: 쓰기 0건 |

### 5.2 해결된 이슈

| 이슈 | 해결 | 결과 |
|------|------|------|
| 모든 Edit의 가짜 L0 스코프 어드바이저리 | RC-1 샌드박싱 + RC-2 어노우리스트 | ✅ |
| 컨트롤 상태 레벨 동기 해제 | writer 열거 + 샌드박스 격리 + 라이브 4 복원 | ✅ |
| grep에 생존한 숨은 writer | mtime 워처 어트리뷰션 + barrel 포함 제거 | ✅ |

---

## 6. 교훈 및 회고

### 6.1 잘된 점 (Keep)

- 어트리뷰션 워처가 grep을 능가: 파일별 mtime 워처가 grep이 못 찾은 writer를 특정함.
- 4라운드의 verify-only 게이트 규율(0-편집 판정)로 무고한 6개 스위트에 대한 무분별 수정 방지.
- 웜컨텍스트 재사용(한 구현 에이전트에 8라운드, 총 ~1.3M)이 라운드별 재발견을 차단.

### 6.2 개선 필요 (Problem)

- MAIN grep 프로브는 head 잘라내기 금지: 1라운드 형제 확인의 `| head -8`가 3개 writer 파일을 숨겨 2라운드 추가 비용.
- 앰비언트 상태 의존 테스트는 앰비언트 상태가 고쳐지기 전까지 숨어 있음 — 공유 상태 교정 시 unmasking 연쇄 예상 (RC-3는 RC-1/RC-2 착지까지 보이지 않았음).
- grep 패턴은 이름이 다른 writer를 놓침 (`setLevel(` vs emergencyStop/Resume) — 단일 패턴이 아닌 패턴 패밀리 필요.

### 6.3 다음 시도 (Try)

- require 캐시 barrel은 env 교체 샌드박스를 조용히 무력화 — 모든 샌드박스 제거는 리프 모듈이 아닌 barrel(`lib/core/index.js`)까지 포함.
- 앰비엔트 상태 writer 추적 시 grep 열거보다 mtime/파일 워치 어트리뷰션 우선.
- masked-sibling 경제성: 충돌 파일이 뒤의 단언을 숨길 때 다라운드 수정 예산 확보; 각 라운드는 검증된 writer 클래스를 닫아야 함.

---

## 7. 프로세스 개선 제안

| 단계 | 관찰 | 제안 |
|------|------|------|
| Do | 계획 1회 대비 8라운드 | 앰비언트 상태 결함 수정에 unmasking 연쇄 사전 예산 |
| Check | 형제 스캔 grep 잘림 | writer 인벤토리 grep의 `head` 잘라내기 금지 |
| 도구 | 수동 mtime 워처 | 어트리뷰션 워처를 재사용 가능한 tools/ 드라이버로 승격 |

---

## 8. 다음 단계

### 8.1 즉시

- [ ] 운영자 판단: br109 형제 공백 종결 (DEFAULT_SCOPE에 tools/**, work/**, bug_reports/**, .bkit/** 누락)
- [ ] 운영자 판단: ZfeatA 레지스트리 정크 정리

### 8.2 다음 PDCA 사이클

| 항목 | 우선순위 | 예상 시작 |
|------|----------|----------|
| br109 DEFAULT_SCOPE 티어 정합 | 낮음 | 운영자 트리거 시 |
| ZfeatA 레지스트리 정리 | 낮음 | 운영자 트리거 시 |

---

## 9. 변경 로그

### Unreleased (2026-10-10)

**수정:**
- br045: 정상 Edit의 가짜 "not in allowed scope for L0" 어드바이저리 (lib/control/scope-limiter.js 어노우리스트 티어; strict 티어 미변경)
- br045: 실제 .bkit/runtime/control-state.json을 쓰던 8개 미샌드박스 스위트 유발 컨트롤 상태 레벨 동기 해제 (10개 스위트 샌드박싱)
- 드러난 RC-3: 실제 L4 동작 기준으로 레벨 의존 회귀 단언 교정 (ENH-298 push 가드)

**변경:**
- 테스트 샌드박싱 관용구 확립: barrel 포함 require 캐시 제거 + 스폰 자식용 시드 mkdtemp 샌드박스

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 1.0 | 2026-10-10 | 완료 보고서 최초 작성 | report-generator |
