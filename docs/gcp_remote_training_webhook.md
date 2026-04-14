# GCP GPU VM Remote Training Webhook

이 문서는 내 PC 디스크를 전혀 쓰지 않고 AI Gods 재학습을 돌리기 위한 GCP GPU VM 기준 운영 절차다.

구성 목표는 아래와 같다.

- Vercel: 앱과 API, online learning dispatch
- GitHub Actions: 데이터셋 준비와 원격 학습 트리거
- GCP GPU VM: 웹훅 수신, SFT/DPO 학습, 퍼블리시, 스택 활성화
- 내 PC: 사용 안 함

## 1. VM 권장 사양

- OS: Ubuntu 22.04 LTS
- GPU: L4, T4, A10G 중 하나
- Disk: 최소 100GB SSD
- Python: 3.11
- CUDA 드라이버와 PyTorch CUDA wheel 설치 가능 상태

학습 체크포인트, Hugging Face cache, base model 다운로드까지 고려하면 100GB 미만은 빠듯하다.

## 2. VM 초기 세팅

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv python3-pip

sudo mkdir -p /opt/muel
sudo chown fancy:fancy /opt/muel
cd /opt/muel
git clone https://github.com/team-muel/ai-gods-project.git ai-gods-project-remote
cd ai-gods-project-remote

python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-data.txt
python -m pip install -r requirements-training.txt
```

CUDA wheel 은 VM GPU 환경에 맞게 별도로 맞춘다. 예시는 아래처럼 잡을 수 있다.

```bash
python -m pip uninstall -y torch torchvision torchaudio
python -m pip install --index-url https://download.pytorch.org/whl/cu124 torch
```

## 3. 원격 웹훅 서버 환경 변수

VM 에서 사용하는 .env 는 이 저장소 루트에 둔다. 시작점으로는 [deploy/gcp_remote_training.env.template](../deploy/gcp_remote_training.env.template) 를 복사하는 편이 가장 빠르다.

```env
REMOTE_WEBHOOK_HOST=0.0.0.0
REMOTE_WEBHOOK_PORT=8788
REMOTE_WEBHOOK_TOKEN=replace-with-long-random-token
REMOTE_TRAINING_REPO_DIR=/opt/ai-gods-project-remote
REMOTE_TRAINING_JOB_ROOT=/opt/ai-gods-remote-jobs
REMOTE_TRAINING_AUTO_GIT_PULL=false
REMOTE_TRAINING_ALLOW_CONCURRENT=false
REMOTE_TRAINING_ENABLE_PUBLISH=true
REMOTE_TRAINING_ENABLE_ACTIVATION=true
REMOTE_TRAINING_INCLUDE_MERGED=false

MODEL_ARTIFACT_TARGET=huggingface
HF_TOKEN=...
HF_LORA_REPO=hevlein/ai-gods-lora
HF_SPACE_ID=hevlein/ai-gods-server

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...

VERCEL_TOKEN=...
VERCEL_PROJECT_ID=prj_Wo05cq8y9xkCnoySO47d3jWAvKWj
VERCEL_PROJECT_NAME=ai-gods-project
VERCEL_TEAM_ID=team_rqUtIsofn2YdFZBTvvaWO1vd
VERCEL_DEPLOY_TARGET=production

POST_TRAIN_ACTIVATE_STACK=1
SERVING_ALLOW_BASE_FALLBACK=true
```

핵심은 GitHub 에 넣을 bearer token 과 VM 의 REMOTE_WEBHOOK_TOKEN 값을 동일하게 맞추는 것이다.

## 4. 웹훅 서버 실행

수동 실행은 아래 한 줄이다.

```bash
cd /opt/muel/ai-gods-project-remote
source .venv/bin/activate
python scripts/remote-training-webhook.py --host 0.0.0.0 --port 8788
```

health check:

```bash
curl http://127.0.0.1:8788/healthz
```

최근 job 목록:

```bash
curl http://127.0.0.1:8788/jobs
```

특정 job 상태와 마지막 로그 80줄:

```bash
curl "http://127.0.0.1:8788/jobs/<job_id>?tail=80"
```

## 5. systemd 서비스 등록

예시 unit 파일은 [deploy/systemd/ai-gods-remote-training-webhook.service](../deploy/systemd/ai-gods-remote-training-webhook.service) 를 사용한다.

```bash
sudo cp deploy/systemd/ai-gods-remote-training-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-gods-remote-training-webhook
sudo systemctl status ai-gods-remote-training-webhook
```

현재 템플릿은 이 프로젝트에서 실제로 쓰는 fancy 사용자와 /opt/muel/ai-gods-project-remote 경로 기준으로 맞춰져 있다. 다른 VM 에 붙일 때만 ExecStart 와 User 를 바꾼다.

## 6. 공개 엔드포인트 열기

GitHub Actions 에서 접근할 수 있어야 하므로 HTTPS reverse proxy 가 필요하다.

예시 경로:

- https://gpu.example.com/ai-gods-train/train
- https://gpu.example.com/ai-gods-train/healthz

가장 단순한 방법은 Caddy 나 Nginx 로 127.0.0.1:8788 을 reverse proxy 하는 것이다.

현재 34.56.232.61.sslip.io VM 은 8787 포트를 이미 다른 서비스가 쓰고 있으므로, 이 프로젝트 기준 실제 공개 경로는 아래처럼 잡는 편이 안전하다.

```caddy
handle_path /ai-gods-train/* {
	reverse_proxy 127.0.0.1:8788
}
```

## 7. GitHub 에 넣을 값

Repository secrets:

- REMOTE_TRAINING_WEBHOOK_URL=https://gpu.example.com/ai-gods-train/train
- REMOTE_TRAINING_BEARER_TOKEN=replace-with-long-random-token

Repository variables:

- REMOTE_TRAINING_PROVIDER=gcp-gpu-vm
- REMOTE_TRAINING_SIGNED_URL_EXPIRES_IN=86400

이미 설정된 값과 함께 동작하는 항목:

- ONLINE_LEARNING_RUN_REMOTE_TRAINING=true
- ONLINE_LEARNING_RUN_SELF_HOSTED_TRAINING=false

## 8. 실제 흐름

1. GitHub Actions 가 snapshot 과 dataset signed URL 을 만든다.
2. scripts/trigger-remote-training.mjs 가 VM 의 /train 으로 payload 를 보낸다.
3. scripts/remote-training-webhook.py 가 job 을 background 로 생성한다.
4. webhook worker 가 training-data 와 dpo-data 를 VM 디스크에 staging 한다.
5. scripts/run-cloud-training.py 가 SFT, DPO, merge, publish, activation 을 수행한다.
6. 완료 후 HF Space 와 Vercel production 이 새 모델 기준으로 갱신된다.

이 경로에서는 내 PC 디스크를 전혀 쓰지 않는다.

## 9. 운영 주의 사항

- serving VM 과 training VM 은 가능하면 분리하는 편이 안전하다.
- REMOTE_TRAINING_REPO_DIR 는 dedicated clone 을 권장한다.
- 동시에 여러 학습을 돌리지 않으려면 REMOTE_TRAINING_ALLOW_CONCURRENT=false 를 유지한다.
- 장기 운영 시 /opt/ai-gods-remote-jobs 아래 오래된 job 로그를 주기적으로 지운다.
- VM 이 꺼져 있거나 webhook 이 죽어 있으면 GitHub 쪽은 remote trigger 단계에서 실패한다.