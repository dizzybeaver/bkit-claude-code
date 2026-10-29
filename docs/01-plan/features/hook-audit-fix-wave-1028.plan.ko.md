# hook-audit-fix-wave-1028 계획 문서

> **요약**: 38건의 미해결 bug/rb 보고서를 8개의 훅/코드스페이스 그룹으로 묶어, 공유 근원(shared root)부터 순서 있게 모두 해결하고 두 active 보고서 디렉터리를 비운다.
>
> **프로젝트**: bkit-claude-code (플러그인 v2.1.40)
> **버전**: 2.1.40 (릴리스 버전은 메인테이너가 지정)
> **작성자**: Claude Code (hook-audit-fix-wave-1028 /loop)
> **날짜**: 2026-10-28
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
|-------------|---------|
| **문제** | hook-audit-1028 릴레이(TS 감사 4회 + red_baron 1회)가 플러그인 훅 계층의 미해결 결함 38건을 확인했다. 하나의 근원을 공유하는 High 급 fail-open 2건, 프로브로 검증된 Critical forged-directive 체인, L2+에서의 인터프리터/경로 탈출 자동 승인, 죽어 있는 PDCA post-write require, 그리고 채널이 전달하지 못하는 출력·거짓 감사·낡은 스키마 계열 결함이다. |
| **해법** | 공유 근원 순으로 8개 그룹(io readers → defense 텍스트 매칭 → permission 게이트 → forged anchor → registry 바인딩 → stale-schema/cwd → inert channel → contract 잡다)으로 나누어, consolidated matrix에서 미리 소화한 브리프를 담은 scoped 에이전트를 그룹별로 디스패치해 수정한다. |
| **기능/UX 효과** | Bash/Stop 게이트가 입력 열화 시 조용히 꺼지지 않는다. 삭제된 CLAUDE.md 지시문이 운영자의 명령을 hard-deny하는 일이 사라진다. PDCA post-write와 StopFailure 안내가 실제로 동작하고, br878 계열의 낡은 컨텍스트 재주입 노이즈가 크게 줄어든다. |
| **핵심 가치** | 강제 계층이 주장하는 대로 동작한다. 가장 위험한 지점에서는 fail-closed, 강제 상태는 실제 원본에 바인딩, 감사 장부에는 실제 결과를 기록한다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | rb007-rb043, br878 등 38건의 미해결 보고서가 훅 강제 계층의 결함을 문서화한다. 핵심 게이트의 fail-open, model-writable 상태 신뢰, 실제로 없는 결과의 감사 기록 — 코드 읽기가 아닌 실행된 프로브로 확인됐다. |
| **WHO** | 운영자(모든 세션의 Bash/Write/Stop 트래픽이 이 훅들을 통과한다)와 감사 장부에 의존하는 후속 수정 에이전트. |
| **RISK** | 공유 근원 수정(readers.js)은 모든 소비자의 실패 극성을 바꾼다 — 지나치게 공격적인 fail-closed는 정상 자동화를 막을 수 있고, deny 패턴 재작성의 회귀는 rb007/rb008/rb013을 다시 열 수 있다. |
| **SUCCESS** | `bug_reports/active/br/`와 `bug_reports/active/rb/` 모두 비움(검증된 해결로 전부 close). 그룹별 프로브 그린, 플러그인 캐시 동기화, tests/ 스위트 회귀 없음. |
| **SCOPE** | 수정 순서 8그룹: (1) fail-open-io 근원, (2) textual-matching-defense, (3) permission-gate, (4) forged-anchor, (5) registry-session-binding, (6) stale-schema-cwd, (7) inert-channels-false-audit, (8) contract-misc. |

---

## 1. 개요

### 1.1 목적

`bug_reports/active/{br,rb}/`의 모든 미해결 보고서를 검증된 수정으로 종결한다. 확인된 fail-open, forged-anchor, 자동 승인, 죽은 강제, 거짓 감사 결함 계열을 훅 계층에서 제거한다.

### 1.2 배경

hook-audit-1028 릴레이(세션 `e1a4c426`, 본체 `work/hook-audit-1028/`)가 38건의 발견을 훅당 1보고서로 통합했다(운영자 지시). red_baron 프로브가 상위 체인들을 end-to-end로 확인했다(RB5-1~RB5-9). 운영자가 /loop(30m cron `592f3070`)으로 이 수정 웨이브를 지시했다. 두 active 디렉터리가 빌 때까지 그룹 단위 해결 후 cron을 취소한다.

### 1.3 관련 문서

- 발견 본체: `work/hook-audit-1028/consolidated-matrix.md` (+ pass1-4/red-baron findings)
- 미해결 보고서: `bug_reports/active/rb/rb007..rb043`, `bug_reports/active/br/br878`
- 큐: `work/now.md` (hook-audit-fix-wave-1028)
- 워크플로: `work/work.md`

---

## 2. 범위

### 2.1 범위 내

- [ ] G1 fail-open-io: rb043 (readers.js fail-closed API + 버퍼 상한), rb018 (bash-pre 소비자 + text-tier 갭), rb020 (unified-stop 소비자 + pre-gate 디스패치 + P4-B1 + child timeout), rb033 (tool-failure expected-failure arm + 자기식별 컨텍스트 + RMW 락, br878 종결)
- [ ] G2 textual-matching-defense: rb007 (quoted-SQL 우회), rb008 (where-prose 억제), rb009 (doc 면제 갭), rb013 (deploy-deny 패턴)
- [ ] G3 permission-gate: rb019 (인터프리터 프리픽스 제거, 경로 containment, push -f 패턴)
- [ ] G4 forged-anchor: rb022 (캐시 mtime+hash 바인딩 + 부재 시 무효화), rb030 (phase enum 검증 + 쿼팅), rb041 (버전 캐시 검증), rb016 (control-state 인증 범위), rb014 (마커 세션 바인딩), rb015 (fire-time 세션 기록), rb012 (transcript containment)
- [ ] G5 registry-session-binding: rb023 (auto-advance 세션 게이트), rb024 (fallback 제거 + transcript 상한), rb017 (updatePdcaStatus 마이그레이션), rb010 (intake 토큰)
- [ ] G6 stale-schema-cwd: rb029 (v1 키), rb039 (cwd), rb025 (janitor preserve-list + RMW 락), rb037 (로스터 스코핑), rb031 (swallower + 조작된 L2 + 감사)
- [ ] G7 inert-channels-false-audit: rb026 (StopFailure 채널), rb027 (감사 진실성), rb035 (notification), rb038 (team-idle 셰이프), rb042 (matcher alternation — live-CC 프로브 1회, 문서+등록 분할로 종결 가능)
- [ ] G8 contract-misc: rb021 (pdca-post-write.js 복원), rb028 (block 계약), rb034 (prompt 셰이프), rb036 (경로 경계), rb040 (effect await), rb032 (단조 phase 가드)

### 2.2 범위 외

- 호스트 측(Claude Code) 재재생 동작 — 플러그인 측 완화만 적용 (br159 선례, rb033에 업스트림 문서화).
- unified-stop.js 560-1040 + unified-bash-pre.js 1-260 적대적 라인 리드 (차기 감사 실행용 미결 구간; 이번 웨이브 수정 대상은 파일된 발견만).
- 버전 bump (메인테이너 전속), 파일된 보고서 외 신규 기능.

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|-------------|----------|--------|
| FR-01 | 훅 stdin 파싱 실패 시 PreToolUse Bash와 Stop에서 명시적 fail-closed 결정(ask/refuse). 조용한 allow 금지 (rb043/rb018/rb020) | High | Pending |
| FR-02 | memory-directives 캐시 유효성을 CLAUDE.md mtime+hash에 바인딩, 원본 부재 시 캐시 무효화 (rb022/rb018) | High | Pending |
| FR-03 | permission 자동 승인에서 인터프리터 프리픽스(`node `, `npm run `) 제거, write 자동 승인은 resolve된 경로 containment 요구 (rb019) | High | Pending |
| FR-04 | deny/탐지 패턴은 경로/단어 경계 매칭 사용, raw substring 금지 (rb013, rb036, rb007/rb008/rb009의 defense 측) | High | Pending |
| FR-05 | active-skill 마커에 sessionId 기록, Stop은 세션 활동 게이트를 핸들러 디스패치 전에 실행 (rb014/rb015/rb020) | High | Pending |
| FR-06 | 감사 장부는 실제 결과 기록(ask/blocked/observed). 전달 불가 채널에서 조작된 'blocked'/'success' 금지 (rb027/rb031/rb020) | Medium | Pending |
| FR-07 | PDCA post-write require 대상이 존재하고 실행됨. StopFailure 안내는 전달되는 채널로 (rb021/rb026) | Medium | Pending |
| FR-08 | tool-failure 복구 텍스트에 자기식별 정보(명령 발췌 + ISO 타임스탬프 + exit code). 예상 실패에는 침묵 (rb033/br878) | High | Pending |
| FR-09 | 모든 상태 읽기는 CLAUDE_PROJECT_DIR에서 resolve. 죽은 v1 키 마이그레이션 (rb029/rb039/rb022/rb041) | Medium | Pending |
| FR-10 | janitor는 선호/포스트모템 상태 파일 보존 (rb025). 공유 RMW 쓰기 락 (rb025/rb033) | Medium | Pending |
| FR-11 | 레지스트리 auto-advance/스탬프 경로는 payload session_id로 필터 (rb023/rb024/rb032) | High | Pending |
| FR-12 | 훅 출력 셰이프 정형(경로당 단일 계약, continue:false는 stopReason 동반) (rb028/rb038/rb034) | Medium | Pending |

### 3.2 비기능 요구사항

| 카테고리 | 기준 | 측정 방법 |
|----------|----------|-------------------|
| 정확성 | 기존 스위트 회귀 없음 | 그룹별 tests/ contract+regression+unit |
| 성능 | 훅이 등록 타임아웃 예산 초과 없음 | 10s Stop 내 spawnSync child ≤ 3s, 5s 훅의 transcript 읽기 상한 |
| 보안 | rb007-rb009/rb013/rb019 프로브 스위트 재실행 그린 | 그룹 프로브 스크립트 + red_baron 스크래치 프로브 재실행 |
| 호환성 | 그룹마다 라이브 플러그인 캐시 동기화, 운영자 재시작 안내 | sync_plugin_cache.sh --apply + drift 체크 |

---

## 4. 성공 기준

### 4.1 완료 정의

- [ ] 38건 전부 종결: 수정 적용 + 원 증상 프로브 + 완료 디렉터리로 이동(Resolution 섹션 포함) + INDEX 갱신
- [ ] 두 active 디렉터리 비움, cron 592f3070 삭제
- [ ] 그룹별 검증 실증: bash -n / node --check / 대상 테스트 / 행동 프로브(감사 프로브 셰이프 재실행)
- [ ] 최종 그룹 후 플러그인 캐시 동기화, 운영자 재시작 안내
- [ ] 매 틱 now.md 큐 갱신, CHANGELOG 초안

### 4.2 품질 기준

- [ ] 새 lint 억제 제로, 주석 절단 없음
- [ ] readers.js 소비자별 실패 극성 문서화(명시적 선택)
- [ ] br878 재재생 현상 사후 프로브: 낡은 컨텍스트가 자기식별(또는 침묵)

---

## 5. 리스크와 완화

| 리스크 | 영향 | 가능성 | 완화 |
|------|--------|------------|------------|
| fail-closed 전환이 정상 명령 차단 (rb043/rb018 과잉 교정) | High | Medium | fail-closed는 deny가 아닌 ASK 발행(사람이 결정). benign 명령 배터리로 프로브 후 종결 |
| deny 패턴 재작성이 rb007/rb008 재발 (quoted SQL, where-prose) | High | Medium | G2에서 rb007/rb008/rb013 프로브 스위트 전체 재실행, GP-21 --flag 회귀 가드 유지 |
| 공유 근원 변경이 fail-open이 필요한 advisory 소비자를 깨뜨림 | Medium | Medium | readers.js는 판별 결과 반환, 소비자가 극성을 명시 선언 |
| rb021 pdca-post-write.js 복원 시 미지의 기대 부활 | Medium | Low | 호출부 사용(:43-53,175) 기준 최소 계약 재구현, 스위트 검증 |
| unified-stop.js 다중 그룹 충돌 (G1+G4+G5) | Medium | High | 엄격한 그룹 순서, 디스패치별 배타적 파일 스코프, 그룹별 커밋 |
| rb042 matcher alternation이 live CC 없이 불가결 | Low | High | live-CC 프로브 1회 시도, 불가결 시 문서화된 등록 분할로 종결(정당한 해결) |

---

## 6. 영향 분석

### 6.1 변경 자원

| 자원 | 유형 | 변경 설명 |
|----------|------|--------------------|
| lib/core/_io/readers.js | lib (stdin 파싱) | fail-open `|| {}` → 판별 결과 + 버퍼 상한 |
| scripts/unified-bash-pre.js | hook | 소비자 fail-closed 선언, text-tier 매칭 수정 |
| scripts/unified-stop.js | hook | 게이트 순서, require 가드, child timeout, 장부 진실성 |
| scripts/permission-request-handler.js | hook | allowlist/containment 재작성 |
| hooks/session-start.js + .bkit/runtime 캐시 | hook + 산출물 | 캐시 유효성 바인딩, 부재 시 무효화 |
| scripts/pdca-post-write.js | hook (신규 파일) | 최소 구현 복원 |
| defense lib (memory-enforcer, quoted-delete, phase9) | lib | rb007/rb008/rb009/rb013 매칭 의미론 |
| 소형 핸들러 12+ | hooks | 보고서별 수정(그룹 목록 참조) |

### 6.2 현재 소비자

| 자원 | 연산 | 코드 경로 | 영향 |
|----------|-----------|-----------|--------|
| readStdinSync | READ | lib/core/io.js 경유 24개 핸들러 전체 | 검증 필요 — 극성이 소비자별로 명시됨 |
| memory-directives.json | READ | bash-pre Memory Enforcer | 검증 필요 — 무효화 경로 추가 |
| active-skill.json | READ/WRITE | unified-stop 디스패치, skill-post 작성기 | 검증 필요 — sessionId 필드 추가 |
| updatePdcaStatus | WRITE | pre-write, pdca-task-completed, automation.js | 검증 필요 — 세션 필터 추가 |
| 감사 장부 작성기 | WRITE | config-change, session-start, unified-stop, bash-pre/post | 검증 필요 — 결과 어휘 변경 |

### 6.3 검증

- [ ] 위 소비자는 그룹 종결 전 그룹 내에서 검증
- [ ] G2 이후 deny 경로 회귀 배터리(G-001/G-004/G-009/G-010b/G-019 프로브 셰이프) 그린
- [ ] 매 그룹 후 플러그인 캐시 drift 체크, 웨이브 종료 시 최종 `--apply`

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨

선택: **기존 플러그인 아키텍처 유지** — bkit은 확립된 Claude Code 플러그인. 레벨 마이그레이션 없음. 수정은 기존 scripts/ + lib/core + lib/{pdca,defense} 계층에 부합.

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|----------|---------|----------|-----------|
| 실패 극성 API | 소비자별 플래그 / 판별 결과 | readStdinSync 판별 결과 + 소비자 선언 | 모든 호출 지점에서 근성이 보임 (rb043 수정 형태) |
| 지시문 캐시 유효성 | TTL / mtime+hash / 매번 재읽기 | mtime+hash + 부재 시 무효화 | 호출당 저렴한 체크, RB5-4 체인을 양끝에서 차단 |
| 마커 세션 바인딩 | sessionId 필드 + 비교 | sessionId + Stop payload 비교 + 게이트 순서 교체 | 하나의 메커니즘으로 rb014/rb015/rb020 해소 |
| pdca-post-write.js | 전면 복원 / 최소 계약 | 호출부 사용 기준 최소 계약 | 미지의 과거 표면, 스위트가 검증 |
| 매칭 의미론 | 전면 regex / 세그먼트+경계 | 결함이 텍스트 매칭인 곳에 경로 세그먼트 + 단어 경계 | 새 FP 계열 회피, GP-21 가드 보존 |

### 7.3 클린 아키텍처 접근

구조 마이그레이션 없음. 그룹 순서가 공유 근원(lib/core/_io, lib/defense)을 소비자보다 먼저 두어 각 그룹의 diff가 한 번에 리뷰 가능.

---

## 8. 컨벤션 사전 확인

### 8.1 기존 프로젝트 컨벤션

- [x] `.claude/CLAUDE.md` 컨벤션 (언어, 버저닝, 캐시 동기화)
- [x] work/work.md 워크플로 (PDCA fire, scoped 에이전트, 버그 처리)
- [x] tests/ 스위트 (contract, regression, unit, security)

### 8.2 정의/검증할 컨벤션

| 카테고리 | 현재 | 정의 사항 | 우선순위 |
|----------|---------------|-----------|:--------:|
| 실패 근성 | 전역적 암묵적 `|| {}` | 소비자별 명시 선언 | High |
| 감사 결과 어휘 | 'success'/'blocked' 오용 | 고정 어휘 (observed/ask/blocked/dispatched) | Medium |

### 8.3 필요 환경 변수

신규 없음. `hooks.advisory.*` 게이팅 키는 새 advisory 이미터가 도입될 때만 확장 (br146 선례대로 default false).

---

## 9. 다음 단계

1. [ ] 설계 문서 (`hook-audit-fix-wave-1028.design.md`, 이중 언어 쌍)
2. [ ] Do 단계: G1 디스패치 (readers.js + bash-pre + unified-stop + tool-failure), 이후 G2-G8 순차
3. [ ] 그룹별 Check (프로브 재실행), 웨이브 종료 시 report + archive

---

## 버전 이력

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-28 | 초안 — hook-audit-1028 본체 기반 8그룹 웨이브 계획 | Claude Code |
