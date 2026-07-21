# Budget Book v6 사용자 행동 로그 수집 스펙

## 1. 목적

이 로그는 사용자의 금융 상태를 분석하기 위한 것이 아니다. v6 사용자 테스트에서 다음 질문에 답하기 위한 최소 행동 데이터만 수집한다.

- 참여자가 닉네임과 5일 예산을 설정하는가?
- 튜토리얼을 마치고 실제 챌린지를 시작하는가?
- 실제 거래를 기록하고 다시 수정하거나 삭제하는가?
- 기록 화면과 미마감일 복구 기능을 사용하는가?
- 여러 날에 걸쳐 앱으로 돌아오는가?
- 하루 마감과 5일 챌린지를 완료하는가?
- 어느 단계에서 이탈하거나 챌린지를 다시 시작하는가?

닉네임 외의 직접 식별 정보와 거래의 상세 내용은 수집하지 않는다.

## 2. 식별자와 저장 위치

### 2.1 식별자

| 필드 | 의미 | 수명 |
| --- | --- | --- |
| `participantId` | 한 명의 테스트 참여자 | 전체 데이터 초기화 후에도 유지 |
| `anonymousId` | 현재 브라우저·기기 | 전체 데이터 초기화 후에도 유지 |
| `sessionId` | 한 차례의 앱 방문 | 30분 비활성 또는 오전 5시 날짜 경계에서 갱신 |
| `challengeId` | 한 번의 5일 챌린지 | 실제 챌린지 시작·재시작마다 갱신 |
| `eventId` | 한 번 발생한 이벤트 | 이벤트마다 새로 생성 |

모든 식별자는 추측할 수 없는 임의 UUID를 사용한다. 닉네임을 식별자로 사용하지 않는다.

### 2.2 브라우저 저장소

- `localStorage["budget-book-participant"]`: `participantId`, `anonymousId`, 닉네임, 최초 등록 시각
- `sessionStorage["budget-book-session-id"]`: `sessionId`, 마지막 활동 시각, 논리적 날짜
- `localStorage["budget-book-event-outbox"]`: 아직 전송되지 않은 이벤트
- `localStorage["savepoint_v6"]`: 거래·예산·마감·현재 `challengeId`를 포함한 앱 상태

앱의 전체 데이터 초기화는 `savepoint_v6`만 초기화한다. 참여자 정보와 미전송 이벤트는 삭제하지 않는다. 초기화 후 닉네임은 유지하며, 새 실제 챌린지를 시작할 때 새 `challengeId`를 발급한다.

## 3. 참여자 등록과 닉네임

- 앞뒤 공백 제거 후 2~20자만 허용한다.
- 제어문자를 제거한다.
- 이메일 주소 또는 전화번호 형태는 허용하지 않는다.
- 중복 닉네임을 허용한다.
- `participant_registered`는 참여자당 한 번만 기록한다.
- 닉네임은 `participants` 시트와 `participant_registered`에만 저장하며 일반 이벤트에는 반복하지 않는다.

## 4. 세션

다음 중 하나를 만족하면 새 `sessionId`를 발급하고 해당 세션의 `page_viewed`를 한 번 기록한다.

- 저장된 세션이 없음
- 마지막 활동 후 30분 이상 지남
- 앱이 사용하는 오전 5시 논리적 날짜 경계를 넘김

짧게 다른 앱으로 이동했다 돌아오거나 같은 세션에서 새로고침한 경우에는 기존 세션을 유지한다.

## 5. 공통 이벤트 형식

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventName": "transaction_created",
  "occurredAt": "2026-07-21T03:12:45.123Z",
  "participantId": "uuid-or-null",
  "anonymousId": "uuid",
  "sessionId": "uuid",
  "challengeId": "uuid-or-null",
  "page": "home",
  "appVersion": "v6",
  "properties": {}
}
```

- `occurredAt`은 브라우저가 생성한 UTC ISO 8601 시각이다.
- 서버는 별도의 `serverTimestamp`를 기록한다.
- 분석 시각대는 Asia/Seoul을 사용한다.
- 참여자 등록 전 `page_viewed`의 `participantId`는 `null`일 수 있다.
- 챌린지 시작 전 이벤트의 `challengeId`는 `null`일 수 있다.
- `page` 허용값은 `onboarding`, `home`, `record`, `input`, `day_detail`, `pending_days`, `budget`, `settings`, `streak`이다.

## 6. 금액과 개인정보

정확한 거래·예산 금액은 전송하지 않고 다음 `amountRange`만 전송한다.

| 값 | 범위 |
| --- | --- |
| `under_10000` | 10,000원 미만 |
| `10000_30000` | 10,000원 이상 30,000원 미만 |
| `30000_50000` | 30,000원 이상 50,000원 미만 |
| `50000_100000` | 50,000원 이상 100,000원 미만 |
| `100000_300000` | 100,000원 이상 300,000원 미만 |
| `over_300000` | 300,000원 이상 |

다음 값은 전송하지 않는다.

- 실명, 이메일, 전화번호
- 계좌·카드번호
- 정확한 거래 금액이나 총자산
- 거래 내용, 상호명, 메모
- 이미지, OCR 원문, 붙여넣은 원문
- 오류 스택이나 사용자가 입력한 값이 포함될 수 있는 오류 메시지

v6의 현재 노출된 거래 입력 방식은 `manual`뿐이다. `text_paste`와 `screenshot_ocr`은 향후 기능을 위한 예약값이며 현재 이벤트를 발생시키지 않는다. `category`는 v6에 카테고리 입력 기능이 없으므로 수집하지 않는다.

## 7. 이벤트 목록

### 7.1 참여·세션·튜토리얼

| 이벤트 | 발생 시점 | 속성 |
| --- | --- | --- |
| `page_viewed` | 새 세션 시작 | `trigger`, `referrerType` |
| `participant_registered` | 유효한 닉네임을 처음 확정 | `nickname` |
| `tutorial_started` | 예산 설정 후 연습 진입 | `stepCount` |
| `tutorial_completed` | 연습을 끝내고 시작 버튼 선택 | `stepCount` |
| `tutorial_skipped` | 연습 건너뛰기 확인 | `skippedAtStep` |

튜토리얼 중의 연습 거래는 모든 `transaction_*`, `transaction_form_*` 이벤트에서 제외한다.

### 7.2 챌린지와 예산

| 이벤트 | 발생 시점 | 속성 |
| --- | --- | --- |
| `challenge_started` | 연습 완료·건너뛰기 후 실제 Day 1 시작, 또는 재시작 | `startDate`, `startType`, `budgetRange` |
| `challenge_restarted` | 진행 중인 챌린지를 초기화하기 직전 | `elapsedDays`, `completedDays`, `transactionDays` |
| `budget_created` | 참여자의 최초 5일 예산 확정 | `amountRange` |
| `budget_updated` | 이후 예산 변경 저장 | `previousAmountRange`, `amountRange`, `entryPoint` |
| `challenge_day_completed` | 하루 마감 | `challengeDay`, `transactionDate`, `result`, `transactionCount`, `entryPoint` |
| `challenge_day_reopened` | 오늘의 마감 취소 | `challengeDay`, `transactionDate`, `entryPoint` |
| `challenge_completed` | 5개 날짜를 모두 마감한 최초 시점 | `completedDays`, `successfulDays`, `transactionDays`, `totalTransactions` |
| `challenge_period_ended` | 5일 기간 종료 후 처음 앱이 활성화된 시점 | `completedDays`, `successfulDays`, `transactionDays`, `totalTransactions` |

`challenge_completed`는 한 `challengeId`에서 한 번만 기록한다. 이후 오늘 마감을 취소하더라도 기존 완료 이벤트는 삭제하지 않으며, 분석 시 뒤따르는 `challenge_day_reopened`를 함께 확인할 수 있다.

`challenge_started.startType` 허용값은 `tutorial_completed`, `tutorial_skipped`, `restart`, `migration`이다.

`challenge_period_ended`는 단순 기간 경과를 뜻하며 완주를 뜻하지 않는다. 클라이언트가 다시 활성화되어야 기간 종료를 관측할 수 있으므로, 이 이벤트가 없는 사용자를 자동 완주 또는 자동 이탈로 해석하지 않는다.

`entryPoint` 허용값은 기능에 따라 `home`, `nav_plus`, `record`, `day_detail`, `pending_days`, `settings` 중 하나를 사용한다.

### 7.3 거래와 탐색

| 이벤트 | 발생 시점 | 속성 |
| --- | --- | --- |
| `transaction_form_opened` | 실제 거래 입력·수정 폼 열림 | `mode`, `entryPoint` |
| `transaction_form_cancelled` | 저장하지 않고 입력·수정 폼 닫힘 | `mode`, `entryPoint`, `filledFields` |
| `transaction_created` | 실제 거래 저장 | 아래 거래 공통 속성 |
| `transaction_updated` | 기존 실제 거래 수정 저장 | 거래 공통 속성, `changedFields` |
| `transaction_deleted` | 실제 거래 삭제 확인 | 거래 공통 속성 |
| `record_tab_viewed` | 기록 탭으로 진입 | `transactionCount`, `completedDays` |
| `pending_days_viewed` | 확인 안 한 날 목록 열림 | `pendingDayCount`, `entryPoint` |

거래 공통 속성은 다음과 같다.

- `transactionId`: 앱이 생성한 임의 ID. 생성·수정·삭제 연결에만 사용
- `transactionType`: `expense` 또는 `income`
- `amountRange`
- `inputMethod`: 현재는 `manual`
- `budgetExcluded`: 예산에서 제외 여부
- `transactionDate`: `YYYY-MM-DD`
- `challengeDay`: 1~5, 챌린지 기간 밖이면 `null`
- `isInChallenge`: 챌린지 기간 포함 여부
- `entryPoint`

`filledFields`와 `changedFields`에는 필드 이름만 넣고 값은 넣지 않는다.

### 7.4 상태 변경과 오류

| 이벤트 | 발생 시점 | 속성 |
| --- | --- | --- |
| `app_data_reset` | 앱 데이터 초기화 직전 | `hadActiveChallenge`, `completedDays`, `transactionCount` |
| `data_imported` | 백업 데이터 복원 성공 | `hadChallenge`, `transactionCount` |
| `app_error_occurred` | 처리되지 않은 실행 오류 | `errorType`, `context` |

로그 전송 오류는 `app_error_occurred`를 다시 생성하지 않는다. 전송 대기열에서 재시도한다.

## 8. 전송과 유실 방지

1. 이벤트를 먼저 `budget-book-event-outbox`에 저장한다.
2. 저장 후 Google Apps Script 엔드포인트로 순차 전송한다.
3. 성공 응답을 받은 이벤트만 대기열에서 제거한다.
4. 실패한 이벤트는 앱 진입, 온라인 복귀, 새 이벤트 발생 시 다시 전송한다.
5. 대기열은 최대 500건으로 제한한다.
6. 14일이 지난 미전송 이벤트는 폐기한다.
7. 화면 종료 직전 전송에는 `keepalive`를 사용한다.
8. 로그 저장·전송 실패는 앱 기능이나 사용자 데이터 저장을 막지 않는다.
9. 서버가 허용 목록 위반으로 영구 거부한 이벤트는 폐기하고 다음 이벤트 전송을 계속한다.

재시도 과정에서 서버 저장은 성공했지만 응답이 유실될 수 있다. Apps Script는 `eventId`를 기준으로 중복 행을 저장하지 않는다.

일반 전송은 Apps Script의 JSON 성공 응답을 확인한다. Apps Script Content Service의 리디렉션 응답만 브라우저 보안 정책으로 읽지 못한 경우에는 동일한 이벤트를 `no-cors` 방식으로 한 번 보완 전송한다. 이때 생길 수 있는 중복도 `eventId`로 제거한다.

## 9. Google Sheets 구조

### 9.1 `participants`

| 열 |
| --- |
| `registered_at` |
| `participant_id` |
| `anonymous_id` |
| `nickname` |
| `app_version` |

`participantId`가 이미 있으면 같은 참여자를 다시 추가하지 않는다.

### 9.2 `events`

| 열 |
| --- |
| `server_timestamp` (서버 수신 시각, ISO 8601 문자열) |
| `occurred_at` |
| `event_id` |
| `event_name` |
| `participant_id` |
| `anonymous_id` |
| `session_id` |
| `challenge_id` |
| `page` |
| `app_version` |
| `properties_json` |

Apps Script는 공통 필수 필드, 이벤트 허용 목록, 이벤트별 속성 허용 목록을 검증한다. 알 수 없는 이벤트나 속성은 저장하지 않는다.

## 10. 핵심 분석 기준

- 참여 등록 전환율: `participant_registered` 고유 `anonymousId` / `page_viewed` 고유 `anonymousId`
- 실제 챌린지 시작률: 최초 `challenge_started` 참여자 / 등록 참여자
- 첫 실제 거래 전환율: `transaction_created` 참여자 / 실제 챌린지 시작 참여자
- 기록 화면 사용률: `record_tab_viewed` 참여자 / 실제 거래 생성 참여자
- 재방문율: 서로 다른 `sessionId`가 2개 이상인 참여자 / 실제 챌린지 시작 참여자
- 날짜별 활동 유지: `challengeDay`별 `transaction_created` 또는 최종 마감 상태가 존재하는 `challengeId`
- 챌린지 완주율: `challenge_completed` 고유 `challengeId` / `challenge_started` 고유 `challengeId`
- 기간 종료 후 복귀율: `challenge_period_ended` 고유 `challengeId` / 종료일이 도래한 `challenge_started` 고유 `challengeId`
- 주요 이탈 단계: 등록 → 예산 설정 → 튜토리얼 결과 → 실제 시작 → 첫 거래 → 기록 탭 → 첫 마감 → 재방문 → 완주

하루의 최종 마감 여부는 같은 `challengeId`와 `challengeDay`에서 가장 마지막에 발생한 `challenge_day_completed` 또는 `challenge_day_reopened`로 판단한다.

## 11. 구현 원칙

- 모든 로그 호출은 앱 상태 저장이 성공한 뒤 실행한다.
- 로그 코드 예외는 내부에서 삼키고 앱 흐름으로 전파하지 않는다.
- 이벤트 이름과 속성은 이 문서의 값만 사용한다.
- 이벤트를 추가하려면 프런트엔드와 Apps Script의 허용 목록을 함께 변경한다.
- 테스트 전 Apps Script 배포 URL을 v6의 `LOG_ENDPOINT`에 설정한다.
