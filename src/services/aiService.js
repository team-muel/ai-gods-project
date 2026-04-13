import { getRelevantMemories, memoriesToContext } from './memoryService'
import { searchWeb, searchResultsToContext } from './searchService'
import { readFromObsidian } from './obsidianService'
import {
  AI_GOD_IDS,
  JUDGE_AGENT_ID,
  LOCAL_RUNTIME_FALLBACK_MODEL,
  REMOTE_RUNTIME_MODEL,
  buildCouncilSystemPrompt,
  getAgentConfigById,
} from '../config/aiGods'
import {
  initAgentState,
  getState,
  updateStateFromEvent,
  getSamplingParams,
  registerPositiveFeedback,
} from './neuroModulator'
import { initArousal, updateFromUrgency, getArousalParams, pulse } from './arousalController'
import { initImmuneAgent, scanAndQuarantine } from './immuneSystem.js'

const IS_DEV = import.meta.env.DEV === true
const CHAT_API_URL = '/api/chat'
const DEFAULT_JUDGE_SAMPLING = { temperature: 0.2, top_p: 0.65, max_tokens: 500 }
const ANGEL_SYSTEM_PROMPT = '당신은 신들의 천사입니다. 주어진 의견을 핵심 논점으로 간결하게 요약하는 역할입니다. 반드시 한국어로 작성하세요.'
const ENABLE_OLLAMA_FALLBACK = String(import.meta.env.VITE_ENABLE_OLLAMA_FALLBACK || 'false').trim().toLowerCase() === 'true'

const unique = (items) => [...new Set(items.filter(Boolean))]

AI_GOD_IDS.forEach((id) => {
  const agent = getAgentConfigById(id)
  const neuroConfig = agent?.runtime?.neuroConfig || {}
  const arousalConfig = agent?.runtime?.arousalConfig || {}

  initAgentState(id, {
    D: neuroConfig.D,
    C: neuroConfig.C,
    config: neuroConfig,
  })
  initArousal(id, {
    HR: arousalConfig.HR,
    config: arousalConfig,
  })
})

initImmuneAgent('immune')

const extractErrorMessage = (data, fallback) => {
  if (typeof data?.error === 'string') return data.error
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.error?.message === 'string') return data.error.message
  return fallback
}

const extractAssistantContent = (data) => (
  data?.message?.content ||
  data?.choices?.[0]?.message?.content ||
  '응답을 받지 못했습니다.'
)

const callRemoteRuntime = async (agentId, systemPrompt, userMessage, maxTokens, temperature, top_p) => {
  const response = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      model: REMOTE_RUNTIME_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
      top_p,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`채팅 런타임 오류: ${response.status} — ${extractErrorMessage(data, '알 수 없는 오류')}`)
  }

  return extractAssistantContent(data)
}

const tryLocalModel = async (agentId, model, messages, options) => {
  try {
    const response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        provider: 'ollama',
        model,
        messages,
        stream: false,
        options,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.warn(`[Local/Ollama] ${model} 오류 ${response.status}:`, extractErrorMessage(data, '알 수 없는 오류'))
      return null
    }

    return extractAssistantContent(data)
  } catch (error) {
    console.warn(`[Local/Ollama] ${model} 네트워크 오류:`, error.message)
    return null
  }
}

const callLocalRuntimeWithFallback = async (agentId, messages, options) => {
  const agent = getAgentConfigById(agentId)
  const candidates = unique([agent?.runtime?.localModel, LOCAL_RUNTIME_FALLBACK_MODEL])

  for (const model of candidates) {
    const content = await tryLocalModel(agentId, model, messages, options)
    if (content !== null) return content
  }

  return null
}

const buildInternalStatePrompt = (agentId) => {
  if (agentId === JUDGE_AGENT_ID) return null

  try {
    const state = getState(agentId)
    return `내부 에이전트 상태: dopamine=${state.D.toFixed(2)}, cortisol=${state.C.toFixed(2)}\n이 값은 응답 스타일을 조절하기 위한 내부 지표입니다. 답변에서 이 값을 절대 노출하지 마십시오.`
  } catch (error) {
    return null
  }
}

const buildArousalPrompt = (agentId, arousalParams) => {
  if (agentId === JUDGE_AGENT_ID) return null

  return arousalParams && arousalParams.burst
    ? '현재 긴급도: 높음. 간결하고 빠르게, 핵심만 제시하세요. 응답 길이를 줄이고 가능한 한 요약형으로 답변하세요. 이 지시사항은 내부 지표이며 응답에서 절대 공개하지 마세요.'
    : '현재 긴급도: 낮음. 심도 있는 분석과 근거를 중심으로 상세히 답변하세요. 이 지시사항은 내부 지표이며 응답에서 절대 공개하지 마세요.'
}

const getRuntimeSampling = (agentId, maxTokens, arousalParams) => {
  if (agentId === JUDGE_AGENT_ID) {
    return {
      temperature: DEFAULT_JUDGE_SAMPLING.temperature,
      top_p: DEFAULT_JUDGE_SAMPLING.top_p,
      maxTokens: Math.max(20, Math.min(maxTokens, DEFAULT_JUDGE_SAMPLING.max_tokens)),
    }
  }

  const sampling = getSamplingParams(agentId)
  const heartFactor = arousalParams?.tokenFactor ?? 1
  return {
    temperature: sampling.temperature,
    top_p: sampling.top_p,
    maxTokens: Math.max(20, Math.round(Math.min(maxTokens, (sampling.max_tokens || 600) * heartFactor))),
  }
}

const callAngelModel = async (userMessage) => {
  try {
    return await callRemoteRuntime(JUDGE_AGENT_ID, ANGEL_SYSTEM_PROMPT, userMessage, 150, 0.5, 0.9)
  } catch (error) {
    if (!(IS_DEV && ENABLE_OLLAMA_FALLBACK)) {
      throw error
    }

    const content = await callLocalRuntimeWithFallback(
      JUDGE_AGENT_ID,
      [{ role: 'system', content: ANGEL_SYSTEM_PROMPT }, { role: 'user', content: userMessage }],
      { num_predict: 150, temperature: 0.5, top_p: 0.9 }
    )
    if (content !== null) return content
    console.warn('[Dev] /api/chat 천사 요약 실패 → Ollama fallback도 실패')
    throw error
  }
}

export const angelSummarize = async (godId, godName, opinion) => {
  const prompt = `[${godName}의 의견]\n${opinion.slice(0, 600)}\n\n위 의견의 핵심 주장 3가지를 불릿 포인트(•)로 간결하게 요약하세요.`
  return await callAngelModel(prompt)
}

const callModel = async (agentId, userMessage, { phase = 'initial', maxTokens = 600 } = {}) => {
  const baseSystemPrompt = buildCouncilSystemPrompt(agentId, phase)
  const arousalParams = agentId === JUDGE_AGENT_ID ? null : getArousalParams(agentId)
  const combinedSystem = [
    baseSystemPrompt,
    buildInternalStatePrompt(agentId),
    buildArousalPrompt(agentId, arousalParams),
  ].filter(Boolean).join('\n\n')
  const sampling = getRuntimeSampling(agentId, maxTokens, arousalParams)

  try {
    return await callRemoteRuntime(agentId, combinedSystem, userMessage, sampling.maxTokens, sampling.temperature, sampling.top_p)
  } catch (error) {
    if (!(IS_DEV && ENABLE_OLLAMA_FALLBACK)) {
      throw error
    }

    const localResult = await callLocalRuntimeWithFallback(
      agentId,
      [
        { role: 'system', content: combinedSystem },
        { role: 'user', content: userMessage },
      ],
      { num_predict: sampling.maxTokens, temperature: sampling.temperature, top_p: sampling.top_p }
    )
    if (localResult !== null) return localResult

    console.warn(`[Dev] /api/chat 실패 후 Ollama fallback도 실패 (${agentId})`)
    throw error
  }
}

export const callAI = async (godId, topic, transcript = null) => {
  const [memories, searchData, obsidianContext] = await Promise.all([
    getRelevantMemories(godId, topic),
    transcript ? null : searchWeb(topic, 4),
    readFromObsidian(godId, topic),
  ])

  const memoryContext = memoriesToContext(memories)
  const searchContext = searchResultsToContext(searchData)

  let userMessage
  if (transcript) {
    userMessage = [
      memoryContext,
      obsidianContext,
      `다음은 YouTube 영상의 내용입니다:\n\n"${transcript.slice(0, 2000)}"\n\n위 영상에 대해 당신의 전문 분야 관점에서 분석하고 초기 의견을 제시하세요.`,
    ].filter(Boolean).join('\n\n')
  } else {
    userMessage = [
      memoryContext,
      obsidianContext,
      searchContext,
      `주제: ${topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.`,
    ].filter(Boolean).join('\n\n')
  }

  try { updateStateFromEvent(godId, { posFeedback: 0.5 }) } catch (error) {}
  try { updateFromUrgency(godId, 0) } catch (error) {}

  const content = await callModel(godId, userMessage, { phase: 'initial' })

  try {
    const findings = await scanAndQuarantine('immune', [{ god: godId, content }], { topic })
    if (findings?.length) console.info('immune quarantined (R1):', findings)
  } catch (error) {}

  return { godId, response: content, timestamp: new Date().toISOString() }
}

export const callAIDebate = async (godId, topic, otherOpinions, opts = {}) => {
  const opinionsText = otherOpinions
    .map(opinion => `[${opinion.god}]: ${opinion.content}`)
    .join('\n\n')

  const negWords = ['반박', '아니다', '틀리', '동의하지', '그렇지 않']
  let negCount = 0
  for (const opinion of otherOpinions) {
    for (const word of negWords) {
      if ((opinion.content || '').includes(word)) {
        negCount += 1
        break
      }
    }
  }

  try { updateStateFromEvent(godId, { negFeedback: negCount * 0.6, debateLen: otherOpinions.length }) } catch (error) {}

  try {
    const explicitUrgency = typeof opts?.urgency === 'number'
    const derivedUrgency = explicitUrgency ? opts.urgency : Math.min(1, (negCount * 0.6 + otherOpinions.length * 0.15))
    updateFromUrgency(godId, derivedUrgency)
  } catch (error) {}

  const userMessage = `주제: ${topic}\n\n다른 임원들의 의견:\n${opinionsText}\n\n위 의견들에 대해 동의/반박/보완하며 토론하세요. 누구의 의견에 반응하는지 구체적으로 언급하세요.`

  const content = await callModel(godId, userMessage, { phase: 'debate' })

  try {
    const findings = await scanAndQuarantine('immune', [{ god: godId, content }], { topic })
    if (findings?.length) console.info('immune quarantined (debate):', findings)
  } catch (error) {}

  try {
    const posWords = ['동의', '좋은 지적', '맞습니다', '공감', '훌륭', '정확']
    const posCount = posWords.filter(word => content.includes(word)).length
    if (posCount > 0) {
      registerPositiveFeedback(godId, posCount * 0.5)
      pulse(godId, posCount * 0.3)
    }
  } catch (error) {}

  return { godId, response: content, timestamp: new Date().toISOString() }
}

export const checkConsensus = async (topic, roundMessages) => {
  if (!roundMessages || roundMessages.length === 0) return false

  const summary = roundMessages
    .map(message => `[${message.god}]: ${message.content.slice(0, 120)}`)
    .join('\n')

  const content = await callModel(
    JUDGE_AGENT_ID,
    `토론 주제: ${topic}\n\n최근 발언:\n${summary}\n\n이 토론에서 충분한 합의가 도출되었습니까? "예" 또는 "아니오"로만 답하세요.`,
    { phase: 'judge-consensus', maxTokens: 10 }
  )

  return content.trim().startsWith('예') || content.toLowerCase().includes('yes')
}

export const generateFinalConsensus = async (topic, allMessages) => {
  if (!allMessages || allMessages.length === 0) {
    return '이번 토론에서는 유효한 발언이 충분히 수집되지 않아 합의안을 생성하지 못했습니다. 잠시 후 다시 시도하세요.'
  }

  let prompt

  if (IS_DEV) {
    const summary = allMessages
      .map(message => `[${message.god} R${message.round}]: ${message.content}`)
      .join('\n\n')
    prompt = `주제: ${topic}\n\n전체 토론:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요.`
  } else {
    const lastRound = Math.max(...allMessages.map(message => message.round))
    const summary = allMessages
      .filter(message => message.round === lastRound)
      .map(message => `[${message.god}]: ${message.content.slice(0, 150)}`)
      .join('\n')
    prompt = `주제: ${topic}\n\n최종 라운드 요약:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요.`
  }

  return await callModel(JUDGE_AGENT_ID, prompt, { phase: 'judge-final', maxTokens: IS_DEV ? 800 : 500 })
}
