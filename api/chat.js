import {
  clampInteger,
  clampNumber,
  enforceRateLimit,
  ensureRequestAllowed,
  parseJsonBody,
  sendJson,
} from './_requestGuard.js'
import { routeChatCompletion } from './_modelRouter.js'

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

const sanitizePayload = (body) => {
  const provider = String(body?.provider || '').trim().toLowerCase()
  const requestedModel = String(body?.model || '').trim()

  return {
    model: provider === 'ollama' || provider === 'custom' ? requestedModel : ALLOWED_MODEL,
    agentId: String(body?.agentId || '').trim().toLowerCase(),
    provider,
    phase: String(body?.phase || '').trim(),
    messages: sanitizeMessages(body?.messages),
    max_tokens: clampInteger(body?.max_tokens, 32, 800, 500),
    temperature: clampNumber(body?.temperature, 0, 1.2, 0.7),
    top_p: clampNumber(body?.top_p, 0.1, 1, 0.9),
  }
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'groq-chat', limit: 80, windowMs: 10 * 60 * 1000 })) return

  let payload
  try {
    payload = sanitizePayload(parseJsonBody(req))
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const result = await routeChatCompletion(payload)
  return sendJson(res, result.status, result.body)
}
