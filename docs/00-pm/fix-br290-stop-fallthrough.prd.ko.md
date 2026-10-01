# fix-br290-stop-fallthrough — 문제 PRD

**날짜:** 2026-10-01 | **유형:** 버그 수정 사이클 | **BR:** br290

## 문제

PDCA 사이클이 완료되고 아카이브 시 기능이 레지스트리에서 제거된 뒤에도 `session.lastSkillFeature`는 죽은 기능 이름을 가리킨다. Stop 핸들러 바인딩은 죽은 기록을 "기록 없음"과 동일하게 취급해 `primaryFeature`(문서 0개인 프로브 픽스처 ZfeatA, phase=plan)로 후퇴한다. 그 결과 완료 후 모든 Stop에서 픽스처의 페이즈 전환("Plan document has been generated → /pdca design ZfeatA 실행")이 재발화되어 턴을 막고 유령 사이클을 지어내도록 압박한다. 2026-10-01 9회 연속 Stop 차단 관찰.

## 증거

- `session.lastSkillFeature = "fix-br288-terminal-guard"` (사망 — 오전 아카이브로 레지스트리에서 제거됨)
- `primaryFeature = "ZfeatA"` (픽스처: phase=plan, docs=0, 2026-09-26 br015 프로브 중 생성)
- 바인딩 식 (scripts/unified-stop.js:326-335): `(recorded && features[recorded] && recorded) || primaryFeature || null`

## 성공 기준

1. 발화 시점 기능이 기록됐으나 죽은 경우 Stop은 아무것도 바인딩하지 않는다 — 전환 블록 없음, 레지스트리 무변경.
2. 살아있는 기록 기능은 여전히 tier-0 바인딩 (br015b 회귀 없음).
3. 기록이 아예 없으면 여전히 primaryFeature로 후퇴 (br006 동작 유지).
4. 변이 검증 회귀 테스트, 전체 jest 배터리 그린.

## 범위 외

- 라이브 레지스트리의 문서 없는 유령 픽스처 제거 (정당한 제거 경로 없음; br290에서 운영자에게 보고).
- br287의 all-archived 승인 재발 메커니즘 (별도 보고서).
