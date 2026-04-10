import {
  clampInteger,
  clampNumber,
  enforceRateLimit,
  ensureRequestAllowed,
  parseJsonBody,
  sendJson,
} from './_requestGuard.js'

const MAX_RETRIES = 5
const ALLOWED_MODEL = 'llama-3.1-8b-instant'

const sanitizeMessages = (messages) => {
  const safeMessages = Array.isArray(messages)
    ? messages
        .filter((message) => message && (message.role === 'system' || message.role === 'user'))
        .slice(-4)
        .map((message) => ({
          role: message.role,
          content: String(message.content || '').slice(0, message.role === 'system' ? 4000 : 12000),
        }))
        .filter((message) => message.content)
    : []

  const hasUserMessage = safeMessages.some((message) => message.role === 'user')
  if (!hasUserMessage) {
    throw new Error('최소 1개의 사용자 메시지가 필요합니다.')
  }

  return safeMessages
}

const sanitizePayload = (body) => ({
  model: ALLOWED_MODEL,
  messages: sanitizeMessages(body?.messages),
  max_tokens: clampInteger(body?.max_tokens, 32, 800, 500),
  temperature: clampNumber(body?.temperature, 0, 1.2, 0.7),
  top_p: clampNumber(body?.top_p, 0.1, 1, 0.9),
})

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'groq-chat', limit: 80, windowMs: 10 * 60 * 1000 })) return

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return sendJson(res, 500, { error: 'GROQ_API_KEY 미설정' })

  let payload
  try {
    payload = sanitizePayload(parseJsonBody(req))
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const serializedBody = JSON.stringify(payload)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: serializedBody,
      })

      const data = await response.json().catch(() => ({}))

      // 429: 대기시간 추출 후 자동 재시도
      if (response.status === 429) {
        const msg = data?.error?.message || ''
        const match = msg.match(/try again in ([\d.]+)s/)
        const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 15000
        console.log(`[Groq 429] ${waitMs}ms 대기 후 재시도 (${attempt + 1}/${MAX_RETRIES})`)
        await sleep(waitMs)
        continue
      }

      return sendJson(res, response.status, data)
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) {
        return sendJson(res, 500, { error: e.message })
      }
      await sleep(3000)
    }
  }

  return sendJson(res, 429, { error: '최대 재시도 횟수 초과. 잠시 후 다시 시도하세요.' })
}
