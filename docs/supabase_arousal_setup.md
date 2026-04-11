**Supabase 테이블 생성 — Neuro & Arousal 로그**

추가 참고:
- Supabase MCP 사용 가이드: [supabase_mcp_usage.md](./supabase_mcp_usage.md)

요약: 리포지토리의 `src/services/neuroModulator.js`와 `src/services/arousalController.js`가 Supabase로 로그를 보낼 수 있도록, 아래 SQL로 테이블을 만듭니다.

- SQL 파일: [db/supabase_create_neuro_arousal_tables.sql](db/supabase_create_neuro_arousal_tables.sql#L1-L200)

실행 방법 (선택):

1) Supabase Dashboard (권장)
  - 프로젝트 > SQL Editor 열기
  - `db/supabase_create_neuro_arousal_tables.sql` 파일 내용을 붙여넣고 Run

2) psql (터미널)
  - Supabase > Settings > Database > Connection string 에서 connection string 확인
  - 예시:
```bash
psql "postgresql://<db_user>:<db_pass>@<host>:5432/<db_name>" -f db/supabase_create_neuro_arousal_tables.sql
```

환경변수 설정 (프로젝트 로컬):
  - `.env.local` 또는 Vercel 환경변수에 다음을 추가하세요.

```text
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

보안 권고:
  - 클라이언트에서 직접 로그를 넣는 경우는 `VITE_SUPABASE_ANON_KEY`를 사용합니다. 이 경우 반드시 Row Level Security(RLS) 정책을 설정해 허용된 동작만 가능하도록 하세요.
  - 서버(서브루틴)에서만 로그를 넣도록 하려면 서비스 역할 키(`SERVICE_ROLE_KEY`)를 사용하고, 브라우저에 노출하지 마세요. 서버에서만 호출하는 엔드포인트를 만들어 로그를 처리하는 것을 권장합니다.

테이블 예시 컬럼 설명:
  - `agent_id`: 신 식별자 (cco, cdo 등)
  - `dopamine`, `cortisol`: 실수값
  - `temperature`, `top_p`, `max_tokens`: 모델 샘플링 파라미터
  - `heart_rate`, `burst`, `token_factor`, `suggested_delay_ms`: 아로잘(심박) 관련 값
  - `metadata`: 추가 컨텍스트(선택)

다음으로 원하시면:
  - 제가 Supabase에 접속해 직접 SQL을 실행해 드릴 수 없습니다(자격 증명 필요). 대신 실행 가이드로 원격 접속 커맨드나 supabase CLI용 스니펫을 더 만들어 드리겠습니다.
  - RLS 예시 정책을 생성해 드릴까요? (예: 인증된 사용자만 INSERT 허용)

  RLS 적용 자동 스크립트:
  - 파일: `db/supabase_apply_rls_policies.sql`
    - 이 파일은 리포지토리에 추가되어 있으며, Supabase SQL Editor에 붙여넣거나 파일 내용을 실행하면
      `neuro_logs`와 `arousal_logs`에 대한 기본 INSERT/SELECT 정책을 생성하고 RLS를 활성화합니다.

  실행 방법 (대시보드):
  1) Supabase 프로젝트 > SQL Editor
  2) `db/supabase_apply_rls_policies.sql` 파일 내용 붙여넣기
  3) Run 클릭

  주의: RLS를 활성화하면 브라우저에서 직접 쓰려면 클라이언트가 인증되어야 합니다. 서버에서 로그를 넣을
  경우 `service_role` 키를 사용한 서버 엔드포인트에서 처리하세요(절대 브라우저에 노출 금지).

  면역 로그 (Immune System)
   - 면역 시스템에서 격리(Quarantine)한 항원 정보를 저장하려면 다음 SQL을 실행하세요:
     - 파일: `db/supabase_create_immune_table.sql`
     - 이 파일은 `immune_logs` 테이블(격리된 메시지, 이유, 유사도 등)을 생성합니다.

  실행 순서 권장:
   1) 기존 `db/supabase_create_neuro_arousal_tables.sql`을 실행했다면
   2) `db/supabase_create_immune_table.sql` 실행
   3) `db/supabase_apply_rls_policies.sql` 실행 (RLS 정책 적용)

