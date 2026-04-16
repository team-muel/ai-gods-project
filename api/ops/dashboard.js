import { clampInteger, enforceRateLimit, ensureRequestAllowed, getRequestQuery, sendJson } from '../_requestGuard.js'
import { buildOperationsDashboard, DEFAULT_DASHBOARD_PAGE_SIZE } from './_operationsDashboard.js'

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'ops-dashboard', limit: 30, windowMs: 10 * 60 * 1000 })) return

  const query = getRequestQuery(req)
  const page = clampInteger(query.page, 1, 999, 1)
  const pageSize = clampInteger(query.pageSize, 6, 24, DEFAULT_DASHBOARD_PAGE_SIZE)

  try {
    const payload = await buildOperationsDashboard({ page, pageSize })
    return sendJson(res, 200, payload)
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '운영 대시보드 조회에 실패했습니다.' })
  }
}