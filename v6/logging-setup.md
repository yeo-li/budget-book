# v6 로그 수집 연결 방법

## 1. Google Sheet와 Apps Script 준비

1. 로그를 받을 새 Google Sheet를 만든다.
2. 시트에서 **확장 프로그램 > Apps Script**를 연다.
3. 기본 코드를 지우고 `google-apps-script.gs`의 내용을 붙여넣는다.
4. Apps Script 편집기에서 `setup` 함수를 한 번 실행하고 권한을 승인한다.
5. Google Sheet에 `participants`, `events` 시트와 헤더가 생성됐는지 확인한다.

## 2. 웹 앱 배포

1. Apps Script에서 **배포 > 새 배포 > 웹 앱**을 선택한다.
2. 실행 사용자는 **나**로 설정한다.
3. 액세스 권한은 테스트 페이지에서 로그인 없이 보낼 수 있도록 **모든 사용자**로 설정한다.
4. 배포 후 끝이 `/exec`인 웹 앱 URL을 복사한다.
5. 해당 URL을 브라우저에서 열어 `{"ok":true,"appVersion":"v6"}`가 표시되는지 확인한다.

## 3. v6 연결

`v6/index.html`의 아래 상수에 `/exec` URL을 넣는다.

```js
const LOG_ENDPOINT='https://script.google.com/macros/s/배포_ID/exec';
```

`LOG_ENDPOINT`가 비어 있으면 앱은 정상 동작하고 이벤트는 브라우저의 `budget-book-event-outbox`에만 쌓인다.

## 4. 배포 전 확인

1. 테스트용 브라우저에서 닉네임과 예산을 입력한다.
2. `participants` 시트에 한 행이 생성됐는지 확인한다.
3. 튜토리얼을 완료하거나 건너뛴다.
4. 실제 거래를 저장하고 하루를 마감한다.
5. `events` 시트에서 같은 `participant_id`, `session_id`, `challenge_id`로 이벤트가 연결되는지 확인한다.
6. Apps Script를 수정했다면 반드시 **배포 관리 > 수정 > 새 버전**으로 다시 배포한다.

웹 앱 URL은 쓰기 권한을 가진 공개 수집 주소다. 사용자 화면이나 공개 문서에 별도로 노출하지 않고, 수집기는 허용된 v6 이벤트와 속성만 저장한다.
