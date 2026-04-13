import { AI_GODS } from '../config/aiGods.js'

const DEFAULT_NEURO_CONFIG = {
  D: 0.2,
  C: 0.1,
  alphaPos: 0.08,
  alphaNeg: 0.12,
  betaD: 0.02,
  betaC: 0.05,
  gammaDebate: 0.01,
  T0: 1.0,
  kD: 0.6,
  kC: 0.8,
}

const DEFAULT_AROUSAL_CONFIG = {
  HR: 1.0,
  alphaUrgency: 0.7,
  betaDecay: 0.06,
  minHR: 0.5,
  maxHR: 2.5,
  burstThreshold: 1.3,
}

const POSITIVE_WORDS = ['동의', '좋은 지적', '맞습니다', '공감', '훌륭', '정확']
const NEGATIVE_WORDS = ['반박', '아니다', '틀리', '동의하지', '그렇지 않']

const RUNTIME_BY_ID = new Map(
  AI_GODS.map((agent) => [
    agent.id,
    {
      neuro: { ...DEFAULT_NEURO_CONFIG, ...(agent.runtime?.neuroConfig || {}) },
      arousal: { ...DEFAULT_AROUSAL_CONFIG, ...(agent.runtime?.arousalConfig || {}) },
    },
  ])
)

const clip = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))

const tokenize = (text) => Array.from(new Set(
  String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
))

const jaccardSimilarity = (leftTokens, rightTokens) => {
  const left = new Set(leftTokens)
  const right = new Set(rightTokens)
  const intersection = [...left].filter((token) => right.has(token)).length
  const union = new Set([...left, ...right]).size
  return union === 0 ? 0 : intersection / union
}

const countKeywordHits = (text, words) => words.filter((word) => String(text || '').includes(word)).length

const countNegativePeerOpinions = (opinions = []) => opinions.reduce((count, opinion) => {
  const hit = NEGATIVE_WORDS.some((word) => String(opinion.content || '').includes(word))
  return count + (hit ? 1 : 0)
}, 0)

const normalizeMessage = (message) => ({
  godId: String(message?.godId || message?.god_id || '').trim().toLowerCase(),
  god: String(message?.god || message?.god_name || message?.godId || message?.god_id || 'unknown').trim(),
  round: Math.max(1, Number(message?.round) || 1),
  content: String(message?.content || ''),
  timestamp: String(message?.timestamp || message?.createdAt || message?.created_at || new Date().toISOString()),
})

export const buildPhysioLogs = ({ debateId = null, topic = '', messages = [], source = 'unknown' } = {}) => {
  const normalizedMessages = messages.map(normalizeMessage).filter((message) => message.godId)
  const neuroRows = []
  const arousalRows = []
  const immuneRows = []
  const states = new Map()
  const topicTokens = tokenize(topic)
  const previousRoundByNumber = new Map()

  for (const message of normalizedMessages) {
    const runtime = RUNTIME_BY_ID.get(message.godId) || {
      neuro: DEFAULT_NEURO_CONFIG,
      arousal: DEFAULT_AROUSAL_CONFIG,
    }

    if (!states.has(message.godId)) {
      states.set(message.godId, {
        D: runtime.neuro.D,
        C: runtime.neuro.C,
        HR: runtime.arousal.HR,
      })
    }

    const state = states.get(message.godId)
    const peerOpinions = (previousRoundByNumber.get(message.round - 1) || [])
      .filter((opinion) => opinion.godId !== message.godId)
    const negCount = countNegativePeerOpinions(peerOpinions)
    const posCount = countKeywordHits(message.content, POSITIVE_WORDS)
    const posFeedback = message.round === 1 ? 0.5 : posCount * 0.5
    const negFeedback = message.round === 1 ? 0 : negCount * 0.6
    const debateLen = message.round === 1 ? 0 : peerOpinions.length

    state.D = clip(
      state.D + runtime.neuro.alphaPos * posFeedback - runtime.neuro.betaD * state.D,
      0,
      1
    )
    state.C = clip(
      state.C + runtime.neuro.alphaNeg * negFeedback + runtime.neuro.gammaDebate * debateLen - runtime.neuro.betaC * state.C,
      0,
      1
    )

    const temperature = clip(
      runtime.neuro.T0 * (1 + runtime.neuro.kD * state.D - runtime.neuro.kC * state.C),
      0.1,
      2.0
    )
    const topP = clip(0.9 + 0.08 * state.D - 0.1 * state.C, 0.5, 0.98)
    const maxTokens = Math.max(120, Math.round(600 * (1 + 0.5 * state.D - 0.3 * state.C)))

    const urgency = message.round === 1
      ? 0
      : Math.min(1, negCount * 0.6 + peerOpinions.length * 0.15)

    state.HR = clip(
      state.HR + runtime.arousal.alphaUrgency * urgency - runtime.arousal.betaDecay * (state.HR - runtime.arousal.minHR),
      runtime.arousal.minHR,
      runtime.arousal.maxHR
    )

    if (posCount > 0) {
      state.HR = clip(
        state.HR + posCount * 0.3,
        runtime.arousal.minHR,
        runtime.arousal.maxHR
      )
    }

    const burst = state.HR > runtime.arousal.burstThreshold
    const tokenFactor = 1 / state.HR
    const suggestedDelayMs = Math.max(50, Math.round(1000 / state.HR))
    const similarity = topicTokens.length > 0
      ? jaccardSimilarity(tokenize(message.content), topicTokens)
      : null

    neuroRows.push({
      agent_id: message.godId,
      dopamine: state.D,
      cortisol: state.C,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      metadata: {
        source,
        debate_id: debateId,
        round: message.round,
        topic,
        pos_feedback: posFeedback,
        neg_feedback: negFeedback,
      },
      created_at: message.timestamp,
    })

    arousalRows.push({
      agent_id: message.godId,
      heart_rate: state.HR,
      burst,
      token_factor: tokenFactor,
      suggested_delay_ms: suggestedDelayMs,
      metadata: {
        source,
        debate_id: debateId,
        round: message.round,
        topic,
        urgency,
      },
      created_at: message.timestamp,
    })

    if (!message.content.trim() || (typeof similarity === 'number' && similarity < 0.08)) {
      immuneRows.push({
        agent_id: message.godId,
        source: message.god,
        content: message.content.slice(0, 4000),
        reason: !message.content.trim() ? 'empty_response' : 'topic_drift',
        similarity: typeof similarity === 'number' ? similarity : 0,
        status: 'quarantined',
        metadata: {
          source,
          debate_id: debateId,
          round: message.round,
          topic,
        },
        created_at: message.timestamp,
      })
    }

    if (!previousRoundByNumber.has(message.round)) {
      previousRoundByNumber.set(message.round, [])
    }
    previousRoundByNumber.get(message.round).push(message)
  }

  return { neuroRows, arousalRows, immuneRows }
}