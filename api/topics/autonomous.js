import { callTextGeneration, parseJsonBlock } from '../_generationTools.js'
import { clampInteger, enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

const isMissingRelationError = (error) => {
  const message = String(error?.message || '')
  return message.includes('Could not find the table') || message.includes('does not exist')
}

const isCronRequest = (req) => Boolean(req.headers['x-vercel-cron'])

const parseRequestPayload = (req) => {
  if (req.method === 'POST') return parseJsonBody(req)

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
  const url = new URL(req.url || '/api/topics/autonomous', `https://${host}`)
  return Object.fromEntries(url.searchParams.entries())
}

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()
const DEFAULT_RECOMMENDED_OUTPUT = 'debate -> dossier -> report -> ppt'

const parseTopicArray = (value) => {
  const parsed = parseJsonBlock(value, [])
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.topics)
      ? parsed.topics
      : []

  return list
    .map((item, index) => ({
      title: cleanText(item?.title || item?.topic || `자율 주제 ${index + 1}`).slice(0, 140),
      rationale: cleanText(item?.rationale || item?.reason || '').slice(0, 420),
      focusArea: cleanText(item?.focusArea || item?.focus || '').slice(0, 120),
      whyNow: cleanText(item?.whyNow || item?.timing || '').slice(0, 200),
      noveltyScore: clampInteger(item?.noveltyScore, 0, 100, 60),
      urgencyScore: clampInteger(item?.urgencyScore, 0, 100, 55),
      evidenceHint: cleanText(item?.evidenceHint || item?.evidence || '').slice(0, 200),
      recommendedOutput: cleanText(item?.recommendedOutput || item?.format || DEFAULT_RECOMMENDED_OUTPUT).slice(0, 120),
    }))
    .filter((item) => item.title)
}

const buildFallbackCandidates = ({ focus = '', count = 5, recentTopics = [] } = {}) => {
  const recentHead = recentTopics.slice(0, 3).join(' / ') || '최근 토론 없음'
  const seed = focus || 'AI 전략'

  return Array.from({ length: count }).map((_, index) => ({
    title: `${seed} 관점의 신규 주제 ${index + 1}`,
    rationale: `최근 토론 흐름(${recentHead})과 겹치지 않으면서도 다음 dossier, 보고서, PPT로 전개하기 좋은 주제를 우선 제안합니다.`,
    focusArea: focus || '전략/운영',
    whyNow: '시장 변화와 실행 우선순위를 함께 다루기 쉬운 시점입니다.',
    noveltyScore: clampInteger(72 - index * 5, 0, 100, 60),
    urgencyScore: clampInteger(68 - index * 4, 0, 100, 55),
    evidenceHint: '규제 문서, 기업 공시, 시장 리포트, 오픈소스 릴리스 노트를 우선 확인',
    recommendedOutput: DEFAULT_RECOMMENDED_OUTPUT,
  }))
}

const persistCandidatesBestEffort = async (candidates, focus) => {
  if (!candidates.length) return 0

  try {
    const supabase = getSupabaseServerClient()
    const rows = candidates.map((item) => ({
      title: item.title,
      rationale: item.rationale,
      focus_area: item.focusArea,
      why_now: item.whyNow,
      novelty_score: item.noveltyScore,
      urgency_score: item.urgencyScore,
      evidence_hint: item.evidenceHint,
      recommended_output: item.recommendedOutput,
      source: 'autonomous_topic_api',
      metadata: {
        focus,
      },
    }))

    const { error } = await supabase.from('autonomous_topic_candidates').insert(rows)
    if (error) {
      if (!isMissingRelationError(error)) {
        console.warn('[topics/autonomous] candidate 저장 경고:', error.message)
      }
      return 0
    }

    return rows.length
  } catch (error) {
    if (!String(error?.message || '').includes('Supabase 서버 환경변수가 설정되지 않았습니다.')) {
      console.warn('[topics/autonomous] candidate 저장 스킵:', error.message || error)
    }
    return 0
  }
}

const listRecentTopics = async () => {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('debates')
      .select('topic')
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) throw error
    return (data || []).map((row) => cleanText(row?.topic)).filter(Boolean)
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  const cronRequest = isCronRequest(req)
  if (!ensureRequestAllowed(req, res, { methods: ['GET', 'POST'], requireSameOrigin: !cronRequest })) return
  if (!enforceRateLimit(req, res, { bucket: 'autonomous-topic-candidates', limit: cronRequest ? 8 : 20, windowMs: 10 * 60 * 1000 })) return

  let payload
  try {
    payload = parseRequestPayload(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const focus = cleanText(payload?.focus || process.env.AUTONOMOUS_TOPIC_FOCUS || '')
  const count = clampInteger(payload?.count, 1, 8, 5)
  const recentTopics = await listRecentTopics()
  let candidates = []
  let source = 'fallback'

  try {
    const generated = await callTextGeneration({
      systemPrompt: '당신은 완전 자율 리서치 운영자입니다. 최근 흐름과 미개척 영역을 바탕으로 다음 토론 주제를 JSON 배열로만 제안하세요. 설명 문장이나 코드블록 외 텍스트를 붙이지 마세요.',
      userPrompt: [
        `포커스: ${focus || '일반 AI 전략'}`,
        `최근 토론 주제: ${recentTopics.length > 0 ? recentTopics.join(' | ') : '없음'}`,
        `반드시 ${count}개의 항목을 JSON 배열로 출력하세요.`,
        `스키마: [{"title":"...","rationale":"...","focusArea":"...","whyNow":"...","noveltyScore":0-100,"urgencyScore":0-100,"evidenceHint":"...","recommendedOutput":"${DEFAULT_RECOMMENDED_OUTPUT}"}]`,
        '최근 토론과 지나치게 중복되지 않게 하고, 근거 수집이 가능한 주제를 우선하세요.',
      ].join('\n'),
      maxTokens: 800,
      temperature: 0.45,
      topP: 0.9,
    })

    candidates = parseTopicArray(generated).slice(0, count)
    if (candidates.length > 0) source = 'llm'
  } catch (error) {
    console.warn('[topics/autonomous] LLM 생성 실패:', error.message || error)
  }

  if (candidates.length === 0) {
    candidates = buildFallbackCandidates({ focus, count, recentTopics })
  }

  const persistedCount = await persistCandidatesBestEffort(candidates, focus)

  return sendJson(res, 200, {
    ok: true,
    source,
    persistedCount,
    recentTopics,
    candidates,
  })
}