-- ============================================================
-- AI Gods — Supabase 전체 셋업 (한 번에 실행)
-- Supabase Dashboard > SQL Editor에 이 파일 전체를 붙여넣고 Run
-- ============================================================

-- 확장 기능
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. debates — 토론 메타
-- ============================================================
CREATE TABLE IF NOT EXISTS public.debates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic        text NOT NULL,
  is_youtube   boolean NOT NULL DEFAULT false,
  total_rounds integer NOT NULL DEFAULT 1,
  consensus    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debates_created_at ON public.debates (created_at DESC);


-- ============================================================
-- 2. debate_messages — 라운드별 발언
-- ============================================================
CREATE TABLE IF NOT EXISTS public.debate_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id  uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  god_id     text NOT NULL,
  god_name   text,
  round      integer NOT NULL DEFAULT 1,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debate_messages_debate_id ON public.debate_messages (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_messages_god_id   ON public.debate_messages (god_id);


-- ============================================================
-- 3. god_memories — 신별 장기 기억 (반감기 기반)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.god_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  god_id          text NOT NULL,
  debate_id       uuid REFERENCES public.debates (id) ON DELETE SET NULL,
  topic           text NOT NULL,
  my_opinion      text,
  consensus       text,
  relevance_score double precision NOT NULL DEFAULT 1.0,
  status          text NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_god_memories_god_id     ON public.god_memories (god_id);
CREATE INDEX IF NOT EXISTS idx_god_memories_status     ON public.god_memories (status);
CREATE INDEX IF NOT EXISTS idx_god_memories_created_at ON public.god_memories (created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_god_memories_updated_at ON public.god_memories;
CREATE TRIGGER trg_god_memories_updated_at
  BEFORE UPDATE ON public.god_memories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 4. memory_links — 기억 간 관계 그래프
-- ============================================================
CREATE TABLE IF NOT EXISTS public.memory_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id_a  uuid NOT NULL REFERENCES public.god_memories (id) ON DELETE CASCADE,
  memory_id_b  uuid NOT NULL REFERENCES public.god_memories (id) ON DELETE CASCADE,
  relationship text NOT NULL,  -- 'related' | 'derived_from' | 'supersedes'
  strength     double precision NOT NULL DEFAULT 0.0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_links_a ON public.memory_links (memory_id_a);
CREATE INDEX IF NOT EXISTS idx_memory_links_b ON public.memory_links (memory_id_b);


-- ============================================================
-- 5. god_stats — 신별 통계 (뷰)
-- ============================================================
CREATE OR REPLACE VIEW public.god_stats AS
SELECT
  dm.god_id,
  dm.god_name                          AS god_name,
  COUNT(DISTINCT dm.debate_id)         AS total_debates,
  COUNT(dm.id)                         AS total_messages,
  MAX(dm.created_at)                   AS last_active,
  ROUND(AVG(LENGTH(dm.content))::numeric, 0) AS avg_response_length
FROM public.debate_messages dm
GROUP BY dm.god_id, dm.god_name;


-- ============================================================
-- 6. neuro_logs — 도파민/코르티솔 변화 기록
-- ============================================================
CREATE TABLE IF NOT EXISTS public.neuro_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    text NOT NULL,
  dopamine    double precision,
  cortisol    double precision,
  temperature double precision,
  top_p       double precision,
  max_tokens  integer,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_neuro_logs_agent_id   ON public.neuro_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_neuro_logs_created_at ON public.neuro_logs (created_at DESC);


-- ============================================================
-- 7. arousal_logs — 심박수(HR) 변화 기록
-- ============================================================
CREATE TABLE IF NOT EXISTS public.arousal_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           text NOT NULL,
  heart_rate         double precision,
  burst              boolean,
  token_factor       double precision,
  suggested_delay_ms integer,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arousal_logs_agent_id   ON public.arousal_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_arousal_logs_created_at ON public.arousal_logs (created_at DESC);


-- ============================================================
-- 8. immune_logs — 환각 탐지 / 격리 기록
-- ============================================================
CREATE TABLE IF NOT EXISTS public.immune_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   text NOT NULL,
  source     text,
  content    text,
  reason     text,
  similarity double precision,
  status     text NOT NULL DEFAULT 'quarantined',  -- 'quarantined' | 'released'
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_immune_logs_agent_id   ON public.immune_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_immune_logs_created_at ON public.immune_logs (created_at DESC);


-- ============================================================
-- 9. update_memory_relevance — 반감기 갱신 RPC
--    memoryService.js의 refreshRelevanceScores()가 호출
--    21일 반감기: score * 0.5^(경과일/21)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_memory_relevance()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.god_memories
  SET
    relevance_score = GREATEST(
      0.01,
      relevance_score * pow(
        0.5,
        EXTRACT(EPOCH FROM (now() - updated_at)) / (21.0 * 86400)
      )
    ),
    updated_at = now()
  WHERE status = 'active'
    AND relevance_score > 0.01;
END;
$$;


-- ============================================================
-- 10. RLS 정책 (Row Level Security)
--     브라우저에서는 직접 DB 접근을 허용하지 않음
--     모든 읽기/쓰기는 서버 API + service_role 키 경유
-- ============================================================

-- RLS 활성화
ALTER TABLE public.debates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.god_memories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neuro_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arousal_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immune_logs     ENABLE ROW LEVEL SECURITY;

-- 이전의 광범위한 공개 정책 제거
DO $$
DECLARE
  tbls text[] := ARRAY[
    'debates', 'debate_messages', 'god_memories',
    'memory_links', 'neuro_logs', 'arousal_logs', 'immune_logs'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS allow_all_anon ON public.%I',
      tbl
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS allow_all_authenticated ON public.%I',
      tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS allow_insert_neuro_authenticated ON public.neuro_logs;
DROP POLICY IF EXISTS allow_select_neuro_authenticated ON public.neuro_logs;
DROP POLICY IF EXISTS allow_insert_arousal_authenticated ON public.arousal_logs;
DROP POLICY IF EXISTS allow_select_arousal_authenticated ON public.arousal_logs;

-- 권한도 명시적으로 회수
REVOKE ALL ON TABLE public.debates         FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.god_memories    FROM anon, authenticated;
REVOKE ALL ON TABLE public.memory_links    FROM anon, authenticated;
REVOKE ALL ON TABLE public.neuro_logs      FROM anon, authenticated;
REVOKE ALL ON TABLE public.arousal_logs    FROM anon, authenticated;
REVOKE ALL ON TABLE public.immune_logs     FROM anon, authenticated;

-- service_role 키는 RLS를 우회하므로 별도 정책 없이 서버 API에서 사용 가능
