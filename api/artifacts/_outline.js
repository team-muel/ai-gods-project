import { callTextGeneration, parseJsonBlock } from '../_generationTools.js'
import { clampInteger, enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()

const normalizeBrief = (brief = {}) => ({
  overview: cleanText(brief?.overview || '').slice(0, 600),
  userRole: cleanText(brief?.userRole || '').slice(0, 120),
  audience: cleanText(brief?.audience || '').slice(0, 120),
  domain: cleanText(brief?.domain || '').slice(0, 60),
  domainLabel: cleanText(brief?.domainLabel || '').slice(0, 120),
  theme: cleanText(brief?.theme || '').slice(0, 40),
  textDensity: cleanText(brief?.textDensity || '').slice(0, 24),
  aiImageMode: cleanText(brief?.aiImageMode || '').slice(0, 24),
  language: cleanText(brief?.language || '').slice(0, 24),
  cardCount: clampInteger(brief?.cardCount, 4, 10, 6),
  writingNote: cleanText(brief?.writingNote || '').slice(0, 240),
  toneNote: cleanText(brief?.toneNote || '').slice(0, 240),
})

const OUTLINE_TEMPLATES = {
  docs: {
    business: ['표지', '핵심 요약', '배경과 현황', '핵심 분석', '실행 제안', '참고자료'],
    editorial: ['표지', '핵심 질문', '맥락', '주요 해석', '의미와 쟁점', '마무리'],
    academic: ['표지', '문제 제기', '배경 / 선행연구', '핵심 분석', '결론', '참고문헌'],
    pitch: ['표지', '왜 지금', '문제', '기회', '실행 포인트', '마무리'],
    'minimal-research': ['표지', '주제 개요', '배경', '핵심 발견', '시사점', '참고자료'],
  },
  ppt: {
    business: ['Cover', 'Why Now', 'Key Insight', 'Evidence', 'Recommendation', 'Next Step'],
    editorial: ['Title', 'Question', 'Context', 'Interpretation', 'Tension', 'Takeaway'],
    academic: ['Title', 'Research Question', 'Background', 'Findings', 'Discussion', 'References'],
    pitch: ['Cover', 'Problem', 'Opportunity', 'Proof', 'Why Us', 'Ask'],
    'minimal-research': ['Title', 'Topic', 'Background', 'Insight', 'Implication', 'References'],
  },
}

const buildFallbackBullets = ({ mode = 'docs', title = '', topic = '', index = 0 } = {}) => {
  const normalized = cleanText(title).toLowerCase()
  if (index === 0 || /표지|cover|title/.test(normalized)) return []
  if (/요약|summary|insight/.test(normalized)) {
    return ['주제의 핵심 메시지를 1~2문장으로 먼저 제시', '독자나 청중이 바로 이해할 수 있는 판단 포인트 정리']
  }
  if (/배경|background|context|현황/.test(normalized)) {
    return [`${topic}를 이해하기 위해 필요한 배경과 현재 상황 정리`, '문제가 왜 지금 중요한지 짧게 설명']
  }
  if (/분석|analysis|findings|evidence|proof/.test(normalized)) {
    return ['핵심 사례나 데이터, 비교 포인트를 중심으로 정리', '주장과 근거가 섞이지 않게 분리해서 제시']
  }
  if (/결론|recommend|next|takeaway|ask|실행/.test(normalized)) {
    return ['최종 판단이나 권고안을 짧고 분명하게 정리', mode === 'ppt' ? '다음 액션이나 발표 마무리 메시지 제시' : '실행 단계나 다음 제안 정리']
  }
  if (/참고|reference|sources|bibliography/.test(normalized)) {
    return ['본문에서 연결할 논문, 기사, 보고서 출처 정리']
  }
  return mode === 'ppt'
    ? ['이 슬라이드에서 전달할 핵심 메시지 정리', '보조 근거나 사례를 1~2줄로 제시']
    : ['이 섹션에서 설명할 핵심 내용을 1~2줄로 정리', '사례 또는 해석 포인트를 짧게 덧붙이기']
}

const buildFallbackItems = ({ mode = 'docs', brief = {} } = {}) => {
  const templateSet = OUTLINE_TEMPLATES[mode] || OUTLINE_TEMPLATES.docs
  const titles = (templateSet[brief.theme] || templateSet.business).slice(0, brief.cardCount)
  const topic = brief.overview
  const items = titles.map((title, index) => ({
    title: index === 0 ? topic : title,
    bullets: buildFallbackBullets({ mode, title, topic, index }),
    citationMode: /참고|reference|sources|bibliography/i.test(title) ? 'required' : index === 0 ? 'off' : 'optional',
    citationQuery: index === 0 ? '' : cleanText(`${topic} ${title} 논문 자료`),
  }))

  if (brief.aiImageMode !== 'off' && items.length >= 5) {
    const imageItem = {
      title: `[image] ${mode === 'ppt' ? '핵심 장면 또는 분위기 이미지' : '핵심 장면을 보여주는 이미지'}`,
      bullets: [],
      citationMode: 'off',
      citationQuery: '',
    }
    items.splice(Math.min(4, items.length), 0, imageItem)
  }

  return items.slice(0, brief.cardCount)
}

const normalizeCitationMode = (value = '', fallback = 'optional') => {
  const normalized = cleanText(value).toLowerCase()
  if (['off', 'optional', 'required'].includes(normalized)) return normalized
  return fallback
}

const parseOutlineItems = (value, { mode = 'docs', brief = {} } = {}) => {
  const parsed = parseJsonBlock(value, null)
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.outline)
        ? parsed.outline
        : Array.isArray(parsed?.sections)
          ? parsed.sections
          : Array.isArray(parsed?.slides)
            ? parsed.slides
            : []

  const items = list
    .map((item, index) => {
      const bullets = Array.isArray(item?.bullets)
        ? item.bullets
        : Array.isArray(item?.points)
          ? item.points
          : cleanText(item?.bullets || item?.points || item?.content || '')
            .split(/\n|\||;/)
      const cleanedBullets = (Array.isArray(bullets) ? bullets : [])
        .map((entry) => cleanText(String(entry || '').replace(/^[-*•]\s*/, '')))
        .filter(Boolean)
        .slice(0, 2)
      const imagePrompt = cleanText(item?.imagePrompt || item?.visualHint || '')
      let title = cleanText(item?.title || item?.heading || item?.name || '')
      if (!title && imagePrompt) title = `[image] ${imagePrompt}`
      if ((item?.imageSection || /^\[?image\]?/i.test(title)) && !/^\[image\]/i.test(title)) {
        title = `[image] ${title.replace(/^\[?image\]?\s*/i, '')}`
      }
      if (!title) return null

      return {
        title: title.slice(0, 160),
        bullets: cleanedBullets,
        citationMode: normalizeCitationMode(item?.citationMode, /^\[image\]/i.test(title) || index === 0 ? 'off' : 'optional'),
        citationQuery: cleanText(item?.citationQuery || item?.sourcesToFind || '').slice(0, 180),
      }
    })
    .filter(Boolean)

  return items.length > 0 ? items.slice(0, brief.cardCount) : buildFallbackItems({ mode, brief })
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'artifact-outline-draft', limit: 20, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const mode = cleanText(body?.mode || '').toLowerCase() === 'ppt' ? 'ppt' : 'docs'
  const brief = normalizeBrief(body?.brief && typeof body.brief === 'object' ? body.brief : {})

  if (!brief.overview) {
    return sendJson(res, 400, { error: '주제 개요가 필요합니다.' })
  }

  const outputLabel = mode === 'ppt' ? '발표자료' : '문서'
  let items = []
  let source = 'fallback'

  try {
    const content = await callTextGeneration({
      systemPrompt: '당신은 사용자가 바로 수정할 수 있는 문서/PPT 목차 초안을 설계하는 편집 AI입니다. 반드시 JSON만 출력하세요. 설명 문장, 코드블록, 마크다운을 붙이지 마세요.',
      userPrompt: [
        `주제: ${brief.overview}`,
        `형식: ${outputLabel}`,
        `작성자 역할: ${brief.userRole || '미지정'}`,
        `대상 독자/청중: ${brief.audience || '일반'}`,
        `도메인: ${brief.domainLabel || brief.domain || '일반'}`,
        `테마: ${brief.theme || 'business'}`,
        `언어: ${brief.language || 'ko'}`,
        `텍스트 양: ${brief.textDensity || 'balanced'}`,
        `이미지 사용: ${brief.aiImageMode || 'support'}`,
        `원하는 항목 수: ${brief.cardCount}`,
        brief.writingNote ? `추가 작성 메모: ${brief.writingNote}` : '',
        brief.toneNote ? `톤 메모: ${brief.toneNote}` : '',
        '규칙:',
        '- 첫 항목은 표지/커버로 둡니다.',
        '- 각 항목은 사용자가 바로 수정 가능한 구체적인 제목으로 작성합니다.',
        '- 일반 항목은 bullets를 0~2개만 넣고 짧게 씁니다.',
        '- 이미지가 필요한 경우 title을 [image] 로 시작하는 독립 항목으로 넣습니다.',
        '- citationMode는 off, optional, required 중 하나만 씁니다.',
        '- citationQuery는 실제로 찾을 자료 방향을 짧게 씁니다.',
        '- 응답 스키마: {"items":[{"title":"...","bullets":["..."],"citationMode":"optional","citationQuery":"..."}]}',
      ].filter(Boolean).join('\n'),
      maxTokens: 1000,
      temperature: 0.55,
      topP: 0.9,
    })

    items = parseOutlineItems(content, { mode, brief })
    if (items.length > 0) source = 'llm'
  } catch (error) {
    console.warn('[artifacts/outline] LLM outline draft 실패:', error.message || error)
  }

  if (items.length === 0) {
    items = buildFallbackItems({ mode, brief })
  }

  return sendJson(res, 200, {
    ok: true,
    source,
    items,
  })
}