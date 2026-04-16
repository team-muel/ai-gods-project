import fs from 'node:fs/promises'
import path from 'node:path'

import searchHandler from '../api/search.js'
import { searchResultsToEvidenceItems } from '../src/lib/debateEvidence.js'
import { buildDebateDossier } from '../src/lib/dossierBuilder.js'

const DEFAULT_QUERY = process.env.OPENREVIEW_SMOKE_QUERY || 'agentic coding benchmark'
const DEFAULT_NUM = Math.max(2, Math.min(6, Number.parseInt(process.env.OPENREVIEW_SMOKE_NUM || '4', 10) || 4))
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), process.env.OPENREVIEW_SMOKE_OUTPUT || 'outputs/openreview-smoke.json')

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const parseArgs = (argv = []) => {
  const options = {
    query: '',
    expectOpenReview: false,
    expectFallback: false,
    out: DEFAULT_OUTPUT_PATH,
    num: DEFAULT_NUM,
  }
  const queryParts = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--expect-openreview') {
      options.expectOpenReview = true
      continue
    }
    if (arg === '--expect-fallback') {
      options.expectFallback = true
      continue
    }
    if (arg === '--out') {
      options.out = path.resolve(process.cwd(), argv[index + 1] || DEFAULT_OUTPUT_PATH)
      index += 1
      continue
    }
    if (arg === '--num') {
      options.num = Math.max(2, Math.min(8, Number.parseInt(argv[index + 1] || '', 10) || DEFAULT_NUM))
      index += 1
      continue
    }

    if (!arg.startsWith('--')) {
      queryParts.push(arg)
    }
  }

  options.query = cleanText(queryParts.join(' ')) || DEFAULT_QUERY
  return options
}

const createRequest = ({ query, num }) => ({
  method: 'GET',
  url: `/api/search?q=${encodeURIComponent(query)}&num=${encodeURIComponent(num)}`,
  query: { q: query, num: String(num) },
  headers: {
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    referer: 'http://localhost:3000/',
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-proto': 'http',
  },
  socket: {
    remoteAddress: '127.0.0.1',
  },
})

const createResponse = () => {
  const state = {
    statusCode: 200,
    headers: new Map(),
    body: '',
  }

  return {
    state,
    setHeader(name, value) {
      state.headers.set(String(name), value)
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

const parseJsonBody = (value = '') => {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

const getEnvSummary = () => ({
  enabled: cleanText(process.env.OPENREVIEW_ENABLED || ''),
  hasIdPassword: Boolean(cleanText(process.env.OPENREVIEW_ID || '') && cleanText(process.env.OPENREVIEW_PASSWORD || '')),
  loginIdLooksLikeEmail: !cleanText(process.env.OPENREVIEW_ID || '') || cleanText(process.env.OPENREVIEW_ID || '').includes('@'),
  hasAccessToken: Boolean(cleanText(process.env.OPENREVIEW_ACCESS_TOKEN || '')),
  hasRefreshToken: Boolean(cleanText(process.env.OPENREVIEW_REFRESH_TOKEN || '')),
  baseUrl: cleanText(process.env.OPENREVIEW_API_BASE_URL || 'https://api2.openreview.net'),
})

const getResultProviders = (item = {}) => {
  const providers = Array.isArray(item?.metadata?.sourceProviders) ? item.metadata.sourceProviders : []
  return providers.length > 0 ? providers : [cleanText(item?.provider || '')].filter(Boolean)
}

const summarizeAcademicResult = (item = {}) => ({
  title: cleanText(item?.title || ''),
  provider: cleanText(item?.provider || ''),
  sourceProviders: getResultProviders(item),
  scholarlyScore: Number(item?.metadata?.scholarlyScore || item?.metadata?.rankingSignals?.total || 0),
  citationCount: Number(item?.metadata?.citationCount || 0),
  reviewSignals: item?.metadata?.reviewSignals && typeof item.metadata.reviewSignals === 'object'
    ? {
        reviewCount: Number(item.metadata.reviewSignals.reviewCount || 0),
        metaReviewCount: Number(item.metadata.reviewSignals.metaReviewCount || 0),
        decisionLabel: cleanText(item.metadata.reviewSignals.decisionLabel || ''),
        decisionStatus: cleanText(item.metadata.reviewSignals.decisionStatus || ''),
        averageRating: Number(item.metadata.reviewSignals.averageRating || 0) || null,
      }
    : null,
  link: cleanText(item?.link || ''),
})

const summarizeEvidence = (item = {}) => ({
  label: cleanText(item?.label || ''),
  sourceKind: cleanText(item?.sourceKind || ''),
  provider: cleanText(item?.provider || ''),
  citationScore: Number(item?.citationScore || 0),
  scholarlyScore: Number(item?.metadata?.scholarlyScore || item?.metadata?.rankingSignals?.total || 0),
  priorityScore: Number(item?.artifactPriorityScore || 0),
  reviewSignals: item?.metadata?.reviewSignals && typeof item.metadata.reviewSignals === 'object'
    ? {
        reviewCount: Number(item.metadata.reviewSignals.reviewCount || 0),
        decisionLabel: cleanText(item.metadata.reviewSignals.decisionLabel || ''),
        decisionStatus: cleanText(item.metadata.reviewSignals.decisionStatus || ''),
      }
    : null,
})

const buildSmokeDossier = ({ query, searchData }) => {
  const evidence = searchResultsToEvidenceItems(searchData, { requestedBy: 'openreview-smoke' })
  return buildDebateDossier({
    debateId: 'openreview-smoke',
    topic: query,
    totalRounds: 1,
    consensus: `${query} 관련 최신 학술 근거를 우선 사용하고, review 여부와 decision 상태를 구분해 설명한다.`,
    messages: [
      {
        round: 1,
        godId: 'cto',
        god: 'CTO',
        content: `${query} 에서는 최신 benchmark, peer review, acceptance signal 이 있는 근거를 우선 검토해야 합니다.`,
      },
    ],
    evidence,
    source: 'openreview_smoke_script',
  })
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const req = createRequest(options)
  const res = createResponse()
  const warnings = []
  const originalWarn = console.warn

  console.warn = (...args) => {
    warnings.push(args.map((value) => cleanText(typeof value === 'string' ? value : JSON.stringify(value))).filter(Boolean).join(' '))
    originalWarn(...args)
  }

  try {
    await searchHandler(req, res)
  } finally {
    console.warn = originalWarn
  }

  const payload = parseJsonBody(res.state.body)
  if (res.state.statusCode !== 200) {
    throw new Error(payload?.error || `search handler failed with status ${res.state.statusCode}`)
  }

  const academicResults = Array.isArray(payload?.academicResults) ? payload.academicResults : []
  const openReviewResults = academicResults.filter((item) => getResultProviders(item).includes('openreview') || cleanText(item?.provider || '') === 'openreview')
  const dossier = buildSmokeDossier({ query: options.query, searchData: payload })
  const envSummary = getEnvSummary()

  if (options.expectOpenReview && openReviewResults.length === 0) {
    if (envSummary.hasIdPassword && !envSummary.loginIdLooksLikeEmail && !envSummary.hasAccessToken) {
      throw new Error('OpenReview 결과를 기대했지만 OPENREVIEW_ID 에 @ 가 없습니다. ID/password 로그인은 실제 로그인 이메일을 사용하거나, 토큰 방식으로 전환해야 합니다.')
    }
    throw new Error('OpenReview 결과를 기대했지만 academicResults 에 openreview provider 가 없습니다.')
  }

  if (options.expectFallback) {
    if (academicResults.length === 0) {
      throw new Error('폴백 검증 실패: academicResults 가 비어 있습니다.')
    }
    if (openReviewResults.length > 0) {
      throw new Error('폴백 검증 실패: openreview 결과가 없어야 하는데 포함되어 있습니다.')
    }
  }

  const summary = {
    query: options.query,
    statusCode: res.state.statusCode,
    env: envSummary,
    warnings,
    resultCounts: {
      total: Array.isArray(payload?.results) ? payload.results.length : 0,
      academic: academicResults.length,
      web: Array.isArray(payload?.webResults) ? payload.webResults.length : 0,
      openreview: openReviewResults.length,
    },
    academicSourceSummary: payload?.academicSourceSummary || {},
    topAcademicResults: academicResults.slice(0, 5).map((item) => summarizeAcademicResult(item)),
    dossierProjection: {
      status: cleanText(dossier?.status || ''),
      readinessScore: Number(dossier?.readinessScore || 0),
      evidenceCount: Number(dossier?.metrics?.evidenceCount || 0),
      averageCitationScore: Number(dossier?.citationSummary?.averageCitationScore || 0),
      averageScholarlyScore: Number(dossier?.scholarlySummary?.averageScholarlyScore || 0),
      benchmarkBackedEvidenceCount: Number(dossier?.metrics?.benchmarkBackedEvidenceCount || 0),
      communityBackedEvidenceCount: Number(dossier?.metrics?.communityBackedEvidenceCount || 0),
      openreviewEvidenceCount: (Array.isArray(dossier?.evidence) ? dossier.evidence : []).filter((item) => getResultProviders(item).includes('openreview') || cleanText(item?.provider || '') === 'openreview').length,
      topEvidence: (Array.isArray(dossier?.evidence) ? dossier.evidence : []).slice(0, 5).map((item) => summarizeEvidence(item)),
      evidenceGaps: Array.isArray(dossier?.evidenceGaps) ? dossier.evidenceGaps.slice(0, 3) : [],
    },
  }

  await fs.mkdir(path.dirname(options.out), { recursive: true })
  await fs.writeFile(options.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log(`query: ${summary.query}`)
  console.log(`academic results: ${summary.resultCounts.academic}, web results: ${summary.resultCounts.web}, openreview results: ${summary.resultCounts.openreview}`)
  console.log(`academic sources: ${Object.keys(summary.academicSourceSummary || {}).join(', ') || 'none'}`)
  console.log(`dossier evidence: ${summary.dossierProjection.evidenceCount}, avg citation: ${summary.dossierProjection.averageCitationScore}, avg scholar: ${summary.dossierProjection.averageScholarlyScore}`)
  console.log(`output: ${options.out}`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})