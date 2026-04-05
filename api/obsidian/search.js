/**
 * GET /api/obsidian/search?godId=cso&q=주제
 * Vercel 환경: Supabase god_memories에서 해당 신의 과거 기억 검색
 */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { godId, q = '' } = req.query

  if (!godId) return res.status(400).json({ notes: [] })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase
    .from('god_memories')
    .select('topic, my_opinion, created_at')
    .eq('god_id', godId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data) {
    return res.status(200).json({ notes: [] })
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

  return res.status(200).json({ notes })
}
