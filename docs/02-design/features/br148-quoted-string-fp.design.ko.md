# br148-quoted-string-fp — 설계 (KO)

**버전:** 1.0 · **날짜:** 2026-10-19 · **기능:** br148-quoted-string-fp

> 영어 원본: [br148-quoted-string-fp.design.en.md](br148-quoted-string-fp.design.en.md)
> 두 문서는 내용이 동일하며 언어만 다릅니다.

## 1. 개요

G-001 계열 규칙이 연산이 아닌 DATA인 따옴표 영역 안의 삭제 토큰을
매칭하지 못하도록 한다 — 우회로를 열지 않고. 측정된 FP (br148 보고 + 라이브
재현):

- `node -e "const t='shutil.rmtree'; console.log(t)"` → 기존 critical/deny
- `echo 'deny for any rm -rf' | head` → 기존 critical/deny
- `grep "rm -rf" file.txt | head` → 기존 critical/deny

## 2. 메커니즘

`lib/control/destructive-detector.js`에 새 exported 헬퍼
`stripInertQuotedDeletes(command)` — br046 스트리퍼 계약을 따른다
("noise는 제거하되 evidence는 절대 제거하지 않는다"; 따옴표 불균형 시
fail-open → 원본 반환).

영역 규칙 (deny-biased):

| 영역 | 동작 |
|---|---|
| 셸 인자 (`bash|sh|zsh|dash|ksh -c`, `eval`) | 전체 KEEP |
| 원격/조합 실행기 인자 (`ssh su doas sudo xargs docker kubectl podman nc`) | 전체 KEEP |
| `--플래그`의 인자 (예: `wrangler --command "DROP ..."`) | 전체 KEEP — 플래그는 실행 페이로드 (GP-21 회귀 가드) |
| 인터프리터 페이로드 (`node/python/perl/ruby/php -e/-c/-r/-p`) + exec 마커 있음 (`child_process, execSync, spawn, os.system, subprocess, popen`) | 전체 KEEP |
| 인터프리터 페이로드, exec 마커 없음 | 코드는 유지, INNER 문자열 리터럴만 블랭크 — data-in-data (`node -e "…'shutil.rmtree'…"`)는 더 이상 매칭 안 됨; 실제 호출 (`shutil.rmtree(`)은 생존 |
| 기타 single-quoted + exec 마커 | KEEP |
| 기타 single-quoted, 마커 없음 | BLANK (`''`) |
| 기타 double-quoted + `$` 또는 backtick | KEEP (명령 치환 가능) |
| 기타 double-quoted | BLANK (`""`) |

## 3. 적용 지점

1. 세그먼트 파이프라인: `inputs = …map(stripHeredocBodies).map(stripInertQuotedDeletes)`.
2. targetFields 분기 (G-001/G-013/G-020 경로): inert-stripped 필드로
   패턴 테스트 — 따옴표 DATA 안에만 있는 토큰은 아예 매칭되지 않음.

`stripHeredocBodies`와 함께 export되어 직접 단언 가능.

## 4. 검증 (측정, 수정 후)

- 3개 FP 전부 → no match.
- GP-21 `wrangler --command "DROP TABLE …"` → G-009 critical/deny 복원
  (초안이 이를 스트립해 GP-21 실패 → `--플래그` 가드 추가).
- 실제 삭제: `rm -rf /tmp/x` high/ask; `python3 -c …shutil.rmtree…`
  critical/deny (양쪽 인용 스타일).
- 우회 시도 전부 여전히 차단: `bash -c` critical; `node -e execSync`,
  `python os.system`, `ssh`, double-quote 내 `$( )` → high/ask (사용자 확인 게이트);
  `xargs` critical.
- 스위트: destructive-detector 유닛, registry-lockdown, enh-440-447
  precision (GP-21 포함) 전부 통과.
- 잔여: heredoc 본문 산문은 여전히 G-001에 매칭되지만 high/ask로
  경감 (br046이 본문을 스트립; ask 잔여는 마찰이지 차단 아님).

## 5. 참고

- 검증 프로브 자체가 라이브(프리싱크) 디텍터에 두 번 차단됨 — 처음엔
  인라인(Bash 명령줄의 `node -e` 문자열), 그 다음엔 프로브 파일의 리터럴
  SQL 문자열 (G-009는 targetFields가 없어 Write content도 매칭). 프로브 v3는
  SQL을 런타임에 조립. 워크플로 위험으로 기록: 라이브 패턴을 인용하는
  디텍터 테스트는 런타임 조립하거나 매칭 범위 밖 파일에서 실행할 것.
