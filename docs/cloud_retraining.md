# Cloud Retraining

로컬 PC를 켜두지 않고도 자동 재학습을 하려면 항상 켜져 있는 외부 GPU 실행기가 필요합니다.

현재 저장소는 다음 세 단계를 자동화합니다.

1. GitHub Actions가 토론 데이터 축적, readiness 평가, snapshot 생성, SFT/DPO dataset 생성까지 수행합니다.
2. scripts/trigger-remote-training.mjs 가 원격 GPU 서비스에 signed URL 기반 학습 요청을 보냅니다.
3. 원격 GPU 서비스가 scripts/run-cloud-training.py 를 실행하면 학습, 퍼블리시, 그리고 선택적으로 scripts/activate-serving-stack.py 를 통한 HF Space 재기동과 Vercel 재배포까지 이어질 수 있습니다.

## GitHub 설정 위치

이 저장소의 retraining-pipeline.yml 은 GitHub Environment 를 쓰지 않습니다. 기본 기준은 Repository secrets 와 Repository variables 입니다.

### Repository secrets 에 넣을 값

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- HF_TOKEN
- VERCEL_TOKEN
- REMOTE_TRAINING_WEBHOOK_URL
- REMOTE_TRAINING_BEARER_TOKEN 선택

### Repository variables 에 넣을 값

- HF_LORA_REPO
- HF_SPACE_ID
- MODEL_ARTIFACT_TARGET, 기본값 huggingface
- VERCEL_PROJECT_ID 또는 VERCEL_PROJECT_NAME
- VERCEL_TEAM_ID 선택
- VERCEL_DEPLOY_TARGET, 기본값 production
- REMOTE_TRAINING_PROVIDER 선택, 기본값 generic-webhook
- REMOTE_TRAINING_SIGNED_URL_EXPIRES_IN 선택, 기본값 86400

### Environment variables / Organization variables 는 언제 쓰나

- Environment variables: production, staging 같이 GitHub Environment 를 workflow 에 명시해서 분리 운영할 때만 사용합니다. 현재 워크플로는 environment: 를 선언하지 않으므로 여기 넣어도 자동으로 읽지 않습니다.
- Organization variables: 여러 저장소가 같은 값을 공유할 때만 사용합니다. 이 프로젝트만 먼저 붙일 거면 Repository variables 로 넣는 편이 가장 단순합니다.

참고로 HF_LORA_REPO 값은 hevlein/ai-gods-lora 같은 형식이라 slash 가 들어가도 됩니다. 문제되는 것은 값이 아니라 이름 규칙입니다. 변수 이름은 HF_LORA_REPO 로 만들고, 값에 hevlein/ai-gods-lora 를 넣으면 됩니다. 현재 워크플로는 HF_LORA_REPO 를 Repository variable 로 우선 읽고, 없으면 기존 Repository secret 도 fallback 으로 읽습니다.

## GitHub 측 흐름

1. retraining-pipeline.yml 의 readiness 와 prepare-datasets 가 실행됩니다.
2. train-remote-cloud 가 outputs/training-datasets-manifest.json 과 outputs/training-readiness.json 을 읽습니다.
3. snapshot 과 각 dataset object path 에 대해 signed URL 을 만듭니다.
4. 원격 GPU 서비스로 학습 요청 payload 를 보냅니다.
5. self-hosted 학습 job은 publish-training-artifacts.py 와 activate-serving-stack.py 를 이어서 실행해 최신 모델을 production stack 에 반영할 수 있습니다.

## 원격 GPU 측 최소 계약

원격 서비스는 POST payload 를 받아 다음을 수행하면 됩니다.

1. signed URL 로 snapshot 과 dataset 파일을 다운로드합니다.
2. 저장소를 체크아웃합니다.
3. python scripts/run-cloud-training.py --god all 을 실행합니다.
4. 학습 결과는 기본적으로 최소 어댑터 파일만 Hugging Face Hub 에 업로드합니다.
5. 기본 target 이 Hugging Face 인 경우 run-cloud-training.py 는 serving alias 경로도 같이 갱신할 수 있습니다.
6. POST_TRAIN_ACTIVATE_STACK=1 이고 HF_SPACE_ID, HF_TOKEN, VERCEL_TOKEN 이 준비돼 있으면 activate-serving-stack.py 가 HF Space 를 재기동하고 Vercel production 을 재배포합니다.
7. 허깅페이스 거부가 계속 나면 MODEL_ARTIFACT_TARGET=supabase 로 바꿔 Supabase Storage 로 업로드합니다. 이 경우 현재 HF Space 기반 serving 자동 갱신은 별도 구현이 필요합니다.

## 로컬 PC 의존성을 제거하는 이유

- GitHub hosted runner 는 GPU 학습을 보장하지 않습니다.
- 기존 self-hosted runner 는 사용자 PC 가 켜져 있어야 합니다.
- 원격 GPU 웹훅 구조로 바꾸면 GitHub 는 orchestrator 만 맡고, 실제 학습은 외부 GPU 가 맡습니다.

## 권장 원격 실행기 예시

- RunPod serverless or pods
- Modal GPU jobs
- Vast.ai worker
- GPU attached VM on AWS, GCP, Azure

## 주의 사항

- merge-and-register.py 는 클라우드 모드에서 GGUF 변환과 Ollama 등록을 생략할 수 있습니다.
- merge-and-register.py 는 기본적으로 models/dpo/<god_id> 가 있으면 그 어댑터를 우선 활성 모델로 등록하고, 없으면 models/lora/<god_id> 로 폴백합니다. 필요하면 MODEL_ADAPTER_SOURCE=sft 또는 dpo 로 강제할 수 있습니다.
- publish-training-artifacts.py 는 기본적으로 adapter_config.json, adapter_model.safetensors 같은 최소 파일만 퍼블리시합니다.
- publish-training-artifacts.py 는 Hugging Face target 일 때 runs/<run_id>/... 버전 경로와 top-level serving alias 경로를 함께 갱신합니다.
- 토론 원문, snapshot, dataset JSONL 은 Hugging Face 로 보내지 않고 계속 Supabase Storage signed URL 경로를 사용합니다.
- Hugging Face 정책에 걸리면 MODEL_ARTIFACT_TARGET=supabase 로 전환해 모델 산출물도 Supabase Storage 로 보낼 수 있습니다.
- 로컬 Ollama 배포가 필요하면 별도의 후속 배포 파이프라인을 두는 편이 안전합니다.