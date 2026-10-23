# startup-sections-advisory-gating — 설계 (KO)

**버전:** 1.0 · **날짜:** 2026-10-19 · **기능:** startup-sections-advisory-gating

> 영어 원본: [startup-sections-advisory-gating.design.en.md](startup-sections-advisory-gating.design.en.md)
> 두 문서는 내용이 동일하며 언어만 다릅니다.

## 1. 개요

운영자 결정(2026-10-19, br146 후속): SessionStart 컨텍스트 주입의 나머지
섹션들(`hooks/startup/session-context.js`의 `_ciSections` 스택)을
`bkit.config.json hooks.advisory`로 게이트한다. 기본 false(침묵),
strict boolean true = 주입. br144/br146과 동일한 메커니즘·관용구.

## 2. 추가되는 게이트 (모두 기본 false = 침묵)

| 키 | 섹션 빌더 |
|---|---|
| `hooks.advisory.agentTeams` | `buildAgentTeamsContext` (CTO-Led Agent Teams + 안정성 노트) |
| `hooks.advisory.outputStyles` | `buildOutputStylesAndMemoryContext` (출력 스타일 + 메모리 시스템) |
| `hooks.advisory.bkendMcp` | `buildBkendMcpContext` |
| `hooks.advisory.enterpriseBatch` | `buildEnterpriseBatchContext` |
| `hooks.advisory.pdcaCoreRules` | `buildPdcaCoreRules` |
| `hooks.advisory.automation` | `buildAutomationContext` (트리거 테이블) |
| `hooks.advisory.versionEnhancements` | `buildVersionEnhancementsContext` |

`ui.contextInjection.enabled/sections`(ENH-238)은 그 위에서 계속 적용된다:
섹션은 ENH-238 게이트와 어드바이저리 키가 모두 true일 때만 주입된다.

이미 게이트됨(변경 없음): `ccVersionAdvisory`(`forkModeAdvisory` 경유),
`onboarding`(br146).

게이트하지 않음: 한 줄 헤더(기능명 + 버전) — 최소 기능 세션 마커,
및 모든 기능적 이미터(PDCA 상태 복원, 자동 진행, preflight 경고).

## 3. 구현

`hooks/startup/session-context.js` `buildCoreInjectionContext()`: 나머지
각 섹션 줄에 `&& getConfig('hooks.advisory.<key>') === true`를 추가
(getConfig는 br146 편집에서 이미 임포트됨). `bkit.config.json`
`hooks.advisory`에 7개 키를 모두 `false`로 추가.

## 4. 검증

1. 편집 파일 `node --check`, config JSON 파싱.
2. 스모크: 라이브 캐시 `hooks/session-start.js` 실행 — 헤더는 있고
   7개 섹션은 기본 config에서 없음.
3. br144 게이트 계약 스위트 그린 유지.
4. `tools/brfix-wave-probes/sync_plugin_cache.sh --apply`로 동기화.
