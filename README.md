# AI Gods - 우주 공간의 AI 임원 회의 시스템

> 8명의 역할 특화 AI 임원이 토론하고, Aegis가 결론을 정리하는 3D 회의 시뮬레이터

## 개요

AI Gods는 8명의 AI 임원 에이전트가 하나의 주제를 서로 다른 직무 관점에서 토론하는 시스템입니다.

핵심 흐름은 다음과 같습니다.

1. 사용자가 질문이나 YouTube 맥락을 입력합니다.
2. 각 에이전트가 검색 결과, 과거 메모리, Obsidian 기록을 참고해 초기 의견을 냅니다.
3. 여러 라운드의 토론을 거친 뒤, Aegis가 합의 여부를 판정하고 최종 권고안을 작성합니다.
4. 토론 결과와 로그는 Supabase에 저장되고, 필요하면 Obsidian vault와 동기화됩니다.

현재 운영 경로는 Vercel과 GitHub에서 Groq를 사용하고, 로컬은 테스트용 Ollama 경로를 유지하는 구조입니다. 학습 구조는 완전 자동 온라인 재학습 루프가 아니라, 토론 데이터를 축적한 뒤 reward_events와 preference_pairs를 만들고, readiness를 평가한 후 배치 스크립트로 export, SFT, DPO를 수행하는 형태입니다.

## 에이전트 구성

| 역할 | 이름 | 주요 관점 |
|------|------|----------|
| CCO | Muse (뮤즈) | 콘텐츠 전략, 브랜드 서사, 창의 실험 |
| CSO | Atlas (아틀라스) | 장기 전략, 경쟁 우위, 시장 포지셔닝 |
| CPO | Forge (포지) | 제품 우선순위, 사용자 문제, 로드맵 |
| CMO | Mercury (머큐리) | 성장 채널, 메시지, 퍼널 전환 |
| CXO | Empathy (엠파시) | 고객 감정, 경험 마찰, 신뢰 형성 |
| CFO | Prudence (프루던스) | 수익성, 현금흐름, 하방 리스크 |
| CDO | Oracle (오라클) | 데이터 근거, 지표, 실험 설계 |
| CTO | Nexus (넥서스) | 시스템 구조, 구현 난이도, 운영 안정성 |

내부 judge:
- Aegis (이지스): 토론자와 분리된 중립 심판으로, 합의 판정과 최종 권고안 작성만 담당합니다.

## 현재 구조

### 실행 경로

- 운영 환경: /api/chat -> Vercel serverless API -> Groq llama-3.1-8b-instant
- 로컬 개발: /api/chat -> Vite dev proxy -> 로컬 Ollama direct
- 역할 정의 단일 소스: src/config/aiGods.js
- 최종 판정: 토론자와 분리된 Aegis judge

### 저장 경로

- 토론 메타: debates
- 라운드별 발언: debate_messages
- 신별 장기 기억: god_memories
- 기억 관계 그래프: memory_links
- 생체 모사 로그: neuro_logs, arousal_logs, immune_logs
- 가상창고 인덱스: debate_archives, dataset_versions, training_runs, model_versions
- Obsidian 동기화: 로컬 vault 또는 서버 API 계층

### 가상창고 구조

- Hot: Supabase 테이블은 최근 토론, 통계, 메모리, reward 신호, 아카이브 포인터만 유지합니다.
- Raw: 토론 원문 전체는 debate-archives 버킷에 json.gz 아카이브로 저장합니다.
- Curated: 재학습용 스냅샷과 SFT/DPO 데이터셋은 training-datasets 버킷과 warehouse/snapshots 아래에 버전별로 저장합니다.
- Registry: 학습 실행과 병합된 모델 버전은 training_runs, model_versions에 기록합니다.

### 생체 모사 런타임

- Neuro modulator: 도파민, 코르티솔 상태값으로 sampling을 조절합니다.
- Arousal controller: 심박 기반 urgency로 응답 길이와 리듬을 조절합니다.
- Immune system: 낮은 유사도 또는 비정상 응답을 감지해 quarantine 로그를 남깁니다.

### 학습 파이프라인 상태

- 토론 후 결과는 Supabase와 Obsidian으로 축적됩니다.
- reward_events와 preference_pairs가 있으면 토론 결과에서 자동 생성되어 강화학습용 보상 신호로 축적됩니다.
- 아직 이 테이블을 만들지 않아도 기본 토론 저장과 운영은 유지되며, 보상학습 경로만 자동으로 비활성화되거나 기존 합의 토론 기반 경로로 폴백됩니다.
- check-training-readiness.mjs가 토론 수, 합의 수, 신별 memory 수를 기준으로 학습 readiness를 평가합니다.
- build-training-snapshots.mjs가 debate_archives와 최근 live 토론을 합쳐 warehouse snapshot을 생성합니다.
- export-training-data.py와 generate_dpo_data.py는 warehouse snapshot을 우선 읽고, 없으면 기존 DB 직조회로 폴백합니다.
- prepare-training-datasets.mjs가 snapshot 생성, SFT/DPO 데이터셋 생성, dataset_versions 등록까지 한 번에 수행합니다.
- finetune-god.py, train_dpo.py, merge-and-register.py로 배치 학습을 진행합니다.
- GitHub에서는 자동 토론 후 readiness 평가와 dataset export까지 반자동으로 수행할 수 있습니다.
- 실제 SFT와 DPO 학습은 self-hosted GPU runner에서만 수행하는 구조로 두는 것이 현실적입니다.
- self-hosted 대신 외부 GPU 웹훅을 연결하면 GitHub가 dataset 준비 후 원격 학습을 자동 트리거할 수 있습니다.
- 모델 산출물 퍼블리시는 기본적으로 최소 어댑터 파일만 대상으로 하며, 토론 원문과 dataset 은 계속 Supabase Storage 에만 둡니다.

## 기술 스택

- 프론트엔드: React 18 + Vite
- 3D 렌더링: Three.js + @react-three/fiber + @react-three/drei
- 포스트 프로세싱: @react-three/postprocessing
- 애니메이션: Framer Motion
- 상태 관리: Zustand
- 스타일링: Tailwind CSS
- 저장소: Supabase
- 로컬 모델 런타임: Ollama
- 운영 모델 런타임: Groq
- 자동화: GitHub Actions

## 로컬 개발 원칙

- 브라우저가 localhost:11434를 직접 호출하지 않습니다.
- 로컬 모델 호출도 항상 /api/chat 경유로 맞춥니다.
- 커스텀 god-server.py는 기본 경로가 아닙니다.
- 로컬 태그가 있으면 ai-muse, ai-atlas, ai-forge, ai-mercury, ai-empathy, ai-prudence, ai-oracle, ai-nexus를 사용합니다.
- 로컬 태그가 없으면 fallback 모델 llama3.1:8b를 사용합니다.

## 로컬 실행

### 준비

1. 의존성 설치: npm install
2. 필요하면 .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GROQ_API_KEY를 설정합니다.
2-1. reward-learning과 RLS를 같이 쓰려면 SUPABASE_SERVICE_ROLE_KEY를 서버/스크립트 환경에 넣는 편이 안전합니다.
3. Obsidian 연동이 필요하면 OBSIDIAN_VAULT_PATH를 설정합니다.
3-1. 가상창고를 쓰려면 SUPABASE_ARCHIVE_BUCKET, SUPABASE_DATASET_BUCKET, SUPABASE_ARCHIVE_BUCKET_FILE_SIZE_LIMIT_BYTES, SUPABASE_DATASET_BUCKET_FILE_SIZE_LIMIT_BYTES, WAREHOUSE_ARCHIVE_AFTER_DAYS, WAREHOUSE_PRUNE_AFTER_DAYS 를 필요에 맞게 조정합니다.
4. 운영 대시보드를 쓰려면 GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, VERCEL_TOKEN, VERCEL_PROJECT_NAME 또는 VERCEL_PROJECT_ID, 필요하면 VERCEL_TEAM_ID를 추가합니다.
5. 위 값을 Vercel 프로젝트에 자동 업서트하려면 npm run setup:ops-env 를 사용합니다.

### 실행 순서

1. Ollama 실행: ollama serve
2. 로컬 모델 생성: node scripts/create-gods.js
3. 앱 실행: npm run dev
4. 샘플 응답 확인:
	- Groq 경로: node scripts/check-agent-samples.mjs
	- PowerShell Ollama 경로: $env:AGENT_SAMPLE_PROVIDER='ollama'; node scripts/check-agent-samples.mjs
	- CMD Ollama 경로: set AGENT_SAMPLE_PROVIDER=ollama && node scripts/check-agent-samples.mjs

## 주요 스크립트

- npm run build: 프로덕션 빌드
- npm run apply-rls: Supabase RLS SQL 적용
- npm run setup:ops-env: 운영 대시보드용 GitHub/Vercel 환경변수 업서트
- npm run check:warehouse: 가상창고 테이블, storage bucket, 로컬 snapshot 상태 점검
- npm run check:training-readiness: 재학습 readiness 평가
- npm run prepare:training-data: warehouse snapshot 생성 + SFT/DPO 데이터셋 생성 + dataset_versions 등록
- npm run warehouse:activate: bucket 자동 생성 시도 + 기존 debate archive backfill + snapshot/dataset 재생성
- npm run train:remote-trigger: signed URL 기반 원격 GPU 학습 요청 생성 및 웹훅 전송
- npm run train:cloud: 원격 GPU 러너에서 SFT, DPO, 병합, Hugging Face 업로드 일괄 실행
- npm run export-data: SFT용 데이터 export
- npm run train: export + finetune + 모델 등록
- npm run train:dpo: DPO 데이터 생성 + DPO 학습
- npm run warehouse:snapshot: warehouse snapshot만 생성
- npm run warehouse:maintain: 오래된 토론을 archive하고 debate_messages를 정리
- npm run sync-obsidian: Supabase -> Obsidian 동기화
- npm run watch-obsidian: Obsidian 변경 감시

## GitHub 자동화

- CI: push와 pull request 시 빌드 검증
- AI Gods 자동 토론: schedule, workflow_dispatch, push 에 반응
- AI Gods 재학습 파이프라인: 자동 토론 성공 뒤 readiness를 평가하고, 조건을 넘으면 warehouse snapshot과 training-data/dpo-data를 아티팩트로 준비합니다.
- 실제 SFT와 DPO는 workflow_dispatch + self-hosted runner에서만 실행하도록 분리했습니다.
- 외부 GPU 서비스가 준비되면 같은 워크플로의 train-remote-cloud job 이 signed URL payload 를 만들고 원격 학습을 트리거합니다.
- 자동 토론 워크플로는 debates, outputs 같은 생성 산출물만 바뀐 경우에는 다시 돌지 않도록 구성되어 있습니다.
- reward-learning 테이블을 RLS와 함께 쓰려면 GitHub Actions에도 SUPABASE_SERVICE_ROLE_KEY secret을 추가하는 것이 권장됩니다.
- warehouse-maintenance 워크플로는 오래된 토론을 archive한 뒤 debate_messages를 자동 정리합니다.

GitHub Actions에서 자동 토론이 정상 동작하려면 다음 Secrets가 필요합니다.

- GROQ_API_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SERPER_API_KEY

재학습 readiness와 dataset export까지 정상 동작하려면 같은 Secrets를 그대로 사용합니다. 실제 self-hosted 학습까지 돌리려면 runner 환경에 Python, torch 계열 패키지, 그리고 필요하면 Ollama가 추가로 준비돼 있어야 합니다.

로컬 PC 없이 자동 재학습까지 하려면 아래 값이 추가로 필요합니다.

- SUPABASE_SERVICE_ROLE_KEY
- HF_TOKEN
- HF_LORA_REPO
- REMOTE_TRAINING_WEBHOOK_URL
- REMOTE_TRAINING_BEARER_TOKEN 선택

허깅페이스 쪽에서 내용 정책으로 거부가 나면 MODEL_ARTIFACT_TARGET=supabase 로 바꾸면 됩니다. 그러면 학습 산출물도 training-datasets 또는 SUPABASE_MODEL_BUCKET 으로 올라가고, 허깅페이스에는 아무 것도 보내지 않습니다.

구조 설명은 docs/cloud_retraining.md 를 참고하면 됩니다.

reward-learning을 기존 프로젝트에 추가하려면 db/supabase_add_reward_learning_tables.sql 을 적용하세요. 이 단계는 선택 사항이고, 적용 전에도 기본 운영은 가능합니다. 이미 DB 접속 정보가 있다면 PowerShell에서 다음처럼 실행할 수 있습니다.

- $env:SUPABASE_SQL_FILE='db/supabase_add_reward_learning_tables.sql'; npm run apply-rls

가상창고를 기존 프로젝트에 추가하려면 db/supabase_add_virtual_warehouse.sql 을 적용하세요. debate-archives 와 training-datasets 버킷, debate_archives 와 model registry 테이블이 함께 생성됩니다.

- $env:SUPABASE_SQL_FILE='db/supabase_add_virtual_warehouse.sql'; npm run apply-rls

service role 이 준비된 뒤 기존 토론까지 한 번에 archive/backfill 하려면 아래 명령을 사용하세요.

- npm run warehouse:activate

현재 기본 bucket 파일 제한은 1 GiB 입니다. 이 값은 개별 archive/data file 하나당 상한이고 총 가상창고 용량이 아닙니다.

운영 대시보드가 GitHub와 Vercel 상태를 읽으려면 배포 환경 변수도 필요합니다.

- GITHUB_TOKEN
- GITHUB_REPO_OWNER
- GITHUB_REPO_NAME
- VERCEL_TOKEN
- VERCEL_PROJECT_NAME 또는 VERCEL_PROJECT_ID
- VERCEL_TEAM_ID (팀 스코프일 때만)

로컬 .env에 위 값을 넣은 뒤 아래 명령으로 Vercel 프로젝트에 같은 키를 한 번에 넣을 수 있습니다.

- npm run setup:ops-env

운영 대시보드는 추가로 8개 에이전트의 cutover readiness 점수를 보여줍니다. 이 점수는 총 토론 수, 최근 24시간 메시지량, 활성 메모리 수, 검역률, 평균 코르티솔을 합쳐 계산합니다.
## 문서 및 설정

- 역할 및 런타임 설정: src/config/aiGods.js
- Supabase MCP 설정: .vscode/mcp.json
- Supabase MCP 사용 가이드: docs/supabase_mcp_usage.md
- Supabase 전체 스키마 예시: db/supabase_setup_all.sql

## 조작법

- 마우스 드래그: 3D 공간 회전
- 마우스 휠: 줌 인, 줌 아웃
- 구체 클릭: AI 신 상세 정보 확인
- 좌측 패널: 질문 입력 후 토론 시작
