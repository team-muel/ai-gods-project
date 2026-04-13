import http from 'node:http'
import { randomUUID } from 'node:crypto'

const HOST = String(process.env.OPENAI_PROXY_HOST || '127.0.0.1').trim() || '127.0.0.1'
const PORT = Math.max(1, Number.parseInt(process.env.OPENAI_PROXY_PORT || '8011', 10) || 8011)
const UPSTREAM_BASE_URL = String(process.env.LEGACY_UPSTREAM_BASE_URL || 'https://hevlein-ai-gods-server.hf.space').trim().replace(/\/$/, '')
const API_KEY = String(process.env.OPENAI_PROXY_API_KEY || '').trim()
const DEFAULT_MODEL_NAME = String(process.env.OPENAI_PROXY_MODEL_NAME || 'ai-gods-proxy').trim() || 'ai-gods-proxy'
const DEFAULT_JUDGE_MODEL = String(process.env.LEGACY_JUDGE_MODEL || 'ai-oracle').trim() || 'ai-oracle'
const REQUEST_BODY_LIMIT_BYTES = 1024 * 1024

const AGENT_MODEL_MAP = {
  cco: 'ai-muse',
  cso: 'ai-atlas',
  cpo: 'ai-forge',
  cmo: 'ai-mercury',
  cxo: 'ai-empathy',
  cfo: 'ai-prudence',
  cdo: 'ai-oracle',
  cto: 'ai-nexus',
}

const LEGACY_MODELS = new Set(Object.values(AGENT_MODEL_MAP))

const toInt = (value, fallback, minimum = 0) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(minimum, parsed)
}

const toFloat = (value, fallback, minimum = 0, maximum = 2) => {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

const readJsonBody = async (req) => {
  const chunks = []
  let totalLength = 0

  for await (const chunk of req) {
    totalLength += chunk.length
    if (totalLength > REQUEST_BODY_LIMIT_BYTES) {
      throw new Error('요청 본문이 너무 큽니다.')
    }
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim()
  if (!rawBody) return {}
  return JSON.parse(rawBody)
}

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(body)
}

const unauthorized = (res) => {
  sendJson(res, 401, { error: 'Unauthorized' })
}

const ensureAuthorized = (req, res) => {
  if (!API_KEY) return true

  const authorization = String(req.headers.authorization || '').trim()
  if (authorization === `Bearer ${API_KEY}`) return true
  unauthorized(res)
  return false
}

const normalizeKey = (value) => String(value || '').trim().toLowerCase()

const resolveLegacyModel = ({ model, agentId, adapter, phase }) => {
  const requestedModel = normalizeKey(model)
  if (LEGACY_MODELS.has(requestedModel)) return requestedModel

  const candidates = [
    normalizeKey(agentId),
    normalizeKey(adapter),
    normalizeKey(adapter).split('-')[0],
    requestedModel,
    requestedModel.split('-')[0],
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (AGENT_MODEL_MAP[candidate]) {
      return AGENT_MODEL_MAP[candidate]
    }
  }

  if (normalizeKey(phase).startsWith('judge')) {
    return DEFAULT_JUDGE_MODEL
  }

  return DEFAULT_JUDGE_MODEL
}

const toLegacyPayload = (body, legacyModel) => ({
  model: legacyModel,
  messages: Array.isArray(body?.messages) ? body.messages : [],
  stream: false,
  options: {
    num_predict: toInt(body?.max_tokens, 256, 16),
    temperature: toFloat(body?.temperature, 0.7, 0, 1.5),
    top_p: toFloat(body?.top_p, 0.9, 0.1, 1),
  },
})

const proxyChatCompletion = async (body) => {
  const legacyModel = resolveLegacyModel(body || {})
  const upstreamResponse = await fetch(`${UPSTREAM_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toLegacyPayload(body, legacyModel)),
  })
  const upstreamData = await upstreamResponse.json().catch(() => ({}))

  if (!upstreamResponse.ok) {
    return {
      status: upstreamResponse.status,
      body: {
        error: upstreamData?.error || upstreamData?.message || 'Legacy upstream request failed',
        provider: 'custom',
        upstreamModel: legacyModel,
      },
    }
  }

  const content = String(
    upstreamData?.message?.content ||
    upstreamData?.choices?.[0]?.message?.content ||
    ''
  )

  return {
    status: 200,
    body: {
      id: `chatcmpl-${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: String(body?.model || DEFAULT_MODEL_NAME).trim() || DEFAULT_MODEL_NAME,
      provider: 'custom',
      adapter: body?.adapter || body?.agentId || null,
      upstreamModel: legacyModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    },
  }
}

const listModels = async () => {
  const upstreamResponse = await fetch(`${UPSTREAM_BASE_URL}/api/tags`)
  const upstreamData = await upstreamResponse.json().catch(() => ({}))

  const models = Array.isArray(upstreamData?.models) ? upstreamData.models : []
  return models.map((item) => ({
    id: String(item?.name || item?.model || '').trim(),
    object: 'model',
    owned_by: 'ai-gods-legacy-upstream',
  })).filter((item) => item.id)
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true })
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (!ensureAuthorized(req, res)) return

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return sendJson(res, 200, {
        status: 'ok',
        provider: 'custom',
        upstreamBaseUrl: UPSTREAM_BASE_URL,
        defaultModel: DEFAULT_MODEL_NAME,
        defaultJudgeModel: DEFAULT_JUDGE_MODEL,
      })
    }

    if (req.method === 'GET' && url.pathname === '/v1/models') {
      const data = await listModels()
      return sendJson(res, 200, { object: 'list', data })
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const body = await readJsonBody(req)
      const result = await proxyChatCompletion(body)
      return sendJson(res, result.status, result.body)
    }

    return sendJson(res, 404, { error: 'Not Found' })
  } catch (error) {
    return sendJson(res, 500, { error: error?.message || 'Internal Server Error' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[openai-legacy-proxy] listening on http://${HOST}:${PORT}`)
  console.log(`[openai-legacy-proxy] upstream=${UPSTREAM_BASE_URL}`)
})