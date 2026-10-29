# hook-audit-fix-wave-1028 설계 문서

> **요약**: 38건 훅 계층 결함의 수정 웨이브 설계 — 판별식 stdin 파싱과 소비자별 실패 근성, 원본 바인딩된 강제 캐시, 세션 바인딩된 레지스트리 쓰기, 경계 기반 매칭, 진실한 감사 출력을 8개 스코프 모듈로 전달한다.
>
> **프로젝트**: bkit-claude-code (플러그인 v2.1.40)
> **버전**: 2.1.40
> **작성자**: Claude Code (hook-audit-fix-wave-1028)
> **날짜**: 2026-10-28
> **상태**: Draft
> **계획 문서**: [hook-audit-fix-wave-1028.plan.ko.md](../01-plan/features/hook-audit-fix-wave-1028.plan.ko.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 38건의 미해결 보고서가 훅 강제 계층의 결함을 문서화한다. 핵심 게이트의 fail-open, model-writable 상태 신뢰, 실제로 없는 결과의 감사 기록 — 실행된 프로브로 확인됐다. |
| **WHO** | 운영자(모든 세션 Bash/Write/Stop 트래픽)와 감사 장부에 의존하는 수정 에이전트. |
| **RISK** | 공유 근원의 실패 극성 변경은 정상 자동화를 과잉 차단할 수 있다. deny 패턴 재작성은 rb007/rb008/rb013을 재발시킬 수 있다. |
| **SUCCESS** | 두 active 보고서 디렉터리를 검증된 해결로 비움. 그룹별 프로브 그린, 캐시 동기화, 스위트 회귀 없음. |
| **SCOPE** | 8개 모듈(=웨이브 그룹 G1-G8), 공유 근원 우선 수정 순서. |

---

## 1. 개요

### 1.1 설계 목표

1. 실패 근성을 모든 stdin 소비자에서 명시적·가시적 결정으로 만든다 — 우연한 `|| {}` 금지.
2. 강제 상태(지시문 캐시, 스킬 마커, 자동화 레벨)를 실제 원본과 세션에 바인딩한다.
3. 매칭 결정(deny, 문서 분류, 프리뷰 플래그)은 경계 기반 — substring 운에 맡기지 않는다.
4. 감사 장부는 실제 일어난 일을 기록한다.
5. 모든 수정은 해당 보고서의 검증 명령으로 프로브 검증 후 종결한다.

### 1.2 설계 원칙

- 근원 우선 순서: 공유 근원(lib/core/_io, lib/defense)을 소비자보다 먼저 변경.
- fail-closed는 게이트에만(PreToolUse Bash, Stop). advisory 소비자는 가시 마커와 함께 fail-open — 조용히 금지.
- 새 lint 억제 없음, 주석 절단 없음, 새 docs/ 파일은 이중 언어.
- 각 그룹은 하나의 리뷰 가능한 diff로 착지: 수정 + 프로브 + 보고서 이동이 같은 단위.

---

## 2. 아키텍처 옵션

### 2.0 아키텍처 비교

| 기준 | 옵션 A: 최소 | 옵션 B: 클린 | 옵션 C: 실용 |
|----------|:-:|:-:|:-:|
| **접근** | 보고서별 로컬 패치, `|| {}` 근원 유지 | 신규 입력/근성 모듈, 24개 소비자 전면 재작성 | 공유 근원에 판별 결과, 소비자가 근성 선언, 캐시/세션 바인딩 공용 헬퍼, 나머지는 로컬 수정 |
| **신규 파일** | 1 (pdca-post-write.js) | 3-4 | 2 (pdca-post-write.js, 소형 바인딩 헬퍼) |
| **수정 파일** | ~20 | ~26 | ~20 |
| **복잡도** | Low | High | Medium |
| **유지보수성** | Low (근원 잔존) | High | High |
| **노력** | Low | High | Medium |
| **리스크** | High (fail-open 계열 생존) | Medium (핫 훅 전면 동시 변경) | Low |

**선택**: 옵션 C — 두 High fail-open은 로컬 패치로 죽일 수 없는 하나의 근원을 공유한다(rb043의 핵심). 반면 전면 재작성(B)은 모든 핫 훅을 한 번에 건드려 과잉 차단 위험이 있다. C는 근원을 한 번 고치고, 각 소비자가 근성을 선언하게 하며, forged-anchor 계열에 하나의 바인딩 헬퍼를 공유한다.

---

## 2.1 컴포넌트 다이어그램

```
CC 호스트 엔벨로프 (stdin)
        │
        ▼
┌─────────────────────────────┐
│ lib/core/_io/readers.js     │  readStdinSync → {ok:true,payload} | {ok:false,reason}
│  (판별 결과, 버퍼 상한)      │  + 10MB stdin 상한, loud 절단 마커
└──────────┬──────────────────┘
           │ 소비자가 근성 선언
   ┌───────┴────────┬──────────────────┐
   ▼                ▼                  ▼
GATES             ADVISORY           LEDGER
bash-pre,         session-start,     감사 작성기는 실제 결과
unified-stop      startup/*, 소형    어휘 기록
(fail-CLOSED:     핸들러             (observed|ask|blocked|
 ask/refuse)      (fail-OPEN+마커)   dispatched)
   │                │                  │
   └───────┬────────┴──────────────────┘
           ▼
┌─────────────────────────────┐
│ 원본 바인딩 상태             │  .bkit/runtime 캐시: 원본 존재 +
│  (mtime+hash 바인딩,        │  mtime+hash 일치 시에만 유효;
│   sessionId 필드)           │  마커는 sessionId 포함, Stop에서 비교
└─────────────────────────────┘
```

## 2.2 데이터 흐름 (게이트 결정 경로)

```
stdin 바이트 → 파싱(판별) → [게이트: 파싱 실패 → ASK "검증 불가"] →
가드 고정 순서 실행(단락 결합 아님: 모든 가드 채점, 결과는 최고 등급으로 병합) →
판정 → 단일 계약 출력 → 실제 결과의 감사 행
```

## 2.3 의존성

| 컴포넌트 | 의존 대상 | 목적 |
|-----------|-----------|---------|
| 24개 핸들러 전체 | lib/core/_io/readers.js | stdin 파싱 (근성 수정 지점) |
| unified-bash-pre.js | lib/defense/memory-enforcer.js | 지시문 deny (캐시 바인딩 소비자) |
| unified-stop.js | lib/core/active-skill-marker.js | 마커 디스패치 (sessionId 바인딩) |
| hooks/session-start.js | .bkit/runtime/* | 캐시 작성기 (유효성 바인딩 작성 측) |
| pdca-task-completed.js | lib/pdca/automation.js | auto-advance (세션 필터) |

---

## 3. 데이터 모델

### 3.1 핵심 구조

```js
// readers.js — 판별식 stdin 결과
{ ok: true,  payload: <object>, truncated: false }
{ ok: false, reason: 'parse'|'empty'|'truncated', raw: <Buffer> }

// .bkit/runtime/memory-directives.json — 바인딩된 캐시 항목
{ pattern, action, rule, source: 'CLAUDE.md',
  srcMtime: <epochMs>, srcHash: <sha256-8>, boundAt: <ISO> }

// .bkit/runtime/active-skill.json — 세션 바인딩 마커
{ skill, feature, ts, sessionId: <CC session id> }

// 감사 결과 어휘 (조작된 'success'/'blocked' 대체)
'observed' | 'ask' | 'blocked' | 'dispatched' | 'dispatched_no_context'
```

### 3.2 관계

CLAUDE.md(진실의 원본) 1─1 (mtime,hash) 바인딩 → memory-directives 캐시. 세션 1─N 마커(sessionId 경유). 레지스트리 행은 모든 쓰기 경로에서 ownerSession 스탬프.

---

## 4. 인터페이스 명세 (REST 아닌 훅 계약)

### 4.1 게이트 계약 (PreToolUse Bash / Stop)

| 사례 | 기존 동작 | 새 동작 |
|------|--------------|--------------|
| 파싱 성공 | 가드 실행 | 가드 실행 (변경 없음) |
| 파싱 실패 / 빈 입력 / 잘못된 키 | `input={}` → 조용한 ALLOW | ASK 발행 "명령 검증 불가" (bash-pre) / 장부+게이트 쓰기 거부 + debug 행 (unified-stop) |
| stdin > 10MB | 무한 증가 | 상한 + 절단 마커 → 동일 fail-closed 경로 |

### 4.2 출력 계약

경로당 하나의 계약: PreToolUse 게이트는 `hookSpecificOutput.permissionDecision` 출력. 차단은 (구조화 stdout JSON) 또는 (exit 2 + stderr 이유) 중 정확히 하나 — 둘 다 금지 (rb028). `continue:false`는 항상 `stopReason` 동반 (rb038/rb020).

---

## 5. (N/A — UI 없음, 플러그인 훅만)

---

## 6. 에러 처리

### 6.1 에러 계열

| 계열 | 메커니즘 | 처리 |
|-------|----------|----------|
| stdin 열화 | 파싱 실패/빈 입력/절단 | 게이트는 fail-closed. advisory 소비자는 `+[degraded-input]` 마커와 함께 진행 |
| 원본 부재 | CLAUDE.md 없는 지시문 캐시 | 캐시 무효화(삭제), deny 금지 |
| 모듈 부재 | pdca-post-write require | 파일 복원, require 래핑, 실패 시 loud 경고 |
| 동시 RMW | 공유 상태 쓰기 | 모든 공유 경로에 lockedUpdate/원자적 temp+rename |
| 비동기 초과 | fire-and-forget effect | 타임아웃 내 await 또는 큐잉, rejection 핸들러는 로깅(프로세스 전역 swallower 금지) |

---

## 7. 보안 고려사항

- [x] deny/자동 승인 결정은 resolve된 경로(containment)와 단어 경계 사용 — raw substring 금지 (rb019/rb013/rb036, rb007/rb008/rb009의 defense 측)
- [x] model-writable 상태는 원본 바인딩 없이 강제에 사용 금지 (rb016/rb022/rb030/rb041)
- [x] 교차 세션 민감 쓰기에 세션 신원 필수 (rb014/rb015/rb020/rb023/rb024/rb032/rb037)
- [x] allowlist에서 인터프리터 프리픽스 제거 (rb019)
- [ ] matcher alternation의 live-CC 프로브 (rb042) — Do 중 1회 실행, 어느 쪽이든 결과 문서화

---

## 8. 테스트 계획

### 8.1 테스트 범위 (프로브 검증, 그룹별; 코드 + 프로브 = 1세트)

| 유형 | 대상 | 도구 | 단계 |
|------|--------|------|-------|
| P1: 구문 | 변경 파일 전체 | `bash -n`, `node --check` | Do |
| P2: unit/contract/regression | 변경 영역 | tests/ 스위트(스코프 실행) | Do |
| P3: 행동 프로브 | 원 보고서의 검증 명령 재실행 | 핸들러 직접 호출(감사 프로브 셰이프) | Do |
| P4: 적대적 재프로브 | 이제 HOLDE야 할 RB5-1..6/8/9 체인 | red_baron 스크래치 기법 | Do |

### 8.2 핵심 프로브 시나리오 (수정 후 기대 동작)

| # | 프로브 (본체 출처) | 수정 후 기대 결과 |
|---|---------------------|---------------------------|
| 1 | 빈/절단/이진 stdin → unified-bash-pre | ASK 발행 (조용한 allow 아님) — RB5-3 held |
| 2 | CLAUDE.md 한 줄 + rm CLAUDE.md → bash-pre | deny 없음 (캐시 무효화) — RB5-4 held |
| 3 | L2+에서 `node -e '…'` / `docs/../../../x` | 사람 결정 (자동 승인 없음) — RB5-1/2 held |
| 4 | 위조 마커 + `printf '' \| unified-stop` | 디스패치 없음, 마커 거부(sessionId) — RB5-5 held |
| 5 | `git push -f` (문자열 끝) | deny (패턴 수정) — RB5-6 held |
| 6 | 실제 실패 후 깨끗한 턴들 (br878) | 복구 텍스트에 cmd+ts+exit 포함, 예상 실패 프로브는 무출력 |
| 7 | rb007 quoted-SQL / rb008 where-prose / rb013 변형 | 탐지 유지 (회귀 없음) |
| 8 | ask/유령 디스패치 후 감사 장부 | ask/dispatched_no_context 기록 — RB5-9 held |

---

## 9. 아키텍처 적합성 (기존 계층 유지, 마이그레이션 없음)

| 컴포넌트 | 계층 | 위치 |
|-----------|-------|----------|
| stdin 근성 | core lib | `lib/core/_io/readers.js` |
| 캐시/세션 바인딩 헬퍼 | core lib | `lib/core/state-binding.js` (신규, 소형) |
| 게이트 수정 | hooks | `scripts/unified-*.js`, `scripts/pre-write.js` |
| 매칭 의미론 | defense | `lib/defense/*` |
| pdca-post-write (복원) | hooks | `scripts/pdca-post-write.js` |

의존 규칙: 핸들러 → lib만. lib는 scripts/를 require하지 않음(유지). rb021의 scripts→scripts 방향은 훅 내부 arm으로 허용.

---

## 10. 코딩 컨벤션 참조

기존 저장소 컨벤션 적용 (CommonJS, 모듈 docstring, 명시적 에러 처리, lint 억제 금지). 신규: 감사 결과 어휘(§3.1)와 명시적 실패 근성 선언은 모든 stdin 소비자의 필수 스타일.

---

## 11. 구현 가이드

### 11.1 파일 구조 (delta)

```
lib/core/_io/readers.js        (수정 — 판별 결과, 상한)
lib/core/state-binding.js      (신규 — mtime+hash 바인딩, 부재 시 무효화, sessionId 비교)
scripts/pdca-post-write.js     (신규 — 최소 계약 복원)
scripts/unified-bash-pre.js    (수정 — fail-closed, 병합 판정, 경계 플래그)
scripts/unified-stop.js        (수정 — 게이트 순서, require 가드, child timeout, 장부 진실성)
scripts/permission-request-handler.js (수정 — allowlist/containment)
hooks/session-start.js         (수정 — 캐시 작성기 바인딩, cwd, 감사 진실성)
lib/defense/*                  (수정 — rb007/rb008/rb009/rb013 매칭)
+ 소형 핸들러 ~12개             (보고서별 수정, 계획 §2.1 G6-G8 참조)
```

### 11.2 구현 순서

1. [ ] G1 fail-open-io (근원 우선: readers.js → bash-pre → unified-stop → tool-failure)
2. [ ] G2 textual-matching-defense (lib/defense + 진행 전 프로브 배터리)
3. [ ] G3 permission-gate
4. [ ] G4 forged-anchor (여기서 state-binding.js 도입, rb022/rb030/rb041/rb016/rb014/rb015/rb012 적용)
5. [ ] G5 registry-session-binding
6. [ ] G6 stale-schema-cwd
7. [ ] G7 inert-channels-false-audit
8. [ ] G8 contract-misc

### 11.3 세션 가이드

#### 모듈 맵

| 모듈 | 스코프 키 | 설명 | 예상 턴 |
|--------|-----------|-------------|:---------------:|
| fail-open-io | `module-1` | readers.js 판별 결과 + 게이트 소비자 + tool-failure arm | 40-50 |
| textual-matching-defense | `module-2` | defense lib 매칭 + 프로브 배터리 | 30-40 |
| permission-gate | `module-3` | allowlist/containment 재작성 | 20-30 |
| forged-anchor | `module-4` | state-binding.js + 캐시/마커/레벨 바인딩 | 40-50 |
| registry-session-binding | `module-5` | 레지스트리 쓰기 경로의 세션 필터 | 30-40 |
| stale-schema-cwd | `module-6` | v2 키, CLAUDE_PROJECT_DIR, janitor preserve-list | 30-40 |
| inert-channels-false-audit | `module-7` | 채널 등록 + 결과 어휘 | 25-35 |
| contract-misc | `module-8` | pdca-post-write 복원 + 셰이프/await/경계 수정 | 30-40 |

#### 권장 세션 계획

| 세션 | 단계 | 스코프 | 턴 |
|---------|-------|-------|:-----:|
| 세션 1 | Plan + Design | 전체 | 완료 |
| 세션 2-9 | Do | `--scope module-1` … `module-8` (틱당 하나) | 맵 참조 |
| 세션 10 | Check + Report + Archive | 전체 | 30-40 |

---

## 버전 이력

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-28 | 초안 — 옵션 C 선택, 8모듈 세션 가이드 | Claude Code |
