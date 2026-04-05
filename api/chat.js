export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const groqKey = process.env.GROQ_API_KEY

  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY 미설정' })

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
    return res.status(response.status).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
