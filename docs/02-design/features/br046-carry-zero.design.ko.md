# br046-carry-zero 설계 문서

> **요약**: 정확한 설계 — stateReadExempt 심(detect() 1313줄 부근 docTargetExempt 옆), 벡터 스위트, 아카이빙 스크립트(dry-run 기본).
>
> **Project**: bkit-claude-code (v2.1.40) · **Date**: 2026-10-10 · **Status**: Draft
> **Planning Doc**: [plan](../../01-plan/features/br046-carry-zero.plan.ko.md)

---

## Context Anchor

| 키 | 값 |
|-----|-----|
| **WHY** | 운영자 지시: 캐리오버 제로; br046 + 문서-증거 유령이 마지막 2개. |
| **WHO** | 유지보수자, 디스패치된 에이전트, 대시보드. |
| **RISK** | 면제 과잉-폭(거부 벡터로 게이트); 문서 이동의 카운트 계약 파괴(배터리로 게이트). |
| **SUCCESS** | SC-1 허용/거부 행렬 + REDTEST 녹색; SC-2 features 디렉터리 비음 + 유령 0; SC-3 배터리 녹색. |
| **SCOPE** | lib 파일 1개 + 벡터; 스크립트 1개 + ~170 문서 이동. |

---

## 2. 아키텍처 — 옵션 A (+ 스크립트 배치)

### W1: stateReadExempt (lib/control/destructive-detector.js)

검증 사실: `detect()` 규칙 루프는 `if (docTargetExempt && rule.stateGuard) continue;`(1313줄 부근)로 면제; 명령은 세그먼트화됨(`splitCommandSegments`, ENH-440); G-019는 `stateGuard: true`; G-020은 자체 패턴을 가진 별도 규칙.

설계:
1. 새 헬퍼 `isStateReadUse(segment)` — 하나의 명령 세그먼트에서 작동:
   - (heredoc-제거 후, 이미 상류에서 수행) 공백으로 토큰화.
   - 브로커-토큰 정규식: `/(\.bkit[\/\\]\s*state|pdca[-_]?status)/i`.
   - **cp/mv 조항**: 세그먼트의 첫 동사가 cp 또는 mv면 → 경로 인자 수집; 모든 브로커-토큰 발생이 마지막 경로 인자 엄격 이전의 인자 사이에 있고 세그먼트에 `>>|<<|tee |-o |of=` 형태가 없으면 → true 반환.
   - **인터프리터 조항**: 첫 동사가 node/python3/python/perl이면 → 브로커-토큰 발생 위치 탐색; 각각은 토큰 앞 60자 내에 읽기-호출 마커(`readFileSync|readFile|createReadStream|statSync|accessSync`)를 포함하는 인용 영역 내부에 있어야 함; 그리고 세그먼트 전체에 쓰기-호출 마커(`writeFileSync|appendFileSync|writeFile\s*\(|openSync\s*\([^)]*['"]w`)가 없어야 함 → true 반환. 아니면 false.
   - 세그먼트 어디든 쓰기-형태(`>>`, `tee`, `sort -o`, `dd of=`, `truncate`, `chmod`, 토큰과 함께 `rm`) → 무조건 false.
2. 규칙 루프에서 docTargetExempt 옆에: `if (rule.id === 'G-019' && stateReadExempt) continue;` — G-019 전용(G-020 무영향), ENH-440 세그먼트화처럼 세그먼트별 계산(면제는 전체 입력이 아니라 매치된 동일 세그먼트에서 평가되어야 함).
3. 2개의 실측 FP 기록과 함께 br046을 인용하는 주석.

### W1 벡터 (test/unit/destructive-detector-readexempt.test.js — node:test 스타일, 또는 기존 REDTEST 스타일 스위트 확장):

허용: `cp .bkit/state/pdca-status.json /tmp/x` · `cp --parents a b .bkit/state/pdca-status.json work/backups/x/` · `node -e "const s=require('fs').readFileSync('.bkit/state/pdca-status.json','utf8');console.log(s.length)"`.
거부: `cp /tmp/x .bkit/state/pdca-status.json` · `node -e "require('fs').writeFileSync('.bkit/state/pdca-status.json','{}')"` · `echo x >> .bkit/state/pdca-status.json` · `sort .bkit/state/x -o .bkit/state/x` · `cat y | tee .bkit/state/pdca-status.json` · `rm .bkit/state/pdca-status.json` · `python3 -c "open('.bkit/state/pdca-status.json','w')"` (openSync/open with 'w'는 쓰기 마커) · 기존 PDCA_GUARD_REDTEST 벡터(스위트는 변경 없이 녹색 유지).

### W2: 아카이빙 스크립트 (tools/doc-archive/archive-features.js)

1. 목록: docs/{01-plan,02-design,03-analysis,04-report}/features/* 글로브; 기능명별 그룹화(`.plan|.design|.analysis|.report` + `.en|.ko` 접미사 제거).
2. 안전 제외: `getPdcaStatusFull().features`에 phase가 {archived, completed}가 아닌 이름 건너뜀 — API(lib/pdca)로 읽기, 파일 직접 금지.
3. 시대: 기능의 가장 오래된 문서 mtime에서 `YYYY-MM`.
4. dry-run 기본: 전체 이동 계획 출력(기능 → 시대 디렉터리, 파일 목록). `--apply`: 각 파일을 `docs/archive/<era>/<feature>/`로 git mv, 기능별 행을 `docs/archive/_INDEX.md`에 추가(없으면 생성, 기존 행 형식 일치).
5. 사후: 요약 출력(이동된 기능, 이동된 파일, 제외 목록).

## 8. 테스트 계획 (MAIN 실행)

| 확인 | 방법 |
|------|------|
| SC-1 | 벡터 스위트 + 기존 REDTEST 스위트 + 3개 인라인 node 프로브(cp-소스 허용, cp-대상 거부, writeFileSync 페이로드 거부) 실행 |
| SC-2 | `ls docs/{01-plan,02-design,03-analysis,04-report}/features/` + 뷰 readback: 활성 = 레지스트리-추적 + 이 사이클 |
| SC-3 | 24단계 contract-check 배터리(9/21단계가 docs-code-sync 생존 증명) |

## 11. 구현 순서

W1 감지기 + 벡터 → node --check → W2 스크립트 → 스크립트 dry-run(계획을 MAIN에 보고) → MAIN이 계획 검토 → `--apply` → readback. 에이전트 1개, 두 작업 항목, 배타적 범위: lib/control/destructive-detector.js, 신규 벡터 파일, tools/doc-archive/.

## 버전 이력

| 0.1 | 2026-10-10 | 초안 | dizzybeaver |
|-----|------------|------|-------------|
