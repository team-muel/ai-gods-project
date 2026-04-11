import assert from 'node:assert/strict'

import { enforceRateLimit, ensureRequestAllowed } from '../api/_requestGuard.js'

const createResponse = () => {
  const state = {
    statusCode: 200,
    headers: new Map(),
    body: '',
  }

  return {
    state,
    setHeader(name, value) {
      state.headers.set(name, value)
    },
    end(payload = '') {
      state.body = payload
    },
    get statusCode() {
      return state.statusCode
    },
    set statusCode(value) {
      state.statusCode = value
    },
  }
}

const createRequest = ({
  method = 'GET',
  host = 'ai-gods-project.vercel.app',
  origin = `https://${host}`,
  referer = '',
  forwardedFor = '203.0.113.10',
  forwardedProto = 'https',
} = {}) => ({
  method,
  headers: {
    host,
    origin,
    referer,
    'x-forwarded-for': forwardedFor,
    'x-forwarded-proto': forwardedProto,
  },
  socket: {
    remoteAddress: forwardedFor,
  },
})

const parseBody = (res) => JSON.parse(res.state.body || '{}')

const clearRateLimits = () => {
  globalThis.__aiGodsRateLimits?.clear()
}

const main = () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS

  try {
    process.env.ALLOWED_ORIGINS = 'https://ai-gods-project.vercel.app'

    {
      const req = createRequest()
      const res = createResponse()
      assert.equal(ensureRequestAllowed(req, res, { methods: ['GET'] }), true)
      assert.equal(res.state.statusCode, 200)
    }

    {
      const req = createRequest({ origin: 'https://evil.example.com' })
      const res = createResponse()
      assert.equal(ensureRequestAllowed(req, res, { methods: ['GET'] }), false)
      assert.equal(res.state.statusCode, 403)
      assert.equal(parseBody(res).error, '허용되지 않은 요청입니다.')
    }

    {
      const req = createRequest({ method: 'POST' })
      const res = createResponse()
      assert.equal(ensureRequestAllowed(req, res, { methods: ['GET'] }), false)
      assert.equal(res.state.statusCode, 405)
      assert.equal(res.state.headers.get('Allow'), 'GET')
    }

    {
      const req = createRequest({ host: 'localhost:5173', origin: '' })
      const res = createResponse()
      assert.equal(ensureRequestAllowed(req, res, { methods: ['GET'] }), true)
      assert.equal(res.state.statusCode, 200)
    }

    clearRateLimits()
    {
      const bucket = `self-test-${Date.now()}`
      const req = createRequest({ forwardedFor: '198.51.100.5' })
      const first = createResponse()
      const second = createResponse()
      const third = createResponse()

      assert.equal(enforceRateLimit(req, first, { bucket, limit: 2, windowMs: 60_000 }), true)
      assert.equal(enforceRateLimit(req, second, { bucket, limit: 2, windowMs: 60_000 }), true)
      assert.equal(enforceRateLimit(req, third, { bucket, limit: 2, windowMs: 60_000 }), false)
      assert.equal(third.state.statusCode, 429)
      assert.equal(parseBody(third).error, '요청이 너무 많습니다. 잠시 후 다시 시도하세요.')
    }

    console.log('request guard checks passed')
  } finally {
    clearRateLimits()
    if (originalAllowedOrigins == null) {
      delete process.env.ALLOWED_ORIGINS
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins
    }
  }
}

main()