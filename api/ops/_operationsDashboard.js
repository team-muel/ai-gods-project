import { createClient } from '@supabase/supabase-js'
import { AI_GODS } from '../../src/config/aiGods.js'

export const DASHBOARD_WINDOW_HOURS = 24
export const DEFAULT_DASHBOARD_PAGE_SIZE = 12
const MAX_DASHBOARD_PAGE_SIZE = 24

const GITHUB_ERROR_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'stale',
  'timed_out',
])

const VERCEL_ERROR_STATES = new Set(['CANCELED', 'ERROR'])

const clampPositiveInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

const average = (values) => {
  const safeValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (safeValues.length === 0) return null
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length
}

const roundMetric = (value, digits = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)))

const resolveEnv = (env, keys) => keys.map((key) => env?.[key]).find(Boolean) || ''

const createSupabaseClient = (env) => {
  const url = resolveEnv(env, ['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const key = resolveEnv(env, ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY'])

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const createUnavailableSource = (source, message, extra = {}) => ({
  source,
  available: false,
  automaticRuns24h: 0,
  errorRuns24h: 0,
  successRuns24h: 0,
  recent: [],
  message,
  ...extra,
})

const createHeaders = (token) => {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ai-gods-project-ops-dashboard',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

const fetchJson = async (url, { headers } = {}) => {
  const response = await fetch(url, { headers })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.error || data?.message || `${response.status} ${response.statusText}`
    throw new Error(errorMessage)
  }

  return data
}

const normalizeDebate = (debate) => ({
  id: debate.id,
  topic: debate.topic,
  consensus: debate.consensus || '',
  createdAt: debate.created_at,
  totalRounds: debate.total_rounds || 1,
  isYoutube: Boolean(debate.is_youtube),
})

const getDebateMetrics = async ({ env, since, page, pageSize }) => {
  const supabase = createSupabaseClient(env)
  if (!supabase) {
    return {
      source: 'debates',
      available: false,
      totalCount: 0,
      last24hCount: 0,
      page,
      pageSize,
      totalPages: 1,
      latest: null,
      recent: [],
      collection: [],
      message: 'Supabase 환경변수가 설정되지 않아 토론 저장소를 조회할 수 없습니다.',
    }
  }

  const [{ count: totalCount, error: totalError }, { count: last24hCount, error: windowError }] = await Promise.all([
    supabase.from('debates').select('*', { count: 'exact', head: true }),
    supabase.from('debates').select('*', { count: 'exact', head: true }).gte('created_at', since.toISOString()),
  ])

  if (totalError) throw new Error(totalError.message)
  if (windowError) throw new Error(windowError.message)

  const latestResult = await supabase
    .from('debates')
    .select('id, topic, consensus, created_at, total_rounds, is_youtube')
    .order('created_at', { ascending: false })
    .limit(5)

  if (latestResult.error) throw new Error(latestResult.error.message)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const collectionResult = await supabase
    .from('debates')
    .select('id, topic, consensus, created_at, total_rounds, is_youtube', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (collectionResult.error) throw new Error(collectionResult.error.message)

  const recent = Array.isArray(latestResult.data) ? latestResult.data.map(normalizeDebate) : []
  const collection = Array.isArray(collectionResult.data) ? collectionResult.data.map(normalizeDebate) : []
  const exactCount = collectionResult.count ?? totalCount ?? 0

  return {
    source: 'debates',
    available: true,
    totalCount: totalCount || 0,
    last24hCount: last24hCount || 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(exactCount / pageSize)),
    latest: recent[0] || null,
    recent,
    collection,
  }
}

const buildCutoverDecision = (metrics) => {
  const evidenceScore = clampScore((metrics.totalDebates / 30) * 100)
  const activityScore = clampScore((metrics.recentMessages24h / 10) * 100)
  const memoryScore = clampScore((metrics.activeMemories / 20) * 100)
  const immuneScore = clampScore(100 - metrics.quarantineRate24h * 220)
  const stressScore = clampScore(100 - (metrics.avgCortisol24h || 0) * 80)
  const score = clampScore(
    evidenceScore * 0.25 +
    activityScore * 0.2 +
    memoryScore * 0.15 +
    immuneScore * 0.25 +
    stressScore * 0.15
  )

  if (score >= 80) {
    return {
      score,
      readiness: 'ready',
      recommendation: 'Groq와 병렬 비교를 끝내면 개별 에이전트 cutover 후보로 올릴 수 있습니다.',
    }
  }

  if (score >= 60) {
    return {
      score,
      readiness: 'candidate',
      recommendation: 'shadow mode 비교 운영에는 충분합니다. 데이터와 검역률을 더 쌓으면 됩니다.',
    }
  }

  if (score >= 40) {
    return {
      score,
      readiness: 'watch',
      recommendation: '응답량과 기억 축적은 진행 중입니다. 아직 직접 전환보다는 관찰 단계입니다.',
    }
  }

  return {
    score,
    readiness: 'shadow',
    recommendation: '현 시점에서는 Groq 보조 없이 운영하기 이릅니다. 학습 데이터와 최근 활동량이 더 필요합니다.',
  }
}

const getAgentMetrics = async ({ env, since }) => {
  const supabase = createSupabaseClient(env)
  if (!supabase) {
    return {
      source: 'agents',
      available: false,
      summary: null,
      members: [],
      message: 'Supabase 환경변수가 설정되지 않아 에이전트 전환 지표를 계산할 수 없습니다.',
    }
  }

  const [godStatsResult, recentMessagesResult, memoriesResult, neuroResult, arousalResult, immuneResult] = await Promise.all([
    supabase.from('god_stats').select('god_id, god_name, total_debates, total_messages, avg_response_length, last_active'),
    supabase
      .from('debate_messages')
      .select('god_id, debate_id, content, created_at')
      .gte('created_at', since.toISOString())
      .range(0, 1999),
    supabase
      .from('god_memories')
      .select('god_id, status')
      .eq('status', 'active')
      .range(0, 1999),
    supabase
      .from('neuro_logs')
      .select('agent_id, dopamine, cortisol, temperature, top_p, max_tokens, created_at')
      .gte('created_at', since.toISOString())
      .range(0, 1999),
    supabase
      .from('arousal_logs')
      .select('agent_id, heart_rate, burst, token_factor, suggested_delay_ms, created_at')
      .gte('created_at', since.toISOString())
      .range(0, 1999),
    supabase
      .from('immune_logs')
      .select('agent_id, status, similarity, created_at')
      .gte('created_at', since.toISOString())
      .range(0, 1999),
  ])

  for (const result of [godStatsResult, recentMessagesResult, memoriesResult, neuroResult, arousalResult, immuneResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const godStatsById = new Map((godStatsResult.data || []).map((row) => [row.god_id, row]))
  const recentMessages = recentMessagesResult.data || []
  const memories = memoriesResult.data || []
  const neuroLogs = neuroResult.data || []
  const arousalLogs = arousalResult.data || []
  const immuneLogs = immuneResult.data || []

  const members = AI_GODS.map((agent) => {
    const baseStats = godStatsById.get(agent.id) || {}
    const agentMessages = recentMessages.filter((row) => row.god_id === agent.id)
    const agentMemories = memories.filter((row) => row.god_id === agent.id)
    const agentNeuro = neuroLogs.filter((row) => row.agent_id === agent.id)
    const agentArousal = arousalLogs.filter((row) => row.agent_id === agent.id)
    const agentImmune = immuneLogs.filter((row) => row.agent_id === agent.id)

    const recentDebates24h = new Set(agentMessages.map((row) => row.debate_id)).size
    const recentMessages24h = agentMessages.length
    const quarantineCount24h = agentImmune.filter((row) => row.status === 'quarantined').length
    const quarantineRate24h = recentMessages24h > 0 ? quarantineCount24h / recentMessages24h : 0
    const avgRecentResponseLength = average(agentMessages.map((row) => String(row.content || '').length))
    const avgDopamine24h = average(agentNeuro.map((row) => row.dopamine))
    const avgCortisol24h = average(agentNeuro.map((row) => row.cortisol))
    const avgHeartRate24h = average(agentArousal.map((row) => row.heart_rate))
    const burstRate24h = agentArousal.length > 0
      ? agentArousal.filter((row) => Boolean(row.burst)).length / agentArousal.length
      : 0

    const metrics = {
      id: agent.id,
      role: agent.role,
      name: agent.name,
      nameKo: agent.nameKo,
      title: agent.title,
      symbol: agent.symbol,
      color: agent.color,
      localModel: agent.runtime?.localModel || null,
      totalDebates: Number(baseStats.total_debates || 0),
      totalMessages: Number(baseStats.total_messages || 0),
      activeMemories: agentMemories.length,
      lastActive: baseStats.last_active || null,
      recentDebates24h,
      recentMessages24h,
      quarantineCount24h,
      quarantineRate24h,
      avgResponseLength: roundMetric(Number(baseStats.avg_response_length || 0), 0) || 0,
      avgRecentResponseLength: roundMetric(avgRecentResponseLength, 0) || 0,
      avgDopamine24h: roundMetric(avgDopamine24h, 2) || 0,
      avgCortisol24h: roundMetric(avgCortisol24h, 2) || 0,
      avgHeartRate24h: roundMetric(avgHeartRate24h, 2) || 0,
      burstRate24h: roundMetric(burstRate24h, 2) || 0,
      neuroSamples24h: agentNeuro.length,
      arousalSamples24h: agentArousal.length,
      immuneEvents24h: agentImmune.length,
    }

    const cutover = buildCutoverDecision(metrics)
    return {
      ...metrics,
      cutoverScore: cutover.score,
      cutoverReadiness: cutover.readiness,
      cutoverRecommendation: cutover.recommendation,
    }
  })

  const averageScore = roundMetric(average(members.map((member) => member.cutoverScore)), 0) || 0
  const readyCount = members.filter((member) => member.cutoverReadiness === 'ready').length
  const candidateCount = members.filter((member) => member.cutoverReadiness === 'candidate').length

  let overallReadiness = 'not_ready'
  let recommendation = '현재는 Groq를 기준으로 운영하고, 자체 모델은 shadow mode 비교를 유지하는 편이 안전합니다.'

  if (readyCount === members.length && averageScore >= 80) {
    overallReadiness = 'cutover_ready'
    recommendation = '8개 역할 모두 점수가 충분합니다. Groq와의 마지막 회귀 비교 후 cutover 검토가 가능합니다.'
  } else if (readyCount + candidateCount === members.length && averageScore >= 65) {
    overallReadiness = 'pilot_ready'
    recommendation = '전 역할이 candidate 이상입니다. 일부 트래픽만 자체 모델로 보내는 pilot 단계에 들어갈 수 있습니다.'
  } else if (readyCount + candidateCount >= 4) {
    overallReadiness = 'shadow_mode'
    recommendation = '절반 이상이 후보권입니다. Groq 병행 상태에서 역할별 shadow evaluation을 진행하면 됩니다.'
  }

  return {
    source: 'agents',
    available: true,
    summary: {
      averageScore,
      readyCount,
      candidateCount,
      overallReadiness,
      recommendation,
    },
    members,
  }
}

const getGitHubMetrics = async ({ env, since }) => {
  const owner = resolveEnv(env, ['GITHUB_REPO_OWNER', 'VERCEL_GIT_REPO_OWNER']) || 'team-muel'
  const repo = resolveEnv(env, ['GITHUB_REPO_NAME', 'VERCEL_GIT_REPO_SLUG']) || 'ai-gods-project'
  const token = resolveEnv(env, ['GITHUB_TOKEN', 'GH_TOKEN'])

  try {
    const data = await fetchJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=100`,
      { headers: createHeaders(token) }
    )

    const workflowRuns = Array.isArray(data?.workflow_runs) ? data.workflow_runs : []
    const recentAutomaticRuns = workflowRuns.filter((run) => {
      const createdAt = Date.parse(run.created_at || '')
      return Number.isFinite(createdAt) && createdAt >= since.getTime() && run.event !== 'workflow_dispatch'
    })

    const errorRuns24h = recentAutomaticRuns.filter((run) => GITHUB_ERROR_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())).length
    const successRuns24h = recentAutomaticRuns.filter((run) => String(run.conclusion || '').toLowerCase() === 'success').length

    return {
      source: 'github',
      available: true,
      repo: `${owner}/${repo}`,
      automaticRuns24h: recentAutomaticRuns.length,
      errorRuns24h,
      successRuns24h,
      authMode: token ? 'token' : 'anonymous',
      recent: recentAutomaticRuns.slice(0, 5).map((run) => ({
        id: run.id,
        name: run.name,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion || (run.status === 'completed' ? 'unknown' : 'in_progress'),
        createdAt: run.created_at,
        url: run.html_url,
      })),
    }
  } catch (error) {
    return createUnavailableSource('github', error.message || 'GitHub Actions 조회에 실패했습니다.', {
      repo: `${owner}/${repo}`,
    })
  }
}

const toVercelTimestamp = (deployment) => {
  const raw = deployment?.created ?? deployment?.createdAt ?? deployment?.readyTimestamp
  if (typeof raw === 'number') return raw
  const parsed = Date.parse(raw || '')
  return Number.isFinite(parsed) ? parsed : null
}

const getVercelMetrics = async ({ env, since }) => {
  const token = resolveEnv(env, ['VERCEL_TOKEN'])
  const teamId = resolveEnv(env, ['VERCEL_TEAM_ID'])
  const projectKey = resolveEnv(env, ['VERCEL_PROJECT_ID', 'VERCEL_PROJECT_NAME', 'VERCEL_GIT_REPO_SLUG']) || 'ai-gods-project'

  if (!token) {
    return createUnavailableSource('vercel', 'VERCEL_TOKEN 이 설정되지 않아 배포 기록을 조회할 수 없습니다.', {
      project: projectKey,
    })
  }

  try {
    const projectParams = new URLSearchParams()
    if (teamId) projectParams.set('teamId', teamId)
    const projectSuffix = projectParams.toString() ? `?${projectParams.toString()}` : ''
    const project = await fetchJson(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectKey)}${projectSuffix}`,
      { headers: createHeaders(token) }
    )

    const deploymentParams = new URLSearchParams({
      projectId: project.id,
      limit: '100',
    })
    if (teamId) deploymentParams.set('teamId', teamId)

    const deploymentData = await fetchJson(
      `https://api.vercel.com/v6/deployments?${deploymentParams.toString()}`,
      { headers: createHeaders(token) }
    )

    const deployments = Array.isArray(deploymentData?.deployments) ? deploymentData.deployments : []
    const recentDeployments = deployments.filter((deployment) => {
      const createdAt = toVercelTimestamp(deployment)
      return createdAt != null && createdAt >= since.getTime()
    })

    const errorRuns24h = recentDeployments.filter((deployment) => VERCEL_ERROR_STATES.has(String(deployment.state || deployment.readyState || '').toUpperCase())).length
    const successRuns24h = recentDeployments.filter((deployment) => String(deployment.state || deployment.readyState || '').toUpperCase() === 'READY').length

    return {
      source: 'vercel',
      available: true,
      project: project.name || projectKey,
      automaticRuns24h: recentDeployments.length,
      errorRuns24h,
      successRuns24h,
      recent: recentDeployments.slice(0, 5).map((deployment) => ({
        id: deployment.uid,
        name: deployment.name || project.name || projectKey,
        state: deployment.state || deployment.readyState || 'UNKNOWN',
        target: deployment.target || 'production',
        createdAt: new Date(toVercelTimestamp(deployment) || Date.now()).toISOString(),
        url: deployment.url ? `https://${deployment.url}` : null,
      })),
    }
  } catch (error) {
    return createUnavailableSource('vercel', error.message || 'Vercel 배포 조회에 실패했습니다.', {
      project: projectKey,
    })
  }
}

export const buildOperationsDashboard = async ({
  page = 1,
  pageSize = DEFAULT_DASHBOARD_PAGE_SIZE,
  env = process.env,
  now = new Date(),
} = {}) => {
  const normalizedPage = clampPositiveInteger(page, 1, 999, 1)
  const normalizedPageSize = clampPositiveInteger(pageSize, 6, MAX_DASHBOARD_PAGE_SIZE, DEFAULT_DASHBOARD_PAGE_SIZE)
  const since = new Date(now.getTime() - DASHBOARD_WINDOW_HOURS * 60 * 60 * 1000)

  const [github, vercel, debates, agents] = await Promise.all([
    getGitHubMetrics({ env, since }),
    getVercelMetrics({ env, since }),
    getDebateMetrics({ env, since, page: normalizedPage, pageSize: normalizedPageSize }).catch((error) => ({
      source: 'debates',
      available: false,
      totalCount: 0,
      last24hCount: 0,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: 1,
      latest: null,
      recent: [],
      collection: [],
      message: error.message || '토론 저장소 조회에 실패했습니다.',
    })),
    getAgentMetrics({ env, since }).catch((error) => ({
      source: 'agents',
      available: false,
      summary: null,
      members: [],
      message: error.message || '에이전트 전환 지표 계산에 실패했습니다.',
    })),
  ])

  const warnings = [github, vercel, debates, agents]
    .filter((entry) => entry && entry.available === false && entry.message)
    .map((entry) => ({ source: entry.source || 'unknown', message: entry.message }))

  return {
    generatedAt: now.toISOString(),
    windowHours: DASHBOARD_WINDOW_HOURS,
    github,
    vercel,
    debates,
    agents,
    warnings,
  }
}