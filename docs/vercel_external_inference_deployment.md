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
5. 추론 서버는 8개 임원 발화에 LoRA adapter 를 사용한다.
6. judge, angel, workbench artifact refinement 는 Groq 를 유지하고, export 는 AI 없이 렌더링만 수행한다.
7. 토론 결과는 Supabase 와 Obsidian write 경로로 저장된다.

## Vercel 환경 변수

권장 운영값은 하이브리드 라우팅이다.

```env
CHAT_PROVIDER_MODE=groq
CHAT_PROVIDER_CCO=custom
CHAT_PROVIDER_CSO=custom
CHAT_PROVIDER_CPO=custom
CHAT_PROVIDER_CMO=custom
CHAT_PROVIDER_CXO=custom
CHAT_PROVIDER_CFO=custom
CHAT_PROVIDER_CDO=custom
CHAT_PROVIDER_CTO=custom
MODEL_REGISTRY_BACKEND=file
MODEL_REGISTRY_PATH=outputs/model-registry.json
CUSTOM_MODEL_BASE_URL=https://your-inference-host.example.com
CUSTOM_MODEL_CHAT_PATH=/v1/chat/completions
CUSTOM_MODEL_NAME=qwen2.5-3b-instruct-local
CUSTOM_MODEL_TIMEOUT_MS=240000
CUSTOM_MODEL_MAX_TOKENS=96
CUSTOM_MODEL_SYSTEM_PROMPT_CHARS=900
CUSTOM_MODEL_USER_PROMPT_CHARS=1800
MODEL_ROUTER_ALLOW_FALLBACK=false
VITE_AI_PROMPT_PROFILE=minimal
VITE_AI_USE_OBSIDIAN_CONTEXT=false
VITE_AI_MEMBER_MAX_TOKENS=96
VITE_AI_DEBATE_REPAIR_MAX_TOKENS=120
VITE_AI_JUDGE_MAX_TOKENS=140
VITE_AI_ANGEL_MAX_TOKENS=48
VITE_AI_ANGEL_SOURCE_CHARS=220
VITE_AI_DEBATE_CONTEXT_CHARS=140
VITE_AI_EVIDENCE_CONTEXT_CHARS=90
VITE_AI_DEBATE_EVIDENCE_LIMIT=2
VITE_AI_CONSENSUS_CONTEXT_CHARS=72
VITE_AI_FINAL_CONTEXT_CHARS=96
VITE_AI_TRANSCRIPT_CONTEXT_CHARS=900
VITE_AI_MEMORY_CONTEXT_CHARS=320
VITE_AI_SEARCH_CONTEXT_CHARS=520
VITE_AI_OBSIDIAN_CONTEXT_CHARS=240
VITE_AI_INITIAL_SEARCH_RESULT_COUNT=2
```

이 구성의 의미는 아래와 같다.

- 8개 임원 speaking/debate turn 은 custom 경로로 외부 추론 서버를 탄다.
- judge 와 angel phase 는 override 가 없으므로 global Groq 로 남는다.
- api/artifacts/generate 의 workbench-generate phase 는 agentId 가 없으므로 global Groq 로 남는다.
- api/artifacts/export 는 DOCX/PPTX 렌더링만 하고 모델을 호출하지 않는다.
- custom 경로는 서버 측에서 max_tokens 와 system/user prompt 길이를 clamp 해 HF Space 지연에 덜 민감하게 만든다.
- 프런트 빌드도 minimal prompt profile 과 낮은 context budget 을 사용해 실제 사용자 경로의 prompt 크기를 줄인다.
- VITE_AI_USE_OBSIDIAN_CONTEXT=false 를 주면 participant initial prompt 에서 Obsidian 과거 노트 주입을 빼서 rich 초기 프롬프트 지연을 크게 줄일 수 있다.

Vercel 배포에서 outputs/model-registry.json 이 제외되는 경우가 있으므로, production override 는 registry 보다 custom 이 더 안전하다.

judge/angel 까지 Groq 없이 함께 처리하려면 아래처럼 full registry cutover 로 바꿔야 한다.

```env
CHAT_PROVIDER_MODE=registry
MODEL_ROUTER_ALLOW_FALLBACK=false
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

따라서 다음 운영 단계는 Vercel 또는 다른 프론트 환경에 같은 hybrid router env 를 넣고, 외부 inference host 만 실제 고정 주소로 바꾸는 것이다.