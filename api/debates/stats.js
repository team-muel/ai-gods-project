import { enforceRateLimit, ensureRequestAllowed, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

const createStatsFallback = (message) => ({
  totalDebates: 0,
  todayDebates: 0,
  available: false,
  message: message || '통계 조회에 실패했습니다.',
})

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'debate-stats', limit: 60, windowMs: 10 * 60 * 1000 })) return

  try {
    const supabase = getSupabaseServerClient({ allowAnonFallback: true })
    const { count: totalDebates, error: totalError } = await supabase
      .from('debates')
      .select('*', { count: 'exact', head: true })

    if (totalError) throw new Error(totalError.message)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count: todayDebates, error: todayError } = await supabase
      .from('debates')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())

    if (todayError) throw new Error(todayError.message)

    return sendJson(res, 200, {
      totalDebates: totalDebates || 0,
      todayDebates: todayDebates || 0,
      available: true,
    })
  } catch (error) {
    console.warn('[debates/stats] fallback response:', error?.message || error)
    return sendJson(res, 200, createStatsFallback(error?.message))
  }
}
