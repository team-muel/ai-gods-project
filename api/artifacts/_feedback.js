import { maybeTriggerOnlineLearning } from '../../src/lib/onlineLearning.js'
import { estimateArtifactQuality } from '../../src/lib/artifactBuilder.js'
import { isRewardLearningUnavailableError } from '../../src/lib/rewardLearning.js'
import { enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const getDirectionScore = (direction) => {
  if (direction === 'up') return 0.85
  if (direction === 'down') return -0.85
  return 0
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'artifact-feedback', limit: 30, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const direction = cleanText(body?.direction || '').toLowerCase()
  const artifactType = cleanText(body?.artifactType || '').toLowerCase()
  const debateId = cleanText(body?.debateId || '') || null
  const topic = cleanText(body?.topic || '').slice(0, 200)
  const note = cleanText(body?.note || '').slice(0, 600)
  const artifact = body?.artifact && typeof body.artifact === 'object' ? body.artifact : null
  const dossier = body?.dossier && typeof body.dossier === 'object' ? body.dossier : null

  if (!['up', 'down'].includes(direction) || !artifactType || !artifact) {
    return sendJson(res, 400, { error: 'artifactType, direction, artifact가 필요합니다.' })
  }

  const rewardEvent = {
    debate_id: debateId,
    god_id: null,
    event_type: 'artifact_quality_feedback',
    reward_score: getDirectionScore(direction),
    reward_label: direction === 'up' ? 'artifact_positive' : 'artifact_negative',
    source: 'artifact_feedback_ui',
    metadata: {
      topic,
      artifactType,
      artifactTitle: artifact.title || '',
      note,
      artifactQualityScore: estimateArtifactQuality({ dossier, artifactType: artifactType === 'slides' ? 'slides' : 'report', artifact }),
      citationScore: Number(dossier?.citationSummary?.averageCitationScore || 0),
    },
  }

  try {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.from('reward_events').insert(rewardEvent)

    if (error) {
      if (isRewardLearningUnavailableError(error)) {
        return sendJson(res, 200, {
          ok: true,
          skipped: true,
          rewardLearningReady: false,
          message: 'reward_events 테이블이 없어 artifact feedback 저장을 건너뜁니다.',
        })
      }

      throw error
    }

    const onlineLearning = await maybeTriggerOnlineLearning({
      debateId,
      topic,
      totalRounds: 0,
      consensus: '',
      messages: [],
      rewardEvents: [rewardEvent],
      preferencePairs: [],
      artifactFeedbackEvents: [rewardEvent],
    })

    return sendJson(res, 200, {
      ok: true,
      saved: true,
      rewardScore: rewardEvent.reward_score,
      onlineLearning,
    })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'artifact feedback 저장 중 오류가 발생했습니다.' })
  }
}