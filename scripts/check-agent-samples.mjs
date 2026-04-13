import { AI_GODS, REMOTE_RUNTIME_MODEL, buildCouncilSystemPrompt } from '../src/config/aiGods.js'

const API_URL = process.env.AGENT_SAMPLE_API_URL || 'http://localhost:3000/api/chat'
const QUESTION = process.env.AGENT_SAMPLE_QUESTION || 'AI SaaS 가격 전략을 어떻게 설계해야 하나?'
const PROVIDER = process.env.AGENT_SAMPLE_PROVIDER || 'groq'
const MODEL = process.env.AGENT_SAMPLE_MODEL || REMOTE_RUNTIME_MODEL
const MAX_TOKENS = Math.max(16, Number.parseInt(process.env.AGENT_SAMPLE_MAX_TOKENS || '180', 10) || 180)
const TEMPERATURE = Number.parseFloat(process.env.AGENT_SAMPLE_TEMPERATURE || '0.7') || 0.7
const TOP_P = Number.parseFloat(process.env.AGENT_SAMPLE_TOP_P || '0.9') || 0.9

const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim()

const main = async () => {
  const results = []

  for (const agent of AI_GODS) {
    try {
      const requestBody = PROVIDER === 'ollama'
        ? {
            agentId: agent.id,
            provider: 'ollama',
            model: agent.runtime.localModel,
            messages: [
              { role: 'system', content: buildCouncilSystemPrompt(agent.id, 'initial') },
              { role: 'user', content: QUESTION },
            ],
            phase: 'initial',
            stream: false,
            options: {
              num_predict: MAX_TOKENS,
              temperature: TEMPERATURE,
              top_p: TOP_P,
            },
          }
        : {
            agentId: agent.id,
            provider: PROVIDER === 'custom' ? 'custom' : '',
            model: MODEL,
            messages: [
              { role: 'system', content: buildCouncilSystemPrompt(agent.id, 'initial') },
              { role: 'user', content: QUESTION },
            ],
            phase: 'initial',
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            top_p: TOP_P,
          }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json().catch(() => ({}))
      const text = normalize(data?.message?.content || data?.choices?.[0]?.message?.content)

      results.push({
        id: agent.id,
        name: agent.name,
        ok: response.ok,
        provider: data?.provider || PROVIDER,
        model: data?.model || (PROVIDER === 'ollama' ? agent.runtime.localModel : MODEL),
        adapter: data?.adapter || null,
        modelVersion: data?.modelVersion || null,
        sample: text.slice(0, 220),
        error: response.ok ? null : data?.error || `HTTP ${response.status}`,
      })
    } catch (error) {
      results.push({
        id: agent.id,
        name: agent.name,
        ok: false,
        sample: '',
        error: error.message,
      })
    }
  }

  console.log(JSON.stringify({ apiUrl: API_URL, provider: PROVIDER, model: MODEL, question: QUESTION, maxTokens: MAX_TOKENS, temperature: TEMPERATURE, topP: TOP_P, results }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})