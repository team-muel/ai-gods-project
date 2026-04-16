import { calcDecayScore, keywordSimilarity } from '../../src/lib/memoryScoring.js'
import { clampInteger, enforceRateLimit, ensureRequestAllowed, getRequestQuery, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'memories-relevant', limit: 90, windowMs: 10 * 60 * 1000 })) return

  const query = getRequestQuery(req)
  const godId = String(query.godId || '').trim().slice(0, 64)
  const topic = String(query.topic || '').trim().slice(0, 200)
  const count = clampInteger(query.count, 1, 10, 3)

  if (!godId) {
    return sendJson(res, 400, { error: 'godId 파라미터가 필요합니다.' })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('god_memories')
      .select('id, topic, my_opinion, relevance_score, created_at')
      .eq('god_id', godId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30)

    if (error || !data) {
      throw new Error(error?.message || '메모리 조회에 실패했습니다.')
    }

    const scored = data
      .map((memory) => ({
        ...memory,
        score: calcDecayScore(memory.created_at) * (0.3 + keywordSimilarity(memory.topic, topic) * 0.7),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, count)

    return sendJson(res, 200, { memories: scored })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '메모리 조회 중 오류가 발생했습니다.' })
  }
}
