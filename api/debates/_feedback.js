import { getFeedbackRewardDelta, isRewardLearningUnavailableError } from '../../src/lib/rewardLearning.js'
import { clampInteger, enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

const sendSkippedResponse = (res, debateId) => sendJson(res, 200, {
  ok: true,
  skipped: true,
  rewardLearningReady: false,
  debateId,
  updatedPairs: 0,
  appliedReward: 0,
  message: '보상학습 테이블이 아직 없어 피드백 저장은 건너뜁니다. 기본 토론 운영에는 영향이 없습니다.',
})

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'debate-feedback', limit: 20, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const debateId = String(body?.debateId || '').trim()
  const direction = String(body?.direction || '').trim().toLowerCase()
  const note = String(body?.note || '').trim().slice(0, 1000)
  const delta = getFeedbackRewardDelta(direction)

  if (!debateId) {
    return sendJson(res, 400, { error: 'debateId가 필요합니다.' })
  }
  if (!delta) {
    return sendJson(res, 400, { error: 'direction은 up 또는 down 이어야 합니다.' })
  }

  try {
    const supabase = getSupabaseServerClient()

    const [rewardTableResult, pairTableResult] = await Promise.all([
      supabase.from('reward_events').select('id', { head: true, count: 'exact' }),
      supabase.from('preference_pairs').select('id', { head: true, count: 'exact' }),
    ])

    for (const tableResult of [rewardTableResult, pairTableResult]) {
      if (!tableResult.error) continue
      if (isRewardLearningUnavailableError(tableResult.error)) {
        return sendSkippedResponse(res, debateId)
      }
      throw new Error(tableResult.error.message)
    }

    const { data: godRows, error: godError } = await supabase
      .from('debate_messages')
      .select('god_id')
      .eq('debate_id', debateId)

    if (godError) throw new Error(godError.message)

    const godIds = [...new Set((godRows || []).map((row) => row.god_id).filter(Boolean))]
    const rewardRows = [
      {
        debate_id: debateId,
        god_id: null,
        event_type: 'human_feedback',
        reward_score: delta,
        reward_label: direction === 'up' ? 'human_approved' : 'human_rejected',
        source: 'consensus_feedback_ui',
        metadata: { note, godCount: godIds.length },
      },
      ...godIds.map((godId) => ({
        debate_id: debateId,
        god_id: godId,
        event_type: 'human_feedback',
        reward_score: delta,
        reward_label: direction === 'up' ? 'human_approved' : 'human_rejected',
        source: 'consensus_feedback_ui',
        metadata: { note },
      })),
    ]

    const { error: rewardError } = await supabase.from('reward_events').insert(rewardRows)
    if (rewardError) {
      if (isRewardLearningUnavailableError(rewardError)) {
        return sendSkippedResponse(res, debateId)
      }
      throw new Error(rewardError.message)
    }

    const { data: pairRows, error: pairError } = await supabase
      .from('preference_pairs')
      .select('id, reward_score')
      .eq('debate_id', debateId)
      .eq('status', 'ready')

    if (pairError) {
      if (isRewardLearningUnavailableError(pairError)) {
        return sendSkippedResponse(res, debateId)
      }
      throw new Error(pairError.message)
    }

    for (const row of pairRows || []) {
      const nextScore = Number((Number(row.reward_score || 0) + delta).toFixed(4))
      const { error: updateError } = await supabase
        .from('preference_pairs')
        .update({ reward_score: nextScore })
        .eq('id', row.id)

      if (updateError) {
        if (isRewardLearningUnavailableError(updateError)) {
          return sendSkippedResponse(res, debateId)
        }
        throw new Error(updateError.message)
      }
    }

    return sendJson(res, 200, {
      ok: true,
      rewardLearningReady: true,
      debateId,
      updatedPairs: clampInteger(pairRows?.length, 0, 99999, 0),
      appliedReward: delta,
    })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '피드백 저장 중 오류가 발생했습니다.' })
  }
}