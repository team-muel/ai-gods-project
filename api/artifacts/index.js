import exportHandler from './_export.js'
import feedbackHandler from './_feedback.js'
import generateHandler from './_generate.js'
import { sendJson } from '../_requestGuard.js'

const getRouteSuffix = (req, basePath) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
  const url = new URL(req.url || '/', `https://${host}`)
  const queryRoute = String(url.searchParams.get('route') || '').trim().toLowerCase()
  if (queryRoute) return queryRoute

  const normalizedPath = String(url.pathname || '').replace(/\/+$/, '').toLowerCase()
  const normalizedBase = String(basePath || '').replace(/\/+$/, '').toLowerCase()

  if (normalizedBase && normalizedPath.startsWith(normalizedBase)) {
    return normalizedPath.slice(normalizedBase.length).replace(/^\/+/, '')
  }

  return normalizedPath.replace(/^\/+/, '')
}

export default async function handler(req, res) {
  const route = getRouteSuffix(req, '/api/artifacts')

  if (route === 'generate') return await generateHandler(req, res)
  if (route === 'export') return await exportHandler(req, res)
  if (route === 'feedback') return await feedbackHandler(req, res)

  return sendJson(res, 404, { error: '지원하지 않는 artifacts route 입니다.' })
}