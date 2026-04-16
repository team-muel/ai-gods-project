# Google Workspace Export Setup

이 문서는 AI Gods의 Google Docs / Google Slides export 기능을 실제 운영 환경에서 붙이는 절차만 다룹니다.

현재 코드가 읽는 환경변수는 아래 3개입니다.

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_EXPORT_FOLDER_ID`

주의:

- 코드가 `GOOGLE_SERVICE_ACCOUNT_JSON` 전체를 읽는 구조는 아닙니다.
- 서비스 계정 JSON에서 `client_email`, `private_key`만 꺼내서 넣어야 합니다.
- 이 값은 브라우저가 아니라 서버 환경 변수에만 넣어야 합니다.
- 일반 Google 개인 Drive 폴더에 서비스 계정으로 Google Docs/Slides를 생성하면 소유권과 quota 문제로 실패할 수 있습니다.
- 가장 안정적인 방식은 Google Workspace Shared Drive를 쓰거나, 사용자 OAuth로 문서를 생성하는 것입니다.

## 1. Google Cloud 프로젝트 준비

1. Google Cloud Console에 들어갑니다.
2. 우측 상단 프로젝트 선택기에서 새 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
3. Billing이 꼭 필요한 구성은 아니지만, 조직 정책에 따라 API 사용 전에 Billing 연결이 필요할 수 있습니다.

권장 프로젝트 이름 예시:

- `ai-gods-exports`

## 2. 필요한 API 켜기

Google Cloud Console 경로:

1. `APIs & Services`
2. `Library`

아래 3개 API를 모두 Enable 합니다.

1. Google Docs API
2. Google Slides API
3. Google Drive API

셋 중 하나라도 빠지면 export가 중간에 실패합니다.

## 3. 서비스 계정 만들기

Google Cloud Console 경로:

1. `IAM & Admin`
2. `Service Accounts`
3. `Create Service Account`

입력 예시:

- Service account name: `ai-gods-exporter`
- Service account ID: 자동 생성값 사용
- Description: `AI Gods Google Docs and Slides exporter`

역할은 이 단계에서 굳이 크게 줄 필요 없습니다. Drive API 접근은 폴더 공유로 제어할 것이므로, 프로젝트 IAM에 과한 권한을 붙이지 않는 편이 안전합니다.

## 4. 키 발급

서비스 계정 상세 화면에서:

1. `Keys`
2. `Add Key`
3. `Create new key`
4. `JSON`
5. 다운로드

다운로드된 JSON에서 아래 2개 값을 사용합니다.

- `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` -> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

예시:

```json
{
  "client_email": "ai-gods-exporter@your-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

## 5. Google Drive 폴더 만들기

이 단계가 빠지면 문서가 생성돼도 본인 계정에서 바로 보이지 않거나, 폴더 이동이 실패할 수 있습니다.

Google Drive에서:

1. 새 폴더 생성
2. 이름 예시: `AI Gods Exports`
3. 폴더 열기
4. 주소창 URL에서 폴더 ID 복사

예:

- URL: `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp`
- 폴더 ID: `1AbCdEfGhIjKlMnOp`

이 값을 `GOOGLE_EXPORT_FOLDER_ID` 에 넣습니다.

## 6. 폴더를 서비스 계정과 공유

방금 만든 Drive 폴더에서:

1. `공유`
2. 서비스 계정 이메일 입력
3. 권한은 최소 `편집자`
4. 저장

공유 대상은 JSON의 `client_email` 값입니다.

예:

- `ai-gods-exporter@your-project.iam.gserviceaccount.com`

이 단계가 빠지면 export API는 성공처럼 보여도, 폴더 이동이나 접근 권한에서 막힐 수 있습니다.

## 7. 로컬 .env 또는 배포 환경에 값 넣기

필수 값:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=ai-gods-exporter@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_EXPORT_FOLDER_ID=1AbCdEfGhIjKlMnOp
```

중요:

- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` 는 줄바꿈을 실제 개행이 아니라 `\n` 문자열 형태로 넣는 게 안전합니다.
- 로컬 `.env` 와 Vercel 환경변수 둘 다 같은 형식으로 넣으면 됩니다.
- 키 전체 JSON를 붙여넣지 말고 `private_key` 값만 넣어야 합니다.

## 8. Vercel에 넣는 방법

Vercel Dashboard 경로:

1. 프로젝트 선택
2. `Settings`
3. `Environment Variables`

아래 3개를 각각 추가합니다.

1. `GOOGLE_SERVICE_ACCOUNT_EMAIL`
2. `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
3. `GOOGLE_EXPORT_FOLDER_ID`

권장 대상:

- `Production`
- 필요하면 `Preview`
- 로컬 개발까지 쓸 거면 `.env` 에도 동일하게 추가

추가 후:

1. `Redeploy`
2. 새 배포가 끝날 때까지 대기

## 9. 동작 확인

앱에서:

1. Debate 또는 Docs 탭에서 보고서 생성
2. `Google Docs` 버튼 실행
3. URL 반환 여부 확인
4. Drive 폴더에 문서가 생겼는지 확인

PPT 쪽은:

1. PPT 초안 생성
2. `Google Slides` 버튼 실행
3. URL 반환 여부 확인
4. 같은 Drive 폴더에 Slides가 생겼는지 확인

정상 기대 결과:

- 브라우저에 `docs.google.com/document/...` 링크가 열림
- 브라우저에 `docs.google.com/presentation/...` 링크가 열림
- Drive 폴더 안에 결과물이 보임

## 자주 나는 문제

### 1. `GOOGLE_SERVICE_ACCOUNT_EMAIL과 GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY가 필요합니다`

원인:

- 환경변수 누락
- redeploy 안 함
- 변수명 오타

확인:

- Vercel에 정확히 같은 키 이름으로 들어갔는지 확인
- 새 배포가 끝났는지 확인

### 2. Google Docs는 되는데 폴더에 안 보임

원인:

- `GOOGLE_EXPORT_FOLDER_ID` 누락
- 서비스 계정이 해당 폴더에 접근 권한 없음

확인:

- 폴더를 서비스 계정 이메일에 `편집자` 권한으로 공유했는지 확인

### 3. 링크는 나오는데 접근 권한이 없다고 뜸

원인:

- 문서는 서비스 계정이 만들었지만, 사용자 계정이 그 폴더 권한을 상속받지 못했거나 잘못된 폴더로 들어감

확인:

- 본인 계정이 그 Drive 폴더에 접근 가능한지 확인
- 서비스 계정이 정확한 폴더로 이동시켰는지 확인

### 4. `invalid_grant` 또는 인증 실패

원인:

- private key 줄바꿈 형식 깨짐
- 잘못된 서비스 계정 키 사용

확인:

- `private_key` 값에 `\n` 이 유지되어 있는지 확인
- JSON 파일에서 `private_key` 값을 다시 복사해 넣기

### 4-1. `403 access_denied` 또는 `앱은 현재 테스트 중이며 개발자가 승인한 테스터만 앱에 액세스할 수 있습니다`

원인:

- OAuth 동의 화면이 `테스트 중` 상태인데 현재 로그인한 Gmail 계정이 테스트 사용자 목록에 없음

확인:

1. Google Cloud Console에서 `Google 인증 플랫폼`
2. `대상` 또는 `Audience`
3. `테스트 사용자`
4. 현재 로그인 중인 Gmail 계정이 목록에 있는지 확인

해결:

1. `테스트 사용자 추가`
2. 실제 로그인에 쓰는 Gmail 주소 입력
3. 저장 후 1분 정도 대기
4. OAuth 연결 재시도

메모:

- 개인적으로만 쓰는 앱이면 Google 검증 완료 전에도 테스트 사용자 추가만으로 충분한 경우가 많습니다.
- OAuth 클라이언트 편집 화면이 아니라 OAuth 동의 화면의 `대상/Audience` 설정에서 처리해야 합니다.

### 5. `The user's Drive storage quota has been exceeded.`

원인:

- 현재 폴더가 일반 개인 Google Drive(My Drive) 아래에 있고, 서비스 계정이 그 안에 Google Docs/Slides를 만들면서 quota/ownership 제약에 걸림
- 서비스 계정은 일반 사용자처럼 My Drive quota를 안정적으로 쓰지 못할 수 있음

확인:

- 대상 폴더에 `driveId` 가 없고, owner가 개인 Gmail 계정이면 일반 My Drive 폴더일 가능성이 큼
- 서비스 계정이 폴더에 writer 로만 공유돼 있어도 문서 생성 자체는 quota 때문에 실패할 수 있음

해결:

1. Google Workspace Shared Drive를 만들고, 그 Shared Drive 또는 그 안의 폴더에 서비스 계정을 추가한 뒤 그 폴더 ID를 사용
2. 또는 서비스 계정 대신 사용자 OAuth 토큰 기반으로 문서를 생성하도록 구현 변경
3. Google Docs/Slides 대신 현재 바로 동작하는 DOCX/PPTX export만 우선 사용

## 개인 계정에서 실제로 되는 경로: 사용자 OAuth

개인 Gmail 계정을 계속 쓸 생각이면, 이 프로젝트에서는 서비스 계정 대신 사용자 OAuth로 바꾸는 쪽이 맞습니다.

핵심 차이는 이것입니다.

- 지금 방식: 서비스 계정이 문서를 만듦
- 바꿀 방식: 실제 사용자 본인 계정이 문서를 만듦

그러면 문서 소유권과 quota가 서비스 계정이 아니라 본인 Google 계정에 붙습니다. 지금 겪은 My Drive quota/ownership 문제를 피하려면 이 구조가 필요합니다.

### 구현 방향

이 프로젝트 기준 최소 변경 경로는 아래입니다.

1. 브라우저에서 Google 로그인 동의
2. 서버가 authorization code를 받아 access token / refresh token 교환
3. 서버가 refresh token을 안전하게 저장
4. [ai-gods-project/api/artifacts/export.js](ai-gods-project/api/artifacts/export.js) 가 서비스 계정 대신 사용자 OAuth 클라이언트로 Google Docs/Slides 생성
5. [ai-gods-project/src/components/ui/QuestionPanel.jsx](ai-gods-project/src/components/ui/QuestionPanel.jsx) 의 Google Docs / Google Slides 버튼은 기존처럼 유지하되, 미연결 상태면 먼저 연동 화면으로 보냄

### 1. Google Cloud에서 OAuth 클라이언트 만들기

Google Cloud Console에서 아래 순서로 진행합니다.

1. `APIs & Services`
2. `OAuth consent screen`
3. 앱 이름, 사용자 지원 이메일, 개발자 이메일 입력
4. 테스트 사용자에 본인 Gmail 추가
5. `Clients`
6. `Create OAuth client`
7. 타입은 `Web application`

Redirect URI 예시:

- 로컬: `http://localhost:3000/api/google/oauth/callback`
- 배포: `https://ai-gods-project.vercel.app/api/google/oauth/callback`

JavaScript origin 예시:

- `http://localhost:3000`
- `https://ai-gods-project.vercel.app`

주의:

- 지금 앱은 Vite + Vercel API 구조라서 `Web application` 타입이 맞습니다.
- 이 저장소의 로컬 dev 서버 포트는 `3000` 입니다.
- Gmail 개인 계정이어도 OAuth 자체는 가능합니다.

### 2. 새 환경변수 추가

서비스 계정 변수와 별도로 아래 값을 추가합니다.

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/oauth/callback
GOOGLE_OAUTH_COOKIE_SECRET=랜덤한_긴_문자열
```

운영에서는 `GOOGLE_OAUTH_REDIRECT_URI` 를 Vercel 도메인 기준으로 맞춰야 합니다.

### 3. 이 프로젝트에 필요한 API 엔드포인트

현재 구현 기준 엔드포인트는 아래입니다.

1. `api/google/oauth/start.js`
2. `api/google/oauth/callback.js`
3. `api/google/oauth/status.js`

역할은 아래와 같습니다.

- `start.js`: Google 동의 화면 URL 생성 후 redirect
- `callback.js`: code를 token으로 교환하고 refresh token 저장
- `status.js`: 현재 브라우저가 Google export 가능한 상태인지 확인

추가로 연결 해제용 엔드포인트도 들어가 있습니다.

4. `api/google/oauth/disconnect.js`

이건 연결 해제나 토큰 삭제용입니다.

### 4. 토큰 저장 방식

이 프로젝트는 별도 사용자 로그인 시스템이 아직 핵심 축이 아니므로, 현실적인 저장 방식은 두 가지입니다.

1. 개인용 단일 사용자 배포: httpOnly cookie에 암호화해서 저장
2. 다중 사용자까지 고려: Supabase에 사용자별 암호화 저장

지금 상황에서는 1번이 가장 빠릅니다.

권장 방식:

- refresh token만 저장
- access token은 요청 때마다 새로 발급
- cookie는 `httpOnly`, `secure`, `sameSite=lax`
- cookie 값은 `GOOGLE_OAUTH_COOKIE_SECRET` 으로 암호화

### 5. export API를 어떻게 바꾸는지

현재 [ai-gods-project/api/artifacts/export.js](ai-gods-project/api/artifacts/export.js) 는 OAuth 환경변수가 있으면 사용자 OAuth를 우선 사용하고, 없으면 서비스 계정으로 폴백하는 구조입니다.

OAuth 전환 시에는 아래처럼 바뀝니다.

1. cookie 에서 refresh token 복원
2. `new google.auth.OAuth2(...)` 생성
3. `oauth2Client.setCredentials({ refresh_token })`
4. 그 auth 객체로 Docs / Slides / Drive API 호출
5. OAuth 환경변수가 없으면 서비스 계정으로 폴백

실제 호출부는 auth 주입 구조로 이미 바뀌어 있습니다.

- [ai-gods-project/api/artifacts/export.js](ai-gods-project/api/artifacts/export.js)
- [ai-gods-project/api/_googleOAuth.js](ai-gods-project/api/_googleOAuth.js)

즉, 생성 로직 전체를 다시 짠 것이 아니라 인증 소스만 교체한 상태입니다.

### 6. 프론트엔드에서 필요한 최소 변경

현재 버튼은 이미 [ai-gods-project/src/components/ui/QuestionPanel.jsx](ai-gods-project/src/components/ui/QuestionPanel.jsx#L400) 와 [ai-gods-project/src/components/ui/QuestionPanel.jsx](ai-gods-project/src/components/ui/QuestionPanel.jsx#L447) 에 있습니다.

여기서 필요한 최소 동작은 아래입니다.

1. 화면 진입 시 `api/google/oauth/status` 조회
2. 연결 안 되어 있으면 `Google 연결 후 Docs`, `Google 연결 후 Slides` 라벨 표시
3. 버튼 클릭 시 미연결이면 `/api/google/oauth/start` 로 이동
4. OAuth callback 이후 다시 화면으로 돌아오면 연결 상태 메시지 표시

실제 연결 상태 조회와 export 요청은 아래 파일에 연결돼 있습니다.

- [ai-gods-project/src/services/workbenchService.js](ai-gods-project/src/services/workbenchService.js)
- [ai-gods-project/src/components/ui/QuestionPanel.jsx](ai-gods-project/src/components/ui/QuestionPanel.jsx)

### 7. 현재 구현의 Google scope

현재 구현은 아래 scope를 사용합니다.

- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/presentations`
- `https://www.googleapis.com/auth/drive`

이 프로젝트는 기존에 만든 특정 Drive 폴더 안으로 결과물을 바로 생성해야 해서, 현재는 `drive.file` 보다 넓은 `drive` scope를 사용합니다.

### 8. 실제 적용 순서

가장 실무적인 순서는 아래입니다.

1. Google Cloud에서 OAuth consent screen + Web client 생성
2. 로컬 `.env` 와 Vercel에 OAuth 관련 env 추가
3. `api/google/oauth/start.js` 와 `callback.js` 구현
4. `api/google/oauth/status.js` 구현
5. [ai-gods-project/api/artifacts/export.js](ai-gods-project/api/artifacts/export.js) 를 OAuth 기반으로 전환
6. [ai-gods-project/src/components/ui/QuestionPanel.jsx](ai-gods-project/src/components/ui/QuestionPanel.jsx) 에 연결 상태 UI 추가
7. 로컬에서 Google Docs / Google Slides 각각 1회 생성 검증
8. Vercel redeploy 후 운영 검증

### 9. 이 방식의 장단점

장점:

- 개인 Gmail 계정으로도 현실적으로 동작함
- 문서가 본인 Drive에 바로 생성됨
- Shared Drive가 없어도 됨

단점:

- 서비스 계정보다 구현이 복잡함
- 최초 1회 사용자 동의 절차가 필요함
- refresh token 저장 보안 처리가 필요함

정리하면, 개인 계정을 유지할 거면 이 경로가 맞고, 지금 프로젝트에서는 `인증 추가 + export auth 소스 교체` 정도가 핵심 작업입니다.

## 최소 체크리스트

1. Docs API 활성화
2. Slides API 활성화
3. Drive API 활성화
4. 서비스 계정 생성
5. JSON 키 발급
6. `client_email` 저장
7. `private_key` 저장
8. Drive 폴더 생성
9. 폴더를 서비스 계정 이메일에 공유
10. `GOOGLE_EXPORT_FOLDER_ID` 저장
11. Vercel 배포 환경에 3개 변수 추가
12. redeploy 후 버튼으로 실검증