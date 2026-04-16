import fs from 'node:fs/promises'
import path from 'node:path'
import { AI_GODS, REMOTE_RUNTIME_MODEL, buildCouncilSystemPrompt } from '../src/config/aiGods.js'

const BASE_URL = String(process.env.PROBE_BASE_URL || 'https://ai-gods-project.vercel.app').trim().replace(/\/$/, '')
const TOPIC = String(process.env.PROBE_TOPIC || '에이전트 코딩 벤치마크를 조직에 도입할 때의 운영 전략').trim()
const OUTPUT_PATH = path.resolve(process.cwd(), process.env.PROBE_OUTPUT_PATH || 'outputs/custom-budget-probe.json')

const parseCsv = (value, fallback) => String(value || fallback)
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean)

const parseIntSet = (value, fallback) => String(value || fallback)
  .split(',')
  .map((item) => Number.parseInt(item.trim(), 10))
  .filter((item) => Number.isFinite(item) && item > 0)

const AGENT_IDS = parseCsv(process.env.PROBE_AGENT_IDS, 'cco,cmo')
const PROMPT_PROFILES = parseCsv(process.env.PROBE_PROMPT_PROFILES, 'minimal,compact')
const MAX_TOKENS_SET = parseIntSet(process.env.PROBE_MAX_TOKENS_SET, '48,96')
const USER_PROFILES = parseCsv(process.env.PROBE_USER_PROFILES, 'lean,rich')

const REQUEST_HEADERS = {
  Accept: 'application/json',
  Origin: BASE_URL,
  Referer: `${BASE_URL}/`,
  'User-Agent': 'AI-Gods-Custom-Budget-Probe/1.0',
  'Content-Type': 'application/json',
}

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const buildUserMessage = (profile) => {
  if (profile === 'lean') {
    return `주제: ${TOPIC}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요. 핵심 주장, 즉시 실행할 행동, 가장 큰 리스크만 짧게 답하세요.`
  }

  return [
    `[과거 관련 토론 기억]\n주제: "${TOPIC}"\n내 의견: 조직 차원의 가드레일과 평가 기준이 먼저 정리되어야 합니다.`,
    `[실시간 웹 검색 결과: "${TOPIC}"]\n1. 에이전트 평가 벤치마크는 태스크 정의, 비용 통제, 실패시 롤백 기준을 함께 둬야 합니다.\n2. 파일럿 단계에서는 전사 확대보다 반복 가능한 평가 루프가 중요합니다.`,
    `[Obsidian 과거 노트]\n[과거 기록 "${TOPIC}"]\n벤치마크 도입 목적, 소유 팀, 승인 기준이 선행되지 않으면 지표만 늘고 운영 부채가 커집니다.`,
    `주제: ${TOPIC}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.`,
  ].join('\n\n')
}

const requestChat = async ({ agentId, promptProfile, maxTokens, userProfile }) => {
  const systemPrompt = buildCouncilSystemPrompt(agentId, 'initial', {
    profile: promptProfile,
    compact: promptProfile !== 'full',
  })
  const userMessage = buildUserMessage(userProfile)
  const payload = {
    agentId,
    model: REMOTE_RUNTIME_MODEL,
    phase: 'initial',
    max_tokens: maxTokens,
    temperature: 0.4,
    top_p: 0.8,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  }

  const startedAt = Date.now()

  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    const elapsedMs = Date.now() - startedAt
    const content = normalize(data?.message?.content || data?.choices?.[0]?.message?.content || '')

    return {
      ok: response.ok,
      status: response.status,
      elapsedMs,
      provider: data?.provider || null,
      model: data?.model || null,
      adapter: data?.adapter || null,
      error: response.ok ? null : data?.error || `HTTP ${response.status}`,
      contentSample: content.slice(0, 220),
      systemChars: systemPrompt.length,
      userChars: userMessage.length,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      provider: null,
      model: null,
      adapter: null,
      error: error.message || String(error),
      contentSample: '',
      systemChars: systemPrompt.length,
      userChars: userMessage.length,
    }
  }
}

const main = async () => {
  const selectedAgents = AI_GODS.filter((agent) => AGENT_IDS.includes(agent.id))
  if (selectedAgents.length === 0) {
    throw new Error('PROBE_AGENT_IDS에 유효한 agentId가 없습니다.')
  }

  const summary = {
    baseUrl: BASE_URL,
    topic: TOPIC,
    agentIds: selectedAgents.map((agent) => agent.id),
    promptProfiles: PROMPT_PROFILES,
    maxTokensSet: MAX_TOKENS_SET,
    userProfiles: USER_PROFILES,
    startedAt: new Date().toISOString(),
    results: [],
  }

  for (const agent of selectedAgents) {
    for (const promptProfile of PROMPT_PROFILES) {
      for (const userProfile of USER_PROFILES) {
        for (const maxTokens of MAX_TOKENS_SET) {
          console.log(`[probe] ${agent.id} profile=${promptProfile} user=${userProfile} maxTokens=${maxTokens}`)
          const result = await requestChat({ agentId: agent.id, promptProfile, maxTokens, userProfile })
          summary.results.push({
            agentId: agent.id,
            promptProfile,
            userProfile,
            maxTokens,
            ...result,
          })
          console.log(`[probe] -> ok=${result.ok} provider=${result.provider || '-'} adapter=${result.adapter || '-'} elapsed=${result.elapsedMs}ms`)
        }
      }
    }
  }

  summary.finishedAt = new Date().toISOString()
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(summary, null, 2), 'utf8')

  console.log(JSON.stringify({
    ok: true,
    outputPath: path.relative(process.cwd(), OUTPUT_PATH).replace(/\\/g, '/'),
    total: summary.results.length,
    succeeded: summary.results.filter((result) => result.ok).length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})