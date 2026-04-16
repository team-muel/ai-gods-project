import { routeChatCompletion } from './_modelRouter.js'

const extractAssistantContent = (body = {}) => (
  body?.message?.content
  || body?.choices?.[0]?.message?.content
  || ''
)

export const callTextGeneration = async ({
  systemPrompt,
  userPrompt,
  maxTokens = 900,
  temperature = 0.35,
  topP = 0.9,
  agentId = '',
  phase = 'workbench-generate',
} = {}) => {
  const result = await routeChatCompletion({
    agentId,
    phase,
    messages: [
      { role: 'system', content: String(systemPrompt || '').slice(0, 4000) },
      { role: 'user', content: String(userPrompt || '').slice(0, 12000) },
    ],
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
  })

  if (!result?.ok) {
    throw new Error(result?.body?.error || `생성 모델 호출 실패: ${result?.status || 500}`)
  }

  return extractAssistantContent(result.body)
}

export const parseJsonBlock = (value, fallback = null) => {
  const text = String(value || '').trim()
  if (!text) return fallback

  const candidates = [text]
  const fencedMatch = text.match(/```json\s*([\s\S]+?)```/i) || text.match(/```\s*([\s\S]+?)```/)
  if (fencedMatch?.[1]) candidates.push(fencedMatch[1].trim())

  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch?.[0]) candidates.push(arrayMatch[0])

  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) candidates.push(objectMatch[0])

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }

  return fallback
}