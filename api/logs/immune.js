import { clampNumber, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const agentId = String(body?.agentId || '').trim()
  if (!agentId) {
    return sendJson(res, 400, { error: 'agentId가 필요합니다.' })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.from('immune_logs').insert({
      agent_id: agentId,
      source: String(body?.source || '').slice(0, 120),
      content: String(body?.content || '').slice(0, 4000),
      reason: String(body?.reason || 'low_similarity').slice(0, 120),
      similarity: clampNumber(body?.similarity, 0, 1, null),
      status: body?.status === 'released' ? 'released' : 'quarantined',
      created_at: new Date().toISOString(),
    })

    if (error) throw new Error(error.message)
    return sendJson(res, 200, { ok: true })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '면역 로그 저장에 실패했습니다.' })
  }
}
