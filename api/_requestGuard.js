const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i
const rateLimits = globalThis.__aiGodsRateLimits || new Map()

if (!globalThis.__aiGodsRateLimits) {
  globalThis.__aiGodsRateLimits = rateLimits
}

const normalizeOrigin = (value = '') => String(value).trim().replace(/\/$/, '')

const getHost = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()

const getProtocol = (req, host) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim()
  if (forwardedProto) return forwardedProto
  return LOCAL_HOST_RE.test(host) ? 'http' : 'https'
}

const parseRefererOrigin = (value = '') => {
  try {
    return normalizeOrigin(new URL(String(value)).origin)
  } catch {
    return ''
  }
}

export const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export const ensureRequestAllowed = (req, res, { methods = ['GET'], requireSameOrigin = true } = {}) => {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '))
    res.statusCode = 405
    res.end()
    return false
  }

  if (!requireSameOrigin) return true

  const host = getHost(req)
  if (!host) {
    sendJson(res, 403, { error: '요청 호스트를 확인할 수 없습니다.' })
    return false
  }

  if (LOCAL_HOST_RE.test(host)) return true

  const protocol = getProtocol(req, host)
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => normalizeOrigin(value))
      .filter(Boolean)
  )
  allowedOrigins.add(`${protocol}://${host}`)

  const callerOrigin = normalizeOrigin(req.headers.origin || parseRefererOrigin(req.headers.referer))
  if (!callerOrigin || !allowedOrigins.has(callerOrigin)) {
    sendJson(res, 403, { error: '허용되지 않은 요청입니다.' })
    return false
  }

  return true
}

export const parseJsonBody = (req) => {
  if (req.body == null || req.body === '') return {}

  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : String(req.body)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error('유효한 JSON 본문이 필요합니다.')
  }
}

export const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export const clampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
  const ip = forwarded.split(',')[0]?.trim()
  return ip || req.socket?.remoteAddress || 'unknown'
}

export const enforceRateLimit = (req, res, { bucket = 'default', limit = 60, windowMs = 10 * 60 * 1000 } = {}) => {
  const now = Date.now()
  const key = `${bucket}:${getClientIp(req)}`

  for (const [entryKey, entry] of rateLimits.entries()) {
    if (entry.expiresAt <= now) rateLimits.delete(entryKey)
  }

  const current = rateLimits.get(key)
  if (!current || current.expiresAt <= now) {
    rateLimits.set(key, { count: 1, expiresAt: now + windowMs })
    return true
  }

  if (current.count >= limit) {
    sendJson(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' })
    return false
  }

  current.count += 1
  rateLimits.set(key, current)
  return true
}
