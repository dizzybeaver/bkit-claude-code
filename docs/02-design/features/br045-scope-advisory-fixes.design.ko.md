# br045-scope-advisory-fixes 설계 문서

> **요약**: 정확한 편집 — 픽스처 샌드박스 (env 교체 + require 캐시 purge), try/finally 방어, 허용 목록 계층 추가, setLevel을 통한 라이브 레벨 복원.
>
> **Project**: bkit-claude-code (bkit Vibecoding Kit v2.1.40) · **Date**: 2026-10-10 · **Status**: Draft
> **Planning Doc**: [plan](../../01-plan/features/br045-scope-advisory-fixes.plan.ko.md)

---

## Context Anchor

| 키 | 값 |
|-----|-----|
| **WHY** | br045: 스푸리 L0 범위 어드바이저리; control-state 레벨이 세션과 어긋남. |
| **WHO** | 유지보수자, 디스패치된 서브에이전트, pre-write 훅 소비자. |
| **RISK** | require-캐시 미해제 → 샌드박스 조용한 no-op (PROJECT_DIR은 로드 시점 상수). |
| **SUCCESS** | SC-1 배터리가 currentLevel 불변; SC-2 L2 프로브 허용; SC-3 24단계 배터리 녹색. |
| **SCOPE** | 편집 2개 파일 + API 복원 1회. ENH-398 변경 없음. |

---

## 2. 아키텍처 — 옵션 A (최소 지점 편집)

편집을 닻는 검증 사실:
- `PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd()`는 **모듈 로드 시점 상수**(`lib/core/platform.js:47`) — 샌드박스는 `platform` + `automation-controller`의 require 캐시를 반드시 purge해야 함 (관용구: `tests/qa/bkit-deep-system.test.js` A2-1/A2-5 `purge(/…/)`).
- `getEffectiveScope`: `level <= 1` → strict; `2` → moderate; `3-4` → wide, 그리고 **wide는 `DEFAULT_SCOPE.allowedPaths`의 별칭**(`scope-limiter.js:69` → 19행) — wide 계층 추가는 DEFAULT_SCOPE에 반영됨.
- `_globMatch`: `*` → `[^/]*` — `*.md`는 **루트-레벨 md만** 매치; `docs/**`가 중첩 문서를 계속 커버. 이번 세션에서 검증됨.
- 라이브 복원은 `setLevel`을 통과 (런타임 제어 상태의 공개 작성자 — PDCA 레지스트리 아님; G-020 무관).

## 8. 테스트 계획

| 레벨 | 확인 | 실행자 |
|------|------|--------|
| SC-2 프로브 | `checkPathScope('tests/foo.test.js', 2).allowed === true`; `checkPathScope('README.md', 2).allowed === true`; `checkPathScope('tests/foo.js', 0).allowed === false` (strict 불변) | MAIN |
| SC-1 | `currentLevel` 기록 → 전체 배터리 → 비교 | MAIN |
| SC-3 | 24단계 contract-check 배터리 | MAIN |

## 11. 구현 가이드 (정확한 편집)

| # | 파일 | 편집 |
|---|------|------|
| 1 | `tests/qa/v2112-deep-qa-fixes.test.js` | L1 automation-controller 테스트 그룹을 샌드박스로 감쌈: 임시 디렉터리 생성; `CLAUDE_PROJECT_DIR` 저장; 임시 디렉터리로 설정; `purge(/lib\/(core\/(platform\|cache\|config)\|control\/automation-controller)/)`; 샌드박스 내부에서 컨트롤러 재-require; 기존 L1-001..L1-004 본문을 그것에 대해 실행 (각 set/restore는 추가로 try/finally로 감쌈); 그룹 후: env 복원, 동일 정규식 재-purge. 임시 `control-state.json`이 생성되었음을 단언 (리다이렉션 증명) + 실제 상태 파일이 무결인지 (그룹 전후 실제 파일 읽기). |
| 2 | `lib/control/scope-limiter.js` | (a) `LEVEL_SCOPE_OVERRIDES.moderate.allowedPaths`: `'tests/**', '*.md'` 추가; (b) `DEFAULT_SCOPE.allowedPaths` (19행): `'tests/**', '*.md'` 추가. br045 인용 주석. `strict` 계층은 건드리지 말 것. |
| 3 | (MAIN, Do 이후) | `node -e "require('./lib/control/automation-controller').setLevel(4, { reason: 'br045 restore to work.md operating level', setBy: 'operator-work-md' })"` 후 readback 검증. |

### 11.2 순서: 편집 1 → 2 → MAIN이 편집 3 실행 → SC-1..SC-3.

### 11.3 세션 가이드: module-1 = 편집 1+2, 에이전트 1회 디스패치.

## 버전 이력

| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
|---|---|---|---|
