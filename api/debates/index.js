import completeHandler from './_complete.js'
import feedbackHandler from './_feedback.js'
import statsHandler from './_stats.js'
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
  const route = getRouteSuffix(req, '/api/debates')

  if (route === 'complete') return await completeHandler(req, res)
  if (route === 'feedback') return await feedbackHandler(req, res)
  if (route === 'stats') return await statsHandler(req, res)

  return sendJson(res, 404, { error: '지원하지 않는 debates route 입니다.' })
}