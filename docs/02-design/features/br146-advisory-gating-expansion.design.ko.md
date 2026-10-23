# br146-advisory-gating-expansion — 설계 (KO)

**버전:** 1.0 · **날짜:** 2026-10-19 · **기능:** br146-advisory-gating-expansion

> 영어 원본: [br146-advisory-gating-expansion.design.en.md](br146-advisory-gating-expansion.design.en.md)
> 두 문서는 내용이 동일하며 언어만 다릅니다.

## 1. 개요

br144에서 도입한 config 게이트 메커니즘(`bkit.config.json hooks.advisory`,
없음/false = 침묵, strict boolean true = 주입)을 나머지 모든 어드바이저리 전용
컨텍스트 주입기로 확장한다. 대상 목록은
`bug_reports/active/br/br146-stale-hook-context-replayed-after-fix.md`
(Expanded Scope 섹션)의 센서스를 따른다.

## 2. 추가되는 게이트 (모두 기본 false = 침묵)

| 키 | 이미터 | true일 때 주입되는 것 |
|---|---|---|
| `hooks.advisory.dashboard` | `hooks/session-start.js` | PDCA 대시보드 섹션(진행 바 / 워크플로 맵 / 임팩트 뷰 / 에이전트 패널 / 컨트롤 패널). `ui.dashboard.enabled`는 계속 적용 |
| `hooks.advisory.onboarding` | `hooks/startup/session-context.js` | 온보딩 텍스트 섹션 |
| `hooks.advisory.cwdChangeNote` | `scripts/cwd-changed-handler.js` | "Project changed: …" 노트 |
| `hooks.advisory.pdcaStatusEcho` | `scripts/notification-handler.js` | idle 알림의 PDCA/Sprint 보강 |
| `hooks.advisory.sizeClassifier` | `scripts/pre-write.js` runPdcaGuidance | "Minor change (N lines). PDCA optional." 계열 안내 |
| `hooks.advisory.scopeLimitAdvisory` | `scripts/pre-write.js` runScopeLimiter | 소프트 `NOT_IN_SCOPE`/`PATH_TRAVERSAL` "Scope limit: …" 텍스트 |

## 3. 게이트하지 않음 (기능적)

- `runScopeLimiter`의 HARD_DENY_RULES 분기(DENIED_PATH / SYMLINK_ESCAPE /
  NULL_BYTE) — 보안 결정이므로 게이트의 영향을 받지 않는다.
- DENY 결정에 실려 가는 ENH-264 alternatives(`unified-bash-pre.js`).
- PDCA 상태 복원(`post-compaction.js`, `context-compaction.js`),
  자동 진행(`pdca-task-completed.js`), 도구 실패 복구 안내, 세션 시작
  헤더, preflight 경고, permission-request 결정 출력(어드바이저리가 아닌 기능).
- `ccVersionAdvisory` 섹션: 이미 기본 침묵 — br144가
  `hooks.advisory.forkModeAdvisory`(기본 false)로 게이트함. 코드 변경 불필요.
- 서브에이전트 start/stop 핸들러: 이미 br144의 `ackMessages`로 게이트됨.

## 4. 구현 노트

- br144와 동일한 관용구: 지연 `require('../lib/core/config')` +
  `getConfig('hooks.advisory.<key>') !== true` → 침묵 종료 / 빈 반환.
- `bkit.config.json` `hooks.advisory`에 6개 키를 모두 `false`로 추가.
- 버전 bump 없음(유지보수자 권한). CHANGELOG 항목은 선택.

## 5. 검증

1. 편집한 JS 5개 파일 `node --check`, config JSON 파싱.
2. br144 계약 스위트(`node --test test/contract/br144-advisory-gating.test.js`) — 그린.
3. 라이브 스모크: 게이트 상태의 `cwd-changed-handler.js` → 빈 출력, exit 0.
4. 플러그인 캐시 동기화(`tools/brfix-wave-probes/sync_plugin_cache.sh --apply`)
   로 다음 세션 시작 시 라이브 훅이 게이트를 적용하도록 함.
