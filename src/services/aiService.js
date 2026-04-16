import { getRelevantMemories, memoriesToContext } from './memoryService'
import { searchWeb, searchResultsToContext, searchResultsToEvidence } from './searchService'
import { readFromObsidian } from './obsidianService'
import { buildCitationRefsFromResponse, buildTranscriptEvidenceItem, mergeEvidenceItems } from '../lib/debateEvidence.js'
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
const readPositiveInt = (value, fallback, minimum = 1) => {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isNaN(parsed) ? fallback : Math.max(minimum, parsed)
}

const readNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed)
}

const readBooleanFlag = (value, fallback = false) => {
  const normalized = String(value ?? (fallback ? 'true' : 'false')).trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

const readPromptProfile = () => {
  const explicit = String(import.meta.env.VITE_AI_PROMPT_PROFILE || '').trim().toLowerCase()
  if (explicit === 'full' || explicit === 'compact' || explicit === 'minimal') return explicit

  const compactEnabled = String(import.meta.env.VITE_AI_COMPACT_PROMPTS || 'true').trim().toLowerCase() !== 'false'
  if (!compactEnabled) return 'full'
  return IS_DEV ? 'compact' : 'minimal'
}

const clampPromptBlock = (value, limit) => {
  const text = String(value || '').trim()
  if (!limit || text.length <= limit) return text
  return `${text.slice(0, limit).trim()}\n...`
}

const RUNTIME_PROMPT_PROFILE = readPromptProfile()
const INCLUDE_INTERNAL_STATE_PROMPT = String(import.meta.env.VITE_AI_INCLUDE_STATE_PROMPT || (IS_DEV ? 'true' : 'false')).trim().toLowerCase() === 'true'
const MEMBER_MAX_TOKENS = readPositiveInt(import.meta.env.VITE_AI_MEMBER_MAX_TOKENS, IS_DEV ? 220 : 140, 64)
const DEBATE_REPAIR_MAX_TOKENS = readPositiveInt(import.meta.env.VITE_AI_DEBATE_REPAIR_MAX_TOKENS, IS_DEV ? 260 : 120, 96)
const JUDGE_MAX_TOKENS = readPositiveInt(import.meta.env.VITE_AI_JUDGE_MAX_TOKENS, IS_DEV ? 360 : 140, 48)
const ANGEL_MAX_TOKENS = readPositiveInt(import.meta.env.VITE_AI_ANGEL_MAX_TOKENS, IS_DEV ? 80 : 48, 24)
const ANGEL_SOURCE_CHARS = readPositiveInt(import.meta.env.VITE_AI_ANGEL_SOURCE_CHARS, IS_DEV ? 360 : 220, 120)
const DEBATE_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_DEBATE_CONTEXT_CHARS, IS_DEV ? 220 : 140, 80)
const EVIDENCE_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_EVIDENCE_CONTEXT_CHARS, IS_DEV ? 150 : 90, 60)
const DEBATE_EVIDENCE_LIMIT = readPositiveInt(import.meta.env.VITE_AI_DEBATE_EVIDENCE_LIMIT, IS_DEV ? 4 : 2, 1)
const CONSENSUS_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_CONSENSUS_CONTEXT_CHARS, IS_DEV ? 90 : 72, 40)
const FINAL_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_FINAL_CONTEXT_CHARS, IS_DEV ? 220 : 96, 60)
const TRANSCRIPT_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_TRANSCRIPT_CONTEXT_CHARS, IS_DEV ? 1200 : 900, 400)
const MEMORY_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_MEMORY_CONTEXT_CHARS, IS_DEV ? 900 : 320, 80)
const SEARCH_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_SEARCH_CONTEXT_CHARS, IS_DEV ? 1800 : 520, 120)
const OBSIDIAN_CONTEXT_CHARS = readPositiveInt(import.meta.env.VITE_AI_OBSIDIAN_CONTEXT_CHARS, IS_DEV ? 900 : 240, 80)
const INITIAL_SEARCH_RESULT_COUNT = readNonNegativeInt(import.meta.env.VITE_AI_INITIAL_SEARCH_RESULT_COUNT, IS_DEV ? 4 : 2)
const USE_OBSIDIAN_CONTEXT = readBooleanFlag(import.meta.env.VITE_AI_USE_OBSIDIAN_CONTEXT, IS_DEV)
const DEFAULT_JUDGE_SAMPLING = { temperature: 0.2, top_p: 0.65, max_tokens: JUDGE_MAX_TOKENS }
const ANGEL_SYSTEM_PROMPT = '당신은 신들의 천사입니다. 주어진 의견을 핵심 논점으로 2개만 짧게 요약하는 역할입니다. 반드시 한국어로 작성하세요.'
const ENABLE_OLLAMA_FALLBACK = String(import.meta.env.VITE_ENABLE_OLLAMA_FALLBACK || 'false').trim().toLowerCase() === 'true'

const unique = (items) => [...new Set(items.filter(Boolean))]
const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()
const trimForPrompt = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)

const countMatches = (value = '', pattern) => (String(value || '').match(pattern) || []).length

const isSuspiciousModelText = (value = '') => {
  const text = String(value || '').replace(/\s+/g, '')
  if (!text) return true

  const questionMarks = countMatches(text, /\?/g)
  const replacementChars = countMatches(text, /�/g)
  const readableChars = countMatches(text, /[A-Za-z0-9가-힣]/g)

  if (replacementChars > 0) return true
  if (questionMarks >= 6 && questionMarks / text.length >= 0.16) return true
  if (text.length >= 24 && readableChars < Math.max(8, Math.round(text.length * 0.22))) return true
  return false
}

const hasEvidenceCue = (value = '') => /\[E\d+\]|citation|scholar|doi|peer-reviewed|논문|근거/i.test(String(value || ''))

const hasStructuredEvidenceFormat = (value = '', selectedEvidence = []) => {
  if (!selectedEvidence.length) return true

  const text = String(value || '')
  const hasEvidenceTag = /\[E\d+\]/.test(text)
  const hasSourceLine = /(^|\n)출처\s*:/m.test(text)
  const expectsUrl = selectedEvidence.some((item) => String(item?.url || '').trim())
  const hasUrl = /https?:\/\//.test(text)

  if (!hasEvidenceTag || !hasSourceLine) return false
  if (expectsUrl && !hasUrl) return false
  return true
}

const buildDebateResponseFormat = (selectedEvidence = []) => [
  '다음 형식으로만 답하세요.',
  '반응 대상: 누구의 주장에 답하는지 1문장',
  '판단: 동의/반박/보완 중 하나를 분명히 밝히는 1~2문장',
  selectedEvidence.length > 0
    ? '근거: [E1] 같은 태그를 포함해 학술 근거를 1개 이상 연결하는 1문장'
    : '근거: 현재 근거 상태를 1문장으로 설명',
  selectedEvidence.length > 0
    ? '출처: [E1] 태그와 원문 링크를 1개 이상 그대로 적는 1문장'
    : '출처: 직접 연결 가능한 원문 링크가 없으면 없음이라고 1문장',
  '제안: 다음 행동이나 보완안을 1문장',
].join('\n')

const buildFallbackDebateResponse = (godId, otherOpinions = [], selectedEvidence = []) => {
  const agent = getAgentConfigById(godId)
  const target = trimForPrompt(otherOpinions[0]?.god || '다른 임원', 40)
  const evidenceLabel = selectedEvidence[0]
    ? `[E1] ${trimForPrompt(selectedEvidence[0].label || '상위 근거', 84)}`
    : '직접 연결 가능한 상위 근거가 아직 부족합니다.'
  const evidenceUrl = String(selectedEvidence[0]?.url || '').trim()
  const lens = trimForPrompt(agent?.runtime?.lens || agent?.role || '전문 관점', 72)

  return [
    `반응 대상: ${target}의 주장에 답합니다.`,
    `판단: ${lens} 기준에서 이번 의사결정은 범위를 좁혀 검증하는 보완 접근이 더 안전합니다.`,
    selectedEvidence[0]
      ? `근거: ${evidenceLabel}를 우선 연결하고 scholar 또는 citation 신호가 높은 자료부터 판단 근거로 사용해야 합니다.`
      : `근거: ${evidenceLabel}`,
    selectedEvidence[0]
      ? `출처: ${evidenceUrl ? `[E1] ${evidenceUrl}` : '[E1] 원문 링크를 다시 확인해야 합니다.'}`
      : '출처: 직접 연결 가능한 원문 링크 없음.',
    `제안: ${lens} 기준의 체크리스트로 리스크와 실행 순서를 다시 정리하세요.`,
  ].join('\n')
}

const shouldRepairDebateResponse = (value = '', selectedEvidence = []) => {
  if (isSuspiciousModelText(value)) return true
  if (selectedEvidence.length > 0 && !hasEvidenceCue(value)) return true
  if (selectedEvidence.length > 0 && !hasStructuredEvidenceFormat(value, selectedEvidence)) return true
  return false
}

const formatEvidencePromptLine = (item = {}, index = 0) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const authors = Array.isArray(metadata.authors) ? metadata.authors.slice(0, 2).join(', ') : ''
  const venue = trimForPrompt(metadata.venue || metadata.sourceLabel || item?.provider || '', 48)
  const year = trimForPrompt(metadata.year || '', 8)
  const scholarlyScore = Number(metadata.scholarlyScore || metadata?.rankingSignals?.total || 0)
  const evidenceLine = [authors, year, venue].filter(Boolean).join(' · ')
  const signalBits = [
    scholarlyScore > 0 ? `scholar ${Math.round(scholarlyScore)}/100` : '',
    metadata.peerReviewed ? 'peer-reviewed est.' : metadata.preprint ? 'preprint' : '',
  ].filter(Boolean)
  const excerpt = trimForPrompt(item?.excerpt || '', EVIDENCE_CONTEXT_CHARS)
  const url = trimForPrompt(item?.url || '', 120)
  const excerptLabel = cleanText(metadata.excerptSource || '').toLowerCase() === 'full_text' ? '본문 발췌' : '발췌/초록'

  return [
    `[E${index + 1}] ${trimForPrompt(item?.label || '근거 없음', 92)}`,
    evidenceLine,
    signalBits.join(' · '),
    excerpt ? `${excerptLabel}: ${excerpt}` : '',
    url ? `원문 링크: ${url}` : '',
  ].filter(Boolean).join(' | ')
}

const evidenceToDebateContext = (evidence = []) => {
  const items = mergeEvidenceItems(Array.isArray(evidence) ? evidence : []).slice(0, DEBATE_EVIDENCE_LIMIT)
  if (items.length === 0) return { items: [], context: '' }

  return {
    items,
    context: [
      '검토된 근거:',
      ...items.map((item, index) => formatEvidencePromptLine(item, index)),
      '위 근거를 우선 연결하고, 직접 인용은 제공된 발췌/초록 문구 범위 안에서만 사용하세요.',
      '근거를 사용했다면 [E1] 같은 태그와 원문 링크를 1개 이상 그대로 남기세요.',
    ].join('\n'),
  }
}

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
  if (!INCLUDE_INTERNAL_STATE_PROMPT) return null
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
    return await callRemoteRuntime(JUDGE_AGENT_ID, ANGEL_SYSTEM_PROMPT, userMessage, ANGEL_MAX_TOKENS, 0.4, 0.8)
  } catch (error) {
    if (!(IS_DEV && ENABLE_OLLAMA_FALLBACK)) {
      throw error
    }

    const content = await callLocalRuntimeWithFallback(
      JUDGE_AGENT_ID,
      [{ role: 'system', content: ANGEL_SYSTEM_PROMPT }, { role: 'user', content: userMessage }],
      { num_predict: ANGEL_MAX_TOKENS, temperature: 0.4, top_p: 0.8 }
    )
    if (content !== null) return content
    console.warn('[Dev] /api/chat 천사 요약 실패 → Ollama fallback도 실패')
    throw error
  }
}

export const angelSummarize = async (godId, godName, opinion) => {
  const prompt = `[${godName}의 의견]\n${trimForPrompt(opinion, ANGEL_SOURCE_CHARS)}\n\n위 의견의 핵심 주장 2가지를 불릿 포인트(•)로 간결하게 요약하세요.`
  return await callAngelModel(prompt)
}

const callModel = async (agentId, userMessage, { phase = 'initial', maxTokens = null } = {}) => {
  const baseSystemPrompt = buildCouncilSystemPrompt(agentId, phase, {
    profile: RUNTIME_PROMPT_PROFILE,
    compact: RUNTIME_PROMPT_PROFILE !== 'full',
  })
  const arousalParams = agentId === JUDGE_AGENT_ID ? null : getArousalParams(agentId)
  const resolvedMaxTokens = Number.isFinite(maxTokens)
    ? maxTokens
    : (agentId === JUDGE_AGENT_ID ? JUDGE_MAX_TOKENS : MEMBER_MAX_TOKENS)
  const combinedSystem = [
    baseSystemPrompt,
    buildInternalStatePrompt(agentId),
    buildArousalPrompt(agentId, arousalParams),
  ].filter(Boolean).join('\n\n')
  const sampling = getRuntimeSampling(agentId, resolvedMaxTokens, arousalParams)

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
    transcript || INITIAL_SEARCH_RESULT_COUNT === 0 ? null : searchWeb(topic, INITIAL_SEARCH_RESULT_COUNT),
    USE_OBSIDIAN_CONTEXT ? readFromObsidian(godId, topic) : '',
  ])

  const memoryContext = clampPromptBlock(memoriesToContext(memories), MEMORY_CONTEXT_CHARS)
  const searchContext = clampPromptBlock(searchResultsToContext(searchData), SEARCH_CONTEXT_CHARS)
  const trimmedObsidianContext = clampPromptBlock(obsidianContext, OBSIDIAN_CONTEXT_CHARS)
  const evidence = transcript
    ? [buildTranscriptEvidenceItem({ topic, transcript, requestedBy: godId })].filter(Boolean)
    : searchResultsToEvidence(searchData, { requestedBy: godId })
  const { items: selectedEvidence, context: evidenceContext } = evidenceToDebateContext(evidence)

  let userMessage
  if (transcript) {
    userMessage = [
      memoryContext,
      trimmedObsidianContext,
      evidenceContext || searchContext,
      `다음은 YouTube 영상의 내용입니다:\n\n"${transcript.slice(0, TRANSCRIPT_CONTEXT_CHARS)}"\n\n위 영상에 대해 당신의 전문 분야 관점에서 분석하고 초기 의견을 제시하세요.`,
      selectedEvidence.length > 0 ? '제공된 발췌/초록 범위 밖의 인용문은 만들지 말고, 근거를 사용했다면 [E1] 태그와 원문 링크를 답변에 남기세요.' : '',
    ].filter(Boolean).join('\n\n')
  } else {
    userMessage = [
      memoryContext,
      trimmedObsidianContext,
      evidenceContext || searchContext,
      `주제: ${topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.`,
      selectedEvidence.length > 0 ? '제공된 발췌/초록 범위 밖의 인용문은 만들지 말고, 근거를 사용했다면 [E1] 태그와 원문 링크를 답변에 남기세요.' : '',
    ].filter(Boolean).join('\n\n')
  }

  try { updateStateFromEvent(godId, { posFeedback: 0.5 }) } catch (error) {}
  try { updateFromUrgency(godId, 0) } catch (error) {}

  const content = await callModel(godId, userMessage, { phase: 'initial' })

  try {
    const findings = await scanAndQuarantine('immune', [{ god: godId, content }], { topic })
    if (findings?.length) console.info('immune quarantined (R1):', findings)
  } catch (error) {}

  const citationRefs = buildCitationRefsFromResponse({ content, selectedEvidence })

  return {
    godId,
    response: content,
    timestamp: new Date().toISOString(),
    evidence,
    promptEvidence: selectedEvidence,
    citationRefs,
  }
}

export const callAIDebate = async (godId, topic, otherOpinions, opts = {}) => {
  const opinionsText = otherOpinions
    .map(opinion => `[${opinion.god}]: ${trimForPrompt(opinion.content, DEBATE_CONTEXT_CHARS)}`)
    .join('\n\n')
  const { items: selectedEvidence, context: evidenceContext } = evidenceToDebateContext(opts?.evidence)

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

  const userMessage = [
    `주제: ${topic}`,
    evidenceContext,
    `다른 임원들의 의견:\n${opinionsText || '다른 의견 없음'}`,
    '위 의견들에 대해 동의/반박/보완하며 토론하세요. 누구의 의견에 반응하는지 구체적으로 언급하세요.',
    selectedEvidence.length > 0 ? '근거를 사용했다면 [E1] 태그와 원문 링크를 그대로 남기고, 발췌 범위 밖의 인용문은 만들지 마세요.' : '',
    buildDebateResponseFormat(selectedEvidence),
  ].filter(Boolean).join('\n\n')

  let content = await callModel(godId, userMessage, { phase: 'debate' })

  if (shouldRepairDebateResponse(content, selectedEvidence)) {
    try {
      const repaired = await callModel(godId, [
        userMessage,
        '이전 답변은 문자 깨짐이 있거나 근거 연결이 약했습니다. 물음표 반복 없이, 일반 한국어 텍스트로 다시 작성하세요.',
        buildDebateResponseFormat(selectedEvidence),
      ].join('\n\n'), { phase: 'debate', maxTokens: DEBATE_REPAIR_MAX_TOKENS })
      content = shouldRepairDebateResponse(repaired, selectedEvidence)
        ? buildFallbackDebateResponse(godId, otherOpinions, selectedEvidence)
        : repaired
    } catch (error) {
      content = buildFallbackDebateResponse(godId, otherOpinions, selectedEvidence)
    }
  }

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

  const citationRefs = buildCitationRefsFromResponse({ content, selectedEvidence })

  return {
    godId,
    response: content,
    timestamp: new Date().toISOString(),
    evidence: selectedEvidence,
    promptEvidence: selectedEvidence,
    citationRefs,
  }
}

export const checkConsensus = async (topic, roundMessages) => {
  if (!roundMessages || roundMessages.length === 0) return false

  const summary = roundMessages
    .map(message => `[${message.god}]: ${trimForPrompt(message.content, CONSENSUS_CONTEXT_CHARS)}`)
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
      .map(message => `[${message.god} R${message.round}]: ${trimForPrompt(message.content, FINAL_CONTEXT_CHARS)}`)
      .join('\n\n')
    prompt = `주제: ${topic}\n\n전체 토론:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요.`
  } else {
    const lastRound = Math.max(...allMessages.map(message => message.round))
    const summary = allMessages
      .filter(message => message.round === lastRound)
      .map(message => `[${message.god}]: ${trimForPrompt(message.content, FINAL_CONTEXT_CHARS)}`)
      .join('\n')
    prompt = `주제: ${topic}\n\n최종 라운드 요약:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요.`
  }

  return await callModel(JUDGE_AGENT_ID, prompt, { phase: 'judge-final', maxTokens: JUDGE_MAX_TOKENS })
}
