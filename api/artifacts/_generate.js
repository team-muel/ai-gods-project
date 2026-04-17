import { callTextGeneration, parseJsonBlock } from '../_generationTools.js'
import { clampInteger, enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { buildDebateArtifacts, buildSlideCitationLedger, buildSlideMarkdown, enforceSlideCitationPolicy, normalizeSlideOutline } from '../../src/lib/artifactBuilder.js'
import { buildDebateDossier } from '../../src/lib/dossierBuilder.js'

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const normalizeBrief = (brief = {}) => ({
  overview: cleanText(brief?.overview || '').slice(0, 600),
  userRole: cleanText(brief?.userRole || '').slice(0, 120),
  domain: cleanText(brief?.domain || '').slice(0, 40),
  domainLabel: cleanText(brief?.domainLabel || '').slice(0, 80),
  visualTheme: cleanText(brief?.visualTheme || '').slice(0, 40),
  visualPreset: cleanText(brief?.visualPreset || '').slice(0, 40),
  textDensity: cleanText(brief?.textDensity || '').slice(0, 24),
  aiImageMode: cleanText(brief?.aiImageMode || '').slice(0, 24),
  imageSource: cleanText(brief?.imageSource || '').slice(0, 24),
  imageStylePreset: cleanText(brief?.imageStylePreset || '').slice(0, 40),
  cardCount: clampInteger(brief?.cardCount, 4, 10, 6),
  layoutPreset: cleanText(brief?.layoutPreset || '').slice(0, 24),
  language: cleanText(brief?.language || '').slice(0, 24),
  writingNote: cleanText(brief?.writingNote || '').slice(0, 240),
  toneNote: cleanText(brief?.toneNote || '').slice(0, 240),
  debateUsage: cleanText(brief?.debateUsage || '').slice(0, 24),
  mode: cleanText(brief?.mode || '').slice(0, 24),
  outlineTitles: (Array.isArray(brief?.outlineTitles) ? brief.outlineTitles : [])
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 8),
})

const buildBriefPreferenceLines = (brief = {}, { artifactType = 'report' } = {}) => {
  const domainLabel = brief?.domainLabel || brief?.domain || ''
  const lines = [
    domainLabel ? `도메인: ${domainLabel}` : null,
    brief?.userRole ? `작성자 직업/역할: ${brief.userRole}` : null,
    brief?.visualTheme ? `시각 테마: ${brief.visualTheme}` : null,
    brief?.visualPreset ? `테마 프리셋: ${brief.visualPreset}` : null,
    brief?.textDensity ? `텍스트 양: ${brief.textDensity}` : null,
    brief?.aiImageMode ? `AI 이미지: ${brief.aiImageMode}` : null,
    brief?.imageSource ? `이미지 출처: ${brief.imageSource}` : null,
    brief?.imageStylePreset ? `이미지 스타일: ${brief.imageStylePreset}` : null,
    brief?.cardCount ? `카드 수: ${brief.cardCount}` : null,
    brief?.layoutPreset ? `레이아웃 모드: ${brief.layoutPreset}` : null,
    brief?.language ? `언어: ${brief.language}` : null,
    brief?.writingNote ? `추가 작성 메모: ${brief.writingNote}` : null,
    brief?.toneNote ? `톤 메모: ${brief.toneNote}` : null,
    brief?.debateUsage ? `토론 인사이트 활용: ${brief.debateUsage}` : null,
  ]

  if (brief?.outlineTitles?.length) {
    lines.push(`${artifactType === 'slides' ? '슬라이드' : '문서'} 윤곽선: ${brief.outlineTitles.join(' -> ')}`)
  }

  return lines.filter(Boolean)
}

const buildBriefMessages = ({ topic = '', instructions = '', audience = '', brief = {}, mode = 'docs' } = {}) => {
  const outputLabel = mode === 'ppt' ? '발표자료' : '문서'
  const outlineLabel = brief?.outlineTitles?.length > 0
    ? brief.outlineTitles.join(' / ')
    : outputLabel === '발표자료'
      ? 'Cover / Core insight / Evidence / Next step'
      : '표지 / 배경 / 분석 / 결론'

  return [
    {
      godId: 'brief-orchestrator',
      god: 'Brief Orchestrator',
      round: 1,
      content: `목표 ${outputLabel}: ${topic}. 대상 독자/청중: ${audience || '일반 사용자'}. 작성자 역할: ${brief?.userRole || '미지정'}. 도메인: ${brief?.domainLabel || brief?.domain || '일반'}.`,
    },
    {
      godId: 'structure-designer',
      god: 'Structure Designer',
      round: 1,
      content: `권장 윤곽선: ${outlineLabel}. ${outputLabel}은 토론 요약이 아니라 바로 제출/발표 가능한 구조로 설계해야 합니다.`,
    },
    {
      godId: 'visual-director',
      god: 'Visual Director',
      round: 1,
      content: `시각 테마 ${brief?.visualTheme || 'business'}, 프리셋 ${brief?.visualPreset || 'default'}, 텍스트 양 ${brief?.textDensity || 'balanced'}, AI 이미지 ${brief?.aiImageMode || 'support'}, 이미지 출처 ${brief?.imageSource || 'ai'}, 이미지 스타일 ${brief?.imageStylePreset || 'default'}. 추가 요청: ${instructions || '없음'}.`,
    },
  ]
}

const buildBriefConsensus = ({ topic = '', instructions = '', audience = '', brief = {}, mode = 'docs' } = {}) => {
  const outputLabel = mode === 'ppt' ? '발표자료' : '문서'
  const densityText = brief?.textDensity === 'dense'
    ? '배경과 설명을 충분히 포함합니다.'
    : brief?.textDensity === 'light'
      ? '메시지를 짧고 선명하게 유지합니다.'
      : '설명과 압축의 균형을 유지합니다.'
  const imageText = brief?.aiImageMode === 'off'
    ? '텍스트와 데이터 중심 구조를 유지합니다.'
    : brief?.aiImageMode === 'hero'
      ? '시각 컨셉을 장표/섹션 분위기에 적극 반영합니다.'
      : '필요한 visual cue만 보조적으로 사용합니다.'

  return [
    '📊 핵심 합의점 3가지',
    `1. ${topic}를 ${audience || '일반 사용자'} 대상 ${outputLabel}로 구조화합니다.`,
    brief?.userRole ? `1-1. 작성자 역할은 ${brief.userRole}로 간주하고 표현 톤과 설명 깊이를 맞춥니다.` : null,
    `2. ${brief?.outlineTitles?.length > 0 ? `구성은 ${brief.outlineTitles.join(', ')} 순을 우선합니다.` : '브리프 중심으로 배경, 핵심 논점, 결론 흐름을 분명히 나눕니다.'}`,
    `3. ${densityText} ${imageText}`,
    brief?.layoutPreset ? `4. 레이아웃 모드는 ${brief.layoutPreset}을 우선하고, 언어는 ${brief.language || 'ko'} 기준으로 맞춥니다.` : null,
    '',
    '⚡ 주요 이견',
    brief?.debateUsage === 'off'
      ? '- 토론 인사이트는 기본 입력으로 사용하지 않고 브리프 중심으로 설계합니다.'
      : '- 필요 시 토론 인사이트를 보조 재료로 참조하되 결과물은 독립적인 장르로 구성합니다.',
    '',
    '✅ 권고사항',
    `- 단기: ${instructions || topic}`,
    `- 중기: ${brief?.visualTheme ? `${brief.visualTheme} 테마에 맞는 레이아웃과 메시지 톤을 고정합니다.` : '형식에 맞는 레이아웃과 메시지 톤을 고정합니다.'}`,
    `- 장기: export 가능한 ${outputLabel} 완성본으로 다듬습니다.`,
  ].filter(Boolean).join('\n')
}

const normalizeCitationControl = (value = '') => {
  const normalized = cleanText(value).toLowerCase()
  return normalized === 'auto' ? '' : normalized.slice(0, 32)
}

const normalizeStylePreset = (value = '') => cleanText(value).toLowerCase().replace(/[^a-z-]/g, '').slice(0, 40)

const buildReportProfilePrompt = (reportProfile = '') => {
  switch (cleanText(reportProfile).toLowerCase()) {
    case 'university-paper':
      return '작성 프로필: 대학 과제형 보고서. bullet 남발을 피하고, 각 섹션을 완전한 문단 2~3개로 전개하세요. 문제 제기 -> 배경/프레임 -> 분석 -> 결론 흐름을 분명히 유지하세요.'
    case 'evidence-analysis':
      return '작성 프로필: evidence analysis memo. 섹션마다 핵심 판단 한 문장과 그 판단을 지지하는 근거 해석을 붙이세요. 단순 최종 결론 요약으로 끝내지 마세요.'
    case 'executive-brief':
      return '작성 프로필: executive brief. 제목과 소제목은 결론형으로 쓰고, 경영진이 바로 의사결정할 수 있게 why now, decision drivers, recommended actions를 분명히 드러내세요.'
    case 'concept-note':
      return '작성 프로필: concept note. 설득용 narrative를 유지하되, 배경-메시지 구조-활용 시나리오가 읽히게 구성하세요.'
    default:
      return '작성 프로필: structured strategic report. 섹션별 역할을 분명히 나누고, 최종 합의안의 단순 반복 대신 분석과 해석을 전개하세요.'
  }
}

const buildSlideProfilePrompt = (slideProfile = '') => {
  switch (cleanText(slideProfile).toLowerCase()) {
    case 'investor-deck':
      return 'deck 프로필: investor deck. 슬라이드 제목은 주제어가 아니라 verdict/headline으로 쓰고, 각 장은 투자자 관점의 why now, opportunity, operating model, ROI/KPI, decision ask 흐름을 가져가세요.'
    case 'evidence-deck':
      return 'deck 프로필: evidence deck. 각 슬라이드는 질문 -> 근거 -> 시사점 구조를 가져가고, strongest signal과 evidence gap을 분명히 보여주세요.'
    case 'research-presentation':
      return 'deck 프로필: research presentation. 연구 질문, 배경/방법, findings, discussion, references 흐름을 유지하고 세미나 발표처럼 차분하게 구성하세요.'
    case 'pitch-deck':
      return 'deck 프로필: pitch deck. 한 장 한 메시지 원칙을 지키고, 문제-베팅-왜 이기는가-다음 단계로 짧고 강하게 전개하세요.'
    default:
      return 'deck 프로필: executive deck. 각 슬라이드는 한 문장 takeaway를 제목으로 쓰고, 2~3개 support bullet만 남겨 메모가 아니라 발표자료처럼 보이게 하세요.'
  }
}

const getScholarlyScore = (metadata = {}) => {
  const directScore = Number(metadata?.scholarlyScore)
  if (Number.isFinite(directScore)) return Math.round(directScore)

  const rankingScore = Number(metadata?.rankingSignals?.total)
  return Number.isFinite(rankingScore) ? Math.round(rankingScore) : 0
}

const formatCommunitySignals = (communitySignals = {}) => {
  const upvotes = Number.isFinite(Number(communitySignals.upvotes)) ? Number(communitySignals.upvotes) : 0
  const collectionsCount = Number.isFinite(Number(communitySignals.collectionsCount)) ? Number(communitySignals.collectionsCount) : 0
  const citationSurface = [communitySignals.modelsCiting, communitySignals.datasetsCiting, communitySignals.spacesCiting]
    .map((value) => Number.isFinite(Number(value)) ? Number(value) : 0)
    .reduce((sum, value) => sum + value, 0)

  const bits = []
  if (upvotes > 0) bits.push(`HF upvotes ${upvotes}`)
  if (collectionsCount > 0) bits.push(`HF collections ${collectionsCount}`)
  if (citationSurface > 0) bits.push(`community citing ${citationSurface}`)
  if (cleanText(communitySignals.githubUrl || '')) bits.push('GitHub linked')
  return bits.join(', ')
}

const sanitizeMessages = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message && message.godId && cleanText(message.content))
  .slice(-80)
  .map((message) => ({
    godId: cleanText(message.godId).slice(0, 64),
    god: cleanText(message.god || message.godId).slice(0, 80),
    round: Math.max(1, Number(message.round) || 1),
    content: String(message.content).slice(0, 4000),
  }))

const formatEvidenceForPrompt = (evidence = []) => (Array.isArray(evidence) ? evidence : [])
  .slice(0, 8)
  .map((item, index) => {
    const metadata = item?.metadata || {}
    const authors = Array.isArray(metadata.authors) ? metadata.authors.slice(0, 3).join(', ') : ''
    const year = cleanText(metadata.year || '')
    const venue = cleanText(metadata.venue || metadata.sourceLabel || item?.provider || '')
    const doi = cleanText(metadata.doi || '')
    const scholarlyScore = getScholarlyScore(metadata)
    const sourceProviders = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders.filter(Boolean).slice(0, 3) : []
    const benchmarkTerms = Array.isArray(metadata?.benchmarkSignals?.matchedTerms) ? metadata.benchmarkSignals.matchedTerms.filter(Boolean).slice(0, 2) : []
    const reviewSignals = metadata.reviewSignals && typeof metadata.reviewSignals === 'object' ? metadata.reviewSignals : {}
    const communityLabel = formatCommunitySignals(metadata.communitySignals && typeof metadata.communitySignals === 'object' ? metadata.communitySignals : {})
    const priorityReasons = Array.isArray(item.artifactPriorityReasons) ? item.artifactPriorityReasons.slice(0, 3).join(', ') : ''
    const excerpt = cleanText(item?.excerpt || '').slice(0, 220)
    const reviewLabel = reviewSignals.decisionLabel
      ? reviewSignals.decisionLabel
      : Number(reviewSignals.reviewCount || 0) > 0
        ? `reviews ${reviewSignals.reviewCount}${Number.isFinite(Number(reviewSignals.averageRating)) ? ` / rating ${Number(reviewSignals.averageRating).toFixed(1)}` : ''}`
        : '없음'
    return `${index + 1}. ${item.label} | citation=${item.citationScore || 0} | scholar=${scholarlyScore} | priority=${item.artifactPriorityScore || 0} | ${authors || 'author n/a'} | ${year || 'year n/a'} | ${venue || 'venue n/a'} | DOI=${doi || '없음'} | providers=${sourceProviders.join('+') || 'n/a'} | benchmark=${benchmarkTerms.join(', ') || '없음'} | openreview=${reviewLabel} | community=${communityLabel || '없음'} | excerpt=${excerpt || '없음'} | reason=${priorityReasons || 'n/a'} | ${item.url || 'url 없음'}`
  })
  .join('\n')

const formatScholarlySummaryForPrompt = (dossier = {}) => {
  const scholarlySummary = dossier?.scholarlySummary && typeof dossier.scholarlySummary === 'object' ? dossier.scholarlySummary : {}
  if (!scholarlySummary.academicEvidenceCount) return '학술 신호 요약 없음'

  return [
    `학술 근거 ${scholarlySummary.academicEvidenceCount}개`,
    scholarlySummary.averageScholarlyScore ? `average scholar ${scholarlySummary.averageScholarlyScore}/100` : null,
    scholarlySummary.strongScholarlyCount ? `강한 근거 ${scholarlySummary.strongScholarlyCount}개` : null,
    scholarlySummary.benchmarkBackedCount ? `benchmark-backed ${scholarlySummary.benchmarkBackedCount}개` : null,
    scholarlySummary.communityBackedCount ? `community-backed ${scholarlySummary.communityBackedCount}개` : null,
    scholarlySummary.recommendedAction ? `권고: ${scholarlySummary.recommendedAction}` : null,
  ].filter(Boolean).join(' | ')
}

const buildWorkingDossier = ({ body, topic, messages, consensus }) => {
  const providedDossier = body?.dossier && typeof body.dossier === 'object' ? body.dossier : null
  const evidence = Array.isArray(providedDossier?.evidence)
    ? providedDossier.evidence
    : []

  return buildDebateDossier({
    debateId: providedDossier?.debateId || null,
    topic: topic || cleanText(providedDossier?.topic || ''),
    totalRounds: Number(providedDossier?.totalRounds || Math.max(1, ...messages.map((message) => Number(message.round || 1)), 1)),
    consensus: consensus || cleanText(providedDossier?.consensusSnapshot || ''),
    messages,
    evidence,
    isYoutube: Boolean(providedDossier?.isYoutube),
    source: 'artifact_generate_api',
  })
}

const mergeRefinedSlidesWithBase = (baseSlides = [], refinedSlides = []) => normalizeSlideOutline(
  (Array.isArray(refinedSlides) ? refinedSlides : []).map((slide, index) => {
    const baseSlide = Array.isArray(baseSlides) ? baseSlides[index] || {} : {}
    return {
      ...baseSlide,
      ...slide,
      highlights: Array.isArray(slide?.highlights) && slide.highlights.length > 0 ? slide.highlights : baseSlide.highlights || [],
      metrics: Array.isArray(slide?.metrics) && slide.metrics.length > 0 ? slide.metrics : baseSlide.metrics || [],
      citations: Array.isArray(slide?.citations) && slide.citations.length > 0 ? slide.citations : baseSlide.citations || [],
      citationRefs: Array.isArray(slide?.citationRefs) && slide.citationRefs.length > 0 ? slide.citationRefs : baseSlide.citationRefs || [],
      quote: slide?.quote || baseSlide.quote || '',
      footer: slide?.footer || baseSlide.footer || '',
      accent: slide?.accent || baseSlide.accent || '',
      layout: slide?.layout || baseSlide.layout || '',
      kicker: slide?.kicker || baseSlide.kicker || '',
    }
  })
)

const buildCitationPolicyPrompt = (citationPolicy = {}, { artifactType = 'report' } = {}) => {
  if (!citationPolicy?.mode) return ''

  if (citationPolicy.mode === 'none' || citationPolicy.visibility === 'hidden') {
    return artifactType === 'slides'
      ? '인용 정책: citations와 참고문헌을 새로 추가하지 말고, 슬라이드 본문은 전달력 중심으로만 다듬으세요.'
      : '인용 정책: 본문과 끝부분 모두에 새로운 citation/참고문헌을 추가하지 말고, 근거는 일반 서술로만 남기세요.'
  }

  if (citationPolicy.visibility === 'bibliography-only') {
    return artifactType === 'slides'
      ? '인용 정책: 개별 slide 하단 citations를 늘리지 말고, 참고자료는 마지막 slide 또는 references slide에만 모으세요.'
      : '인용 정책: 본문 섹션 안에 ### Citations 블록을 만들지 말고, 참고문헌 섹션에만 출처를 모으세요.'
  }

  return artifactType === 'slides'
    ? '인용 정책: 인용이 필요한 slide에만 citations를 유지하고, 다른 slide로 분산하지 마세요.'
    : '인용 정책: 인용이 필요한 섹션에만 citation을 유지하고, Citation Ledger나 참고문헌은 기존 구조를 따르세요.'
}

const stripReportSectionByHeading = (markdown = '', headingPattern = /.^/) => {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n')
  const output = []
  let skipping = false

  lines.forEach((line) => {
    const trimmed = line.trim()
    const isHeading = /^##\s+/.test(trimmed)

    if (isHeading) {
      if (headingPattern.test(trimmed)) {
        skipping = true
        return
      }
      skipping = false
    }

    if (!skipping) output.push(line)
  })

  return output.join('\n').trim()
}

const stripReportCitationSubsections = (markdown = '') => {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n')
  const output = []
  let skipping = false

  lines.forEach((line) => {
    const trimmed = line.trim()
    const isMajorHeading = /^##\s+/.test(trimmed)
    const isCitationHeading = /^###\s+Citations$/i.test(trimmed)
    const isOtherSubheading = /^###\s+/.test(trimmed) && !isCitationHeading

    if (isCitationHeading) {
      skipping = true
      return
    }

    if (skipping && (isMajorHeading || isOtherSubheading)) {
      skipping = false
    }

    if (!skipping) output.push(line)
  })

  return output.join('\n').trim()
}

const enforceReportMarkdownCitationPolicy = (markdown = '', citationPolicy = {}) => {
  let nextMarkdown = String(markdown || '').trim()
  if (!nextMarkdown) return nextMarkdown

  if (!citationPolicy?.includeLedger) {
    nextMarkdown = stripReportSectionByHeading(nextMarkdown, /^##\s+Citation Ledger$/i)
  }

  if (citationPolicy.visibility !== 'inline') {
    nextMarkdown = stripReportCitationSubsections(nextMarkdown)
  }

  if (!citationPolicy.includeReferences) {
    nextMarkdown = stripReportSectionByHeading(nextMarkdown, /^##\s+(References|Bibliography|참고문헌|참고자료)$/i)
  }

  return nextMarkdown || markdown
}

const refineReportMarkdown = async ({ dossier, instructions, audience, baseMarkdown, citationPolicy, reportProfile }) => {
  try {
    const content = await callTextGeneration({
      systemPrompt: '당신은 증거 기반 전략 보고서 작성자입니다. 반드시 한국어 markdown만 출력하세요. 문체는 paper-like executive memo 형식으로 유지하되, 기존 초안의 섹션 제목과 섹션 순서를 최대한 유지하세요. citation이 강하고 scholar 점수가 높은 학술 근거를 먼저 배치하세요. benchmark/leaderboard, peer-reviewed, 다중 인덱싱, top venue 신호는 강한 보강 근거로 취급하고, Hugging Face upvotes/collections 같은 커뮤니티 신호는 보조 지표로만 사용하세요. 약한 근거는 추가 검증 필요라고 명시하세요. 직접 인용은 제공된 excerpt 범위 안에서만 허용하고, 인용이나 근거 문장 근처에는 원문 링크를 함께 남기세요. URL 없는 문장을 인용문처럼 쓰지 마세요.',
      userPrompt: [
        `주제: ${dossier.topic}`,
        audience ? `독자: ${audience}` : null,
        instructions ? `사용자 요청: ${instructions}` : null,
        ...buildBriefPreferenceLines(dossier?.brief || {}, { artifactType: 'report' }),
        buildReportProfilePrompt(reportProfile),
        `Executive summary: ${dossier.executiveSummary}`,
        `핵심 주장: ${(dossier.claims || []).map((claim) => claim.statement).join(' | ') || '없음'}`,
        `근거 목록:\n${formatEvidenceForPrompt(dossier.evidence) || '없음'}`,
        `Citation 평균 점수: ${dossier.citationSummary?.averageCitationScore || 0}/100`,
        `Scholarly 신호 요약: ${formatScholarlySummaryForPrompt(dossier)}`,
        dossier.evidenceGaps?.length ? `남은 공백: ${dossier.evidenceGaps.slice(0, 3).join(' | ')}` : null,
        '인용 규칙: 제공된 excerpt 안의 표현만 quote처럼 사용할 수 있으며, 각 근거에는 원문 링크를 보존하세요.',
        buildCitationPolicyPrompt(citationPolicy, { artifactType: 'report' }),
        '섹션 규칙: 기존 초안의 ## 섹션 제목과 순서를 유지하고, 각 섹션에 배정된 근거는 그 섹션 안에만 남겨두세요.',
        '기존 초안:',
        baseMarkdown,
        '위 정보를 바탕으로 더 읽기 좋은 최종 보고서 markdown을 다시 작성하세요. 단순히 최종 결론을 길게 풀어쓰지 말고, 섹션별 역할이 보이도록 실제 과제물/전략문서처럼 다시 구성하세요.',
      ].filter(Boolean).join('\n\n'),
      maxTokens: 1300,
      temperature: 0.28,
      topP: 0.9,
    })

    return enforceReportMarkdownCitationPolicy(cleanText(content) ? content.trim() : baseMarkdown, citationPolicy)
  } catch (error) {
    console.warn('[artifacts] report refinement skipped:', error?.message || error)
    return enforceReportMarkdownCitationPolicy(baseMarkdown, citationPolicy)
  }
}

const refineSlides = async ({ dossier, instructions, audience, baseSlides, citationPolicy, slideProfile }) => {
  try {
    const content = await callTextGeneration({
      systemPrompt: '당신은 임원용 발표자료 설계자입니다. 반드시 JSON 배열만 출력하세요. 각 항목은 {"title":"...","kicker":"...","layout":"hero|split|evidence|metrics|content|closing","bullets":["..."],"citations":["..."]} 형식입니다. 슬라이드는 최대 6장입니다. 기존 초안의 슬라이드 순서와 역할을 최대한 유지하세요. 첫 장은 hero, 마지막 장은 closing을 우선 사용하세요. 가장 강한 학술 근거 1~2개와 그 이유(scholar, benchmark, peer-reviewed 여부, venue tier)를 필요할 때만 드러내세요. 커뮤니티 신호는 보조 정보로만 사용하세요. 인용은 제공된 excerpt 범위 안에서만 쓰고, citations에는 원문 링크를 그대로 남기세요.',
      userPrompt: [
        `주제: ${dossier.topic}`,
        audience ? `청중: ${audience}` : null,
        instructions ? `사용자 요청: ${instructions}` : null,
        ...buildBriefPreferenceLines(dossier?.brief || {}, { artifactType: 'slides' }),
        buildSlideProfilePrompt(slideProfile),
        `Executive summary: ${dossier.executiveSummary}`,
        `핵심 주장: ${(dossier.claims || []).map((claim) => claim.statement).join(' | ') || '없음'}`,
        `근거 목록:\n${formatEvidenceForPrompt(dossier.evidence) || '없음'}`,
        `Scholarly 신호 요약: ${formatScholarlySummaryForPrompt(dossier)}`,
        dossier.evidenceGaps?.length ? `남은 공백: ${dossier.evidenceGaps.slice(0, 3).join(' | ')}` : null,
        '슬라이드 규칙: quote-like 문장은 excerpt 범위 안에서만 사용하고, citations에는 원문 링크를 그대로 보존하세요.',
        buildCitationPolicyPrompt(citationPolicy, { artifactType: 'slides' }),
        '구조 규칙: 기존 초안의 슬라이드 제목과 순서를 최대한 유지하고, 슬라이드별 citation 위치를 섞지 마세요.',
        `기존 슬라이드 초안:\n${buildSlideMarkdown(baseSlides)}`,
        '더 날카롭고 발표하기 쉬운 슬라이드 개요를 JSON 배열로 다시 작성하세요. 보고서 요약본처럼 길게 설명하지 말고, 실제 발표용 headline + support bullets 구조로 다듬으세요.',
      ].filter(Boolean).join('\n\n'),
      maxTokens: 900,
      temperature: 0.32,
      topP: 0.9,
    })

    const parsed = parseJsonBlock(content, [])
    const slides = normalizeSlideOutline(Array.isArray(parsed) ? parsed : parsed?.slides)
    const mergedSlides = slides.length > 0 ? mergeRefinedSlidesWithBase(baseSlides, slides) : baseSlides
    return enforceSlideCitationPolicy(mergedSlides, citationPolicy, dossier.evidence || [])
  } catch (error) {
    console.warn('[artifacts] slide refinement skipped:', error?.message || error)
    return enforceSlideCitationPolicy(baseSlides, citationPolicy, dossier.evidence || [])
  }
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'artifact-generate', limit: 24, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const mode = cleanText(body?.mode || 'both').toLowerCase()
  const brief = normalizeBrief(body?.brief && typeof body.brief === 'object' ? body.brief : {})
  const topic = cleanText(body?.topic || brief.overview || '').slice(0, 200)
  const instructions = cleanText(body?.instructions || '').slice(0, 1000)
  const audience = cleanText(body?.audience || '').slice(0, 200)
  const reportCitationMode = normalizeCitationControl(body?.reportCitationMode)
  const reportCitationVisibility = normalizeCitationControl(body?.reportCitationVisibility)
  const slideCitationMode = normalizeCitationControl(body?.slideCitationMode)
  const slideCitationVisibility = normalizeCitationControl(body?.slideCitationVisibility)
  const reportStylePreset = normalizeStylePreset(body?.reportStylePreset)
  const slideStylePreset = normalizeStylePreset(body?.slideStylePreset)
  const consensus = String(body?.consensus || '').slice(0, 4000)
  const messages = sanitizeMessages(body?.messages)
  const syntheticMessages = (!body?.dossier && messages.length === 0 && topic)
    ? buildBriefMessages({ topic, instructions, audience, brief, mode })
    : []
  const workingMessages = messages.length > 0 ? messages : syntheticMessages
  const workingConsensus = consensus || ((!body?.dossier && topic)
    ? buildBriefConsensus({ topic, instructions, audience, brief, mode })
    : '')

  if (!body?.dossier && !topic) {
    return sendJson(res, 400, { error: '문서/PPT 생성을 위해 주제 개요 또는 Dossier가 필요합니다.' })
  }

  try {
    const dossier = buildWorkingDossier({ body, topic, messages: workingMessages, consensus: workingConsensus })
    dossier.brief = brief
    const customization = {
      audience,
      reportRequest: mode === 'docs' || mode === 'both' ? instructions : '',
      slideRequest: mode === 'ppt' || mode === 'both' ? instructions : '',
      briefDomain: brief.domainLabel || brief.domain,
      visualTheme: brief.visualTheme,
      visualPreset: brief.visualPreset,
      textDensity: brief.textDensity,
      aiImageMode: brief.aiImageMode,
      imageSource: brief.imageSource,
      imageStylePreset: brief.imageStylePreset,
      cardCount: brief.cardCount,
      layoutPreset: brief.layoutPreset,
      language: brief.language,
      userRole: brief.userRole,
      writingNote: brief.writingNote,
      toneNote: brief.toneNote,
      reportOutlineTitles: mode === 'docs' || mode === 'both' ? brief.outlineTitles : [],
      slideOutlineTitles: mode === 'ppt' || mode === 'both' ? brief.outlineTitles : [],
      reportCitationMode: mode === 'docs' || mode === 'both' ? reportCitationMode : '',
      reportCitationVisibility: mode === 'docs' || mode === 'both' ? reportCitationVisibility : '',
      reportStylePreset: mode === 'docs' || mode === 'both' ? reportStylePreset : '',
      slideCitationMode: mode === 'ppt' || mode === 'both' ? slideCitationMode : '',
      slideCitationVisibility: mode === 'ppt' || mode === 'both' ? slideCitationVisibility : '',
      slideStylePreset: mode === 'ppt' || mode === 'both' ? slideStylePreset : '',
    }
    const artifacts = buildDebateArtifacts({ dossier, customization })

    if ((mode === 'docs' || mode === 'both') && (instructions || audience)) {
      artifacts.report.markdown = await refineReportMarkdown({
        dossier,
        instructions,
        audience,
        baseMarkdown: artifacts.report.markdown,
        citationPolicy: artifacts.report?.structuredContent?.citationPolicy || artifacts.report?.metadata || {},
        reportProfile: artifacts.report?.structuredContent?.writingProfile || artifacts.report?.metadata?.profile || '',
      })
      artifacts.report.metadata.generatedWithLlm = true
    }

    if ((mode === 'ppt' || mode === 'both') && (instructions || audience)) {
      const slides = await refineSlides({
        dossier,
        instructions,
        audience,
        baseSlides: artifacts.slides.structuredContent?.slides || [],
        citationPolicy: artifacts.slides?.structuredContent?.citationPolicy || artifacts.slides?.metadata || {},
        slideProfile: artifacts.slides?.structuredContent?.deckProfile || artifacts.slides?.metadata?.profile || '',
      })
      const citationPolicy = artifacts.slides?.structuredContent?.citationPolicy || artifacts.slides?.metadata || {}
      const slideCitationLedger = buildSlideCitationLedger(slides, citationPolicy)
      artifacts.slides.structuredContent = {
        ...(artifacts.slides.structuredContent || {}),
        slides,
        citationLedger: slideCitationLedger,
      }
      artifacts.slides.markdown = buildSlideMarkdown(slides)
      artifacts.slides.metadata.slideCount = slides.length
      artifacts.slides.metadata.citationLedgerCount = slideCitationLedger.length
      artifacts.slides.metadata.generatedWithLlm = true
    }

    return sendJson(res, 200, {
      ok: true,
      topic: dossier.topic,
      dossier,
      artifacts,
    })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '산출물 생성 중 오류가 발생했습니다.' })
  }
}