# Direct Model Serving

AI Gods는 이제 베이스 모델 1개와 역할별 LoRA adapter hot-swap 구조로 직접 서빙할 수 있다.

권장 운영 토폴로지는 다음과 같다.

- Vercel: React 앱과 /api/chat 같은 얇은 API 게이트웨이
- GitHub Actions: 자동 토론, 데이터 준비, 재학습 트리거
- 별도 GPU 또는 고정 서버: Qwen + LoRA 직접 추론 서버

핵심 구성:

- 라우터: [api/_modelRouter.js](../api/_modelRouter.js)
- 직접 서빙 서버: [scripts/god-server.py](../scripts/god-server.py)
- 학습 결과 등록: [scripts/merge-and-register.py](../scripts/merge-and-register.py)
- 클라우드 러너 연결: [scripts/run-cloud-training.py](../scripts/run-cloud-training.py)

Supabase registry가 없거나 쓰기 경로를 열지 못한 경우에도 outputs/model-registry.json local registry로 같은 cutover 흐름을 유지할 수 있다.

## 서버 계약

직접 서빙 서버는 아래 endpoint 를 제공한다.

- POST /v1/chat/completions
- GET /v1/models
- GET /health
- GET /admin/adapters
- POST /admin/adapters/reload

기존 로컬 경로 호환을 위해 아래도 유지한다.

- POST /api/chat
- GET /api/tags

## Adapter manifest

학습 후 등록 스크립트를 실행하면 outputs/serving-adapters.json 이 생성된다.

같은 시점에 outputs/model-registry.json 도 갱신되어 trainingRuns, modelVersions 의 local fallback registry 역할을 한다.

manifest 는 두 가지 adapter 식별자를 함께 만든다.

- 안정 alias: cco
- 버전 alias: cco-manual-20260412120000

라우터는 model_versions.metadata.remoteAdapterId 를 우선 사용하고, 없으면 run_id 또는 agentId 로 폴백한다.
live model_versions 테이블이 없으면 outputs/model-registry.json 의 active row 를 대신 읽는다.

## model_versions metadata

등록 스크립트는 model_versions.metadata 에 아래 값을 함께 기록한다.

- artifactUri
- adapterArtifactUri
- remoteAdapterId
- servingProvider
- servingBaseUrl
- servingBaseModel
- localAdapterPath

## 실행 절차

1. Python 의존성 설치

```bash
python -m pip install -r requirements-serving.txt
```

2. 학습 결과 등록

```bash
python scripts/merge-and-register.py --god all
```

3. 직접 서빙 서버 실행

```bash
python scripts/god-server.py
```

또는

```bash
npm run serve:model
```

4. 라우터 연결

```env
CHAT_PROVIDER_MODE=registry
MODEL_REGISTRY_BACKEND=auto
MODEL_REGISTRY_PATH=outputs/model-registry.json
CUSTOM_MODEL_BASE_URL=http://127.0.0.1:8000
CUSTOM_MODEL_CHAT_PATH=/v1/chat/completions
CUSTOM_MODEL_NAME=qwen2.5-3b-instruct-local
MODEL_ROUTER_ALLOW_FALLBACK=false
SERVING_ALLOW_BASE_FALLBACK=true
```

judge 와 angel 단계까지 Groq 없이 직접 서빙으로 처리하려면 아래 조건이 필요하다.

- CHAT_PROVIDER_MODE=registry
- CUSTOM_MODEL_BASE_URL 이 직접 서빙 서버를 가리켜야 한다.
- MODEL_ROUTER_ALLOW_FALLBACK=false 로 Groq 폴백을 끈다.
- SERVING_ALLOW_BASE_FALLBACK=true 로 judge 요청이 base model 로 처리되게 한다.

이때 8개 임원 발화는 각 LoRA adapter 를 사용하고, judge/angel 은 별도 adapter 없이 base model 로 처리된다.

## 현재 남은 운영 과제

첫 cutover 는 가능하지만 아래는 별도 운영 작업이다.

1. 여러 환경이 공유하는 원격 registry가 필요하면 live Supabase 에 public.training_runs 와 public.model_versions 를 실제 생성한다.
2. remote runner 가 artifactUri 기준으로 adapter 를 다시 다운로드하는 복구 경로를 추가한다.
3. shadow, canary, rollback 자동화를 위해 평가 로그와 승격 기준을 더 붙인다.
4. judge 전용 adapter 를 학습하지 않는 동안은 base-model fallback 품질을 계속 모니터링한다.