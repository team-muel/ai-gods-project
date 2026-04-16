# OpenReview Setup

이 문서는 AI Gods의 학술 검색 파이프라인에 OpenReview를 붙이는 최소 설정만 다룹니다.

현재 구현 범위:

- AI/CS 계열 질의에서만 OpenReview를 추가 학술 소스로 조회합니다.
- submission 검색 결과를 공통 academic schema로 정규화합니다.
- 가능하면 forum의 review, meta review, decision 신호를 같이 읽어 랭킹과 산출물 근거에 반영합니다.
- OpenReview 인증이 없거나 401/403/MFA로 막히면 검색은 실패로 전파되지 않고 OpenAlex, arXiv, PubMed, Crossref만 계속 사용합니다.

운영 메모:

- 2026-04-15 기준으로 `openreview.net/search`, `api2.openreview.net/notes/search`, `api2.openreview.net/notes` 를 무인증으로 직접 호출하면 모두 403 이었습니다.
- 즉, 현재 프로젝트에서는 사실상 무토큰 공개 검색 경로를 기대하면 안 되고, 최소한 ID/password 로그인이나 access token 중 하나는 있어야 합니다.

## 환경변수

기본 URL:

```env
OPENREVIEW_ENABLED=1
OPENREVIEW_API_BASE_URL=https://api2.openreview.net
```

메모:

- `OPENREVIEW_ENABLED` 를 `false` 로 두면 자격증명이 남아 있어도 OpenReview 검색을 강제로 끌 수 있습니다.

인증은 두 방식 중 하나를 쓰면 됩니다.

### 1. ID + 비밀번호 로그인

```env
OPENREVIEW_ID=your-openreview-login-id
OPENREVIEW_PASSWORD=your-openreview-password
```

메모:

- `OPENREVIEW_ID` 는 보통 프로필 닉네임이 아니라 OpenReview에 실제 로그인할 때 쓰는 이메일이어야 합니다.
- OpenReview API v2 로그인은 `POST /login` 에 `id`, `password` 를 보내는 구조입니다.
- 최근 MFA 정책 때문에 이 방식은 계정 상태에 따라 403 또는 추가 인증 요구로 막힐 수 있습니다.
- 따라서 운영 환경에서는 아래 토큰 방식이 더 안전합니다.

토큰을 직접 받아 보고 싶으면 아래 유틸을 실행하면 됩니다.

```bash
npm run openreview:token
```

`.env` 에 붙여넣을 줄까지 출력하려면:

```bash
npm run openreview:token -- --print-env
```

현재 `.env` 에 바로 저장하려면:

```bash
npm run openreview:token -- --write-env
```

이 유틸은 `OPENREVIEW_ID`, `OPENREVIEW_PASSWORD` 를 읽어서 `POST /login` 을 호출하고, 응답 본문 또는 `openreview.accessToken`, `openreview.refreshToken` 쿠키에서 토큰을 추출합니다.

### 2. 토큰 기반 세션 주입

```env
OPENREVIEW_ACCESS_TOKEN=
OPENREVIEW_REFRESH_TOKEN=
```

메모:

- 이미 발급된 access token 이 있으면 `openreview.accessToken` 쿠키로 주입해서 바로 조회합니다.
- refresh token 까지 있으면 access token 만료 시 `POST /refreshToken` 으로 갱신을 시도합니다.
- MFA가 있는 계정은 비밀번호 재로그인보다 이 방식이 더 안정적입니다.

## 권장 운영 방식

1. 우선 OpenReview 계정이 실제로 review/decision 이 보이는지 브라우저에서 확인합니다.
2. MFA가 걸린 계정이면 비밀번호 로그인보다는 토큰 기반으로 넣습니다.
3. 서버 환경변수에만 넣고 브라우저 코드에는 절대 노출하지 않습니다.
4. OpenReview가 막혀도 나머지 scholarly providers 로 검색이 유지되는지 같이 확인합니다.

## 동작 확인

예시 질의:

- `LLM benchmark`
- `agentic coding benchmark`
- `multimodal reasoning openreview`

로컬 smoke test:

```bash
npm run check:openreview -- "agentic coding benchmark"
```

OpenReview가 실제 포함되어야 하는 검증:

```bash
npm run check:openreview -- "agentic coding benchmark" --expect-openreview
```

인증 실패나 잘못된 토큰에서 폴백 검증:

```bash
OPENREVIEW_ENABLED=1 OPENREVIEW_ACCESS_TOKEN=bogus npm run check:openreview -- "agentic coding benchmark" --expect-fallback
```

정상 기대 결과:

- `/api/search` 결과의 `academicSourceSummary` 에 `openreview` 가 포함됩니다.
- OpenReview 결과는 submission title, abstract, forum 링크와 함께 review 수, meta review 수, decision, 평균 rating 같은 신호를 포함할 수 있습니다.
- 동일 논문이 OpenAlex, arXiv, Crossref 와 겹치면 제목 기준으로 병합되고 `sourceProviders` 에 여러 provider 가 같이 남습니다.

## 실패 시 폴백

아래 경우 OpenReview 결과만 빠지고 전체 검색은 계속됩니다.

- 환경변수가 비어 있음
- 로그인 실패
- MFA 요구
- `403 access denied`
- `401 unauthorized`
- forum reply 상세 조회 실패

이 경우 시스템은 OpenAlex, Crossref, arXiv, PubMed 결과만으로 계속 dossier 와 artifact 근거를 구성합니다.

## 주의사항

- OpenReview는 범용 학술 검색원이 아니라 AI/CS conference 중심입니다. 모든 주제에 넣을 필요는 없습니다.
- acceptance decision 이 있다고 해서 citation 이 높은 것은 아니므로, 현재 랭킹은 citation, recency, query overlap, benchmark 신호와 함께 같이 평가합니다.
- review나 decision 필드 이름은 venue마다 조금씩 다를 수 있어 일부 레코드는 review 신호가 비어 있을 수 있습니다.