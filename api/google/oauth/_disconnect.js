import { enforceRateLimit, ensureRequestAllowed, sendJson } from '../../_requestGuard.js'
import { clearGoogleOAuthCookies, getGoogleExportAuthMode } from '../../_googleOAuth.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'google-oauth-disconnect', limit: 12, windowMs: 10 * 60 * 1000 })) return

  clearGoogleOAuthCookies(req, res)

  return sendJson(res, 200, {
    ok: true,
    mode: getGoogleExportAuthMode(),
    connected: false,
  })
}