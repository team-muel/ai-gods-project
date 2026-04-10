# AI Gods - 우주 공간의 AI 임원 회의 시스템

> 8명의 AI 신(神)들이 우주 공간에서 인류의 질문에 답한다

## 개요

8개의 독립 AI 인스턴스(CCO/CSO/CPO/CMO/CXO/CFO/CDO/CTO)가
3D 우주 공간에서 토론하고, 별도의 judge 에이전트 Aegis가 합의 여부와 최종 결론을 정리하는 시스템.

## 8명의 신

| 역할 | 이름 | 전문 분야 |
|------|------|----------|
| CCO | Muse (뮤즈) | 콘텐츠 전략, 브랜드 스토리텔링 |
| CSO | Atlas (아틀라스) | 기업 전략, 경쟁 분석 |
| CPO | Forge (포지) | 제품 개발, UX/UI |
| CMO | Mercury (머큐리) | 마케팅 전략, 퍼포먼스 |
| CXO | Empathy (엠파시) | 고객 경험, 서비스 디자인 |
| CFO | Prudence (프루던스) | 재무 분석, 리스크 관리 |
| CDO | Oracle (오라클) | 데이터 분석, 예측 모델링 |
| CTO | Nexus (넥서스) | 시스템 아키텍처, 기술 전략 |

내부 judge:
- Aegis (이지스): 토론자와 분리된 중립 심판. 합의 판정과 최종 권고안 작성만 담당

## 기술 스택

- **프론트엔드**: React 18 + Vite
- **3D 렌더링**: Three.js + @react-three/fiber + @react-three/drei
- **포스트 프로세싱**: @react-three/postprocessing (Bloom 효과)
- **애니메이션**: Framer Motion
- **상태 관리**: Zustand
- **스타일링**: Tailwind CSS

## 런타임 구조

- 운영 경로: /api/chat -> Groq llama-3.1-8b-instant
- 로컬 개발 경로: /api/chat -> Vite dev proxy -> 로컬 Ollama direct
- 역할 정의 단일 소스: src/config/aiGods.js
- 최종 판정자: 토론자와 분리된 Aegis judge

로컬 개발 원칙:
- 브라우저에서 직접 localhost:11434를 호출하지 않습니다.
- 커스텀 god-server.py는 기본 경로가 아닙니다.
- Ollama가 있으면 각 agent의 로컬 태그 ai-muse, ai-atlas, ai-forge, ai-mercury, ai-empathy, ai-prudence, ai-oracle, ai-nexus를 사용합니다.
- 로컬 태그가 없으면 fallback 모델 llama3.1:8b로 내려갑니다.

## 로컬 실행

1. Ollama 실행: ollama serve
2. 로컬 모델 생성: node scripts/create-gods.js
3. 앱 실행: npm run dev
4. 역할 샘플 확인:
	- Groq 경로: node scripts/check-agent-samples.mjs
	- Ollama 경로: set AGENT_SAMPLE_PROVIDER=ollama && node scripts/check-agent-samples.mjs



## 개발 로드맵

- **Phase 1** (현재): 3D 우주 공간 UI + 기초 설정
- **Phase 2**: 8개 독립 AI 인스턴스 + 분리된 judge + 오케스트레이터
- **Phase 3**: 3D 시각 효과 고도화
- **Phase 4**: 학습 & 성장 시스템
- **Phase 5**: 배포 & 최적화

## 조작법

- **마우스 드래그**: 3D 공간 회전
- **마우스 휠**: 줌 인/아웃
- **구체 클릭**: AI 신 상세 정보 확인
- **좌측 패널**: 질문 입력 후 토론 시작
