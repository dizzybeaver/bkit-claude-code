# PRD — fix-br015-stop-dispatch (한국어)

**날짜:** 2026-09-27
**출처:** br015 (높음) — br009/br011/br014 Stop-advance 계열의 근본 원인
**사이클 형태:** 버그 수정 PDCA (work.md §45.9): pm→plan→design→do→report→archive

## 문제

`scripts/unified-stop.js:117-119`는 `getActiveSkill()`을 통해 `pdcaStatus.session.lastSkill`을 읽어 Stop 이벤트를 스킬별 핸들러로 라우팅하지만, `session.lastSkill`을 쓰는 코드가 어디에도 없습니다 (검증 완료: scripts/ + lib/ 전체 grep → 유일한 읽기 지점; 18회 pdca 발화 후에도 세션 블록에 lastSkill 없음). fork-mode 세션에서는 다른 경로가 `pdca-skill-stop.js`로 디스패치하지 않으므로 핸들러 내부의 모든 advance(report→completed, envelope derivation)가 도달 불가능한 코드입니다.

## 성공 기준

1. pdca 스킬 발화 시 `lib/orchestrator/skill-invocation-effects.js`의 기존 `lastActivity` 쓰기와 함께 `session.lastSkill`(+대칭 `session.lastAgent`)을 레지스트리에 기록합니다.
2. `getActiveSkill()`이 플러그인 접두사 이름(`'bkit:pdca'` → `'pdca'`)을 정규화하여 SKILL_HANDLERS 키와 일치시킵니다.
3. 회귀 테스트가 전체 체인을 증명합니다: 발화 → 레지스트리 `session.lastSkill` 설정 → unified-stop이 pdca Stop 핸들러에 도달.
4. 전체 배터리 통과; br015 종결 및 아카이브.

## 범위

- `lib/orchestrator/skill-invocation-effects.js` — 쓰기 추가
- `scripts/unified-stop.js` — 읽기 시 정규화 추가
- `test-scripts/unit/` — 신규 회귀 스위트
- 범위 외: 핸들러 내부 로직 (br005a/br014에서 이미 수정됨)
