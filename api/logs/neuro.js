import { clampInteger, clampNumber, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
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
    const { error } = await supabase.from('neuro_logs').insert({
      agent_id: agentId,
      dopamine: clampNumber(body?.dopamine, 0, 1, null),
      cortisol: clampNumber(body?.cortisol, 0, 1, null),
      temperature: clampNumber(body?.temperature, 0, 2, null),
      top_p: clampNumber(body?.topP, 0, 1, null),
      max_tokens: clampInteger(body?.maxTokens, 1, 2000, null),
      created_at: new Date().toISOString(),
    })

    if (error) throw new Error(error.message)
    return sendJson(res, 200, { ok: true })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '신경 로그 저장에 실패했습니다.' })
  }
}
