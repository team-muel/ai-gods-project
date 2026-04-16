import { enforceRateLimit, ensureRequestAllowed } from '../../_requestGuard.js'
import {
  clearGoogleOAuthSession,
  clearGoogleOAuthState,
  getGoogleOAuthClient,
  getStoredGoogleRefreshToken,
  normalizeReturnTo,
  readGoogleOAuthState,
  storeGoogleRefreshToken,
} from '../../_googleOAuth.js'

const cleanText = (value = '') => String(value).trim()

const redirectTo = (res, location) => {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

const buildReturnLocation = (returnTo, state, errorCode = '') => {
  const url = new URL(normalizeReturnTo(returnTo || '/'), 'http://localhost')
  url.searchParams.set('google_oauth', state)
  if (errorCode) url.searchParams.set('google_oauth_error', errorCode)
  return `${url.pathname}${url.search}${url.hash}`
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'], requireSameOrigin: false })) return
  if (!enforceRateLimit(req, res, { bucket: 'google-oauth-callback', limit: 40, windowMs: 10 * 60 * 1000 })) return

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
  const url = new URL(req.url || '/api/google/oauth/callback', `https://${host}`)
  const code = cleanText(url.searchParams.get('code') || '')
  const state = cleanText(url.searchParams.get('state') || '')
  const oauthError = cleanText(url.searchParams.get('error') || '')
  const statePayload = readGoogleOAuthState(req)
  const returnTo = normalizeReturnTo(statePayload?.returnTo || '/')

  clearGoogleOAuthState(req, res)

  if (oauthError) {
    return redirectTo(res, buildReturnLocation(returnTo, 'error', oauthError))
  }

  if (!statePayload?.state || !state || statePayload.state !== state) {
    return redirectTo(res, buildReturnLocation(returnTo, 'error', 'state_mismatch'))
  }

  if (!code) {
    return redirectTo(res, buildReturnLocation(returnTo, 'error', 'missing_code'))
  }

  try {
    const oauth2Client = getGoogleOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    const refreshToken = cleanText(tokens.refresh_token || getStoredGoogleRefreshToken(req))

    if (!refreshToken) {
      clearGoogleOAuthSession(req, res)
      return redirectTo(res, buildReturnLocation(returnTo, 'error', 'missing_refresh_token'))
    }

    storeGoogleRefreshToken(req, res, { refreshToken })
    return redirectTo(res, buildReturnLocation(returnTo, 'connected'))
  } catch {
    clearGoogleOAuthSession(req, res)
    return redirectTo(res, buildReturnLocation(returnTo, 'error', 'token_exchange_failed'))
  }
}