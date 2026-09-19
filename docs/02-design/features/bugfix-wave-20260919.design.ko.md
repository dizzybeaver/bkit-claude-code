# bugfix-wave-20260919 설계 문서

> **요약**: 검증된 코드 앵커에 기반한 bkit 집행/기록 서브시스템의 6개 정밀 수정과 양방향 회귀 테스트.
>
> **프로젝트**: bkit (bkit-claude-code)
> **작성자**: Claude Code (L4 풀오토)
> **날짜**: 2026-09-19
> **상태**: Draft
> **계획 문서**: [bugfix-wave-20260919.plan.ko.md](../01-plan/features/bugfix-wave-20260919.plan.ko.md)

---

## Context Anchor

| 키 | 값 |
|----|-----|
| **WHY** | 게이트/훅 결함이 정당한 작업을 차단 — 집행 레이어가 자기 사용자를 실패시킴. |
| **WHO** | 에이전트 오케스트레이션 PDCA 사이클을 돌리는 bkit 사용자, 집행 레이어 자체. |
| **RISK** | 탐지기 변경이 실제 보호 약화, 게이트 완화가 불완전 사이클 통과. |
| **SUCCESS** | 6건 모두 회귀 테스트로 검증, CHANGELOG 기록, 설치 플러그인 동기화. |
| **SCOPE** | 6개 수정: G-001/G-013 targetFields, 아카이브 쓰기 순서, 고아 행 정리, matchRate 기록 + 게이트 완화, 피처 해석, StopFailure 파싱. |

---

## 1. 개요

### 1.1 설계 목표

- 멤버가 아닌 결함 클래스 수정: G-001 특수 처리 대신 G-020의 targetFields 메커니즘 재사용.
- 레지스트리보다 ground truth: 레지스트리 기록 실패 시 아카이브 게이트는 디스크 문서를 신뢰.
- 보호 회귀 없음: 모든 탐지기 변경은 양방향 테스트 동반(악성은 여전히 거부, 정당은 이제 허용).

### 1.2 설계 원칙

- 검증된 앵커의 최소 diff (옵션 A — 최소 변경) — 리팩터가 아닌 수술적 버그 수정.
- fail-closed 유지: 게이트 완화는 긍정적 증거 필요(phase ≥ report AND 4개 문서 존재).
- 레지스트리 잠금 유지(G-020): 고아 정리는 정식 lib API로만.

**선택**: 옵션 A(최소 변경) — 성숙한 코드베이스의 6개 직교 결함. L4에서 자동 선택(AskUserQuestion 금지 지시).

---

## 2. 구성 요소 다이어그램

```
Write/Edit --> pre-write.js --> destructive-detector.detect() --> G-001/G-013 (targetFields: command만)
Bash       --> unified-bash-pre.js --> detect() --> G-001/G-013 (command 전체 커버리지 불변)

gap-detector 에이전트 --Stop--> gap-detector-stop.js --> extractFeature(수정) --> matchRate 파싱(테이블+일반)
                                                                              \-> status-core 기록
pdca-archive CLI --> 게이트: completed OR matchRate>=90 OR (phase>=report AND 디스크 문서 4개)
archiveFeature    --> updatePdcaStatus('archived')  [status 우선 순서 검증]
StopFailure       --> stop-failure-handler.js --> 분류기(실제 필드) --> error-log.json
고아 행           --> status-cleanup 정식 경로(문서-부재 증명 필요)
```

---

## 3. 상세 설계 (수정별)

### 수정 1 — G-001/G-013 targetFields (RB-003)

`lib/control/destructive-detector.js`:
- G-001 규칙 행(39-62행)과 G-013(252-260행)에 `targetFields: ['command']` 추가 — G-020 선언(431-438행)과 동일 메커니즘. detect()의 1296-1301행 분기가 이미 targetFields를 지원하므로 detect() 변경 없음.
- 효과: Write/Edit toolInput(`command` 필드 없음)에서 G-001/G-013은 content/file_path를 매칭하지 않음. Bash는 이전과 동일하게 `toolInput.command`만 판정.
- 테스트(test/unit/destructive-detector.test.js 추가):
  - `detect('Write', {file_path:'tests/x.py', content:'import shutil\nshutil.rmtree(p)'})` → 거부 안 됨.
  - `detect('Bash', {command:'rm -rf /tmp/x'})` → 여전히 거부.
  - `detect('Bash', {command:'find . -exec rm {} \;'})` → 여전히 거부(G-013).
  - `detect('Write', {content:'docs about find -delete'})` → 거부 안 됨.

### 수정 2 — archiveFeature 쓰기 순서 (archive-phase-write 리포트)

측정된 현재 상태: `archiveFeature`(lifecycle.js:138-174)는 이미 `removeActiveFeature` 전에 `updatePdcaStatus('archived', ...)`를 쓰고, `moveDocsToArchive`는 lib에 더 이상 없음(CLI가 문서 이동). 리포트의 실패 양상은 현재 코드에 구조적으로 없지만, 문서 게이트 자체(`requireDocs` 기본 true)는 문서가 이미 없는 경우(CLI 적용 아카이브 케이스) archived 쓰기를 묵살할 수 있음.
- 조치: lifecycle.js의 archive-phase `updatePdcaStatus` 호출에 `opts.requireDocs: false` 전달 — 아카이브된 피처는 정의상 문서 원래 위치를 떠났으므로 이 전이에서 문서 게이트는 무의미.
- 테스트: 문서 부재 시 `archiveFeature`가 `phase:'archived'` + `archivedTo`를 기록(오늘은 shouldUpdate 발동 시 묵살 경로).

### 수정 3 — 고아 행 정식 정리 (BR-001)

`lib/pdca/status-cleanup.js` `deleteFeatureFromStatus`(39-49행):
- 정식 고아 경로 추가: 표준 경로에 문서가 실증적으로 없고 phase가 비종결이면 삭제 허용 — `{success: true, reason: 'orphan-removed (docs missing)'}` 반환. 문서-부재 증명은 shouldUpdate의 doc-check 재사용(plan/design 문서 모두 부재).
- `lib/pdca/feature-manager.js`: 상한 재설계 없음. `canStartFeature`는 활성 행을 계속 세지만, 정리 경로로 고아 제거가 가능해 3-상한 회복 가능.
- 기존 `/pdca cleanup {feature}` 액션으로 노출 — 신규 CLI 없음.
- 테스트: 고아 행(phase 'do', 문서 없음) → 삭제 성공. 살아있는 피처(phase 'do', 문서 있음) → 여전히 거부.

### 수정 4 — matchRate 기록 + 아카이브 게이트 (RB-002 + BR-002)

`scripts/gap-detector-stop.js`(67-98행):
- 정규식 순서 수정: `(Overall\s+Match Rate|Match Rate|매치율|일치율|Design Match)[^0-9]*(\d+)` — 단독 `Overall`이 이기면 안 됨. `[^0-9]*` 갭은 이미 테이블 형식(`Overall Match Rate | 98%`) 허용.
- 피처 해석 수정: 현재 호출 `extractFeatureFromContext({agentOutput, currentStatus})`는 시그니처(status-core.js:403, `sources.feature`/`sources.filePath`만 읽음)가 무시하는 키를 전달 — primaryFeature 폴백 보장. `{feature: featureMatch?.[1], filePath: undefined}`로 전달 변경.
- 잘못된 피처 가드: 해석된 피처가 primaryFeature도 아니고 activeFeatures에도 없으면 기록하지 않고 parseWarning 발생(BR-002의 오귀속 방지).

`scripts/pdca-archive.js` 게이트(104-139행):
- 확장: `gatePassed = completed || matchRate >= 90 || (phaseNumber(phase) >= phaseNumber('report') && discoverDocs(feature).missing.length === 0)`. 디스크 문서가 ground truth(RB-002 Fix-2).
- 테스트: phase 'report' + 디스크 문서 4개 + matchRate null → 통과. phase 'do' + 문서 있음 → 여전히 실패.

### 수정 5 — StopFailure 페이로드 파싱 (stop-failure-payload 리포트)

`scripts/stop-failure-handler.js`(30-59행):
- `last_assistant_message`을 errorMessage 소스로 추가(문자열 또는 `{content:[{text}]}` 형태).
- `input.error`가 일반 문자열이면 메시지로 사용(현재 객체 형태만 처리)하고 기존 분류기를 통과시켜 category/severity를 실제 값으로.
- 유용 필드 0개 페이로드만 unknown/low 유지, 일부 필드 발견 시 'partial'.
- 테스트: `error: "Exit code 2"`만 있는 페이로드 → 실제 메시지 + 분류된 severity(unknown/low/빈값 아님).

### 수정 6 — 사전 패치 분류

리포트는 이미 이동한 코드를 인용할 수 있음(이미 입증: moveDocsToArchive 부재). Do 단계 0단계: 각 리포트의 file:line을 HEAD에 재검증, 결함이 이미 사라진 경우 no-op 패치 대신 측정 증거와 함께 `fixed-elsewhere`로 종결.

---

## 4. 데이터 설계

스키마 변경 없음. 소비하는 레지스트리 필드: `phase`, `matchRate`, `activeFeatures`, `archivedTo`. error-log 항목 형태 불변(필드 값만 개선).

---

## 5. 테스트 계획

L1 단위(test/unit/):
- destructive-detector: 양방향 4케이스(수정 1).
- status-cleanup: 고아 vs 살아있는 삭제(수정 3).
- 아카이브 게이트: 디스크-문서 통과/실패 케이스(수정 4).
- stop-failure-handler: 페이로드 변형 → 분류된 항목(수정 5).
- lifecycle: 문서 부재 시 아카이브 지속(수정 2).

L2 통합: `node test/run-all.js --unit --integration --regression` 전체 통과.
L3 E2E: 실제 probe — 아카이브 시점에 자체 피처 대상 `pdca-archive.js` dry-run(dogfood).

---

## 6. 구현 가이드

### 6.1 모듈 맵

| 모듈 | 스코프 키 | 파일 |
|------|-----------|------|
| module-1 detector | G-001/G-013 targetFields + 테스트 | lib/control/destructive-detector.js, test/unit/destructive-detector.test.js |
| module-2 archive | lifecycle requireDocs:false + 게이트 완화 + 테스트 | lib/pdca/lifecycle.js, scripts/pdca-archive.js, test/unit/* |
| module-3 bookkeeping | gap-detector-stop + 고아 정리 + 테스트 | scripts/gap-detector-stop.js, lib/pdca/status-cleanup.js, test/unit/* |
| module-4 observability | stop-failure-handler + 테스트 | scripts/stop-failure-handler.js, test/unit/* |

### 6.2 권장 세션 계획

1. 세션 1: 모듈 1+2 (탐지기 + 아카이브).
2. 세션 2: 모듈 3+4 (기록 + 관측성).
3. 세션 3: 분류(수정 6), 리포트 이동, CHANGELOG, 플러그인 동기화.

### 6.3 구현 순서

수정 1 → 2 → 4 → 3 → 5 → 6. 예상 ~150 변경 라인 + ~200 테스트 라인.

---

## 7. 보안 고려사항

- G-001/G-013은 Bash 표면(삭제를 실행하는 유일한 표면)에서 완전히 유지. Write/Edit 내용 매칭은 실제 보호 0 손실 — Write는 아무것도 실행하지 않음.
- 아카이브 게이트 완화는 긍정적 디스크 증거 필요. fail-open 경로 없음.
- 고아 정리는 문서-부재 증명 필요. 문서 있는 활성 피처는 보호 유지.

---

## 8. 테스트 계획 (QA 게이트)

단위+통합+회귀 전체 green. 탐지기 양방향 테스트는 mutation check로 RED-before/GREEN-after 입증.

---

## 9. 배포 / 동기화

변경 파일만 설치된 플러그인 루트(Do 시점에 `~/.claude/plugins/cache/bkit-marketplace/bkit/2.1.38/`에서 기록)로 복사. 동기화 매니페스트는 완료 리포트에 기록.

---

## 10. 리스크

| 리스크 | 완화 |
|--------|------|
| 설치 캐시 디렉터리가 버전됨(2.1.38), 플러그인 업데이트 시 동기화 유실 | 저장소가 source of truth. 동기화 매니페스트 문서화. 버전 변경은 메인테이너 몫 |
| 리포트 드리프트(제출 후 코드 이동) | 수정 6 분류가 패치 전 모든 인용 재검증 |

---

## 11. 구현 가이드 (세션 가이드)

모듈 맵 6.1, 3-세션 분할 6.2. `/pdca do bugfix-wave-20260919 --scope module-N` 지원. 각 수정 지점에 Design Ref 주석.

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-09-19 | 초안, Explore 디스패치로 앵커 검증 | Claude Code |
