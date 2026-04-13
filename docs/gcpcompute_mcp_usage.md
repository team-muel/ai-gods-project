# gcpCompute MCP 사용 가이드

이 워크스페이스는 이제 gcpCompute MCP 서버를 함께 사용할 수 있다.

- 워크스페이스 설정: [../.vscode/mcp.json](../.vscode/mcp.json)
- 프로젝트 설정: [../.vscode/mcp.json](../.vscode/mcp.json)
- 원본 참조: [../../third_party/discord-news-bot/.vscode/mcp.json](../../third_party/discord-news-bot/.vscode/mcp.json)

## 1. 지금 확인된 상태

2026-04-12 기준으로 아래가 실제 검증되었다.

- SSH 키 경로: C:/Users/user/.ssh/google_compute_engine
- SSH 접속: fancy@34.56.232.61 성공
- 원격 MCP 실행 전제조건:
  - /opt/muel/discord-news-bot 존재
  - config/env/unified-mcp.gcp.env 존재
  - scripts/unified-mcp-stdio.ts 존재
  - 원격 Node 실행 가능
- Obsidian 도구 호출 성공:
  - 파일 목록 조회 성공
  - 키워드 검색 성공
  - 파일 읽기 성공

주의:

- 원격 서버 내부의 Obsidian adapter status 기준으로 remote-mcp 중계 자체는 비활성이다.
- 대신 native-cli 와 local-fs adapter 가 살아 있으므로 obsidian-read/search/files 계열은 정상 동작한다.
- obsidian lore sync loop 는 현재 idle 상태다.

## 2. gcpCompute에서 실제로 쓸 만한 도구 축

실제 action catalog 에서 확인된 주요 축:

- Obsidian / knowledge:
  - obsidian.guild_doc.upsert
  - rag.retrieve
  - knowledge.update
- Web / research:
  - web.search
  - web.fetch
  - jarvis.research
  - community.search
- External / operator:
  - openjarvis.ops
  - operate.ops
  - implement.execute
  - review.review
  - architect.plan
  - nemoclaw.review
- Workflow / automation:
  - n8n.status
  - n8n.workflow.list
  - n8n.workflow.execute
  - n8n.workflow.trigger
- Database:
  - db.supabase.read

## 3. AI Gods에서 언제 무엇을 써야 하는가

### gcpCompute를 우선 쓸 때

- 원격 Obsidian vault 검색/읽기/쓰기
- 원격 wiki, lore, 운영 문서 RAG 조회
- 일반 웹 검색과 원문 fetch
- OpenJarvis, NemoClaw, n8n 같은 외부 어댑터/운영 도구 활용
- 팀 공용 control-plane 문서나 운영 노트 확인

예:

- 논의 주제와 비슷한 운영 메모를 vault 에서 찾기
- 외부 기사 원문을 fetch 해서 요약하기
- 원격 운영 runbook 읽기

### Supabase MCP를 우선 쓸 때

- DB 스키마 확인
- 테이블/컬럼/관계 확인
- 읽기 전용 데이터 점검
- 명시적인 쓰기 작업 또는 함수 관리

예:

- reward_events, preference_pairs, model_versions 상태 확인
- RLS 관련 테이블 구조 점검
- 타입 생성이나 함수 배포 전 점검

### 로컬 워크스페이스 도구를 우선 쓸 때

- AI Gods 코드 수정
- 로컬 파일 검색, 심볼 탐색, 리팩터링
- Vite/React/Node 런타임 디버깅
- 학습 스크립트 실행과 결과 확인

예:

- src/services/aiService.js 변경
- api/chat.js 가드 수정
- scripts/finetune-god.py 동작 점검

## 4. 추천 라우팅 규칙

한 줄 원칙:

- 코드 = 로컬
- 데이터베이스 = Supabase MCP
- 원격 운영 지식 / Obsidian / 외부 어댑터 = gcpCompute

실전 규칙:

1. 코드 구조 분석은 로컬 도구를 먼저 쓴다.
2. Supabase 테이블/스키마/데이터 점검은 supabase 또는 supabaseWrite 를 쓴다.
3. Obsidian note, lore, 운영 컨텍스트는 gcpCompute 를 쓴다.
4. 같은 정보를 로컬과 gcpCompute 둘 다 줄 수 있으면, 코드와 직접 관련된 것은 로컬을 우선한다.
5. 팀 공용 운영 문서, 외부 어댑터, 원격 vault 문맥은 gcpCompute 를 우선한다.

## 5. 이번 검증에서 확인된 Obsidian 상태

- adapter selected:
  - read/search/read_file/write_note = local-fs
  - daily_note/task_management = native-cli
- remote-mcp adapter = available false
- vault health = healthy true

즉, 현재 gcpCompute 서버는 "원격 VM 위에 있는 실제 vault" 를 local/native adapter 로 직접 다루는 구조에 가깝다.

## 6. 바로 써볼 수 있는 질문 예시

- gcpCompute 로 운영 vault 에서 MCP 관련 문서를 찾아줘.
- gcpCompute 로 원격 Obsidian 에서 discord-news-bot 관련 컨텍스트를 읽어줘.
- gcpCompute 의 web.fetch 로 특정 기사 원문을 가져와 요약해줘.
- Supabase MCP 로 training_runs 와 model_versions 테이블 상태를 확인해줘.

## 7. 현재 한계

- remote-mcp adapter 자체는 켜져 있지 않다.
- obsidian daily note 는 비어 있다.
- lore sync loop 는 현재 돌고 있지 않다.

그래도 검색/읽기/파일목록 조회가 이미 성공했기 때문에, 실사용에는 큰 문제는 없다.

## 8. 다음 단계

1. VS Code 가 MCP 설정을 다시 읽도록 창을 새로고침한다.
2. Copilot Chat 에서 gcpCompute 기반 Obsidian 또는 web 작업을 실제로 시킨다.
3. 필요하면 이후에 remote-mcp adapter 자체를 원격 서버에서 활성화한다.