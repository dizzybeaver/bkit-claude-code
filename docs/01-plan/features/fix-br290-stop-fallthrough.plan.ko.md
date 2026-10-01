# fix-br290-stop-fallthrough — 계획

**날짜:** 2026-10-01 | **유형:** 버그 수정 사이클 (pm → plan → design → do → report → archive) | **BR:** br290

## 요약 (Executive Summary)

| 관점 | 내용 |
|---|---|
| 문제 | 발화 시점에 기록됐으나 더 이상 레지스트리에 없는 기능이 Stop 핸들러 바인딩에서 `primaryFeature`(문서 없는 프로브 픽스처 ZfeatA)로 후퇴해, 완료 후 모든 Stop에서 유령 페이즈 전환이 재발화됨. |
| 해법 | 죽은 기록 가드: `session.lastSkillFeature`가 설정됐지만 `features`에 없으면 아무것도 바인딩하지 않음(완료 후 Stop). `primaryFeature` 후퇴는 기록이 아예 없을 때만. |
| 기능/UX 효과 | 사이클 완료 후 멈출 수 없는 "다음 페이즈 진행" 블록 소멸; 턴이 깨끗하게 끝남. |
| 핵심 가치 | 발화 시점 기록은 호출 단위 증거 — 그 죽음은 증거 부재가 아니라 완료의 증명이다. |

## 컨텍스트 앵커

| 앵커 | 내용 |
|---|---|
| WHY | 2026-10-01 9회 연속 Stop 차단; br288 사이클 아카이브 후 "execute /pdca design ZfeatA" 유령 압박. |
| WHO | PDCA 사이클을 완료·아카이브하는 모든 세션 (모든 미래 사이클이 해당). |
| RISK | 과잉 가드 시 살아있는 tier-0 바인딩(br015b)이나 br006 primary 후퇴가 깨질 위험. |
| SUCCESS | 죽은 기록 → 바인딩 없음·전환 블록 없음; 살아있는 기록 → tier-0 유지; 기록 없음 → primary 후퇴 유지. |
| SCOPE | scripts/unified-stop.js 바인딩 블록 + lib/pdca/stop-binding.js tier 0 + 회귀 테스트 1개. |

## 요구사항

- R1: `resolveStopFeature`과 unified-stop.js 인라인 바인딩은 "기록 없음"과 "기록이 죽은 기능을 가리킴"을 구분해야 한다.
- R2: 죽은 기록 → '' 반환 / null 바인딩; 호출자는 페이즈 전환 지시문을 출력하지 않음.
- R3: 보존 동작: 살아있는 기록은 tier-0; 문서 경로 매치(tier 1); 해당 페이즈 단일 기능(tier 2); 기록이 전혀 없을 때만 primaryFeature 후퇴(tier 3).
- R4: 회귀 테스트, 변이 검증(가드 제거 → RED). 전체 jest 배터리 그린.

## 성공 기준

| # | 기준 | 증거 |
|---|---|---|
| SC1 | 죽은 기록 + 유령 primary → resolveStopFeature '' 반환 | 단위 테스트 단언 |
| SC2 | 살아있는 기록은 여전히 바인딩 | 기존 stop-feature-binding 스위트 그린 유지 |
| SC3 | 기록 없음 + primary 존재 → primary 반환 | 단위 테스트가 후퇴 유지 단언 |
| SC4 | 변이 RED / 복원 GREEN | 가드 stash → RED; pop → GREEN |

## 위험 및 완화

| 위험 | 완화 |
|---|---|
| 가드가 정상적인 세션 간 재개를 깨뜨림 (기능은 살아있지만 레지스트리 리로드) | 가드는 `features` 부재 기준 — 살아있는 기능은 존재하므로 영향 없음. |
| 호출 지점 분기 (바인딩 식 2곳) | 양쪽 모두 수정; 인라인 블록이 임포트 가능하면 stop-binding의 단일 헬퍼로. |

## 다음 단계

/design → /do (가드 + 테스트) → /report → /archive
