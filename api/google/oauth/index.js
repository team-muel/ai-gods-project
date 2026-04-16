import callbackHandler from './_callback.js'
import disconnectHandler from './_disconnect.js'
import startHandler from './_start.js'
import statusHandler from './_status.js'
import { sendJson } from '../../_requestGuard.js'

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
  const route = getRouteSuffix(req, '/api/google/oauth')

  if (route === 'start') return await startHandler(req, res)
  if (route === 'callback') return await callbackHandler(req, res)
  if (route === 'status') return await statusHandler(req, res)
  if (route === 'disconnect') return await disconnectHandler(req, res)

  return sendJson(res, 404, { error: '지원하지 않는 Google OAuth route 입니다.' })
}