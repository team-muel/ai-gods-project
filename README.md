# AI Gods - 우주 공간의 AI 임원 회의 시스템

> 8명의 역할 특화 AI 임원이 토론하고, Aegis가 결론을 정리하는 3D 회의 시뮬레이터

## 개요

AI Gods는 8명의 AI 임원 에이전트가 하나의 주제를 서로 다른 직무 관점에서 토론하는 시스템입니다.

핵심 흐름은 다음과 같습니다.

1. 사용자가 질문이나 YouTube 맥락을 입력합니다.
2. 각 에이전트가 검색 결과, 과거 메모리, Obsidian 기록을 참고해 초기 의견을 냅니다.
3. 여러 라운드의 토론을 거친 뒤, Aegis가 합의 여부를 판정하고 최종 권고안을 작성합니다.
4. 토론 결과와 로그는 Supabase에 저장되고, 필요하면 Obsidian vault와 동기화됩니다.

현재 학습 구조는 완전 자동 재학습 루프가 아니라, 토론 데이터를 축적한 뒤 배치 스크립트로 export, SFT, DPO를 수행하는 형태입니다.

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
- Obsidian 동기화: 로컬 vault 또는 서버 API 계층

### 생체 모사 런타임

- Neuro modulator: 도파민, 코르티솔 상태값으로 sampling을 조절합니다.
- Arousal controller: 심박 기반 urgency로 응답 길이와 리듬을 조절합니다.
- Immune system: 낮은 유사도 또는 비정상 응답을 감지해 quarantine 로그를 남깁니다.

### 학습 파이프라인 상태

- 토론 후 결과는 Supabase와 Obsidian으로 축적됩니다.
- export-training-data.py와 generate_dpo_data.py가 학습용 데이터를 생성합니다.
- finetune-god.py, train_dpo.py, merge-and-register.py로 배치 학습을 진행합니다.
- 즉, 토론 직후 모델이 자동 재학습되는 구조는 아직 아닙니다.

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
3. Obsidian 연동이 필요하면 OBSIDIAN_VAULT_PATH를 설정합니다.

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
- npm run export-data: SFT용 데이터 export
- npm run train: export + finetune + 모델 등록
- npm run train:dpo: DPO 데이터 생성 + DPO 학습
- npm run sync-obsidian: Supabase -> Obsidian 동기화
- npm run watch-obsidian: Obsidian 변경 감시

## GitHub 자동화

- CI: push와 pull request 시 빌드 검증
- AI Gods 자동 토론: schedule, workflow_dispatch, push 에 반응
- 자동 토론 워크플로는 debates, outputs 같은 생성 산출물만 바뀐 경우에는 다시 돌지 않도록 구성되어 있습니다.

GitHub Actions에서 자동 토론이 정상 동작하려면 다음 Secrets가 필요합니다.

- GROQ_API_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SERPER_API_KEY

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
