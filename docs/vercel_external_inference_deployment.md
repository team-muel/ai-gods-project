# Vercel + External Inference Deployment

AI Gods의 권장 운영 구조는 Vercel이나 GitHub가 모델을 직접 실행하는 형태가 아니다.

실제 권장 구조는 아래와 같다.

- Vercel: React 앱, serverless API, model router
- GitHub Actions: 자동 토론 배치, 데이터셋 준비, 재학습 트리거
- 외부 추론 서버: Qwen/Qwen2.5-3B-Instruct + LoRA adapter hot-swap
- Supabase: debates, memories, archives, dataset metadata

## 왜 이렇게 나누는가

Vercel은 서버리스 제약 때문에 Qwen + LoRA 모델을 상시 메모리에 올려두는 용도에 맞지 않는다.

GitHub Actions는 배치 자동화에는 적합하지만 실시간 채팅 inference endpoint 용도로는 맞지 않는다.

따라서 프론트/API 와 추론 서버를 분리해야 한다.

## 권장 토폴로지

1. 사용자는 Vercel 앱에 접속한다.
2. 브라우저는 항상 /api/chat 만 호출한다.
3. Vercel의 api/chat 은 api/_modelRouter.js 를 통해 active modelVersion 을 확인한다.
4. model router 는 CUSTOM_MODEL_BASE_URL 로 외부 추론 서버를 호출한다.
5. 추론 서버는 8개 임원 발화에 LoRA adapter 를 사용하고, judge/angel 은 base model fallback 으로 처리한다.
6. 토론 결과는 Supabase 와 Obsidian write 경로로 저장된다.

## Vercel 환경 변수

아래 값이 핵심이다.

```env
CHAT_PROVIDER_MODE=registry
MODEL_REGISTRY_BACKEND=file
MODEL_REGISTRY_PATH=outputs/model-registry.json
CUSTOM_MODEL_BASE_URL=https://your-inference-host.example.com
CUSTOM_MODEL_CHAT_PATH=/v1/chat/completions
CUSTOM_MODEL_NAME=qwen2.5-3b-instruct-local
CUSTOM_MODEL_TIMEOUT_MS=180000
MODEL_ROUTER_ALLOW_FALLBACK=false
```

judge/angel 을 Groq 없이 함께 처리하려면 추론 서버 쪽에 아래도 필요하다.

```env
SERVING_ALLOW_BASE_FALLBACK=true
```

## 외부 추론 서버 환경 변수

```env
SERVING_BASE_MODEL=Qwen/Qwen2.5-3B-Instruct
SERVING_MODEL_NAME=qwen2.5-3b-instruct-local
SERVING_ADAPTER_ROOT=models/lora
SERVING_ADAPTER_MANIFEST=outputs/serving-adapters.json
SERVING_HOST=0.0.0.0
SERVING_PORT=8000
SERVING_DEVICE_MAP=auto
SERVING_TORCH_DTYPE=float16
SERVING_MAX_LOADED_ADAPTERS=8
SERVING_ALLOW_BASE_FALLBACK=true
SERVING_API_KEY=
```

## GitHub Actions 역할

GitHub는 아래를 담당하면 된다.

- 자동 토론 배치 실행
- readiness 체크
- warehouse snapshot 생성
- 데이터셋 export
- remote GPU training webhook 호출

GitHub가 모델을 직접 serving 하는 구조는 권장하지 않는다.

## 현재 검증된 상태

로컬에서 이미 다음 경로를 검증했다.

- 8-agent frontend-path custom speaking canary 성공
- compact multi-round debate 성공
- debate 저장 성공
- Obsidian write 성공

따라서 다음 운영 단계는 Vercel 또는 다른 프론트 환경에 같은 router env 를 넣고, 외부 inference host 만 실제 고정 주소로 바꾸는 것이다.