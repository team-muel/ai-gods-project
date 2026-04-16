import { ensureRequestAllowed, sendJson } from '../../_requestGuard.js'
import { getGoogleExportStatus } from '../../_googleOAuth.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'], requireSameOrigin: false })) return
  return sendJson(res, 200, getGoogleExportStatus(req))
}