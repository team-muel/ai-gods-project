import { clampInteger, clampNumber, enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'arousal-logs', limit: 180, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const agentId = String(body?.agentId || '').trim().slice(0, 64)
  if (!agentId) {
    return sendJson(res, 400, { error: 'agentId가 필요합니다.' })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.from('arousal_logs').insert({
      agent_id: agentId,
      heart_rate: clampNumber(body?.heartRate, 0.1, 10, null),
      burst: Boolean(body?.burst),
      token_factor: clampNumber(body?.tokenFactor, 0.01, 10, null),
      suggested_delay_ms: clampInteger(body?.suggestedDelayMs, 0, 60000, null),
      created_at: new Date().toISOString(),
    })

    if (error) throw new Error(error.message)
    return sendJson(res, 200, { ok: true })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '각성 로그 저장에 실패했습니다.' })
  }
}
