# br045-scope-advisory-fixes 계획 문서

> **요약**: 상태를 오염시키는 픽스처를 샌드박스화하고 허용 목록 계층 격차를 닫으며 라이브 레벨을 복원하여 "not in allowed scope for L0" 스푸리 어드바이저리를 제거 (br045).
>
> **프로젝트**: bkit-claude-code (bkit Vibecoding Kit v2.1.40)
> **버전**: 2.1.40
> **작성자**: dizzybeaver (메인 세션)
> **날짜**: 2026-10-10
> **상태**: 초안
> **레인**: §45.9 버그수정 사이클 (pm → plan → design → do → report → archive)

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 모든 정상적인 서브에이전트 Edit이 거짓 "not in allowed scope for L0" 어드바이저리를 발생시킴: 샌드박스 없는 테스트 픽스처가 영구 control-state 레벨을 0으로 오염시켰고, 허용 목록 계층에는 애초에 `tests/**`와 루트 `*.md`가 없음. |
| **Solution** | automation-controller 픽스처에 hermetic env-swap 샌드박스 + try/finally; moderate 및 wide(DEFAULT_SCOPE) 계층에 `tests/**`와 `*.md` 추가; 공개 `setLevel` API로 라이브 레벨을 4로 복원. |
| **Function/UX Effect** | 범위 어드바이저리가 진짜 범위-외 경로에만 나타남; 영구 레벨이 배터리 실행 전후로 세션과 일관되게 유지됨. |
| **Core Value** | 보안-인접 게이트가 헛된 경고를 그침; 런타임 제어 상태가 배터리-검증됨. |

---

## Context Anchor

| 키 | 값 |
|-----|-----|
| **WHY** | br045: 모든 정상 Edit에 스푸리 L0 범위 어드바이저리; control-state 레벨이 세션과 어긋남. |
| **WHO** | 유지보수자(dizzybeaver), 디스패치된 서브에이전트, pre-write 훅 소비자. |
| **RISK** | 샌드박스는 platform.js와 automation-controller 모두의 require 캐시를 해제해야 함 (PROJECT_DIR은 로드 시점 상수) — 아니면 임시 디렉터리가 조용히 무시됨. |
| **SUCCESS** | SC-1 배터리가 currentLevel을 불변으로 둠; SC-2 L2에서 checkPathScope 프로브 허용; SC-3 24단계 배터리 녹색. |
| **SCOPE** | 편집 2개 파일 (테스트 픽스처 스위트 1, lib 모듈 1), API를 통한 런타임-상태 복원 1회. ENH-398 의미 변경 없음. |

---

## 1. 개요

### 1.1 목적

범위 제한기의 어드바이저리 출력이 오염된 레벨과 불완전한 허용 목록이 아니라 실제 정책 결정을 반영하도록 br045의 두 근본 계층을 수정.

### 1.2 배경

[br045](../../../bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md) 참조: 픽스처가 샌드박스/try-finally 없이 실제 control-state에 기록 ("복원"이 오염된 기준선을 영구히 자가-영속화); 계층 격차로 올바른 레벨에서도 어드바이저리 발생. 라이브 상태 확인: `currentLevel: 0`, `previousLevel: 4` (work.md 운영 레벨).

### 1.3 관련 문서

- 요구사항: [PRD](../../00-pm/br045-scope-advisory-fixes.prd.ko.md)
- 버그 리포트: br045 (active)

---

## 2. 범위

### 2.1 범위 내

- [ ] R1: `tests/qa/v2112-deep-qa-fixes.test.js`의 automation-controller 픽스처에 대한 hermetic 샌드박스
- [ ] R2: 해당 픽스처의 모든 set/restore 쌍에 try/finally
- [ ] R3: 허용 목록 추가 — `tests/**`와 `*.md`를 `moderate` 계층과 `DEFAULT_SCOPE.allowedPaths`(wide 계층의 별칭)에
- [ ] R4: `setLevel(4, { setBy: 'operator-work-md' })`로 라이브 레벨 4 복원

### 2.2 범위 외

- ENH-398 어드바이저리-vs-차단 의미 (설계대로 유지)
- pre-write.js 동작 변경 전부
- DEFAULT_SCOPE에 빠진 `tools/** work/** bug_reports/** .bkit/**` (br109 형제 메모 — 운영자 결정)
- ZfeatA / test-feature 레지스트리 정크 (별개 관심사)

---

## 3. 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 픽스처 샌드박스: `CLAUDE_PROJECT_DIR` → 임시 디렉터리 교체, `purge(/lib\/(core\/(platform\|cache\|config)\|control\/automation-controller)/)`, 샌드박스 내부에서 컨트롤러 재-require, 이후 env 복원 + purge (관용구: bkit-deep-system A2-1/A2-5) | High | Pending |
| FR-02 | 샌드박스 내부에서도 각 setLevel/restore 블록 주변의 try/finally 방어 | Medium | Pending |
| FR-03 | `moderate.allowedPaths` += `'tests/**', '*.md'`; `DEFAULT_SCOPE.allowedPaths` += `'tests/**', '*.md'` (wide는 scope-limiter.js:69→19에서 DEFAULT 별칭) | High | Pending |
| FR-04 | 1회성 MAIN 조치: `ctrl.setLevel(4, { reason: 'br045 restore to work.md operating level', setBy: 'operator-work-md' })` | High | Pending |

### 3.2 비기능

| 범주 | 기준 | 측정 |
|------|------|------|
| 진짜 테스트 | 샌드박스가 실제로 리다이렉트함 (setLevel 후 임시 상태 파일 존재, 실제 파일 무결) | SC-1 |
| 동작 드리프트 없음 | strict 계층 불변; DENIED_PATH 의미 불변 | 프로브 + 스위트 녹색 |

---

## 4. 성공 기준

- [ ] SC-1: 전체 배터리 실행이 `.bkit/runtime/control-state.json`의 currentLevel을 실행 전 값과 동일하게 유지
- [ ] SC-2: `checkPathScope('tests/foo.test.js', 2).allowed === true` 그리고 `checkPathScope('README.md', 2).allowed === true`
- [ ] SC-3: 24단계 contract-check 배터리 전체 녹색 (MAIN 실행)
- [ ] Report + archive 단계 완료

---

## 5. 리스크 및 완화

| 리스크 | 영향 | 가능성 | 완화 |
|--------|------|--------|------|
| require-캐시 미해제 → 샌드박스 조용한 no-op | High | Medium | FR-01은 임시 상태 파일 기록을 단언; purge 정규식이 platform+controller 커버 |
| 허용 목록 글로브 `*.md` 의미 (루트-전용 vs 재귀) | Medium | Medium | `_globMatch`는 선두-`*` 확장 패턴을 basename 매치로 처리 — 수정자가 `docs/x.md` 상호작용을 검증하고 `*.md`(루트)를 명시적으로 선택해야 함 |
| 실제 setLevel을 호출하는 형제 스위트 | Medium | Medium | `tests/` + `test/`에서 다른 `setLevel(` 호출자 grep; 실제 상태를 건드리는 것 발견 시 샌드박스 (근본-원인 규칙에 따라 범위 내) |

---

## 6. 영향 분석

| 리소스 | 변경 | 소비자 | 영향 |
|--------|------|--------|------|
| scope-limiter.js 계층 | 추가적 허용 목록 항목 | pre-write 8단계 어드바이저리만 | 거짓 양성 감소; strict 계층 무손상 |
| v2112-deep-qa-fixes.test.js | 샌드박스된 픽스처 | qa-aggregate | 커버리지 유지 (L1-001..004가 여전히 setLevel 의미 실행) |
| control-state.json | 1회성 setLevel(4) | 훅, trust-engine | 의도된 운영 레벨 복원 |

---

## 7. 아키텍처 — 옵션 A (최소 지점 편집; 결함 레인 크기)

## 8. 컨벤션 — bkit-deep-system A2 샌드박스 관용구; co-author 트레일러 없음; 이중언어 문서

## 9. 다음 단계

1. [x] PRD — 완료
2. [ ] 설계 문서
3. [ ] Do: 범위 지정된 수정 에이전트 1개
4. [ ] MAIN: SC-1..SC-3
5. [ ] Report + archive

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
