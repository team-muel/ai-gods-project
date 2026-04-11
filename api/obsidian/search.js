/**
 * GET /api/obsidian/search?godId=cso&q=주제
 * Vercel 환경: Supabase god_memories에서 해당 신의 과거 기억 검색
 */
import { enforceRateLimit, ensureRequestAllowed, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'obsidian-search', limit: 30, windowMs: 10 * 60 * 1000 })) return

  const godId = String(req.query?.godId || '').trim().slice(0, 64)
  const q = String(req.query?.q || '').trim().slice(0, 200)

  if (!godId) return sendJson(res, 400, { notes: [] })

  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('god_memories')
    .select('topic, my_opinion, created_at')
    .eq('god_id', godId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data) {
    return sendJson(res, 200, { notes: [] })
  }

  // 키워드 필터링 (있을 경우)
  const keywords = q.toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = keywords.length
    ? data.filter(m =>
        keywords.some(kw => m.topic?.toLowerCase().includes(kw) || m.my_opinion?.toLowerCase().includes(kw))
      )
    : data

  const notes = (filtered.length ? filtered : data).slice(0, 3).map(m => ({
    title: m.topic,
    snippet: m.my_opinion?.slice(0, 200) || '',
  }))

  return sendJson(res, 200, { notes })
}
