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
-- 9. reward_events — 강화학습용 보상 이벤트
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reward_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id    uuid REFERENCES public.debates (id) ON DELETE CASCADE,
  god_id       text,
  event_type   text NOT NULL,
  reward_score double precision NOT NULL DEFAULT 0.0,
  reward_label text,
  source       text NOT NULL DEFAULT 'system',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reward_events_debate_id  ON public.reward_events (debate_id);
CREATE INDEX IF NOT EXISTS idx_reward_events_god_id     ON public.reward_events (god_id);
CREATE INDEX IF NOT EXISTS idx_reward_events_created_at ON public.reward_events (created_at DESC);


-- ============================================================
-- 10. preference_pairs — DPO/RLAIF용 선호 쌍
-- ============================================================
CREATE TABLE IF NOT EXISTS public.preference_pairs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id     uuid REFERENCES public.debates (id) ON DELETE CASCADE,
  god_id        text NOT NULL,
  topic         text NOT NULL,
  prompt        text NOT NULL,
  chosen        text NOT NULL,
  rejected      text NOT NULL,
  chosen_round  integer,
  rejected_round integer,
  reward_score  double precision NOT NULL DEFAULT 0.0,
  status        text NOT NULL DEFAULT 'ready',
  source        text NOT NULL DEFAULT 'auto_debate_reward',
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_debate_id  ON public.preference_pairs (debate_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_god_id     ON public.preference_pairs (god_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_status     ON public.preference_pairs (status);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_created_at ON public.preference_pairs (created_at DESC);


-- ============================================================
-- 11. debate_archives — 토론 원문 가상창고 인덱스
-- ============================================================
CREATE TABLE IF NOT EXISTS public.debate_archives (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id             uuid NOT NULL UNIQUE REFERENCES public.debates (id) ON DELETE CASCADE,
  bucket_name           text NOT NULL DEFAULT 'debate-archives',
  object_path           text NOT NULL,
  format                text NOT NULL DEFAULT 'json.gz',
  sha256                text NOT NULL,
  byte_size             bigint NOT NULL DEFAULT 0,
  message_count         integer NOT NULL DEFAULT 0,
  reward_event_count    integer NOT NULL DEFAULT 0,
  preference_pair_count integer NOT NULL DEFAULT 0,
  archive_version       integer NOT NULL DEFAULT 1,
  source                text NOT NULL DEFAULT 'system',
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debate_archives_archived_at ON public.debate_archives (archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_debate_archives_source      ON public.debate_archives (source);


-- ============================================================
-- 12. dataset_versions — 학습 스냅샷/데이터셋 레지스트리
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dataset_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id          text NOT NULL,
  dataset_kind         text NOT NULL,
  god_id               text NOT NULL DEFAULT 'all',
  bucket_name          text NOT NULL DEFAULT 'training-datasets',
  object_path          text NOT NULL,
  file_format          text NOT NULL DEFAULT 'json',
  sample_count         integer NOT NULL DEFAULT 0,
  source_debate_count  integer NOT NULL DEFAULT 0,
  source_archive_count integer NOT NULL DEFAULT 0,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dataset_versions_unique
  ON public.dataset_versions (snapshot_id, dataset_kind, god_id, object_path);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_created_at ON public.dataset_versions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_kind       ON public.dataset_versions (dataset_kind);


-- ============================================================
-- 13. training_runs — 학습 실행 레지스트리
-- ============================================================
CREATE TABLE IF NOT EXISTS public.training_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              text NOT NULL,
  agent_id            text NOT NULL DEFAULT 'all',
  phase               text NOT NULL,
  status              text NOT NULL DEFAULT 'queued',
  dataset_snapshot_id text,
  base_model          text,
  adapter_path        text,
  output_path         text,
  metrics             jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_runs_unique
  ON public.training_runs (run_id, phase, agent_id);
CREATE INDEX IF NOT EXISTS idx_training_runs_created_at ON public.training_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_runs_status     ON public.training_runs (status);


-- ============================================================
-- 14. model_versions — 모델 버전 레지스트리
-- ============================================================
CREATE TABLE IF NOT EXISTS public.model_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          text NOT NULL,
  run_id            text NOT NULL,
  model_name        text NOT NULL,
  ollama_model_name text,
  base_model        text,
  artifact_path     text,
  gguf_path         text,
  rollout_state     text NOT NULL DEFAULT 'registered',
  is_active         boolean NOT NULL DEFAULT false,
  metrics           jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_unique
  ON public.model_versions (agent_id, run_id, model_name);
CREATE INDEX IF NOT EXISTS idx_model_versions_created_at ON public.model_versions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_versions_rollout    ON public.model_versions (rollout_state);


-- ============================================================
-- 14.1 debate_dossiers — 보고서/PPT 생성용 구조화 Dossier
-- ============================================================
CREATE TABLE IF NOT EXISTS public.debate_dossiers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id          uuid NOT NULL UNIQUE REFERENCES public.debates (id) ON DELETE CASCADE,
  topic              text NOT NULL,
  dossier_status     text NOT NULL DEFAULT 'needs_evidence',
  executive_summary  text,
  markdown_content   text,
  structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_count     integer NOT NULL DEFAULT 0,
  claim_count        integer NOT NULL DEFAULT 0,
  action_item_count  integer NOT NULL DEFAULT 0,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debate_dossiers_created_at ON public.debate_dossiers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debate_dossiers_status     ON public.debate_dossiers (dossier_status);

CREATE TABLE IF NOT EXISTS public.debate_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id           uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  evidence_type       text NOT NULL,
  source_kind         text NOT NULL,
  provider            text,
  source_url          text,
  external_id         text,
  title               text NOT NULL,
  excerpt             text,
  verification_status text NOT NULL DEFAULT 'unverified',
  mention_count       integer NOT NULL DEFAULT 1,
  mentioned_by        jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debate_evidence_debate_id   ON public.debate_evidence (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_evidence_source_kind ON public.debate_evidence (source_kind);
CREATE INDEX IF NOT EXISTS idx_debate_evidence_created_at  ON public.debate_evidence (created_at DESC);

CREATE TABLE IF NOT EXISTS public.debate_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id       uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  claim_key       text NOT NULL,
  owner_god_id    text,
  owner_god_name  text,
  round           integer NOT NULL DEFAULT 1,
  statement       text NOT NULL,
  evidence_status text NOT NULL DEFAULT 'missing',
  supporting_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_debate_claims_unique ON public.debate_claims (debate_id, claim_key);
CREATE INDEX IF NOT EXISTS idx_debate_claims_debate_id     ON public.debate_claims (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_claims_created_at    ON public.debate_claims (created_at DESC);

CREATE TABLE IF NOT EXISTS public.debate_artifacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id          uuid NOT NULL REFERENCES public.debates (id) ON DELETE CASCADE,
  artifact_type      text NOT NULL,
  title              text NOT NULL,
  format             text NOT NULL DEFAULT 'markdown',
  status             text NOT NULL DEFAULT 'ready',
  content_markdown   text,
  structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debate_artifacts_debate_id  ON public.debate_artifacts (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_artifacts_type       ON public.debate_artifacts (artifact_type);
CREATE INDEX IF NOT EXISTS idx_debate_artifacts_created_at ON public.debate_artifacts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.autonomous_topic_candidates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  rationale          text,
  focus_area         text,
  why_now            text,
  novelty_score      integer NOT NULL DEFAULT 0,
  urgency_score      integer NOT NULL DEFAULT 0,
  evidence_hint      text,
  recommended_output text,
  status             text NOT NULL DEFAULT 'proposed',
  source             text NOT NULL DEFAULT 'autonomous_topic_api',
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autonomous_topic_candidates_created_at ON public.autonomous_topic_candidates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_topic_candidates_status     ON public.autonomous_topic_candidates (status);

DROP TRIGGER IF EXISTS trg_debate_dossiers_updated_at ON public.debate_dossiers;
CREATE TRIGGER trg_debate_dossiers_updated_at
  BEFORE UPDATE ON public.debate_dossiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 15. storage buckets — 가상창고 원문/데이터셋 버킷
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'debate-archives',
  'debate-archives',
  false,
  1073741824,
  ARRAY['application/gzip', 'application/json']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-datasets',
  'training-datasets',
  false,
  1073741824,
  ARRAY['application/json', 'application/x-ndjson', 'application/jsonl']
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 16. god_stats — live + archive 통합 뷰로 재정의
-- ============================================================
CREATE OR REPLACE VIEW public.god_stats AS
WITH live_messages AS (
  SELECT
    dm.god_id,
    dm.god_name,
    COUNT(DISTINCT dm.debate_id) AS total_debates,
    COUNT(dm.id) AS total_messages,
    MAX(dm.created_at) AS last_active,
    SUM(LENGTH(dm.content)) AS total_response_length
  FROM public.debate_messages dm
  LEFT JOIN public.debate_archives da ON da.debate_id = dm.debate_id
  WHERE da.debate_id IS NULL
  GROUP BY dm.god_id, dm.god_name
),
archived_messages AS (
  SELECT
    stat.key AS god_id,
    COALESCE(NULLIF(stat.value->>'god_name', ''), stat.key) AS god_name,
    COUNT(*) AS total_debates,
    SUM(COALESCE((stat.value->>'message_count')::integer, 0)) AS total_messages,
    MAX(COALESCE((stat.value->>'last_active')::timestamptz, da.archived_at)) AS last_active,
    SUM(COALESCE((stat.value->>'total_characters')::integer, 0)) AS total_response_length
  FROM public.debate_archives da
  CROSS JOIN LATERAL jsonb_each(COALESCE(da.metadata->'god_stats', '{}'::jsonb)) AS stat(key, value)
  GROUP BY stat.key, COALESCE(NULLIF(stat.value->>'god_name', ''), stat.key)
),
combined AS (
  SELECT * FROM live_messages
  UNION ALL
  SELECT * FROM archived_messages
)
SELECT
  god_id,
  MAX(god_name) AS god_name,
  SUM(total_debates) AS total_debates,
  SUM(total_messages) AS total_messages,
  MAX(last_active) AS last_active,
  ROUND((SUM(total_response_length)::numeric / NULLIF(SUM(total_messages), 0)), 0) AS avg_response_length
FROM combined
GROUP BY god_id;


-- ============================================================
-- 17. update_memory_relevance — 반감기 갱신 RPC
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
-- 18. RLS 정책 (Row Level Security)
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
ALTER TABLE public.reward_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_topic_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;

-- 이전의 광범위한 공개 정책 제거
DO $$
DECLARE
  tbls text[] := ARRAY[
    'debates', 'debate_messages', 'god_memories',
    'memory_links', 'neuro_logs', 'arousal_logs', 'immune_logs',
    'reward_events', 'preference_pairs', 'debate_dossiers', 'debate_evidence', 'debate_claims', 'debate_artifacts', 'autonomous_topic_candidates', 'debate_archives',
    'dataset_versions', 'training_runs', 'model_versions'
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
REVOKE ALL ON TABLE public.reward_events   FROM anon, authenticated;
REVOKE ALL ON TABLE public.preference_pairs FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_dossiers FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_evidence FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_artifacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.autonomous_topic_candidates FROM anon, authenticated;
REVOKE ALL ON TABLE public.debate_archives FROM anon, authenticated;
REVOKE ALL ON TABLE public.dataset_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.training_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.model_versions FROM anon, authenticated;

-- service_role 키는 RLS를 우회하므로 별도 정책 없이 서버 API에서 사용 가능
