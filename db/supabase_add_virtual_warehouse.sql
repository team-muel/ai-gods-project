-- ============================================================
-- AI Gods — Virtual Warehouse Incremental Migration
-- debate_archives / dataset_versions / training_runs / model_versions
-- storage buckets: debate-archives / training-datasets
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

ALTER TABLE public.debate_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_anon ON public.debate_archives;
DROP POLICY IF EXISTS allow_all_authenticated ON public.debate_archives;
DROP POLICY IF EXISTS allow_all_anon ON public.dataset_versions;
DROP POLICY IF EXISTS allow_all_authenticated ON public.dataset_versions;
DROP POLICY IF EXISTS allow_all_anon ON public.training_runs;
DROP POLICY IF EXISTS allow_all_authenticated ON public.training_runs;
DROP POLICY IF EXISTS allow_all_anon ON public.model_versions;
DROP POLICY IF EXISTS allow_all_authenticated ON public.model_versions;

REVOKE ALL ON TABLE public.debate_archives FROM anon, authenticated;
REVOKE ALL ON TABLE public.dataset_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.training_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.model_versions FROM anon, authenticated;