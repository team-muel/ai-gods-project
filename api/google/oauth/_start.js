import crypto from 'node:crypto'
import { enforceRateLimit, ensureRequestAllowed, sendJson } from '../../_requestGuard.js'
import { GOOGLE_OAUTH_SCOPES, getGoogleOAuthClient, hasGoogleOAuthConfig, normalizeReturnTo, setGoogleOAuthState } from '../../_googleOAuth.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'], requireSameOrigin: false })) return
  if (!enforceRateLimit(req, res, { bucket: 'google-oauth-start', limit: 20, windowMs: 10 * 60 * 1000 })) return

  if (!hasGoogleOAuthConfig()) {
    return sendJson(res, 400, { error: 'Google OAuth 환경변수가 아직 설정되지 않았습니다.' })
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
  const url = new URL(req.url || '/api/google/oauth/start', `https://${host}`)
  const returnTo = normalizeReturnTo(url.searchParams.get('returnTo') || '/')
  const state = crypto.randomBytes(24).toString('hex')

  setGoogleOAuthState(req, res, { state, returnTo })

  const authUrl = getGoogleOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  })

  res.statusCode = 302
  res.setHeader('Location', authUrl)
  res.end()
}