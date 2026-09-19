# bugfix-wave-20260919 계획 문서

> **요약**: `bug_reports/`의 미해결 버그 리포트 6건을 전체 PDCA 사이클로 해결하고, 변경 사항을 설치된 bkit 플러그인에 동기화한 뒤 CHANGELOG를 갱신합니다.
>
> **프로젝트**: bkit (bkit-claude-code)
> **버전**: 2.1.38 (저장소) / 2.1.39 미출시 진행 중
> **작성자**: Claude Code (사용자 지시에 따라 L4 풀오토)
> **날짜**: 2026-09-19
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **문제** | 6건의 미해결 리포트: 아카이브/상태 기록 데드엔드 2건(고아 레지스트리 행, 문서 이동 후 status 쓰기 게이트 차단), 탐지기 오탐/게이트 차단 2건(Write 내용에 대한 G-001 토큰 오탐, 디스패치 에이전트 matchRate 미기록으로 아카이브 게이트 영구 차단), 관측성 결함 2건(StopFailure 페이로드 미분류, gap-detector-stop의 잘못된 피처 귀속). |
| **해결** | 6건을 한 웨이브로 수정: (1) G-001/G-013 `targetFields: ['command']` 선언, (2) 아카이브 흐름에서 문서 이동과 무관하게 status 기록, (3) feature-manager의 고아 행 정식 정리 경로, (4) SubagentStop matchRate 파서가 테이블 형식 허용 + 디스크 문서 존재 시 아카이브 게이트 완화, (5) gap-detector-stop 피처 해석 강화(kebab-case 파싱, 에이전트 보고 피처 우선), (6) StopFailure 분류기가 실제 필드 추출. |
| **기능/UX 효과** | 정당한 테스트/문서 쓰기가 차단되지 않고, 에이전트 오케스트레이션 PDCA 사이클이 실제 아카이브되며, 오래된 행이 3-피처 상한을 소모하지 않고, 장애 로그가 실제로 actionable해집니다. |
| **핵심 가치** | "PDCA는 반드시 Skill fire로 전 단계 실행" 보장이 실제로 충족 가능해지고, 집행 레이어의 자기 차단 오탐이 제거됩니다. |

---

## Context Anchor

| 키 | 값 |
|----|-----|
| **WHY** | 게이트/훅 결함이 정당한 작업을 차단합니다(쓰기 거부, 아카이브 데드엔드, 레지스트리 행 누수) — 집행 레이어가 자기 사용자를 실패시키고 있습니다. |
| **WHO** | 에이전트 오케스트레이션 PDCA 사이클을 돌리는 bkit 사용자, 운영자의 집행 레이어. |
| **RISK** | destructive-detector 변경이 실제 보호를 약화시킬 수 있음 — Bash 경로의 G-001 커버리지는 유지해야 하며, 아카이브 게이트 완화는 불완전한 사이클을 통과시켜선 안 됩니다. |
| **SUCCESS** | 6건 모두 양방향 회귀 테스트로 검증, CHANGELOG 기록, `~/.claude` 설치본 동기화, 리포트 `completed/` 이동. |
| **SCOPE** | 한 웨이브 6개 수정: destructive-detector G-001/G-013, lifecycle 아카이브 쓰기 순서, 고아 행 정리, SubagentStop matchRate + 게이트 완화, gap-detector-stop 피처 해석, StopFailure 페이로드 파싱. |

---

## 1. 개요

### 1.1 목적

`bug_reports/`의 모든 미해결 결함 리포트(플랫 3건 + `active/br/` 2건 + 인덱스)를 수정하고, 각 수정을 true 테스트로 검증한 뒤 `~/.claude`의 설치된 플러그인 사본에 반영합니다.

### 1.2 배경

리포트는 2026-07-02~2026-09-19에 걸쳐 bkit 자체와 집행 레이어에 제출되었습니다. RB-002와 BR-002는 다른 각도에서 같은 실패 클래스(디스패치 에이전트 PDCA의 레지스트리 기록 누락 → 아카이브 게이트 영구 차단)를 기술합니다. 나머지는 독립적입니다.

### 1.3 관련 문서

- `bug_reports/archive-phase-write-gated-out-after-doc-move.md`
- `bug_reports/stop-failure-payload-missing-fields.md`
- `bug_reports/rb002-dispatched-agent-pdca-matchrate-not-recorded-archive-gate-blocks.md`
- `bug_reports/rb003-g001-write-content-recursive-delete-fp.md`
- `bug_reports/active/br/br001-…md`, `br002-…md`

---

## 2. 범위

### 2.1 범위 내

- [ ] RB-003: `lib/control/destructive-detector.js`의 G-001에 `targetFields: ['command']` 선언(G-013 find-삭제도 동일 클래스 감사)
- [ ] archive-phase-write: `archiveFeature` 순서 재조정 — 문서 이동 후 `requireDocs` 게이트가 `updatePdcaStatus('archived')`를 묵살하지 않도록 (`lib/pdca/lifecycle.js`)
- [ ] BR-001: 고아 레지스트리 행(문서 없음 + 비종결 phase)의 정식 정리 경로 (`lib/pdca/feature-manager.js` / `status-cleanup.js` 또는 아카이브 CLI)
- [ ] RB-002 + BR-002: SubagentStop/gap-detector-stop matchRate 기록 — 테이블 형식 허용, 에이전트 출력에서 kebab-case 안전 파싱, 잘못된 `primaryFeature` 폴백 방지, 4개 문서가 디스크에 있으면 phase ≥ report 조건으로 아카이브 게이트 완화
- [ ] StopFailure 페이로드: 나열된 페이로드 키에서 실제 필드 추출(unknown/low 붕괴 제거)
- [ ] 각 수정의 회귀 테스트(고장 시 실패하는 단정, 탐지기 규칙은 양방향)
- [ ] CHANGELOG 기록(미출시 헤딩, 버전 고정 규칙 준수)
- [ ] 변경 파일을 `~/.claude`의 설치된 플러그인에 동기화

### 2.2 범위 외

- Bash 인용 인자 토큰 오탐 클래스(RB-003 잔여 사항 — 별도 RB)
- `MAX_CONCURRENT_FEATURES` 상한 재설계(고아 행 정리 이상)
- `.claude-plugin/plugin.json` 버전 변경(메인테이너 결정)

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | G-001은 Bash command 표면만 매칭; `rm -rf`/`shutil.rmtree` 언급이 포함된 Write/Edit 내용은 거부되지 않음 | High | Pending |
| FR-02 | `detect('Bash', {command: 'rm -rf /tmp/x'})`는 여전히 탐지(보호 불변) | High | Pending |
| FR-03 | `archiveFeature`는 문서가 이미 이동된 경우에도 `phase='archived'` + `archivedTo`를 기록 | High | Pending |
| FR-04 | 고아 행(비종결 phase, 문서 없음)에 레지스트리 수동 편집 없이 정식 제거 경로 존재 | High | Pending |
| FR-05 | 테이블 형식(`Overall Match Rate | 98%`)과 일반 형식 모두에서 matchRate 기록 | High | Pending |
| FR-06 | gap-detector-stop은 에이전트가 분석하지 않은 피처에 rate를 귀속하지 않음 | High | Pending |
| FR-07 | phase ≥ report이고 4개 문서가 표준 경로에 존재하면 아카이브 게이트 통과 | Medium | Pending |
| FR-08 | StopFailure 항목이 페이로드 필드 존재 시 실제 errorType/category/severity 보유 | Medium | Pending |
| FR-09 | 각 수정은 재발 시 실패하는 회귀 테스트 보유 | High | Pending |

### 3.2 비기능 요구사항

| 카테고리 | 기준 | 측정 방법 |
|----------|------|-----------|
| 호환성 | Bash 탐지 커버리지 불변 | 기존 테스트 + 신규 양방향 테스트 |
| 크기 제한 | JS 파일 프로젝트 임계값 준수 | 수정 후 wc -l |
| 컨벤션 | Conventional Commits, co-author 트레일러 금지 | git log 검토 |

---

## 4. 성공 기준

### 4.1 완료 정의

- [ ] 6건 리포트 모두 실제 probe 출력이 담긴 Fix + Verification 섹션 완비
- [ ] 프로젝트 테스트 스위트 통과
- [ ] 리포트 `.completed` 마커와 함께 `bug_reports/completed/`로 이동
- [ ] CHANGELOG.md 갱신(미출시 헤딩)
- [ ] 변경된 lib/scripts 파일을 설치된 플러그인 디렉터리에 동기화

### 4.2 품질 기준

- [ ] 수정 파일 린트 에러 0
- [ ] destructive-detector 보호 회귀 없음(양방향 테스트 green)

---

## 5. 리스크 및 완화

| 리스크 | 영향 | 가능성 | 완화 |
|--------|------|--------|------|
| G-001 `targetFields`가 탐지 약화 | High | Low | 양방향 회귀 테스트, Bash 표면 전체 커버리지 유지 |
| 게이트 완화로 불완전 사이클 아카이브 | High | Low | phase ≥ report AND 4개 문서 디스크 존재 요구 — 디스크가 ground truth |
| 고아 정리가 살아있는 피처 행 삭제 | Medium | Low | 표준 경로에 문서가 실증적으로 없을 때만 정리 |
| 설치본 동기화와 저장소 불일치 | Medium | Medium | 변경 파일 정확한 복사만 수행, 동기화 매니페스트를 리포트에 기록 |

---

## 6. 영향 분석

### 6.1 변경 리소스

| 리소스 | 유형 | 변경 내용 |
|--------|------|-----------|
| `lib/control/destructive-detector.js` | 코드 | G-001(및 G-013 감사)에 `targetFields` 추가 |
| `lib/pdca/lifecycle.js` | 코드 | 아카이브 status 쓰기가 문서 이동에도 생존 |
| `lib/pdca/feature-manager.js` / `status-cleanup.js` | 코드 | 고아 행 정식 정리 |
| `scripts/gap-detector-stop.js` / `lib/pdca/status-core.js` | 코드 | 피처 해석 + 테이블 형식 matchRate 파싱 |
| `scripts/pdca-archive.js` | 코드 | 디스크-문서 게이트 완화 |
| StopFailure 파싱 경로 | 코드 | 실제 필드 추출 |
| `CHANGELOG.md` | 문서 | 미출시 항목 |
| `~/.claude` 설치 플러그인 | 배포 대상 | 변경 파일 복사 |

### 6.2 현재 소비자

| 리소스 | 연산 | 코드 경로 | 영향 |
|--------|------|-----------|------|
| destructive-detector | detect() | `scripts/pre-write.js`, `unified-bash-pre.js` | 없음 — Bash 커버리지 유지 |
| updatePdcaStatus | WRITE | `lib/pdca/lifecycle.js` archiveFeature | 해당 호출점만 수정 |
| pdca-status 레지스트리 | READ/WRITE | 아카이브 CLI, MCP status, 훅 | 정리 경로는 추가적 |
| matchRate 파서 | READ | gap-detector-stop, iterator-stop | 파서 확장(교체 아님) |

### 6.3 검증

- [x] 위 소비자는 각 리포트의 file:line 근거로 식별 완료
- [ ] 수정 후 모든 소비자 재검증 (Check 단계)

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨

bkit 자체가 Node.js 플러그인 프로젝트로, 웹 앱 레벨 테이블은 적용 대상이 아닙니다. 표준 저장소 컨벤션(lib/ + scripts/ + hooks.json)을 따릅니다.

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| 수정 단위 | 버그당 1 피처 / 웨이브 1 피처 | 웨이브 1 피처 | 동일 집행/기록 서브시스템, 6개 소규모 직교 수정, 루프 구동 |
| 게이트 완화 기준 | matchRate 존재 / 디스크 문서 | 디스크 문서 + phase ≥ report | 레지스트리 기록이 불신뢰 반쪽이고 디스크가 ground truth |
| 고아 정리 메커니즘 | 자동 프룬 / 정식 CLI | 기존 cleanup/archive CLI의 정식 경로 | G-020 레지스트리 잠금 유지 |

### 7.3 구현 표면

```
lib/control/destructive-detector.js   (G-001/G-013 targetFields)
lib/pdca/lifecycle.js                 (아카이브 쓰기 순서/게이트)
lib/pdca/feature-manager.js           (고아 행)
lib/pdca/status-cleanup.js            (고아 행)
lib/pdca/status-core.js               (extractFeatureFromContext)
scripts/gap-detector-stop.js          (피처 해석, 테이블 파싱)
scripts/pdca-archive.js               (게이트 완화)
StopFailure 파싱 경로 (Do 단계에서 위치 확인)
tests/ (수정별 회귀 테스트)
```

---

## 8. 컨벤션 사전확인

### 8.1 기존 프로젝트 컨벤션

- [x] `.claude/CLAUDE.md` — 언어 규칙(코드/문서 영어, 신규 `docs/`는 `.en.md`/`.ko.md` 쌍), 버전 고정
- [x] Conventional Commits, co-author 트레일러 금지
- [x] 버그 리포트 9필드 템플릿

### 8.2 정의/확인할 컨벤션

| 카테고리 | 현재 상태 | 정의 사항 | 우선순위 |
|----------|-----------|-----------|:--------:|
| 바말 문서 | 신규 docs/는 `.en.md`/`.ko.md` 쌍 필수 | 본 피처의 분석/리포트 문서에 적용 | High |
| 파일 크기 | JS 프로젝트 임계값 | 초과 시 분할 | High |

---

## 9. 다음 단계

1. [ ] 설계 문서 (`bugfix-wave-20260919.design.md`, en+ko)
2. [ ] Do 단계: 서브에이전트 디스패치로 6개 수정 구현
3. [ ] Check (gap-detector) → < 90%면 Iterate → QA → Report → Archive
4. [ ] 설치본 동기화, CHANGELOG 기록, 웨이브 완료 시 cron 취소

---

## 버전 이력

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-09-19 | 초안 (L4 풀오토 웨이브) | Claude Code |
