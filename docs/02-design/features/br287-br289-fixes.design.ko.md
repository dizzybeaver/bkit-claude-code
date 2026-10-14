# br287-br289-fixes Design Document

> **요약**: 이미 커밋된 두 수정에 대한 종결 워크플로 설계 — 검증 증거 모델, 리포트 수명주기, CHANGELOG, 브랜치 전달.
>
> **Project**: bkit-claude-code
> **Version**: (maintainer-owned — not modified)
> **Author**: Claude Code loop
> **Date**: 2026-10-14
> **Status**: Draft
> **Planning Doc**: [br287-br289-fixes.plan.md](../01-plan/features/br287-br289-fixes.plan.en.md)

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | 수정은 커밋됐지만 종결되지 않은 미해결 버그 리포트 2건 — 리포트, CHANGELOG, 전달 워크플로가 남아 있습니다. |
| **WHO** | bkit 플러그인 유지보수자와 CI (contract-check가 eslint 실행, 운영자 Stop 흐름이 unified-stop/skill-stop 훅 실행). |
| **RISK** | 검증 드리프트, 잘못된 원격/브랜치 푸시, main으로의 우발적 병합. |
| **SUCCESS** | 두 리포트가 .completed 마커와 함께 completed/에 위치, CHANGELOG 갱신, 전체 테스트 통과, origin에 브랜치 푸시, PR 없음, main 병합 없음. |
| **SCOPE** | 두 수정 검증 → 리포트 2건 종결 → CHANGELOG → 커밋 → 테스트/워크플로 실행 → origin에 브랜치 푸시. |

---

## 1. Overview

### 1.1 Design Goals

1. 새 런타임 코드 없음 — 두 수정 모두 HEAD(커밋 44060a9)에 이미 반영.
2. 모든 종결 주장에 신선한 증거 (수정 커밋을 증거로 인용하지 않음).
3. 운영자 지시대로 정확히 전달: 로컬 커밋 → 테스트 → 브랜치 푸시, PR 없음, 병합 없음.

### 1.2 Design Principles

- 현재 시스템 측정: 모든 검증은 이번 세션의 신선한 실행.
- 버그 리포트 카탈로그는 감사 추적: 상태는 위치 + `.completed` 마커로 변경, 삭제하지 않음.
- PDCA 레지스트리는 수동 편집 금지, 페이즈는 스킬 파이어로만 진행.

---

## 2. Verified Fixes (evidence already gathered this session)

### 2.1 br287 — PDCA-COMPLETE 무한 재발 루프

- **트리 내 수정**: [scripts/pdca-skill-stop.js:452](../../../scripts/pdca-skill-stop.js#L452) — 터미널 기능 조기 종료(`archived`/`completed`/`archivedAt`/`archivedTo` 검사)로 완료된 사이클의 Stop이 PDCA-COMPLETE를 재발행하지 않고 조용히 승인됩니다.
- **신선한 검증**: 라이브 레지스트리 `.bkit/state/pdca-status.json`에 대한 node 프로브 — 아카이브된 16개 항목 모두 수정 술어에서 터미널로 판정. 통과.

### 2.2 br289 — eslint jest 전역 누락

- **트리 내 수정**: [eslint.config.js:153](../../../eslint.config.js#L153) — `test-scripts/**`에 jest 전역을 선언하는 flat-config 오버라이드 블록, 주석에 `br289` 표기.
- **신선한 검증**: `npx eslint test-scripts/` → 0 오류 (기존 경고 4건, 무관). 통과.

---

## 3. Closure Workflow Design

| Step | Mechanism | Artifact |
|------|-----------|----------|
| 1. 각 리포트의 Fix + Verification 필드 채우기 | 제자리 편집 (11-필드 템플릿) | 갱신된 리포트 2건 |
| 2. 리포트를 completed로 이동 | `git mv`로 `bug_reports/completed/BR/`에, `*.md` → `*.completed.md` 리네임 | 종결된 리포트 2건 |
| 3. CHANGELOG | br287/br289 항목으로 `## [Unreleased]` 섹션 추가 (버전 번호는 유지보수자 소관 유지) | CHANGELOG.md |
| 4. 커밋 | 컨벤셔널 커밋, co-author 트레일러 없음, `fix/patches_102026` | 로컬 커밋 |
| 5. 테스트 | 전체 jest 배터리 + eslint; `.github/workflows` 등가물을 로컬 실행 | 테스트 로그 |
| 6. 푸시 | `git push origin fix/patches_102026`만 실행 | 원격 브랜치 |

### 3.1 Explicit Prohibitions (operator directive)

- `gh pr create` 금지, `main` 병합 금지, upstream `main` 병합 금지.
- 스킬 파이어 외 레지스트리 쓰기 금지.
- 린트 억제 금지.

---

## 4. Architecture Selection

Three options considered:

| Option | Description | Verdict |
|--------|-------------|---------|
| A — 최소 | 계획대로 검증 + 종결 + 전달 | **선택됨** |
| B — 클린 | 추가로 stop-hook 완료 감지를 lib 모듈로 리팩터 | 기각: 새 코드가 없는 사이클의 신규 코드, 범위 외 |
| C — 실용 | A + `ZfeatA` 정크 레지스트리 행 정리 | 기각: 레지스트리 쓰기는 별도 결정 필요 (계획 §2.2에 기록) |

---

## 5. Implementation Guide

| # | Item | Files |
|---|------|-------|
| 1 | br287 리포트의 Fix/Verification 채우기 | bug_reports/active/br/br287-*.md |
| 2 | br289 리포트의 Fix/Verification 채우기 | bug_reports/active/br/br289-*.md |
| 3 | 둘 다 `git mv` → completed/BR/*.completed.md | bug_reports/ |
| 4 | `## [Unreleased]` 아래 CHANGELOG 항목 | CHANGELOG.md |
| 5 | 스킬 파이어로 Report + 아카이브 PDCA 문서 | docs/0{1,2,4}-* |
| 6 | 커밋, jest 배터리 + eslint 실행 | — |
| 7 | `git push origin fix/patches_102026` | — |

### 5.1 Session Guide

단일 세션 — 설계 전체가 하나의 모듈(종결 워크플로), `--scope` 분할 불필요.

---

## 6. Test Plan

- jest 전체 배터리: 0 FAIL 예상 (br040-041 사이클 기준 5358 TC / 0 FAIL).
- 저장소 전체 eslint: 0 오류.
- 수동 프로브(§2에 기록됨)가 수정별 런타임 검증을 구성합니다.

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| 배터리에 기준선 대비 새 실패 | 푸시 전 트리아지, 실패 세트 → testing-handoff 프로토콜대로 완전 수정 디스패치 1회 |
| 푸시 거부 (non-fast-forward) | 운영자에게 표면화, 강제 푸시 금지 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-14 | 초안 | Claude Code 루프 |
