import fs from 'node:fs/promises'
import path from 'node:path'
import {
  AI_GODS,
  AI_JUDGE,
  REMOTE_RUNTIME_MODEL,
  buildCouncilSystemPrompt,
} from '../src/config/aiGods.js'

const BASE_URL = String(process.env.VALIDATION_BASE_URL || 'http://127.0.0.1:5173').trim().replace(/\/$/, '')
const DEFAULT_TOPIC = process.env.VALIDATION_TOPIC || 'AI 기반 고객 서비스 자동화 전략'
const MAX_ROUNDS = Math.max(2, Math.min(4, Number.parseInt(process.env.VALIDATION_MAX_ROUNDS || '2', 10) || 2))
const ROUND_MAX_TOKENS = Math.max(24, Number.parseInt(process.env.VALIDATION_ROUND_MAX_TOKENS || '96', 10) || 96)
const ANGEL_MAX_TOKENS = Math.max(16, Number.parseInt(process.env.VALIDATION_ANGEL_MAX_TOKENS || '48', 10) || 48)
const FINAL_MAX_TOKENS = Math.max(64, Number.parseInt(process.env.VALIDATION_FINAL_MAX_TOKENS || '160', 10) || 160)
const SEARCH_NUM = Math.max(1, Math.min(6, Number.parseInt(process.env.VALIDATION_SEARCH_NUM || '4', 10) || 4))
const OUTPUT_PATH = path.resolve(process.cwd(), process.env.VALIDATION_OUTPUT_PATH || 'outputs/orchestrator-validation.json')
const ANGEL_SYSTEM_PROMPT = '당신은 신들의 천사입니다. 주어진 의견을 핵심 논점으로 간결하게 요약하는 역할입니다. 반드시 한국어로 작성하세요.'
const REQUESTED_AGENT_IDS = String(process.env.VALIDATION_AGENT_IDS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
const USE_MEMORIES = !['0', 'false', 'no', 'off'].includes(String(process.env.VALIDATION_USE_MEMORIES || 'false').trim().toLowerCase())
const USE_SEARCH = !['0', 'false', 'no', 'off'].includes(String(process.env.VALIDATION_USE_SEARCH || 'false').trim().toLowerCase())
const USE_OBSIDIAN = !['0', 'false', 'no', 'off'].includes(String(process.env.VALIDATION_USE_OBSIDIAN || 'false').trim().toLowerCase())
const REQUEST_HEADERS = {
  Accept: 'application/json',
  Origin: BASE_URL,
  Referer: `${BASE_URL}/`,
  'User-Agent': 'AI-Gods-Validation/1.0',
}

const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim()

const extractAssistantContent = (data) => (
  data?.message?.content ||
  data?.choices?.[0]?.message?.content ||
  ''
)

const ensureOk = async (response) => {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}`)
  }
  return data
}

const getJson = async (pathname, params = null) => {
  const url = new URL(`${BASE_URL}${pathname}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
  })
  return await ensureOk(response)
}

const postJson = async (pathname, payload) => {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await ensureOk(response)
}

const memoriesToContext = (memories) => {
  if (!Array.isArray(memories) || memories.length === 0) return ''

  const lines = memories.map((memory) => {
    const days = Math.floor((Date.now() - new Date(memory.created_at).getTime()) / 86400000)
    const label = days === 0 ? '오늘' : `${days}일 전`
    return `[${label}] 주제: "${memory.topic}"
내 의견: ${memory.my_opinion}`
  })

  return `[과거 관련 토론 기억]
${lines.join('\n\n')}

위 경험을 참고하되, 새로운 관점으로 답변하세요.`
}

const searchResultsToContext = (searchData) => {
  if (!searchData?.results?.length) return ''

  const lines = searchData.results.map((result, index) => (
    `${index + 1}. ${result.title}
   ${result.snippet}`
  ))

  let context = `[실시간 웹 검색 결과: "${searchData.query}"]\n${lines.join('\n\n')}`
  if (searchData.knowledgePanel) {
    context += `\n\n[핵심 정보] ${searchData.knowledgePanel.title || ''}: ${searchData.knowledgePanel.description || ''}`
  }

  return `${context}\n\n위 최신 정보를 참고하여 답변하세요.`
}

const obsidianNotesToContext = (data) => {
  if (!data?.notes?.length) return ''

  const lines = data.notes.map((note) => `[과거 기록 "${note.title}"]\n${note.snippet}`)
  return `[Obsidian 과거 노트]\n${lines.join('\n\n')}\n\n위 과거 기록을 참고하되 새로운 시각으로 답하세요.`
}

const requestChat = async ({ agentId, phase, systemPrompt, userMessage, maxTokens, temperature = 0.7, topP = 0.9 }) => {
  const startedAt = Date.now()
  const data = await postJson('/api/chat', {
    agentId,
    model: REMOTE_RUNTIME_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    phase,
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
  })

  return {
    response: normalize(extractAssistantContent(data)),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    provider: data?.provider || null,
    model: data?.model || REMOTE_RUNTIME_MODEL,
    adapter: data?.adapter || null,
    modelVersion: data?.modelVersion || null,
  }
}

const buildInitialUserMessage = ({ topic, transcript, memoryContext, obsidianContext, searchContext }) => {
  if (transcript) {
    return [
      memoryContext,
      obsidianContext,
      `다음은 YouTube 영상의 내용입니다:\n\n"${String(transcript).slice(0, 2000)}"\n\n위 영상에 대해 당신의 전문 분야 관점에서 분석하고 초기 의견을 제시하세요.`,
    ].filter(Boolean).join('\n\n')
  }

  return [
    memoryContext,
    obsidianContext,
    searchContext,
    `주제: ${topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.`,
  ].filter(Boolean).join('\n\n')
}

const callInitialOpinion = async ({ agent, topic, transcript, searchContext }) => {
  const [memoryData, obsidianData] = await Promise.all([
    USE_MEMORIES
      ? getJson('/api/memories/relevant', { godId: agent.id, topic, count: 3 }).catch(() => ({ memories: [] }))
      : Promise.resolve({ memories: [] }),
    USE_OBSIDIAN
      ? getJson('/api/obsidian/search', { godId: agent.id, q: topic }).catch(() => ({ notes: [] }))
      : Promise.resolve({ notes: [] }),
  ])

  const result = await requestChat({
    agentId: agent.id,
    phase: 'initial',
    systemPrompt: buildCouncilSystemPrompt(agent.id, 'initial'),
    userMessage: buildInitialUserMessage({
      topic,
      transcript,
      memoryContext: memoriesToContext(memoryData.memories),
      obsidianContext: obsidianNotesToContext(obsidianData),
      searchContext,
    }),
    maxTokens: ROUND_MAX_TOKENS,
  })

  return {
    round: 1,
    godId: agent.id,
    god: agent.name,
    emoji: agent.symbol,
    content: result.response,
    timestamp: result.timestamp,
    runtime: {
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
      adapter: result.adapter,
      modelVersion: result.modelVersion,
    },
  }
}

const callAngelSummary = async (message) => {
  const result = await requestChat({
    agentId: AI_JUDGE.id,
    phase: 'judge-final',
    systemPrompt: ANGEL_SYSTEM_PROMPT,
    userMessage: `[${message.god}의 의견]\n${message.content.slice(0, 600)}\n\n위 의견의 핵심 주장 3가지를 불릿 포인트(•)로 간결하게 요약하세요.`,
    maxTokens: ANGEL_MAX_TOKENS,
    temperature: 0.5,
    topP: 0.9,
  })

  return {
    round: message.round,
    godId: message.godId,
    god: message.god,
    emoji: '👼',
    type: 'angel',
    content: result.response,
    timestamp: result.timestamp,
    runtime: {
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
      adapter: result.adapter,
      modelVersion: result.modelVersion,
    },
  }
}

const callDebateOpinion = async ({ agent, topic, otherOpinions, round }) => {
  const opinionsText = otherOpinions
    .map((opinion) => `[${opinion.god}]: ${opinion.content}`)
    .join('\n\n')

  const result = await requestChat({
    agentId: agent.id,
    phase: 'debate',
    systemPrompt: buildCouncilSystemPrompt(agent.id, 'debate'),
    userMessage: `주제: ${topic}\n\n다른 임원들의 의견:\n${opinionsText}\n\n위 의견들에 대해 동의/반박/보완하며 토론하세요. 누구의 의견에 반응하는지 구체적으로 언급하세요.`,
    maxTokens: ROUND_MAX_TOKENS,
  })

  return {
    round,
    godId: agent.id,
    god: agent.name,
    emoji: agent.symbol,
    content: result.response,
    timestamp: result.timestamp,
    runtime: {
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
      adapter: result.adapter,
      modelVersion: result.modelVersion,
    },
  }
}

const checkConsensus = async (topic, roundMessages) => {
  const summary = roundMessages
    .map((message) => `[${message.god}]: ${message.content.slice(0, 120)}`)
    .join('\n')

  const result = await requestChat({
    agentId: AI_JUDGE.id,
    phase: 'judge-consensus',
    systemPrompt: buildCouncilSystemPrompt(AI_JUDGE.id, 'judge-consensus'),
    userMessage: `토론 주제: ${topic}\n\n최근 발언:\n${summary}\n\n이 토론에서 충분한 합의가 도출되었습니까? "예" 또는 "아니오"로만 답하세요.`,
    maxTokens: 10,
    temperature: 0.2,
    topP: 0.65,
  })

  return {
    reached: result.response.startsWith('예') || result.response.toLowerCase().includes('yes'),
    runtime: {
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
      adapter: result.adapter,
      modelVersion: result.modelVersion,
    },
    raw: result.response,
  }
}

const generateFinalConsensus = async (topic, spokenMessages) => {
  const summary = spokenMessages
    .map((message) => `[${message.god} R${message.round}]: ${message.content}`)
    .join('\n\n')

  const result = await requestChat({
    agentId: AI_JUDGE.id,
    phase: 'judge-final',
    systemPrompt: buildCouncilSystemPrompt(AI_JUDGE.id, 'judge-final'),
    userMessage: `주제: ${topic}\n\n전체 토론:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요.`,
    maxTokens: FINAL_MAX_TOKENS,
    temperature: 0.2,
    topP: 0.65,
  })

  return {
    consensus: result.response,
    runtime: {
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
      adapter: result.adapter,
      modelVersion: result.modelVersion,
    },
  }
}

const syncDebateToObsidian = async ({ agents, topic, debateId, messages, consensus }) => {
  const results = []

  for (const agent of agents) {
    const myMessages = messages.filter((message) => message.godId === agent.id)
    if (myMessages.length === 0) continue

    const lastMessage = myMessages[myMessages.length - 1]

    try {
      const data = await postJson('/api/obsidian/write', {
        godId: agent.id,
        godName: agent.name,
        topic,
        debateId,
        opinion: lastMessage.content,
        consensus,
        score: 1.0,
      })
      results.push({ godId: agent.id, ok: Boolean(data?.ok), file: data?.file || null })
    } catch (error) {
      results.push({ godId: agent.id, ok: false, error: error.message })
    }
  }

  return results
}

const writeOutput = async (payload) => {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8')
}

const main = async () => {
  const topic = process.argv.slice(2).join(' ').trim() || DEFAULT_TOPIC
  const startedAt = new Date().toISOString()
  const runStartedAt = Date.now()
  const debateAgents = REQUESTED_AGENT_IDS.length > 0
    ? AI_GODS.filter((agent) => REQUESTED_AGENT_IDS.includes(agent.id))
    : AI_GODS

  if (debateAgents.length === 0) {
    throw new Error('VALIDATION_AGENT_IDS에 유효한 agentId가 없습니다.')
  }

  const summary = {
    baseUrl: BASE_URL,
    topic,
    agentIds: debateAgents.map((agent) => agent.id),
    context: {
      useMemories: USE_MEMORIES,
      useSearch: USE_SEARCH,
      useObsidian: USE_OBSIDIAN,
    },
    maxRounds: MAX_ROUNDS,
    roundMaxTokens: ROUND_MAX_TOKENS,
    angelMaxTokens: ANGEL_MAX_TOKENS,
    finalMaxTokens: FINAL_MAX_TOKENS,
    startedAt,
    search: null,
    rounds: [],
    consensusChecks: [],
    finalConsensus: null,
    persistence: null,
    obsidian: [],
    success: false,
    durationMs: 0,
  }

  try {
    const searchData = USE_SEARCH
      ? await getJson('/api/search', { q: topic, num: SEARCH_NUM }).catch(() => null)
      : null
    const searchContext = searchResultsToContext(searchData)
    summary.search = searchData

    const spokenMessages = []

    const roundOne = []
    for (const agent of debateAgents) {
      console.log(`[R1] requesting ${agent.id}...`)
      const message = await callInitialOpinion({ agent, topic, transcript: null, searchContext })
      roundOne.push(message)
      spokenMessages.push(message)
      console.log(`[R1] ${agent.id} provider=${message.runtime.provider} adapter=${message.runtime.adapter || '-'} latency=${message.runtime.latencyMs}ms`)
    }
    summary.rounds.push({ round: 1, messages: roundOne })

    if (roundOne.length === 0) {
      throw new Error('Round 1 응답이 없습니다.')
    }

    let finalRound = 1
    let previousRound = roundOne

    for (let round = 2; round <= MAX_ROUNDS; round += 1) {
      const angelMessages = []
      for (const message of previousRound) {
        console.log(`[Angel] requesting ${message.godId}...`)
        const angelMessage = await callAngelSummary(message)
        angelMessages.push(angelMessage)
        console.log(`[Angel] ${message.godId} provider=${angelMessage.runtime.provider} latency=${angelMessage.runtime.latencyMs}ms`)
      }

      const roundMessages = []
      for (const agent of debateAgents) {
        console.log(`[R${round}] requesting ${agent.id}...`)
        const otherOpinions = previousRound
          .filter((message) => message.godId !== agent.id)
          .map((message) => ({ god: message.god, content: angelMessages.find((angel) => angel.godId === message.godId)?.content || message.content }))

        const debateMessage = await callDebateOpinion({ agent, topic, otherOpinions, round })
        roundMessages.push(debateMessage)
        spokenMessages.push(debateMessage)
        console.log(`[R${round}] ${agent.id} provider=${debateMessage.runtime.provider} adapter=${debateMessage.runtime.adapter || '-'} latency=${debateMessage.runtime.latencyMs}ms`)
      }

      summary.rounds.push({ round: round - 1, angelMessages })
      summary.rounds.push({ round, messages: roundMessages })
      finalRound = round
      previousRound = roundMessages

      const consensusResult = await checkConsensus(topic, roundMessages)
      summary.consensusChecks.push({ round, ...consensusResult })
      console.log(`[Judge] round=${round} reached=${consensusResult.reached} raw=${consensusResult.raw}`)

      if (consensusResult.reached) {
        break
      }
    }

    const finalConsensus = await generateFinalConsensus(topic, spokenMessages)
    summary.finalConsensus = finalConsensus
    console.log(`[Final] provider=${finalConsensus.runtime.provider} latency=${finalConsensus.runtime.latencyMs}ms`)

    const persistence = await postJson('/api/debates/complete', {
      topic,
      isYoutube: false,
      totalRounds: finalRound,
      consensus: finalConsensus.consensus,
      messages: spokenMessages,
    })

    summary.persistence = persistence

    const obsidianResults = await syncDebateToObsidian({
      agents: debateAgents,
      topic,
      debateId: persistence?.debateId || null,
      messages: spokenMessages,
      consensus: finalConsensus.consensus,
    })
    summary.obsidian = obsidianResults
    summary.success = true
  } catch (error) {
    summary.error = error.message || String(error)
    throw error
  } finally {
    summary.durationMs = Date.now() - runStartedAt
    summary.finishedAt = new Date().toISOString()
    await writeOutput(summary)
  }

  console.log(JSON.stringify({
    ok: true,
    topic: summary.topic,
    baseUrl: summary.baseUrl,
    agentIds: summary.agentIds,
    rounds: summary.rounds.filter((entry) => entry.messages).length,
    debateId: summary.persistence?.debateId || null,
    obsidianOk: summary.obsidian.filter((entry) => entry.ok).length,
    outputPath: path.relative(process.cwd(), OUTPUT_PATH).replace(/\\/g, '/'),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})