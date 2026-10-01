# fix-br290-stop-fallthrough — 설계

**날짜:** 2026-10-01 | **선택:** 옵션 C (공유 헬퍼로 양쪽 바인딩 지점 가드) | **BR:** br290

## 컨텍스트 앵커

| 앵커 | 내용 |
|---|---|
| WHY | 죽은 발화 기록이 유령 primary로 후퇴 → 완료 후 멈출 수 없는 Stop 블록. |
| WHO | PDCA 사이클을 완료하는 모든 세션. |
| RISK | tier-0 살아있는 바인딩(br015b)이나 br006 primary 후퇴 과잉 가드. |
| SUCCESS | 죽은 기록 → 바인딩 없음; 살아있는 기록 → tier-0; 기록 없음 → primary 후퇴. |
| SCOPE | scripts/unified-stop.js + lib/pdca/stop-binding.js + 회귀 테스트 1개. |

## 아키텍처 옵션

| 옵션 | 형태 | 트레이드오프 |
|---|---|---|
| A — unified-stop.js만 인라인 수정 | 바인딩 식에 조건 하나 추가 | 최소 diff지만 resolveStopFeature에 동일 결함 잔존; 진실 원천 2곳. |
| B — 리졸버를 상태 머신으로 재작성 | 티어를 명시적 결정 테이블로 | 장기적으로 깨끗하지만 br015 검증 경로에 큰 변경. |
| **C — 공유 헬퍼로 양쪽 지점 (선택)** | `isDeadRecordedFeature(recorded, features)`를 stop-binding.js에서 export; unified-stop.js 인라인 바인딩과 resolveStopFeature tier 0을 가드 | 하나의 의미론, 양쪽 호출 지점; 최소 diff; 기존 br015b 테스트가 안전망. |

## 선택된 설계 (옵션 C)

### 새 헬퍼 — lib/pdca/stop-binding.js

```js
// 레지스트리에 ABSENT한 기능을 가리키는 발화 기록은 사이클이 완주됐음의 증명
// (아카이브가 기능을 삭제) — 아무것도 바인딩하지 않음. `recorded`가 비지 않은
// 문자열이면서 `features` 키에 없을 때만 true. 살아있는 기록과 기록 부재는 모두 false.
function isDeadRecordedFeature(recorded, features) {
  return Boolean(recorded) && !(features && Object.prototype.hasOwnProperty.call(features, recorded));
}
```

### 호출 지점 1 — lib/pdca/stop-binding.js `resolveStopFeature` tier 0

현재 tier 0은 기록 기능을 검증하고 미스 시 '' 반환. 변경: `isDeadRecordedFeature(recorded, features)`가 true면 tier 1-3으로 계속 가지 않고 "죽은 기록 — 바인딩 없음"을 뜻하는 구별된 센티널 `null` 반환. `null`을 받은 호출자는 바인딩 기반 동작을 모두 생략(페이즈 전환 지시문·완료 메시지 없음)하고 즉시 exit 0.

### 호출 지점 2 — scripts/unified-stop.js 인라인 바인딩 블록

```js
const recorded = session?.lastSkillFeature || '';
const recordedDead = isDeadRecordedFeature(recorded, pdcaStatus?.features);
const feature = recordedDead ? null
  : (recorded && pdcaStatus?.features?.[recorded] && recorded) || pdcaStatus?.primaryFeature || null;
if (feature === null && recordedDead) {
  process.stdout.write(JSON.stringify({ decision: 'approve', reason: 'br290: fire-time feature completed (archived out) — nothing to advance' }));
  process.exit(0);
}
```

unified-stop.js는 이미 stop-binding.js를 require(br015b 배선)하므로 헬퍼 임포트는 추가적.

## 데이터 흐름

```
Stop → unified-stop.js
  ├─ session.lastSkillFeature 존재 & 살아있음  → tier-0 바인딩 (변경 없음, br015b)
  ├─ session.lastSkillFeature 존재 & 죽음      → isDeadRecordedFeature → approve+exit (신규)
  ├─ 기록 없음, 문서 경로 매치                 → tier-1 (변경 없음)
  ├─ 기록 없음, 해당 페이즈 단일 기능          → tier-2 (변경 없음)
  └─ 기록 없음                                 → tier-3 primaryFeature (변경 없음, br006)
```

## 테스트 계획

- test-scripts/regression/br290-dead-record-no-rebind.test.js (jest 네이티브, br288 테스트처럼 spawn 격리):
  - T1: 죽은 기록 + 유령 primary 레지스트리 → 바인딩 없음 결정(approve, 지시문 텍스트 없음).
  - T2: 살아있는 기록 레지스트리 → 여전히 바인딩 (tier-0 유지).
  - T3: 기록 없음 + primary 존재 → primary 여전히 결정 (후퇴 유지).
- 변이 검증: 죽은 기록 분기 제거 → T1 RED; 복원 → GREEN.
- 전체 jest 배터리 그린 (기존 stop-feature-binding 스위트가 T2/T3 커버; 유지).

## 구현 가이드

1. `isDeadRecordedFeature`를 lib/pdca/stop-binding.js에 추가 (+export).
2. resolveStopFeature tier 0 가드 → 죽은 기록에 null 센티널 반환; JSDoc에 센티널 문서화.
3. unified-stop.js 인라인 바인딩 블록 가드; null+dead에서 early-approve.
4. 회귀 테스트(3케이스) 작성, 실행, 변이 검증.
5. 전체 jest 배터리 + 수정 파일 eslint.
