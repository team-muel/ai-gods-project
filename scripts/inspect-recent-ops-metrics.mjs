import { createClient } from '@supabase/supabase-js'

const keyCandidates = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_ANON_KEY,
]

let supabaseKey = ''
for (const candidate of keyCandidates) {
  if (typeof candidate === 'string' && candidate.length > 0) {
    supabaseKey = candidate
    break
  }
}

if (!process.env.SUPABASE_URL || !supabaseKey) {
  throw new Error('SUPABASE_URL 또는 서버 키가 설정되지 않았습니다.')
}

const supabase = createClient(process.env.SUPABASE_URL, supabaseKey)
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const agentIds = ['cco', 'cso', 'cpo', 'cmo', 'cxo', 'cfo', 'cdo', 'cto']

const average = (values) => {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const main = async () => {
  const [messages, neuro, arousal] = await Promise.all([
    supabase
      .from('debate_messages')
      .select('god_id, debate_id, created_at')
      .gte('created_at', since)
      .range(0, 1999),
    supabase
      .from('neuro_logs')
      .select('agent_id, dopamine, cortisol, created_at')
      .gte('created_at', since)
      .range(0, 1999),
    supabase
      .from('arousal_logs')
      .select('agent_id, heart_rate, burst, created_at')
      .gte('created_at', since)
      .range(0, 1999),
  ])

  for (const result of [messages, neuro, arousal]) {
    if (result.error) throw result.error
  }

  const summary = agentIds.map((id) => {
    const messageRows = messages.data.filter((row) => row.god_id === id)
    const neuroRows = neuro.data.filter((row) => row.agent_id === id)
    const arousalRows = arousal.data.filter((row) => row.agent_id === id)

    return {
      id,
      recentMessages24h: messageRows.length,
      recentDebates24h: new Set(messageRows.map((row) => row.debate_id)).size,
      neuroSamples24h: neuroRows.length,
      avgDopamine24h: Number(average(neuroRows.map((row) => row.dopamine)).toFixed(2)),
      avgCortisol24h: Number(average(neuroRows.map((row) => row.cortisol)).toFixed(2)),
      arousalSamples24h: arousalRows.length,
      avgHeartRate24h: Number(average(arousalRows.map((row) => row.heart_rate)).toFixed(2)),
      burstRate24h: Number(average(arousalRows.map((row) => (row.burst ? 1 : 0))).toFixed(2)),
    }
  })

  console.log(JSON.stringify({
    totals: {
      messageRows24h: messages.data.length,
      neuroRows24h: neuro.data.length,
      arousalRows24h: arousal.data.length,
    },
    summary,
  }, null, 2))
}

await main()