import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getSupabaseServerClient } from './_supabaseAdmin.js'

const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant'
const DEFAULT_TIMEOUT_MS = 45000
const MAX_RETRIES = 5
const ACTIVE_ROLLOUT_STATES = new Set(['active', 'canary'])
const LOCAL_REGISTRY_BACKENDS = new Set(['file', 'local'])
const DEFAULT_LOCAL_REGISTRY_PATH = 'outputs/model-registry.json'
const JUDGE_AGENT_ID = 'judge'
const registryCache = globalThis.__aiGodsModelRegistryCache || new Map()

if (!globalThis.__aiGodsModelRegistryCache) {
  globalThis.__aiGodsModelRegistryCache = registryCache
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeKey = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')

const parseRegistryTimestamp = (value) => {
  const timestamp = Date.parse(String(value || ''))
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const readJsonResponse = async (response) => {
  return await response.json().catch(() => ({}))
}

const shouldFallbackToGroq = () => {
  const value = String(process.env.MODEL_ROUTER_ALLOW_FALLBACK || 'true').trim().toLowerCase()
  return value !== '0' && value !== 'false' && value !== 'no' && value !== 'off'
}

const getCustomBaseUrl = () => String(process.env.CUSTOM_MODEL_BASE_URL || '').trim().replace(/\/$/, '')

const getCustomCompletionsUrl = () => {
  const baseUrl = getCustomBaseUrl()
  if (!baseUrl) return ''

  const explicitPath = String(process.env.CUSTOM_MODEL_CHAT_PATH || '').trim()
  if (explicitPath) {
    return explicitPath.startsWith('http') ? explicitPath : `${baseUrl}${explicitPath.startsWith('/') ? '' : '/'}${explicitPath}`
  }

  return `${baseUrl}/v1/chat/completions`
}

const getCustomHeaders = () => {
  const apiKey = String(process.env.CUSTOM_MODEL_API_KEY || '').trim()
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

const getRequestTimeoutMs = () => {
  const parsed = Number.parseInt(process.env.CUSTOM_MODEL_TIMEOUT_MS || '', 10)
  if (Number.isNaN(parsed) || parsed < 1000) return DEFAULT_TIMEOUT_MS
  return parsed
}

const getOptionalPositiveInt = (envKey) => {
  const parsed = Number.parseInt(process.env[envKey] || '', 10)
  if (Number.isNaN(parsed) || parsed <= 0) return 0
  return parsed
}

const trimPromptContent = (value, limit) => {
  const text = String(value || '')
  if (!limit || text.length <= limit) return text
  if (limit < 80) return text.slice(0, limit)

  const separator = '\n\n[...]\n\n'
  const headLength = Math.max(24, Math.floor(limit * 0.6))
  const tailLength = Math.max(16, limit - headLength - separator.length)
  return `${text.slice(0, headLength)}${separator}${text.slice(-tailLength)}`
}

const prepareCustomPayload = (payload) => {
  const maxTokensCap = getOptionalPositiveInt('CUSTOM_MODEL_MAX_TOKENS')
  const systemPromptChars = getOptionalPositiveInt('CUSTOM_MODEL_SYSTEM_PROMPT_CHARS')
  const userPromptChars = getOptionalPositiveInt('CUSTOM_MODEL_USER_PROMPT_CHARS')

  return {
    ...payload,
    max_tokens: maxTokensCap ? Math.min(Number(payload?.max_tokens) || maxTokensCap, maxTokensCap) : payload.max_tokens,
    messages: Array.isArray(payload?.messages)
      ? payload.messages.map((message) => {
          const limit = message?.role === 'system' ? systemPromptChars : userPromptChars
          if (!limit) return message

          return {
            ...message,
            content: trimPromptContent(message?.content, limit),
          }
        })
      : [],
  }
}

const getAgentProviderOverride = (agentId) => {
  const normalized = normalizeKey(agentId)
  const value = String(process.env[`CHAT_PROVIDER_${normalized}`] || '').trim().toLowerCase()
  return value
}

const getProviderMode = () => String(process.env.CHAT_PROVIDER_MODE || 'groq').trim().toLowerCase()

const getRegistryBackend = () => String(process.env.MODEL_REGISTRY_BACKEND || 'auto').trim().toLowerCase()

const getLocalRegistryPath = () => {
  const configured = String(process.env.MODEL_REGISTRY_PATH || DEFAULT_LOCAL_REGISTRY_PATH).trim()
  return path.resolve(process.cwd(), configured || DEFAULT_LOCAL_REGISTRY_PATH)
}

const isJudgePhase = (phase) => String(phase || '').trim().toLowerCase().startsWith('judge')

const isJudgeBaseModelRequest = (payload, modelVersion) => {
  if (modelVersion) return false

  const agentId = String(payload?.agentId || '').trim().toLowerCase()
  if (agentId === JUDGE_AGENT_ID) return true
  return isJudgePhase(payload?.phase)
}

const isCustomCandidate = (modelVersion) => {
  if (!modelVersion) return false
  if (!modelVersion.is_active) return false
  return ACTIVE_ROLLOUT_STATES.has(String(modelVersion.rollout_state || '').trim().toLowerCase())
}

const getRegistryCacheEntry = (agentId) => {
  const entry = registryCache.get(agentId)
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    registryCache.delete(agentId)
    return null
  }

  return entry.value
}

const setRegistryCacheEntry = (agentId, value) => {
  registryCache.set(agentId, {
    value,
    expiresAt: Date.now() + 15000,
  })
}

const isMissingModelVersionsError = (message) => {
  return message.includes('Could not find the table') || message.includes('does not exist')
}

const readLocalRegistry = async () => {
  try {
    const payload = await readFile(getLocalRegistryPath(), 'utf8')
    return JSON.parse(payload)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    console.warn(`[modelRouter] local registry 읽기 실패: ${error?.message || error}`)
    return null
  }
}

const getActiveLocalModelVersion = async (agentId) => {
  const payload = await readLocalRegistry()
  const rows = Array.isArray(payload?.modelVersions) ? payload.modelVersions : []
  const matched = rows
    .filter((row) => String(row?.agent_id || '').trim() === agentId && row?.is_active)
    .sort((left, right) => {
      return parseRegistryTimestamp(right?.created_at || right?.updatedAt) - parseRegistryTimestamp(left?.created_at || left?.updatedAt)
    })

  return matched[0] || null
}

export const getActiveModelVersion = async (agentId) => {
  const safeAgentId = String(agentId || '').trim()
  if (!safeAgentId) return null

  const cached = getRegistryCacheEntry(safeAgentId)
  if (cached !== null) return cached

  const backend = getRegistryBackend()
  if (LOCAL_REGISTRY_BACKENDS.has(backend)) {
    const localModelVersion = await getActiveLocalModelVersion(safeAgentId)
    setRegistryCacheEntry(safeAgentId, localModelVersion)
    return localModelVersion
  }

  let modelVersion = null
  try {
    const supabase = getSupabaseServerClient()
    const result = await supabase
      .from('model_versions')
      .select('agent_id, run_id, model_name, base_model, artifact_path, gguf_path, rollout_state, is_active, metadata, created_at')
      .eq('agent_id', safeAgentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (result.error) {
      const message = String(result.error.message || '')
      if (!isMissingModelVersionsError(message)) {
        console.warn(`[modelRouter] model_versions 조회 실패 (${safeAgentId}): ${message}`)
      }
    } else {
      modelVersion = result.data || null
    }
  } catch (error) {
    const message = String(error?.message || error)
    if (!message.includes('Supabase 서버 환경변수가 설정되지 않았습니다.')) {
      console.warn(`[modelRouter] registry client 초기화 실패 (${safeAgentId}): ${message}`)
    }
  }

  if (!modelVersion && backend === 'auto') {
    modelVersion = await getActiveLocalModelVersion(safeAgentId)
  }

  setRegistryCacheEntry(safeAgentId, modelVersion)
  return modelVersion
}

const buildCustomRequestBody = ({ payload, modelVersion }) => {
  const metadata = modelVersion?.metadata || {}
  const useBaseModelOnly = isJudgeBaseModelRequest(payload, modelVersion)
  const remoteModel = metadata.remoteModel || process.env.CUSTOM_MODEL_NAME || modelVersion?.base_model || payload.model || DEFAULT_GROQ_MODEL
  const adapter = useBaseModelOnly ? null : metadata.remoteAdapterId || modelVersion?.run_id || payload.agentId || null

  return {
    model: remoteModel,
    messages: payload.messages,
    temperature: payload.temperature,
    top_p: payload.top_p,
    max_tokens: payload.max_tokens,
    stream: false,
    agentId: useBaseModelOnly ? null : payload.agentId || null,
    phase: payload.phase || null,
    adapter,
    modelVersion: modelVersion
      ? {
          runId: modelVersion.run_id,
          modelName: modelVersion.model_name,
          rolloutState: modelVersion.rollout_state,
          artifactPath: modelVersion.artifact_path,
          ggufPath: modelVersion.gguf_path,
        }
      : null,
  }
}

export const callGroqWithRetry = async (payload) => {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    return {
      ok: false,
      status: 500,
      body: { error: 'GROQ_API_KEY 미설정' },
      provider: 'groq',
    }
  }

  const serializedBody = JSON.stringify({
    model: DEFAULT_GROQ_MODEL,
    messages: payload.messages,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature,
    top_p: payload.top_p,
  })

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: serializedBody,
      })

      const body = await readJsonResponse(response)
      if (response.status === 429) {
        const message = String(body?.error?.message || '')
        const match = message.match(/try again in ([\d.]+)s/)
        const waitMs = match ? Math.ceil(Number.parseFloat(match[1]) * 1000) + 500 : 15000
        console.log(`[Groq 429] ${waitMs}ms 대기 후 재시도 (${attempt + 1}/${MAX_RETRIES})`)
        await sleep(waitMs)
        continue
      }

      return {
        ok: response.ok,
        status: response.status,
        body: {
          ...body,
          provider: 'groq',
        },
        provider: 'groq',
      }
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) {
        return {
          ok: false,
          status: 500,
          body: { error: error.message || 'Groq 요청 실패', provider: 'groq' },
          provider: 'groq',
        }
      }

      await sleep(3000)
    }
  }

  return {
    ok: false,
    status: 429,
    body: { error: '최대 재시도 횟수 초과. 잠시 후 다시 시도하세요.', provider: 'groq' },
    provider: 'groq',
  }
}

export const callOllama = async (payload) => {
  const baseUrl = String(process.env.OLLAMA_BASE_URL || process.env.VITE_OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/$/, '')

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        model: payload.model || 'llama3.1:8b',
        stream: false,
      }),
    })

    const body = await readJsonResponse(response)
    return {
      ok: response.ok,
      status: response.status,
      body: {
        ...body,
        provider: 'ollama',
      },
      provider: 'ollama',
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: { error: `로컬 Ollama 연결 실패: ${error.message}`, provider: 'ollama' },
      provider: 'ollama',
    }
  }
}

export const callCustomProvider = async (payload, modelVersion) => {
  const url = getCustomCompletionsUrl()
  if (!url) {
    return {
      ok: false,
      status: 500,
      body: { error: 'CUSTOM_MODEL_BASE_URL 미설정', provider: 'custom' },
      provider: 'custom',
    }
  }

  const preparedPayload = prepareCustomPayload(payload)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs())

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getCustomHeaders(),
      body: JSON.stringify(buildCustomRequestBody({ payload: preparedPayload, modelVersion })),
      signal: controller.signal,
    })
    const body = await readJsonResponse(response)
    return {
      ok: response.ok,
      status: response.status,
      body: {
        ...body,
        provider: 'custom',
        modelVersion: modelVersion
          ? {
              runId: modelVersion.run_id,
              modelName: modelVersion.model_name,
              rolloutState: modelVersion.rollout_state,
            }
          : null,
      },
      provider: 'custom',
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: { error: error.name === 'AbortError' ? '커스텀 모델 응답 시간 초과' : error.message, provider: 'custom' },
      provider: 'custom',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export const routeChatCompletion = async (payload) => {
  const explicitProvider = String(payload.provider || '').trim().toLowerCase()
  if (explicitProvider === 'ollama') {
    return await callOllama(payload)
  }

  const agentId = String(payload.agentId || '').trim().toLowerCase()
  const providerOverride = agentId ? getAgentProviderOverride(agentId) : ''
  const providerMode = providerOverride || getProviderMode()
  const modelVersion = agentId && (explicitProvider === 'custom' || providerMode === 'registry' || providerMode === 'custom')
    ? await getActiveModelVersion(agentId)
    : null
  const judgeBaseModelRequest = isJudgeBaseModelRequest(payload, modelVersion)

  const shouldUseCustom = explicitProvider === 'custom'
    || providerMode === 'custom'
    || (providerMode === 'registry' && (isCustomCandidate(modelVersion) || judgeBaseModelRequest))

  if (shouldUseCustom) {
    const customResult = await callCustomProvider(payload, modelVersion)
    if (customResult.ok || !shouldFallbackToGroq()) {
      return customResult
    }

    console.warn(`[modelRouter] custom provider 실패 → Groq 폴백 (${agentId || 'unknown'}): ${customResult.body?.error || customResult.status}`)
  }

  return await callGroqWithRetry(payload)
}