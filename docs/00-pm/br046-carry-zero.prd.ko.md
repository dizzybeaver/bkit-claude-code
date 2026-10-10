# br046-carry-zero — 결함 수정 PRD (§45.9 버그 수정 레인)

**버전:** 1.0 · **날짜:** 2026-10-10
**유형:** 최소 결함 수정 PRD — 이 레인에서는 제품 디스커버리(discovery/strategy/research 에이전트)가 N/A.
**SoT(원본):** 영문 파일 `br046-carry-zero.prd.en.md`. 본 파일은 내용 동기화된 한국어 쌍 문서.
**버그 리포트:** `bug_reports/active/br/br046-g019-blocks-read-only-state-commands.md` (제출됨; 이 주기에서 종료)

## 1. 요약 (Executive Summary)

| 관점 | 요약 |
|---|---|
| 문제 | G-019가 브로커 상태 토큰을 "언급만 하는" 읽기 전용 명령을 차단(이번 세션에서 2회 관측); ~35개 과거 기능의 페이즈 문서가 미아카이브 상태로 남아 PDCA 상태 뷰에 유령 활성 기능으로 나타남. |
| 해법 | W1: `docTargetExempt` 선례 옆에 `detect()` 구조화된 읽기-사용 면제 추가. W2: 레지스트리 안전 제외 조건을 둔 스크립트 기반 일괄 아카이브(dry-run → apply). |
| 기능/UX 효과 | 정상 백업/읽기 프로브가 가드를 통과; `getPdcaStatusView` 활성 목록이 실제 기능으로 축소. |
| 핵심 가치 | 캐리오버 제로: br046 종료, 가드의 쓰기-차단 권한 유지, 유령 기능 소멸. |

## 2. 배경

운영자 지시(30m carry-zero 루프): 모든 캐리오버를 제거한다 — 범위 내/기존(pre-existing) 결함은
즉시 수정하고, 범위 외 발견은 버그 리포트로 제출하며, 오래되든 새것이든 모든 리포트를 종결한다.
이 주기는 두 작업 항목으로 정의된다:

- **W1 — br046 (이미 제출됨).** `lib/control/destructive-detector.js:401-432`의 G-019가 브로커
  상태 토큰을 언급만 하는 읽기 전용 명령을 차단한다. 이번 세션에서 2회 관측: (1) 상태 파일을
  SOURCE로 쓰는 `cp`(백업 읽기); (2) 따옴표로 묶인 읽기 호출 안에 토큰이 있는 `node -e`.
  이 패턴은 토큰이 소스인지 대상인지, 인터프리터 페이로드 내부에서 읽기 호출인지 쓰기 호출인지
  구분하지 못한다.
- **W2 — 과거 문서 아카이브.** ~35개 기능의 페이즈 문서(plan 43 / design 36 / analysis 19 /
  report 74, `docs/{01-plan,02-design,03-analysis,04-report}/features/` 산하)가 미아카이브
  상태이며, `getPdcaStatusView`가 이를 유령 활성 기능으로 구체화한다.

## 3. 문제 정의

CRITICAL 가드가 과잉 판정한다: `.bkit/state` / `pdca-status` 토큰 4000자 이내에 쓰기 클래스 동사가
포함된 모든 명령 텍스트는 읽기/쓰기 의도와 무관하게 차단된다 — 백업 실패, 재표현 왕복, 그리고
가드의 권위를 잠식하는 알람 피로를 유발한다. 동시에 문서만 존재하고 실행된 적 없는 기능들이
활성 뷰를 오염시켜, 상태 뷰가 레지스트리 추적 작업만 반영해야 한다는 불변식을 깬다.

## 4. 범위

**포함 (IN)**
- W1: `detect()`에 G-019 읽기-사용 면제(cp/mv 소스-위치 검사; 인터프리터 읽기-호출-문맥 검사)
  + 모든 쓰기 형태는 계속 차단되는 회귀 벡터.
- W2: 과거 기능 문서의 `docs/archive/<YYYY-MM>/<feature>/` 스크립트 일괄 아카이브
  (era = 문서 mtime) — dry-run → apply, 이중 언어 형제 파일 동반 이동, `_INDEX.md` 갱신,
  레지스트리 기반 안전 제외.

**제외 (OUT)**
- 면제 로직을 넘어선 G-019 핵심 정규식 의미 변경 (br102/round-10의 과소-클레임 패치는 그대로 유지).
- 아카이브된 이력 건드리기 — 이동은 내용 보존형이며 문서 편집 없음.
- 레지스트리 쓰기 (G-020이 에이전트 쓰기를 차단; 제외 확인은 Do 시점 읽기 전용).
- Do 에이전트의 테스트 실행·커밋·페이즈 진행 (모두 MAIN 소관).

## 5. 요구사항

### R1 — G-019 구조화된 읽기-사용 면제 (W1)

`detect()` 내 기존 `docTargetExempt` 선례(~:1540 부근) 옆에, `stateGuard` 설정 시 G-019에만 적용:
1. **cp/mv 토큰-소스-위치 검사** — 명령을 토크나이즈; 토큰의 모든 출현이 최종 경로 인수보다
   엄격히 앞서고(토큰이 대상인 경우 없음) `>>` / `tee` / `-o` / `of=` 쓰기 형태가 없을 때만 면제.
2. **인터프리터 읽기-호출-문맥 검사** — `node|python3?|perl` 대상: 토큰이 토큰 앞 ~60자 이내에
   읽기 호출 마커(`readFileSync|readFile|createReadStream|statSync|accessSync`)를 포함하는
   따옴표 세그먼트 안에만 존재하고, 명령 전체에 쓰기 호출 마커
   (`writeFileSync|appendFileSync|writeFile|openSync|>\s*'|sort -o|tee `)가 없을 때만 면제.
   쓰기 마커가 어디든 하나라도 있으면 기존대로 차단.

계속 차단해야 할 벡터(레드팀): cp/mv 대상으로서의 토큰; `writeFileSync` 페이로드; `sort -o`;
글롭 철자 변형; 리다이렉트 벡터. PDCA_GUARD_REDTEST 스위트는 반드시 그린 유지.

### R2 — 스크립트 기반 과거 문서 아카이브 (W2)

기계적 일괄 작업(~170개 파일) — automate-repetitive-work 규칙에 따라 스크립트로 처리; 수동 이동 금지:
1. 먼저 파일 집합 백업 (`tools/cycle_ops backup` 패턴 또는 동등물).
2. dry-run 단계가 변경 전에 파일별 이동 계획(원본 → 대상) 전체를 출력.
3. 기능별 era = 문서 mtime → 대상 `docs/archive/<YYYY-MM>/<feature>/`.
4. 이중 언어 형제 파일(`.en.md` / `.ko.md`)은 함께 이동.
5. 이동 원본 디렉터리의 `_INDEX.md` 갱신.
6. Do 시점 안전 제외: 레지스트리 dict에 non-archived로 존재하는 기능은 제외.

### R3 — 사후 상태 불변식

두 작업 완료 후 PDCA 상태 뷰의 활성 목록은 레지스트리 추적 non-terminal 기능과 이 주기
(`br046-carry-zero`)만 포함한다. 유령 문서-증명 기능이 남지 않는다.

## 6. 성공 기준

- **SC-1 (W1 게이트).** `cp .bkit/state/pdca-status.json /tmp/x` → 허용;
  `cp /tmp/x .bkit/state/pdca-status.json`(토큰이 대상) → 차단;
  `node -e "...writeFileSync(...)"` 페이로드 → 차단; PDCA_GUARD_REDTEST 벡터 스위트 → 그린.
- **SC-2 (W2 게이트).** `docs/{01-plan,02-design,03-analysis,04-report}/features/` 비어 있음
  (또는 제외된 활성만 존재); `getPdcaStatusView` 유령 카운트 = 0.
- **SC-3 (컨트랙트 배터리).** 24단계 contract-check 배터리 그린 — docs-code-sync 단계
  (배터리 9/21단계) 포함.

## 7. 리스크

| 리스크 | 완화 |
|---|---|
| 면제가 과도해 실제 쓰기 통과 | 레드팀 벡터(원본 REDTEST 세트)가 수정을 게이트; any-write-marker-anywhere 규칙이 차단 강제. |
| 문서 이동이 docs-code-sync 카운트 계약 파손 | contract-check 배터리 9/21단계가 카운트 드리프트 포착; apply 후 배터리 실행. |
| 이동된 문서의 부실 참조(루프, 인덱스 파일) | 동일 apply에서 `_INDEX.md` 갱신; dry-run 리뷰 중 참조 소거. |

## 8. 논-목표

- 제품 디스커버리·페르소나·시장 규모·GTM 콘텐츠 없음 — 버그 수정 레인에서 N/A.
- 범위화된 면제 외 G-019 변경 없음; 다른 어떤 가드도 약화 없음.
- 아카이브 문서 내용 편집 없음; 이동은 내용 보존형.
- Do 에이전트의 레지스트리 변경·테스트 실행·커밋 없음 — MAIN으로 핸드오프.
