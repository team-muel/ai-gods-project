export default async function handler(req, res) {
  const { q, num = '5' } = req.query
  const serperKey = process.env.SERPER_API_KEY

  if (!q) return res.status(400).json({ error: 'q 파라미터가 필요합니다.' })
  if (!serperKey) return res.status(500).json({ error: 'SERPER_API_KEY 미설정' })

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: parseInt(num), hl: 'ko', gl: 'kr' }),
    })
    const data = await response.json()
    const results = (data.organic || []).slice(0, parseInt(num)).map(r => ({
      title: r.title, snippet: r.snippet, link: r.link,
    }))
    return res.status(200).json({ results, knowledgePanel: data.knowledgeGraph || null, query: q })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
