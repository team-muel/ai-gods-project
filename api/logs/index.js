import arousalHandler from './_arousal.js'
import immuneHandler from './_immune.js'
import neuroHandler from './_neuro.js'
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
  const route = getRouteSuffix(req, '/api/logs')

  if (route === 'neuro') return await neuroHandler(req, res)
  if (route === 'immune') return await immuneHandler(req, res)
  if (route === 'arousal') return await arousalHandler(req, res)

  return sendJson(res, 404, { error: '지원하지 않는 logs route 입니다.' })
}