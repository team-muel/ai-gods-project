const POSITIVE_WORDS = ['동의', '좋은 지적', '맞습니다', '공감', '훌륭', '정확', '탁월', '핵심']
const NEGATIVE_WORDS = ['반박', '아니다', '틀리', '동의하지', '그렇지 않', '문제가', '우려']
const REWARD_TABLE_NAMES = ['reward_events', 'preference_pairs']

const clip = (value, min, max) => Math.max(min, Math.min(max, value))

const countMatches = (content, words) => {
  const text = String(content || '')
  return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0)
}

const scoreMessage = ({ content, round, totalRounds, consensusReached }) => {
  const safeContent = String(content || '').trim()
  if (!safeContent) return -1

  const positiveHits = countMatches(safeContent, POSITIVE_WORDS)
  const negativeHits = countMatches(safeContent, NEGATIVE_WORDS)
  const lengthScore = clip(safeContent.length / 420, 0, 1)
  const roundScore = totalRounds > 0 ? clip(round / totalRounds, 0, 1) : 0
  const consensusBonus = consensusReached ? 0.25 : -0.08
  const lexicalScore = positiveHits * 0.12 - negativeHits * 0.09

  return clip(lengthScore * 0.45 + roundScore * 0.2 + lexicalScore + consensusBonus, -1, 1)
}

const normalizeMessage = (message) => ({
  godId: String(message?.godId || message?.god_id || '').trim(),
  god: String(message?.god || message?.god_name || message?.godId || message?.god_id || '').trim(),
  round: Math.max(1, Number(message?.round) || 1),
  content: String(message?.content || ''),
})

const uniqueMessages = (messages) => {
  const seen = new Set()
  return messages.filter((message) => {
    const key = `${message.round}:${message.content.trim()}`
    if (!message.content.trim() || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const buildRewardLearningArtifacts = ({ debateId = null, topic, totalRounds, consensus, messages, source = 'system_auto_debate' }) => {
  const normalizedMessages = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.godId && message.content.trim())

  const consensusText = String(consensus || '').trim()
  const consensusReached = consensusText.length >= 40
  const grouped = new Map()

  for (const message of normalizedMessages) {
    if (!grouped.has(message.godId)) grouped.set(message.godId, [])
    grouped.get(message.godId).push(message)
  }

  const rewardEvents = []
  const preferencePairs = []

  for (const [godId, godMessages] of grouped.entries()) {
    const unique = uniqueMessages(godMessages)
    const scored = unique
      .map((message) => ({
        ...message,
        score: scoreMessage({
          content: message.content,
          round: message.round,
          totalRounds,
          consensusReached,
        }),
      }))
      .sort((left, right) => right.score - left.score || right.round - left.round)

    if (scored.length === 0) continue

    const averageScore = scored.reduce((sum, message) => sum + message.score, 0) / scored.length
    rewardEvents.push({
      debate_id: debateId,
      god_id: godId,
      event_type: 'debate_outcome',
      reward_score: Number(averageScore.toFixed(4)),
      reward_label: consensusReached ? 'consensus_positive' : 'consensus_weak',
      source,
      metadata: {
        topic,
        totalRounds,
        messageCount: scored.length,
        consensusReached,
        bestRound: scored[0].round,
      },
    })

    if (scored.length < 2) continue

    const chosen = scored[0]
    const rejected = [...scored].sort((left, right) => left.score - right.score || left.round - right.round)[0]
    if (!chosen || !rejected || chosen.content.trim() === rejected.content.trim()) continue

    preferencePairs.push({
      debate_id: debateId,
      god_id: godId,
      topic,
      prompt: `주제: ${topic}\n\n당신의 전문 분야 관점에서 의견을 제시하세요.`,
      chosen: chosen.content.trim(),
      rejected: rejected.content.trim(),
      chosen_round: chosen.round,
      rejected_round: rejected.round,
      reward_score: Number((chosen.score - rejected.score).toFixed(4)),
      status: 'ready',
      source,
      metadata: {
        consensusReached,
        totalRounds,
        chosenScore: Number(chosen.score.toFixed(4)),
        rejectedScore: Number(rejected.score.toFixed(4)),
      },
    })
  }

  if (normalizedMessages.length > 0) {
    rewardEvents.push({
      debate_id: debateId,
      god_id: null,
      event_type: 'debate_summary',
      reward_score: consensusReached ? 0.6 : -0.2,
      reward_label: consensusReached ? 'debate_consensus' : 'debate_no_consensus',
      source,
      metadata: {
        topic,
        totalRounds,
        messageCount: normalizedMessages.length,
        consensusReached,
      },
    })
  }

  return { rewardEvents, preferencePairs }
}

export const getFeedbackRewardDelta = (direction) => {
  if (direction === 'up') return 0.9
  if (direction === 'down') return -0.9
  return 0
}

export const isRewardLearningUnavailableError = (error) => {
  const code = String(error?.code || '').toUpperCase()
  const text = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const mentionsRewardTable = REWARD_TABLE_NAMES.some((tableName) => text.includes(tableName))
  const missingTableSignal = text.includes('does not exist') || text.includes('could not find the table') || text.includes('schema cache')

  return (code === '42P01' || code === 'PGRST205' || missingTableSignal) && mentionsRewardTable
}