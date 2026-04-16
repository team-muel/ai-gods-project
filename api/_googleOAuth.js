import crypto from 'node:crypto'
import { google } from 'googleapis'

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i
const GOOGLE_OAUTH_SESSION_COOKIE = 'ai_gods_google_oauth'
const GOOGLE_OAUTH_STATE_COOKIE = 'ai_gods_google_oauth_state'
const OAUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive',
]

const cleanText = (value = '') => String(value).trim()

const getHost = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()

const getProtocol = (req) => {
  const host = getHost(req)
  const forwardedProto = cleanText(req.headers['x-forwarded-proto'] || '')
  if (forwardedProto) return forwardedProto
  return LOCAL_HOST_RE.test(host) ? 'http' : 'https'
}

const isSecureRequest = (req) => getProtocol(req) === 'https'

const serializeCookie = (name, value, { maxAge, httpOnly = true, path = '/', sameSite = 'Lax', secure = false, expires } = {}) => {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  if (expires instanceof Date) parts.push(`Expires=${expires.toUTCString()}`)
  if (path) parts.push(`Path=${path}`)
  if (httpOnly) parts.push('HttpOnly')
  if (sameSite) parts.push(`SameSite=${sameSite}`)
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

const appendSetCookieHeader = (res, cookieValue) => {
  const current = res.getHeader('Set-Cookie')
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue)
    return
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookieValue])
    return
  }

  res.setHeader('Set-Cookie', [current, cookieValue])
}

const parseCookieHeader = (header = '') => {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex <= 0) return acc
      const name = decodeURIComponent(part.slice(0, separatorIndex).trim())
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim())
      acc[name] = value
      return acc
    }, {})
}

const getCookieSecret = () => {
  const secret = cleanText(process.env.GOOGLE_OAUTH_COOKIE_SECRET || '')
  if (!secret) {
    throw new Error('Google OAuth를 위해 GOOGLE_OAUTH_COOKIE_SECRET이 필요합니다.')
  }
  return secret
}

const getCookieKey = () => crypto.createHash('sha256').update(getCookieSecret()).digest()

const toBase64Url = (buffer) => Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const fromBase64Url = (value = '') => {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64')
}

const encryptPayload = (payload) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getCookieKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return toBase64Url(Buffer.concat([iv, tag, encrypted]))
}

const decryptPayload = (value = '') => {
  const buffer = fromBase64Url(value)
  if (buffer.length < 29) return null

  const iv = buffer.subarray(0, 12)
  const tag = buffer.subarray(12, 28)
  const encrypted = buffer.subarray(28)

  const decipher = crypto.createDecipheriv('aes-256-gcm', getCookieKey(), iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  return JSON.parse(decrypted)
}

const setEncryptedCookie = (req, res, name, payload, maxAge) => {
  appendSetCookieHeader(
    res,
    serializeCookie(name, encryptPayload(payload), {
      maxAge,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureRequest(req),
    })
  )
}

const clearCookie = (req, res, name) => {
  appendSetCookieHeader(
    res,
    serializeCookie(name, '', {
      maxAge: 0,
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureRequest(req),
    })
  )
}

const readEncryptedCookie = (req, name) => {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || '')
    const value = cookies[name]
    if (!value) return null
    return decryptPayload(value)
  } catch {
    return null
  }
}

const hasServiceAccountConfig = () => {
  const clientEmail = cleanText(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '')
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
  return Boolean(clientEmail && privateKey)
}

export const hasGoogleOAuthConfig = () => {
  return Boolean(
    cleanText(process.env.GOOGLE_OAUTH_CLIENT_ID || '') &&
    cleanText(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '') &&
    cleanText(process.env.GOOGLE_OAUTH_REDIRECT_URI || '') &&
    cleanText(process.env.GOOGLE_OAUTH_COOKIE_SECRET || '')
  )
}

export const getGoogleOAuthRedirectUri = () => {
  const redirectUri = cleanText(process.env.GOOGLE_OAUTH_REDIRECT_URI || '')
  if (!redirectUri) {
    throw new Error('Google OAuth를 위해 GOOGLE_OAUTH_REDIRECT_URI가 필요합니다.')
  }
  return redirectUri
}

export const getGoogleOAuthClient = () => {
  const clientId = cleanText(process.env.GOOGLE_OAUTH_CLIENT_ID || '')
  const clientSecret = cleanText(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '')
  const redirectUri = getGoogleOAuthRedirectUri()

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth를 위해 GOOGLE_OAUTH_CLIENT_ID와 GOOGLE_OAUTH_CLIENT_SECRET이 필요합니다.')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export const normalizeReturnTo = (value = '') => {
  const trimmed = String(value || '').trim()
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return '/'
  return trimmed.slice(0, 500)
}

export const setGoogleOAuthState = (req, res, { state, returnTo = '/' } = {}) => {
  setEncryptedCookie(req, res, GOOGLE_OAUTH_STATE_COOKIE, {
    state: cleanText(state),
    returnTo: normalizeReturnTo(returnTo),
  }, OAUTH_STATE_MAX_AGE_SECONDS)
}

export const readGoogleOAuthState = (req) => readEncryptedCookie(req, GOOGLE_OAUTH_STATE_COOKIE)

export const clearGoogleOAuthState = (req, res) => {
  clearCookie(req, res, GOOGLE_OAUTH_STATE_COOKIE)
}

export const storeGoogleRefreshToken = (req, res, { refreshToken } = {}) => {
  setEncryptedCookie(req, res, GOOGLE_OAUTH_SESSION_COOKIE, {
    refreshToken: cleanText(refreshToken),
    savedAt: new Date().toISOString(),
  }, OAUTH_SESSION_MAX_AGE_SECONDS)
}

export const getStoredGoogleRefreshToken = (req) => {
  const payload = readEncryptedCookie(req, GOOGLE_OAUTH_SESSION_COOKIE)
  return cleanText(payload?.refreshToken || '')
}

export const clearGoogleOAuthSession = (req, res) => {
  clearCookie(req, res, GOOGLE_OAUTH_SESSION_COOKIE)
}

export const clearGoogleOAuthCookies = (req, res) => {
  clearGoogleOAuthState(req, res)
  clearGoogleOAuthSession(req, res)
}

export const getGoogleExportAuthMode = () => (hasGoogleOAuthConfig() ? 'oauth' : 'service-account')

export const getGoogleExportStatus = (req) => {
  const mode = getGoogleExportAuthMode()
  if (mode === 'oauth') {
    return {
      mode,
      connected: Boolean(getStoredGoogleRefreshToken(req)),
      requiresUserConnection: true,
    }
  }

  return {
    mode,
    connected: hasServiceAccountConfig(),
    requiresUserConnection: false,
  }
}

export const createGoogleAuthError = (status, code, message, extras = {}) => {
  return Object.assign(new Error(message), { status, code, ...extras })
}

export const getGoogleAuthForRequest = (req) => {
  if (getGoogleExportAuthMode() === 'oauth') {
    const refreshToken = getStoredGoogleRefreshToken(req)
    if (!refreshToken) {
      throw createGoogleAuthError(401, 'oauth_required', 'Google 계정 연결이 필요합니다.')
    }

    const oauth2Client = getGoogleOAuthClient()
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    return oauth2Client
  }

  const clientEmail = cleanText(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '')
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()

  if (!clientEmail || !privateKey) {
    throw new Error('Google Docs/Slides export를 위해 OAuth 또는 서비스 계정 환경변수가 필요합니다.')
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: GOOGLE_OAUTH_SCOPES,
  })
}