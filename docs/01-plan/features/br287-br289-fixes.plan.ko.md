# br287-br289-fixes 계획 문서

> **요약**: 이미 커밋된 두 버그 수정(br287 PDCA-COMPLETE 무한 재발 루프, br289 eslint jest 전역 누락)을 검증·종결하고, CHANGELOG를 갱신하며, main 병합 없이 GitHub에 브랜치를 전달합니다.
>
> **Project**: bkit-claude-code
> **Author**: dizzybeaver (Claude Code loop)
> **Date**: 2026-10-14
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **문제** | br287: 이미 아카이브(터미널)된 기능에 대해 PDCA skill-stop 훅이 이후 모든 Stop에서 PDCA-COMPLETE를 재발행하여 턴 종료를 무기한 막았습니다. br289: eslint.config.js에 jest 전역이 선언되지 않아 test-scripts의 모든 describe/it/expect가 no-undef 오류(210건)였습니다. |
| **해법** | 두 수정은 이미 커밋 44060a9에 반영되어 있습니다(br287: scripts/pdca-skill-stop.js의 터미널 기능 조기 종료, br289: eslint.config.js의 jest 전역 오버라이드 블록). 이 사이클은 라이브 시스템에서 두 수정을 검증하고, 리포트를 종결하며, 전달 워크플로를 완료합니다. |
| **기능/UX 효과** | 사이클 완료 후 Stop은 조용히 승인되고, test-scripts 린트는 0 오류를 보고합니다. 두 수정 외 런타임 동작 변화는 없습니다. |
| **핵심 가치** | 루프 위생: 완료된 사이클이 운영자의 Stop을 가로채지 않고, 린트 출력이 실행 가능합니다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 수정은 커밋됐지만 종결되지 않은 미해결 버그 리포트 2건 — 리포트, CHANGELOG, 전달 워크플로가 남아 있습니다. |
| **WHO** | bkit 플러그인 유지보수자와 CI (contract-check가 eslint 실행, 운영자 Stop 흐름이 unified-stop/skill-stop 훅 실행). |
| **RISK** | 현재 코드 재검증 없이 리포트 종결(검증 드리프트), 잘못된 원격/브랜치 푸시, main으로의 우발적 병합. |
| **SUCCESS** | 두 리포트가 .completed 마커와 함께 completed/로 이동, CHANGELOG 갱신, 전체 테스트 통과, fix/patches_102026 브랜치가 origin에 푸시, PR 없음, main 병합 없음. |
| **SCOPE** | 두 수정 검증 → 리포트 2건 종결 → CHANGELOG → 커밋 → 테스트/워크플로 실행 → origin에 브랜치 푸시. |

---

## 1. Overview

### 1.1 목적

`bug_reports/active/br/`의 미해결 버그 리포트 2건(br287, br289)을 해결하고 운영자의 전달 워크플로(로컬 커밋, 전체 테스트, GitHub 브랜치 푸시)를 완료합니다. 풀 리퀘스트와 main/upstream main 병합은 명시적으로 금지됩니다.

### 1.2 배경

커밋 44060a9("fix(pdca): br287/br289/br292 — terminal-stop silence, eslint jest globals, config self-lint")가 두 코드 수정을 반영했지만, 리포트는 종결되지 않았고 CHANGELOG에 항목이 없습니다. /loop 지시가 전체 종결 워크플로를 요구합니다.

### 1.3 Related Documents

- br287: `bug_reports/active/br/br287-unified-stop-stale-complete-loop.md`
- br289: `bug_reports/active/br/br289-eslint-jest-globals-missing.md`
- CHANGELOG.md, CONTRIBUTING.md, `.github/workflows/`

---

## 2. Scope

### 2.1 범위 내

- [ ] 현재 코드에서 br287 수정 재검증 (터미널 기능 술어 vs 라이브 레지스트리)
- [ ] 현재 코드에서 br289 수정 재검증 (test-scripts eslint 실행)
- [ ] 두 리포트를 `.completed.md` 마커와 함께 `bug_reports/completed/BR/`로 이동, Fix/Verification 필드 채우기
- [ ] 두 수정에 대한 CHANGELOG 항목 추가
- [ ] fix/patches_102026에 로컬 커밋
- [ ] 전체 테스트 실행 (jest 배터리 + eslint)
- [ ] fix/patches_102026을 origin(GitHub)에 푸시

### 2.2 범위 외

- 풀 리퀘스트 또는 main/upstream main 병합 일체 (운영자 지시)
- br292 (44060a9에서 이미 종결)
- `ZfeatA` 정크 primaryFeature 행 (기록됨, 별도 결정)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | br287 수정이 현재 코드에서 신선한 증거로 검증됨 | High | 완료 (이번 세션 검증) |
| FR-02 | br289 수정이 신선한 eslint 실행으로 검증됨 (0 오류) | High | 완료 (이번 세션 검증) |
| FR-03 | bug-reporting.md 규정대로 리포트 종결 (11 필드, .completed 마커) | High | 대기 |
| FR-04 | CHANGELOG 항목 추가 (프로젝트 규칙에 따라 미출시 라벨 버전 헤딩) | Medium | 대기 |
| FR-05 | origin에 브랜치 푸시, PR 없음, main 병합 없음 | High | 대기 |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 검증 | 모든 주장에 신선한 명령 출력 동반 | 트랜스크립트 증거 |
| Git 위생 | 커밋 후 깨끗한 트리, co-author 트레일러 없음 | git status / git log |

---

## 4. Success Criteria

### 4.1 완료 정의

- [ ] 두 리포트가 .completed 마커와 실제 검증 증거로 completed/에 위치
- [ ] CHANGELOG 갱신
- [ ] 전체 테스트 배터리 통과 (0 FAIL)
- [ ] eslint 클린 (0 오류)
- [ ] fix/patches_102026 origin 푸시 완료

### 4.2 품질 기준

- [ ] 레지스트리 수동 편집 없음 (모든 페이즈 쓰기는 스킬 파이어 경유)
- [ ] 린트 억제 도입 없음

---

## 5. Risks and Mitigation

| 위험 | 영향 | 가능성 | 완화 |
|------|--------|------------|------------|
| 검증 드리프트 (이전 세션에만 검증된 수정) | High | Medium | 이번 세션에서 재검증 (완료: 술어 프로브 + eslint 실행) |
| main으로의 우발적 푸시 또는 PR 생성 | High | Low | 명시적으로 `git push origin fix/patches_102026`만 실행, `gh pr create` 금지 |
| 레지스트리 게이트가 아카이브 차단 | Medium | Low | 아카이브 CLI 드라이런 → 적용 순서 준수, 오류 표면화, 우회 금지 |

---

## 6. Impact Analysis

### 6.1 변경 자원

| Resource | Type | Change Description |
|----------|------|--------------------|
| bug_reports (2개 파일) | 문서 | active → completed 이동 |
| CHANGELOG.md | 문서 | 신규 항목 |
| PDCA 문서 (4개) | 문서 | 이 사이클의 plan/design/report + 아카이브 |

### 6.2 현재 소비자

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| scripts/pdca-skill-stop.js | READ (훅 런타임) | 활성 스킬이 있는 모든 Stop | 없음 — 이미 커밋·라이브 |
| eslint.config.js | READ (CI + 로컬 린트) | contract-check 워크플로 | 없음 — 이미 커밋 |

### 6.3 검증

- [x] 수정 코드가 HEAD(44060a9)에 있고 이번 세션에서 신선하게 검증됨
- [x] eslint: test-scripts에서 0 오류
- [x] 터미널 술어: 아카이브된 레지스트리 16개 항목 모두 정확히 터미널 판정

---

## 7. Architecture Considerations

해당 없음 — 새 코드 없음. 두 수정의 아키텍처는 커밋 44060a9와 scripts/pdca-skill-stop.js:452, eslint.config.js:153의 인라인 주석에 문서화되어 있습니다.

---

## 8. Convention Prerequisites

- [x] CHANGELOG.md 존재 — 미출시 스타일 헤딩 아래 항목 추가 (버전 번호는 유지보수자 소관, 프로젝트 CLAUDE.md 준수)
- [x] CONTRIBUTING.md 읽음 — 커밋 메시지 규약 준수
- [x] 이중언어 문서 규칙 — 이 계획은 .en.md + .ko.md로 발행

---

## 9. Next Steps

1. [ ] 설계 문서
2. [ ] Do: 리포트 종결 + CHANGELOG
3. [ ] Report → 아카이브 → 커밋 → 테스트 → 푸시

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-14 | 초안 | Claude Code 루프 |
