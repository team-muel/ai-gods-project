# Remote Model Cutover Design

이 문서는 AI Gods를 현재의 Groq 중심 원격 추론 구조에서, 학습된 자체 모델 또는 LoRA adapter 기반 원격 추론 구조로 점진 전환하기 위한 설계안이다.

목표는 세 가지다.

1. 로컬 개발에서는 기존처럼 Ollama를 유지한다.
2. 운영 환경에서는 초기에는 Groq를 유지하되, 학습 성숙도가 올라간 역할부터 자체 원격 모델로 교체한다.
3. 전환 중에도 즉시 롤백 가능해야 한다.

## 1. 현재 상태

현재 구조는 이미 다음처럼 분리되어 있다.

- 역할 정의와 로컬 모델 이름: [src/config/aiGods.js](../src/config/aiGods.js)
- 브라우저와 런타임 추론 진입점: [src/services/aiService.js](../src/services/aiService.js)
- 서버 추론 API: [api/chat.js](../api/chat.js)
- 학습 산출물 레지스트리: [db/supabase_setup_all.sql](../db/supabase_setup_all.sql)
- 모델 버전 등록: [scripts/merge-and-register.py](../scripts/merge-and-register.py)
- 원격 학습/퍼블리시: [scripts/run-cloud-training.py](../scripts/run-cloud-training.py), [scripts/publish-training-artifacts.py](../scripts/publish-training-artifacts.py)

핵심적으로 이미 있는 것:

- 로컬 Ollama 기반 역할별 모델 이름
- reward_events, preference_pairs 기반 학습 데이터 축적
- training_runs, model_versions 레지스트리
- Hugging Face 또는 Supabase Storage로 모델 산출물 퍼블리시

아직 없는 것:

- 운영 시점의 원격 provider router
- model_versions를 읽어 실제 serving provider를 바꾸는 cutover 계층
- shadow, canary, rollback이 붙은 운영 전환 루프

## 2. 목표 아키텍처

권장 구조는 아래와 같다.

```text
Browser/UI
  -> /api/chat
      -> Provider Router
          -> Groq fallback
          -> Remote custom inference server
              -> Base model + per-agent LoRA adapter hot-swap
          -> Local Ollama (dev only)

Training pipeline
  -> SFT/DPO training
  -> publish artifacts
  -> register model_versions
  -> promote selected version
```

핵심 원칙:

- 브라우저는 어떤 provider를 쓰는지 몰라야 한다.
- provider 선택은 서버에서만 결정한다.
- 역할별 활성 모델 버전은 DB 레지스트리에서 읽는다.
- custom provider가 실패하면 Groq로 자동 폴백한다.

## 3. 권장 서빙 방식

원격 자체 서빙은 두 가지 방식이 가능하다.

### A. 역할별 완전 분리 모델

- cco, cmo, cso 등 각 역할마다 별도 model id를 둔다.
- 라우팅은 단순하지만 운영 비용이 크다.
- 8개 역할 모두 별도 메모리 점유가 발생한다.

### B. 단일 베이스 모델 + 역할별 LoRA adapter hot-swap

- 하나의 베이스 모델을 서버에 올린다.
- 역할별 adapter만 교체해 호출한다.
- 가장 현실적이고, 네가 원하던 구조와도 맞다.
- 비용과 운영 복잡도 균형이 가장 좋다.

이 프로젝트에는 B가 더 적합하다.

이유:

- 현재도 역할별 차이를 adapter 또는 merged artifact 형태로 다루고 있다.
- [scripts/merge-and-register.py](../scripts/merge-and-register.py) 가 agent_id별 model_versions를 이미 기록한다.
- [scripts/publish-training-artifacts.py](../scripts/publish-training-artifacts.py) 가 adapter artifact를 별도로 퍼블리시할 수 있다.

## 4. 원격 provider 계약

원격 커스텀 추론 서버는 가능하면 OpenAI 호환 Chat Completions 인터페이스로 두는 것이 좋다.

이유:

- 기존 [api/chat.js](../api/chat.js) 구조를 크게 안 바꿔도 된다.
- 추후 provider가 바뀌어도 payload 형태를 유지하기 쉽다.
- shadow mode와 fallback 로직을 붙이기 쉽다.

권장 요청 형태:

```json
{
  "provider": "custom",
  "agentId": "cco",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 500,
  "modelVersion": "optional-run-id-or-version",
  "adapter": "optional-adapter-id"
}
```

권장 응답 형태:

```json
{
  "id": "chatcmpl-custom-...",
  "provider": "custom",
  "model": "qwen2.5-3b-base",
  "adapter": "cco-run-20260412",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 321,
    "total_tokens": 444
  }
}
```

## 5. 모델 레지스트리 활용 방식

이미 있는 model_versions 테이블은 아래 컬럼으로 cutover에 충분히 가깝다.

- agent_id
- run_id
- model_name
- ollama_model_name
- base_model
- artifact_path
- gguf_path
- rollout_state
- is_active
- metrics
- metadata

이 테이블을 serving router가 직접 읽도록 바꾸면 된다.

권장 rollout_state 상태값:

- registered
- shadow
- candidate
- canary
- active
- rollback
- disabled

권장 metrics 예시:

```json
{
  "cutoverScore": 82,
  "winRateVsGroq": 0.61,
  "avgRewardScore": 0.34,
  "hallucinationRate": 0.03,
  "recentMessageCount": 480
}
```

권장 metadata 예시:

```json
{
  "artifactTarget": "supabase",
  "artifactUri": "supabase://training-datasets/runs/run-123/lora/cco",
  "remoteAdapterId": "cco-run-123",
  "servingProvider": "custom-openai-compatible",
  "lastPromotionAt": "2026-04-12T12:00:00Z"
}
```

## 6. 서버 라우팅 계층 설계

현재 [api/chat.js](../api/chat.js) 는 Groq 고정이다. 여기서 가장 먼저 바뀌어야 하는 부분은 provider router다.

권장 구조:

- 새 파일: api/_modelRouter.js
- 역할:
  - agentId 기준 활성 provider 결정
  - model_versions에서 is_active=true 조회
  - custom provider health 체크
  - 실패 시 Groq fallback

추천 흐름:

1. 요청 payload에서 agentId, phase, messages를 받는다.
2. 개발 환경이면 기존 Ollama 경로 유지.
3. 운영 환경이면 registry를 조회해 agent별 active model_version을 찾는다.
4. active version이 없으면 Groq 사용.
5. active version이 있고 rollout_state가 active 또는 canary면 custom provider 사용.
6. custom provider 실패 시 Groq fallback.
7. 응답 metadata에 provider와 modelVersion을 기록한다.

이때 브라우저의 [src/services/aiService.js](../src/services/aiService.js) 는 크게 안 바꿔도 된다. 핵심 변경은 서버 API에 agentId 전달만 명시적으로 넣는 것이다.

## 7. 필요한 환경 변수

권장 환경 변수:

- CHAT_PROVIDER_MODE=groq|registry|custom
- CUSTOM_MODEL_BASE_URL
- CUSTOM_MODEL_API_KEY
- CUSTOM_MODEL_TIMEOUT_MS
- CUSTOM_MODEL_HEALTH_PATH
- MODEL_REGISTRY_SOURCE=supabase
- MODEL_ROUTER_DEFAULT_PROVIDER=groq
- MODEL_ROUTER_ALLOW_FALLBACK=true
- MODEL_ROUTER_SHADOW_LOG=true

역할별 강제 override가 필요하면:

- CHAT_PROVIDER_CCO=groq|custom
- CHAT_PROVIDER_CMO=groq|custom
- CHAT_PROVIDER_CTO=groq|custom

이 override는 emergency rollback에 유용하다.

## 8. 단계별 전환 전략

### Phase 1. 수동 cutover

- model_versions에 active version을 수동 지정
- 특정 agent_id만 custom provider 사용
- 나머지는 Groq 유지

이 단계의 목적은 production serving 경로를 여는 것이다.

### Phase 2. shadow mode

- 사용자 응답은 계속 Groq를 반환
- 백그라운드에서 동일 요청을 custom provider에도 보내 결과를 저장
- outputs 또는 Supabase shadow_eval 테이블에 비교 로그 적재

이 단계의 목적은 실제 트래픽 기반 비교다.

### Phase 3. canary

- 특정 agent만 5~10% 트래픽을 custom provider로 보냄
- reward score, latency, hallucination, fallback 빈도 추적

### Phase 4. active cutover

- cutover score와 shadow 비교를 통과한 agent만 custom active로 승격
- Groq는 fallback 전용으로 남김

## 9. readiness와 cutover 연결

현재 operations dashboard의 readiness 점수는 이미 cutover 판단의 초기 지표다.

이걸 실전 cutover로 연결하려면 추가 지표가 필요하다.

필수 추가 지표:

- Groq 대비 승률 또는 사람 선호도
- fallback 발생률
- 최근 24시간 에러율
- 평균 응답 지연
- immune quarantine rate
- role consistency score

권장 승격 조건 예시:

- cutoverScore >= 80
- recentMessages24h >= 100
- winRateVsGroq >= 0.58
- fallbackRate <= 0.03
- hallucinationRate <= 0.05
- rollout_state = candidate

## 10. 파일 단위 변경 제안

최소 변경 경로는 아래와 같다.

### 바로 바꿔야 하는 파일

- [api/chat.js](../api/chat.js)
  - Groq 고정 로직 제거
  - provider router 진입점으로 전환

- 새 파일 [api/_modelRouter.js](../api)
  - registry 조회
  - provider 선택
  - fallback 처리

- [src/services/aiService.js](../src/services/aiService.js)
  - /api/chat 호출 시 agentId 명시 전달
  - provider debug metadata를 옵션으로 받을 수 있게 확장

- [scripts/merge-and-register.py](../scripts/merge-and-register.py)
  - metadata에 remoteAdapterId, artifactUri, servingProvider 기록

### 다음 단계에서 바꿀 파일

- operations dashboard API
  - active provider, active model version 표시

- retraining pipeline
  - 학습 완료 후 candidate 등록 자동화

- 새 promote 스크립트
  - 예: scripts/promote-model-version.mjs
  - 특정 agent/run_id를 active로 승격

## 11. 운영상 중요한 결정

이 프로젝트에서 가장 중요한 결정은 아래 둘이다.

### A. merged model을 서빙할지, adapter만 서빙할지

- merged model 서빙:
  - 단순하다
  - 메모리 비용이 크다
  - 역할이 많아질수록 비효율적이다

- adapter hot-swap 서빙:
  - 효율적이다
  - 구현 난도가 조금 높다
  - 장기적으로 훨씬 유리하다

이 프로젝트에는 adapter hot-swap이 더 적합하다.

### B. 완전 자동 cutover를 할지, 승인형 cutover를 할지

권장은 승인형이다.

이유:

- 역할형 에이전트는 한번 drift가 나면 집단 토론 구조가 무너진다.
- reward score만 보고 자동 승격하면 잘못된 성격 변형이 생길 수 있다.
- 최소한 candidate -> active 전환은 수동 승인 또는 semi-auto가 안전하다.

## 12. 추천 최종 형태

이 프로젝트의 가장 현실적인 최종 형태는 아래다.

- 개발: Ollama
- 운영 기본: Groq
- 운영 승격 역할: self-served base model + role-specific LoRA adapter
- 레지스트리: Supabase model_versions
- 산출물 저장: Hugging Face 또는 Supabase Storage
- cutover 전략: shadow -> canary -> active
- 안전망: Groq fallback 유지

즉, 완전한 Groq 제거가 목표가 아니라, Groq를 안전망으로 유지한 채 역할별로 네 모델을 운영권에 올리는 구조가 맞다.

## 13. 추천 구현 순서

1. api/chat.js 를 provider router 구조로 분리한다.
2. model_versions metadata에 remote artifact / adapter id / serving provider 정보를 넣는다.
3. custom provider를 OpenAI-compatible endpoint로 하나 만든다.
4. cco 한 역할만 shadow mode로 비교한다.
5. 비교 결과가 안정적이면 canary를 붙인다.
6. 그 다음에만 candidate -> active 승격 스크립트를 만든다.

이 순서가 가장 작은 리스크로, 네가 원한 구조에 가장 빨리 도달하는 길이다.