# AI Gods - 우주 공간의 AI 임원 회의 시스템

> 8명의 AI 신(神)들이 우주 공간에서 인류의 질문에 답한다

## 개요

8개의 독립 AI 인스턴스(CCO/CSO/CPO/CMO/CXO/CFO/CDO/CTO)가
3D 우주 공간에서 토론하며 멀티 관점 인사이트를 도출하는 시스템.

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

## 기술 스택

- **프론트엔드**: React 18 + Vite
- **3D 렌더링**: Three.js + @react-three/fiber + @react-three/drei
- **포스트 프로세싱**: @react-three/postprocessing (Bloom 효과)
- **애니메이션**: Framer Motion
- **상태 관리**: Zustand
- **스타일링**: Tailwind CSS

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (http://localhost:3000)
npm run dev

# 프로덕션 빌드
npm run build
```

## 프로젝트 구조

```
src/
├── config/
│   └── aiGods.js          # 8명의 AI 신 정의
├── components/
│   ├── GodSphere.jsx      # 3D AI 구체
│   ├── ConnectionLines.jsx # AI 간 연결선
│   ├── CenterHologram.jsx # 중앙 홀로그램
│   └── ui/
│       ├── LeftPanel.jsx  # 질문 입력 패널
│       ├── RightPanel.jsx # 실시간 로그 패널
│       └── BottomBar.jsx  # 하단 통계 바
├── App.jsx                # 메인 앱
├── main.jsx               # 진입점
└── index.css              # 전역 스타일
```

## 개발 로드맵

- **Phase 1** (현재): 3D 우주 공간 UI + 기초 설정
- **Phase 2**: 8개 독립 AI 인스턴스 + 오케스트레이터
- **Phase 3**: 3D 시각 효과 고도화
- **Phase 4**: 학습 & 성장 시스템
- **Phase 5**: 배포 & 최적화

## 조작법

- **마우스 드래그**: 3D 공간 회전
- **마우스 휠**: 줌 인/아웃
- **구체 클릭**: AI 신 상세 정보 확인
- **좌측 패널**: 질문 입력 후 토론 시작
