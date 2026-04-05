const MAX_RETRIES = 5

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY 미설정' })

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      })

      const data = await response.json()

      // 429: 대기시간 추출 후 자동 재시도
      if (response.status === 429) {
        const msg = data?.error?.message || ''
        const match = msg.match(/try again in ([\d.]+)s/)
        const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 15000
        console.log(`[Groq 429] ${waitMs}ms 대기 후 재시도 (${attempt + 1}/${MAX_RETRIES})`)
        await sleep(waitMs)
        continue
      }

      return res.status(response.status).json(data)
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) {
        return res.status(500).json({ error: e.message })
      }
      await sleep(3000)
    }
  }

  return res.status(429).json({ error: '최대 재시도 횟수 초과. 잠시 후 다시 시도하세요.' })
}
