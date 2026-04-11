/**
 * POST /api/obsidian/write
 * Vercel 환경: 토론 결과를 Supabase god_memories에 저장
 * (memoryService.saveDebateMemory가 이미 저장하므로, 중복 방지를 위해 upsert 사용)
 */
import { enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'obsidian-write', limit: 20, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message })
  }

  const supabase = getSupabaseServerClient()
  const { godId, godName, topic, debateId, opinion, consensus } = body || {}

  if (!godId || !topic) {
    return sendJson(res, 400, { ok: false, error: 'godId, topic 필수' })
  }

  const slug = topic.toLowerCase().replace(/\s+/g, '-').slice(0, 40)
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `${date}-${slug}.md`

  // debate_id + god_id 기준 upsert (saveDebateMemory와 중복 방지)
  if (debateId) {
    const { error } = await supabase
      .from('god_memories')
      .update({
        my_opinion: opinion?.slice(0, 600),
        consensus: consensus?.slice(0, 400),
        updated_at: new Date().toISOString(),
      })
      .eq('debate_id', debateId)
      .eq('god_id', godId)

    if (error) console.warn('[Obsidian/write] 업데이트 경고:', error.message)
  }

  return sendJson(res, 200, { ok: true, file: fileName })
}
