/**
 * Unified Obsidian endpoint for Vercel Hobby plan.
 * GET  /api/obsidian/search  -> rewritten to /api/obsidian
 * POST /api/obsidian/write   -> rewritten to /api/obsidian
 */
import { enforceRateLimit, ensureRequestAllowed, getRequestQuery, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

const handleSearch = async (req, res) => {
  if (!enforceRateLimit(req, res, { bucket: 'obsidian-search', limit: 30, windowMs: 10 * 60 * 1000 })) return

  const query = getRequestQuery(req)
  const godId = String(query.godId || '').trim().slice(0, 64)
  const q = String(query.q || '').trim().slice(0, 200)

  if (!godId) {
    return sendJson(res, 400, { notes: [] })
  }

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

  const keywords = q.toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = keywords.length
    ? data.filter((memory) =>
        keywords.some((keyword) =>
          memory.topic?.toLowerCase().includes(keyword) || memory.my_opinion?.toLowerCase().includes(keyword)
        )
      )
    : data

  const notes = (filtered.length ? filtered : data).slice(0, 3).map((memory) => ({
    title: memory.topic,
    snippet: memory.my_opinion?.slice(0, 200) || '',
  }))

  return sendJson(res, 200, { notes })
}

const handleWrite = async (req, res) => {
  if (!enforceRateLimit(req, res, { bucket: 'obsidian-write', limit: 20, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message })
  }

  const supabase = getSupabaseServerClient()
  const godId = String(body?.godId || '').trim().slice(0, 64)
  const topic = String(body?.topic || '').trim().slice(0, 200)
  const debateId = body?.debateId || null
  const opinion = String(body?.opinion || '').slice(0, 600)
  const consensus = String(body?.consensus || '').slice(0, 400)

  if (!godId || !topic) {
    return sendJson(res, 400, { ok: false, error: 'godId, topic 필수' })
  }

  const slug = topic.toLowerCase().replace(/\s+/g, '-').slice(0, 40)
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `${date}-${slug}.md`

  if (debateId) {
    const { error } = await supabase
      .from('god_memories')
      .update({
        my_opinion: opinion,
        consensus: consensus || null,
        updated_at: new Date().toISOString(),
      })
      .eq('debate_id', debateId)
      .eq('god_id', godId)

    if (error) {
      console.warn('[Obsidian/write] 업데이트 경고:', error.message)
    }
  }

  return sendJson(res, 200, { ok: true, file: fileName })
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET', 'POST'] })) return

  if (req.method === 'GET') {
    return handleSearch(req, res)
  }

  if (req.method === 'POST') {
    return handleWrite(req, res)
  }

  res.setHeader('Allow', 'GET, POST')
  res.statusCode = 405
  res.end()
}