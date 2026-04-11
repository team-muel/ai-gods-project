# Cloud Retraining

로컬 PC를 켜두지 않고도 자동 재학습을 하려면 항상 켜져 있는 외부 GPU 실행기가 필요합니다.

현재 저장소는 다음 두 단계를 자동화합니다.

1. GitHub Actions가 토론 데이터 축적, readiness 평가, snapshot 생성, SFT/DPO dataset 생성까지 수행합니다.
2. scripts/trigger-remote-training.mjs 가 원격 GPU 서비스에 signed URL 기반 학습 요청을 보냅니다.

## 필요한 비밀값

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- HF_TOKEN
- HF_LORA_REPO
- REMOTE_TRAINING_WEBHOOK_URL
- REMOTE_TRAINING_BEARER_TOKEN 선택
- REMOTE_TRAINING_PROVIDER 선택, 기본값 generic-webhook
- REMOTE_TRAINING_SIGNED_URL_EXPIRES_IN 선택, 기본값 86400

## GitHub 측 흐름

1. retraining-pipeline.yml 의 readiness 와 prepare-datasets 가 실행됩니다.
2. train-remote-cloud 가 outputs/training-datasets-manifest.json 과 outputs/training-readiness.json 을 읽습니다.
3. snapshot 과 각 dataset object path 에 대해 signed URL 을 만듭니다.
4. 원격 GPU 서비스로 학습 요청 payload 를 보냅니다.

## 원격 GPU 측 최소 계약

원격 서비스는 POST payload 를 받아 다음을 수행하면 됩니다.

1. signed URL 로 snapshot 과 dataset 파일을 다운로드합니다.
2. 저장소를 체크아웃합니다.
3. python scripts/run-cloud-training.py --god all 을 실행합니다.
4. 학습 결과는 기본적으로 최소 어댑터 파일만 Hugging Face Hub 에 업로드합니다.
5. 허깅페이스 거부가 계속 나면 MODEL_ARTIFACT_TARGET=supabase 로 바꿔 Supabase Storage 로 업로드합니다.
6. 선택적으로 Supabase training_runs, model_versions 를 갱신합니다.

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
- publish-training-artifacts.py 는 기본적으로 adapter_config.json, adapter_model.safetensors 같은 최소 파일만 퍼블리시합니다.
- 토론 원문, snapshot, dataset JSONL 은 Hugging Face 로 보내지 않고 계속 Supabase Storage signed URL 경로를 사용합니다.
- Hugging Face 정책에 걸리면 MODEL_ARTIFACT_TARGET=supabase 로 전환해 모델 산출물도 Supabase Storage 로 보낼 수 있습니다.
- 로컬 Ollama 배포가 필요하면 별도의 후속 배포 파이프라인을 두는 편이 안전합니다.