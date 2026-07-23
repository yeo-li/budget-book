# v7 랜딩 실험 로그와 대시보드 연결 방법

## 1. 수집 대상

v7은 다음 실험 지표와 유입 경로를 계산하기 위한 최소 데이터만 수집한다.

| 지표 | 이벤트/시트 | 계산 방법 |
| --- | --- | --- |
| 고유 방문자 | `events.event_name = page_viewed` | 고유 `visitor_id` 수 |
| CTA 클릭률 | `events.event_name = cta_clicked` | CTA 클릭 고유 방문자 / 고유 방문자 |
| 베타 신청률 | `applications` | 신청 고유 방문자 / 고유 방문자 |
| 친구와 함께 사용할 의향 | `applications.friend_intent = yes` | `yes` 응답 신청자 수 / 전체 신청자 수 |
| 유입 비중 | `events.traffic_source` | 경로별 고유 방문자 / 전체 고유 방문자 |
| 경로별 신청률 | `events`, `applications.traffic_source` | 경로별 신청자 / 경로별 고유 방문자 |

이메일은 베타 안내를 위해 `applications` 시트에만 저장한다. `events` 시트에는 이메일을 저장하지 않는다.
선택 의견은 `applications.feedback`에만 저장하며, `events` 시트에는 의견 내용 대신 작성 여부만 기록한다.
`applications` 시트는 현재 폼에서 사용하는 13개 열만 유지한다: 신청 시각, 신청 ID, 방문자 ID,
세션 ID, 이메일, 친구 의향, 동의, 앱 버전, 유입처, 유입 매체, 캠페인, 이전 도메인, 추가 의견.
사진 데모는 파일명이나 이미지 자체를 전송하지 않고 `photo_demo_uploaded` 이벤트에 이미지 MIME 타입만 기록한다.
이모지 반응은 `emoji_reaction_clicked` 이벤트로 반응 종류, 위치, 선택 여부만 기록한다.
공유 방식 선택은 `share_mode_selected` 이벤트에 선택한 모드만 기록한다.
채팅 데모는 메시지 내용을 전송하지 않고 `chat_demo_sent` 이벤트에 글자 수만 기록한다.

## 2. Google Sheet와 Apps Script 준비

1. 로그를 받을 Google Sheet를 만든다.
2. 시트에서 **확장 프로그램 > Apps Script**를 연다.
3. 기본 코드를 지우고 `v7/google-apps-script.gs`의 내용을 붙여넣는다.
4. Apps Script 편집기에서 `setup` 함수를 한 번 실행하고 권한을 승인한다.
5. Google Sheet에 `events`, `applications`, `dashboard` 시트가 생성됐는지 확인한다.

`setup()`을 다시 실행하면 원본 로그는 유지하면서 `dashboard` 시트만 최신 구조로 다시 만든다.

Apps Script 편집기의 실행 버튼을 사용하기 어렵다면 Google Sheet를 새로고침한 뒤 상단의
**지출 모임 실험 > 로그 시트 설정**을 선택한다. 설정 후 **지출 모임 실험 > 설정 상태 확인**에서
세 시트와 헤더가 정상인지 확인할 수 있다.

## 3. 웹 앱 배포

1. Apps Script에서 **배포 > 새 배포 > 웹 앱**을 선택한다.
2. 실행 사용자는 **나**로 설정한다.
3. 액세스 권한은 랜딩 페이지에서 로그인 없이 보낼 수 있도록 **모든 사용자**로 설정한다.
4. 배포 후 끝이 `/exec`인 웹 앱 URL을 복사한다.
5. 해당 URL을 브라우저에서 열어 `{"ok":true,"appVersion":"v7"}`가 표시되는지 확인한다.

## 4. v7 페이지 연결

`v7/index.html`의 아래 상수에 `/exec` URL을 넣는다.

```js
const EXPERIMENT_ENDPOINT="https://script.google.com/macros/s/배포_ID/exec";
```

`EXPERIMENT_ENDPOINT`가 비어 있으면 페이지는 정상 동작하지만, 이벤트와 신청 내용은 현재 브라우저의 `localStorage`에만 저장된다.

## 5. 유입 링크 만들기

페이지 URL에 UTM 파라미터를 붙이면 `dashboard` 시트에서 캠페인별 유입을 비교할 수 있다.

```text
index.html?utm_source=instagram&utm_medium=social&utm_campaign=beta_v7
index.html?utm_source=kakao&utm_medium=message&utm_campaign=friend_invite
index.html?utm_source=community&utm_medium=post&utm_campaign=budget_goal
```

- `utm_source`: 유입처. 예: `instagram`, `kakao`, `community`
- `utm_medium`: 매체 유형. 예: `social`, `message`, `post`
- `utm_campaign`: 캠페인 이름. 예: `beta_v7`

UTM이 없으면 외부 유입 도메인을 사용하고, 외부 도메인도 없으면 `direct`로 집계한다.

## 6. 대시보드에서 보는 항목

`dashboard` 시트는 로그가 쌓이는 즉시 다음 항목을 자동 계산한다.

- 고유 방문자와 CTA 클릭 고유 방문자
- CTA 클릭률과 통과 기준 30%
- 베타 신청률과 통과 기준 20%
- 친구와 함께 사용할 의향률과 통과 기준 60%
- 세 기준을 모두 반영한 현재 실험 결과
- 유입 경로별 고유 방문자, 신청자, 신청률, 유입 비중
- 유입 경로와 선택 의견을 포함한 최근 베타 신청 20건

대시보드 수식과 서식이 깨졌다면 Apps Script에서 `setup()`을 다시 실행한다. `events`와 `applications`의 기존 행은 삭제되지 않는다.

## 7. 배포 전 확인

1. 테스트 브라우저에서 `v7/index.html`을 연다.
2. CTA 버튼을 클릭한다.
3. 사진을 바꾸고 공유 방식을 선택한 뒤 이모지 반응과 채팅 데모를 사용한다.
4. 베타 신청 폼을 제출한다.
5. `events` 시트에 `page_viewed`, `cta_clicked`, `photo_demo_uploaded`, `share_mode_selected`, `emoji_reaction_clicked`, `chat_demo_sent`, `beta_form_submitted`가 기록됐는지 확인한다.
6. `applications` 시트에 신청 행이 기록됐는지 확인한다.
7. `dashboard` 시트에서 핵심 지표, 유입 경로, 최근 신청이 갱신되는지 확인한다.
8. Apps Script를 수정했다면 반드시 **배포 관리 > 수정 > 새 버전**으로 다시 배포한다.

## 8. 운영 시 주의

- 신청 이메일이 들어 있으므로 Google Sheet 공유 권한은 운영자에게만 부여한다.
- Apps Script 웹 앱 URL은 쓰기 전용 수집 주소로 간주하고 공개 저장소에 직접 커밋하지 않는다.
- 테스트 데이터는 지표에서 제외할 별도 UTM 값(예: `utm_source=internal_test`)을 사용하면 구분하기 쉽다.
