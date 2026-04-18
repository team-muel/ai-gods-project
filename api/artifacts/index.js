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

  if (route === 'generate') {
    const { default: generateHandler } = await import('./_generate.js')
    return await generateHandler(req, res)
  }

  if (route === 'export') {
    const { default: exportHandler } = await import('./_export.js')
    return await exportHandler(req, res)
  }

  if (route === 'feedback') {
    const { default: feedbackHandler } = await import('./_feedback.js')
    return await feedbackHandler(req, res)
  }

  if (route === 'outline') {
    const { default: outlineHandler } = await import('./_outline.js')
    return await outlineHandler(req, res)
  }

  if (route === 'ingest') {
    const { default: ingestHandler } = await import('./_ingest.js')
    return await ingestHandler(req, res)
  }

  return sendJson(res, 404, { error: '지원하지 않는 artifacts route 입니다.' })
}