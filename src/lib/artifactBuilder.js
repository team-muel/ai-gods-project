const cleanText = (value = '') => String(value).replace(/\r/g, '').trim()

const formatEvidenceReference = (item = {}, { compact = false } = {}) => {
  const metadata = item?.metadata || {}
  const authors = Array.isArray(metadata.authors) ? metadata.authors.slice(0, 3).join(', ') : ''
  const venue = cleanText(metadata.venue || '')
  const year = cleanText(metadata.year || '')
  const doi = cleanText(metadata.doi || '')
  const sourceLabel = cleanText(metadata.sourceLabel || item?.provider || '')
  const sourceProviders = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders.filter(Boolean) : []
  const venueSignals = metadata.venueSignals && typeof metadata.venueSignals === 'object' ? metadata.venueSignals : {}
  const benchmarkTerms = Array.isArray(metadata?.benchmarkSignals?.matchedTerms) ? metadata.benchmarkSignals.matchedTerms.filter(Boolean) : []
  const reviewSignals = metadata.reviewSignals && typeof metadata.reviewSignals === 'object' ? metadata.reviewSignals : {}
  const communitySignals = metadata.communitySignals && typeof metadata.communitySignals === 'object' ? metadata.communitySignals : {}
  const directScholarlyScore = Number(metadata.scholarlyScore)
  const rankingScholarlyScore = Number(metadata?.rankingSignals?.total)
  const scholarlyScore = Number.isFinite(directScholarlyScore)
    ? Math.round(directScholarlyScore)
    : Number.isFinite(rankingScholarlyScore)
      ? Math.round(rankingScholarlyScore)
      : 0
  const parts = [authors, year, venue || sourceLabel].filter(Boolean)
  const head = parts.length > 0 ? `${parts.join(' · ')} · ` : ''
  const scoreLabel = Number.isFinite(Number(item?.citationScore)) ? ` [citation ${item.citationScore}/100]` : ''
  const doiLabel = doi ? ` · DOI ${doi}` : ''
  const signalBits = []
  if (scholarlyScore > 0) signalBits.push(`scholar ${scholarlyScore}/100`)
  if (metadata.peerReviewed) signalBits.push('peer-reviewed est.')
  else if (metadata.preprint) signalBits.push('preprint')
  if (venueSignals.emphasisLabel) signalBits.push(venueSignals.emphasisLabel)
  if (sourceProviders.length > 1) signalBits.push(`indexed ${sourceProviders.slice(0, 3).join('+')}`)
  if (benchmarkTerms.length > 0) signalBits.push(`signals ${benchmarkTerms.slice(0, 2).join(', ')}`)
  if (reviewSignals.decisionLabel) signalBits.push(reviewSignals.decisionLabel)
  else if (Number(reviewSignals.reviewCount || 0) > 0) signalBits.push(`reviews ${reviewSignals.reviewCount}`)
  if (Number(communitySignals.upvotes || 0) > 0) signalBits.push(`HF upvotes ${communitySignals.upvotes}`)
  else if (Number(communitySignals.collectionsCount || 0) > 0) signalBits.push(`HF collections ${communitySignals.collectionsCount}`)
  if (!compact && Array.isArray(item.artifactPriorityReasons) && item.artifactPriorityReasons.length > 0) {
    signalBits.push(item.artifactPriorityReasons[0])
  }
  const signalLabel = signalBits.length > 0 ? ` · ${signalBits.slice(0, compact ? 2 : 4).join(' · ')}` : ''
  return truncate(`${head}${item.label}${scoreLabel}${doiLabel}${signalLabel}`, compact ? 180 : 360)
}

const formatEvidenceExcerpt = (item = {}, { compact = false } = {}) => {
  const excerpt = cleanText(item?.excerpt || '')
  if (!excerpt) return ''

  return truncate(`발췌/초록: "${excerpt}"`, compact ? 180 : 300)
}

const formatEvidenceSourceLine = (item = {}) => {
  const metadata = item?.metadata || {}
  const url = cleanText(item?.url || '')
  const doi = cleanText(metadata.doi || '')

  if (url) return `원문 링크: ${url}`
  if (doi) return `원문 식별자: DOI ${doi}`
  return '원문 링크 없음'
}

const formatEvidenceMatrixEntry = (item = {}) => [
  formatEvidenceReference(item),
  formatEvidenceExcerpt(item),
  formatEvidenceSourceLine(item),
].filter(Boolean).join('\n  ')

const getEvidenceScholarlyScore = (item = {}) => {
  const metadata = item?.metadata || {}
  const directScore = Number(item?.scholarlyScore || metadata.scholarlyScore)
  if (Number.isFinite(directScore)) return Math.round(directScore)

  const rankingScore = Number(metadata?.rankingSignals?.total)
  return Number.isFinite(rankingScore) ? Math.round(rankingScore) : 0
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const truncate = (value = '', maxLength = 220) => {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const uniqueBy = (items = [], getKey = (item) => item) => {
  const seen = new Set()

  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = getKey(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const markdownBulletList = (items = [], emptyText = '- 항목 없음') => {
  if (!Array.isArray(items) || items.length === 0) return emptyText
  return items.map((item) => `- ${item}`).join('\n')
}

const normalizeSlideDataPoints = (items = [], { maxItems = 4, preferValue = true } = {}) => {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => {
      if (typeof item === 'string') {
        return preferValue
          ? { value: truncate(item, 32), label: '', note: '' }
          : { value: '', label: truncate(item, 60), note: '' }
      }

      const value = truncate(item?.value || item?.score || item?.number || (preferValue ? item?.label || item?.title || '' : ''), 32)
      const label = truncate(item?.label || item?.title || item?.name || (!preferValue ? value : ''), 60)
      const note = truncate(item?.note || item?.context || item?.detail || '', 72)
      return { value, label, note }
    })
    .filter((item) => item.value || item.label || item.note)
    .slice(0, maxItems)
}

const formatSlideDataPoint = (item = {}) => [item?.value, item?.label, item?.note].filter(Boolean).join(' · ')

const isPlaceholderHeavyText = (value = '') => {
  const text = cleanText(value).replace(/\s+/g, '')
  if (!text) return false
  const questionMarks = (text.match(/\?/g) || []).length
  const readableChars = (text.match(/[A-Za-z0-9가-힣]/g) || []).length
  return (questionMarks >= 6 && questionMarks / text.length >= 0.16)
    || (text.length >= 24 && readableChars < Math.max(8, Math.round(text.length * 0.22)))
}

const compactSlideText = (value = '', maxLength = 110) => {
  const text = truncate(value, maxLength)
  return isPlaceholderHeavyText(text) ? '' : text
}

const cleanStrategicText = (value = '', maxLength = 96) => {
  const lines = cleanText(value)
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line) => {
      const structuredMatch = line.match(/^(반응 대상|판단|근거|제안)\s*[:：]\s*(.+)$/)
      if (!structuredMatch) return line
      if (structuredMatch[1] === '반응 대상') return ''
      return structuredMatch[2]
    })
    .filter(Boolean)

  const candidate = lines.find((line) => line.length >= 18) || lines[0] || ''
  return compactSlideText(candidate, maxLength)
}

const uniqueSlideTexts = (items = []) => uniqueBy(
  (Array.isArray(items) ? items : []).map((item) => cleanText(item)).filter(Boolean),
  (item) => item.toLowerCase(),
)

const buildSlideEvidenceReference = (item = {}) => {
  const metadata = item?.metadata || {}
  const year = cleanText(metadata.year || '')
  const venue = cleanText(metadata.venue || metadata.sourceLabel || item?.provider || '')
  const scholarlyScore = Number(metadata.scholarlyScore || metadata?.rankingSignals?.total || 0)
  const citationScore = Number(item?.citationScore || 0)

  return compactSlideText([
    truncate(item?.label || '근거 없음', 72),
    year,
    venue,
    scholarlyScore > 0 ? `scholar ${Math.round(scholarlyScore)}/100` : '',
    citationScore > 0 ? `citation ${Math.round(citationScore)}/100` : '',
  ].filter(Boolean).join(' · '), 118)
}

const buildSlideCitationNote = (item = {}, index = 0) => {
  const reference = formatEvidenceReference(item, { compact: true })
  const excerpt = formatEvidenceExcerpt(item, { compact: true })
  const source = formatEvidenceSourceLine(item)

  return [`[E${index + 1}] ${reference}`, excerpt, source].filter(Boolean).join(' | ')
}

const buildSlideEvidenceQuote = (item = {}) => {
  const excerpt = cleanText(item?.excerpt || '')
  if (!excerpt) return ''
  return compactSlideText(`"${excerpt}"`, 130)
}

const buildCitationRecord = (item = {}, index = 0) => ({
  evidenceId: cleanText(item?.id || `evidence-${index + 1}`),
  label: truncate(item?.label || '근거 없음', 140),
  url: cleanText(item?.url || '') || null,
  sourceKind: cleanText(item?.sourceKind || '') || null,
  type: cleanText(item?.type || '') || null,
  citationScore: Number(item?.citationScore || 0),
  scholarlyScore: getEvidenceScholarlyScore(item),
  note: buildSlideCitationNote(item, index),
})

const buildCitationLedgerEntry = ({ locationType = 'artifact_section', locationId = '', locationLabel = '', items = [] } = {}) => {
  const citations = (Array.isArray(items) ? items : [])
    .map((item, index) => buildCitationRecord(item, index))
    .filter((item) => item.evidenceId || item.label || item.url)

  if (citations.length === 0) return null

  return {
    locationType,
    locationId,
    locationLabel,
    evidenceIds: uniqueSlideTexts(citations.map((item) => item.evidenceId)).slice(0, 12),
    citations,
  }
}

const formatCitationLedgerLine = (entry = {}) => `${entry.locationLabel}: ${(Array.isArray(entry.citations) ? entry.citations : []).slice(0, 3).map((citation) => `[${citation.evidenceId || 'evidence'}] ${citation.label}${citation.url ? ` · ${citation.url}` : ''}`).join(' | ')}`

const OUTLINE_DIRECTIVE_PATTERN = /(이내|위주|중심|강조|재구성|표시|정리|작성|설명|추가|삭제|포함|구성하|반영|유지|나누|분리|만들|보여|페이지|장수)/i
const OUTLINE_NOISE_PATTERN = /^(예|예시|for example)\s*[:：]/i
const REQUEST_KEYWORD_STOPWORDS = new Set([
  '보고서',
  '발표자료',
  'ppt',
  'pptx',
  'slide',
  'slides',
  'docx',
  'docs',
  '문서',
  '자료',
  '장',
  '슬라이드',
  '장표',
  '중심',
  '위주',
  '강조',
  '재구성',
  '표시',
  '정리',
  '작성',
  '추가',
  '삭제',
  '분리',
  '독자',
  '청중',
  '대상',
  '마지막',
  '첫',
  '이내',
  '사용자',
  '요청',
])

const OUTLINE_CATEGORY_RULES = [
  { id: 'abstract', keywords: ['abstract', 'summary', '요약', '초록', '개요', '핵심요약'] },
  { id: 'background', keywords: ['배경', '현황', 'context', 'overview', '문제배경', '과제개요'] },
  { id: 'question', keywords: ['질문', '쟁점', 'research question', '문제정의', '문제 정의'] },
  { id: 'methodology', keywords: ['방법', '방법론', 'method', 'research design', '연구방법'] },
  { id: 'analysis', keywords: ['분석', '본론', 'analysis', 'evidence', '논의', '검토'] },
  { id: 'metrics', keywords: ['지표', '수치', '숫자', 'metric', 'metrics', 'chart', 'score'] },
  { id: 'case-study', keywords: ['사례', '케이스', 'case', 'benchmark', '비교사례'] },
  { id: 'findings', keywords: ['시사점', '발견', 'insight', 'findings', '핵심포인트', '핵심 포인트'] },
  { id: 'recommendation', keywords: ['권고', '제언', '실행', 'action', 'roadmap', 'plan', 'next action', '대응'] },
  { id: 'risk', keywords: ['리스크', '위험', '한계', 'gap', 'risk', 'limitation', 'counterpoint', '반론', '공백'] },
  { id: 'conclusion', keywords: ['결론', '마무리', '종합', 'closing', 'final', 'next step', '다음 단계'] },
  { id: 'references', keywords: ['참고문헌', 'references', '출처', 'bibliography'] },
]

const stripOutlineMarker = (value = '') => cleanText(String(value)
  .replace(/^[-*•]\s*/, '')
  .replace(/^\d+[\.)]\s*/, '')
  .replace(/^\d+\s*장\s*[:：-]?\s*/i, '')
  .replace(/^(?:slide|slides?|슬라이드|장표|section|part)\s*\d+\s*[:：-]?\s*/i, '')
  .replace(/^[#:：-]+\s*/, ''))

const normalizeOutlineTitleFragment = (value = '') => stripOutlineMarker(String(value)
  .replace(/^(?:(?:보고서|리포트|문서|docx|docs?|pptx?|ppt|발표자료|슬라이드|장표|과제물)(?:는|를|은|을)?\s*)+/i, '')
  .replace(/^(?:과제물\s*부분별로|부분별로|다음\s*(?:순서|구성|목차)(?:로)?|아래\s*(?:순서|구성|목차)(?:로)?|순서(?:는)?|구성(?:은)?|형식(?:은)?|목차(?:는)?)\s*/i, '')
  .replace(/^\d+\s*(?:장|slides?|pages?|페이지)\s*(?:이내|내외)?(?:로)?\s*/i, '')
  .replace(/\s*(?:순서로|구성으로|형식으로|목차로)\s*(?:작성|구성|정리|설명|배치|전개)(?:해줘|해주세요)?$/i, '')
  .replace(/\s*(?:순서|구성|형식|목차)\s*(?:으로)?\s*(?:작성|구성|정리|설명|배치|전개)(?:해줘|해주세요)?$/i, '')
  .replace(/\s*(?:작성|구성|정리|설명|배치|전개)(?:해줘|해주세요)?$/i, '')
  .replace(/\s*(?:순서|구성|형식|목차)(?:로)?$/i, ''))

const isLikelyOutlineTitle = (value = '', { artifactType = 'report' } = {}) => {
  const title = normalizeOutlineTitleFragment(value)
  if (!title) return false
  if (OUTLINE_NOISE_PATTERN.test(value)) return false
  if (title.length > 34) return false
  if (/[?!]/.test(title)) return false
  if (OUTLINE_DIRECTIVE_PATTERN.test(title)) return false
  if (artifactType === 'slides' && /(\d+\s*(?:장|pages?|slides?)\s*이내|\d+\s*(?:페이지|장))/i.test(title)) return false
  return title.split(/\s+/).filter(Boolean).length <= 6
}

const extractKeywordsFromText = (value = '') => uniqueSlideTexts(
  cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((token) => token.length >= 2 && !REQUEST_KEYWORD_STOPWORDS.has(token))
).slice(0, 12)

const extractExplicitOutlineTitles = (request = '', { artifactType = 'report', maxItems = 6 } = {}) => {
  const raw = String(request || '').replace(/\r/g, '\n').trim()
  if (!raw) return []

  const candidateLines = raw
    .replace(/(?:->|→|=>|＞|>)/g, '\n')
    .replace(/[，,]/g, '\n')
    .replace(/[|;]/g, '\n')
    .replace(/\s*\/\s*/g, '\n')
    .replace(/(?:^|\s)(\d+[\.)])\s*/g, '\n$1 ')
    .split('\n')
    .map(cleanText)
    .filter(Boolean)

  return uniqueBy(
    candidateLines
      .map((item) => normalizeOutlineTitleFragment(item))
      .filter((item) => isLikelyOutlineTitle(item, { artifactType })),
    (item) => item.toLowerCase(),
  ).slice(0, maxItems)
}

const parseRequestedSlideCount = (request = '') => {
  const match = cleanText(request).match(/(\d+)\s*(?:장|slides?|pages?|페이지)/i)
  const value = Number(match?.[1] || 0)
  return Number.isFinite(value) && value > 0 ? clamp(value, 3, 6) : 0
}

const buildAssignmentFeatures = (request = '') => {
  const lowered = cleanText(request).toLowerCase()
  return {
    wantsComparison: /(비교|대안|옵션|option|options|trade-?off|트레이드오프|장단점|vs\.?|대조|비교표)/i.test(lowered),
    wantsExecution: /(실행|action|roadmap|로드맵|제언|권고|대응|next action|다음 단계|우선순위|체크리스트|실행안|액션 아이템|action items?|rollout|implementation plan|운영안|도입 계획|도입방안)/i.test(lowered),
    wantsCases: /(사례|case ?study|cases?|benchmark|예시|레퍼런스|reference|best practice|케이스 스터디|사례연구|기업 사례)/i.test(lowered),
    wantsMetrics: /(지표|수치|숫자|metric|metrics|chart|그래프|kpi|roi|cost|비용|예산|매출|수익성|시장규모|tam|sam|som|accuracy|latency|throughput|성능)/i.test(lowered),
    wantsNextAction: /(마지막\s*(장|페이지|슬라이드)|last slide|next action|next steps?|다음 단계|후속 조치|마무리 장)/i.test(lowered),
  }
}

const VALID_CITATION_MODES = new Set(['none', 'light', 'selective', 'strict'])
const VALID_CITATION_VISIBILITIES = new Set(['hidden', 'bibliography-only', 'inline'])

const CITATION_NONE_PATTERN = /((인용|각주|출처|참고문헌|논문|레퍼런스).{0,14}(없음|없다|불필요|필요 없|안 해도|안해도|빼|제외|생략|숨겨|달지 말|넣지 말))|((인용|각주|출처|레퍼런스)\s*(없이|없는))|(?:no|without)\s+(?:citations?|references?|bibliography|footnotes?)/i
const CITATION_BIBLIOGRAPHY_ONLY_PATTERN = /(참고문헌만|참고자료만|출처만\s*(끝|마지막)|references? only|bibliography only|reference-only|출처는 마지막|출처는 끝에|본문\s*(인용|각주)\s*없이|슬라이드\s*(인용|각주)\s*없이|각주는?\s*(빼|숨기)|본문에는\s*출처\s*없이|마지막\s*(장|페이지|슬라이드).{0,8}(출처|참고자료)|끝에만\s*(출처|참고문헌)|references?\s*(slide|page)\s*only)/i
const CITATION_INLINE_PATTERN = /(각주\s*(포함|표시|달아)|슬라이드.*(인용|각주).*(포함|표기|달아)|본문.*(인용|각주).*(포함|표기|달아)|inline citations?|본문마다\s*출처|각\s*(섹션|장|슬라이드)마다\s*출처|footnotes?\s*(include|required))/i
const CITATION_STRICT_PATTERN = /(논문\s*(필수|중심)|학술\s*(근거|인용|출처)\s*(필수|중심)|문헌\s*검토|선행연구|literature review|systematic review|체계적 문헌고찰|근거 중심|citation[s]?\s*required|references?\s*required|peer-reviewed|apa\s*(style)?|mla\s*(style)?|chicago\s*(style)?|footnotes?\s*required)/i
const LIGHT_ASSIGNMENT_PATTERN = /(간단 요약|요약 위주|브리프|brief|브리핑|임원 보고|임원용|경영진용|발표용|발표자료|one-pager|원페이지|executive memo|briefing note|pitch deck|피치덱|투자자 deck|이사회 보고)/i
const IDEATION_ASSIGNMENT_PATTERN = /(브레인스토밍|아이디어|카피|슬로건|소개글|자기소개|연설문|멘트|스토리라인|rough draft|러프|보도자료|랜딩페이지|광고 문안|메시지맵|콘셉트 노트|naming|tagline)/i
const RESEARCH_ASSIGNMENT_PATTERN = /(리서치|research|문헌|문헌조사|선행연구|현황 분석|비교 분석|benchmark|벤치마크|케이스|사례 분석|시장 조사|시장 리서치|정책 검토|법률 검토|review|survey|white paper|실증 분석|메타분석|systematic|case study)/i
const EXECUTION_ASSIGNMENT_PATTERN = /(실행 계획|실행방안|도입 방안|도입 계획|제안서|전략안|전략 제안|roadmap|사업 계획|운영 계획|운영 가이드|권고안|대응 방안|우선순위|체크리스트|rollout|implementation plan|go-to-market|gtm)/i

const normalizeCitationMode = (value = '') => {
  const normalized = cleanText(value).toLowerCase()
  return VALID_CITATION_MODES.has(normalized) ? normalized : ''
}

const normalizeCitationVisibility = (value = '') => {
  const normalized = cleanText(value).toLowerCase()
  return VALID_CITATION_VISIBILITIES.has(normalized) ? normalized : ''
}

const hasCitationIntent = (request = '') => /(논문|인용|각주|출처|참고문헌|citation|reference|bibliography|scholar|학술|문헌|footnote|apa|mla|chicago)/i.test(cleanText(request))

const detectExplicitCitationMode = (request = '') => {
  const text = cleanText(request)
  if (!text) return ''
  if (CITATION_BIBLIOGRAPHY_ONLY_PATTERN.test(text)) return ''
  if (CITATION_NONE_PATTERN.test(text)) return 'none'
  if (CITATION_STRICT_PATTERN.test(text)) return 'strict'
  if (IDEATION_ASSIGNMENT_PATTERN.test(text) && !hasCitationIntent(text)) return 'none'
  if (LIGHT_ASSIGNMENT_PATTERN.test(text) && !CITATION_INLINE_PATTERN.test(text)) return 'light'
  return ''
}

const detectExplicitCitationVisibility = (request = '') => {
  const text = cleanText(request)
  if (!text) return ''
  if (CITATION_BIBLIOGRAPHY_ONLY_PATTERN.test(text)) return 'bibliography-only'
  if (CITATION_NONE_PATTERN.test(text)) return 'hidden'
  if (CITATION_INLINE_PATTERN.test(text)) return 'inline'
  return ''
}

const detectAssignmentType = ({ request = '', features = {}, artifactType = 'report' } = {}) => {
  const text = cleanText(request)
  if (!text) return artifactType === 'slides' ? 'briefing' : 'general'
  if (IDEATION_ASSIGNMENT_PATTERN.test(text)) return 'ideation'
  if (EXECUTION_ASSIGNMENT_PATTERN.test(text) || features.wantsExecution) return 'execution'
  if (RESEARCH_ASSIGNMENT_PATTERN.test(text) || features.wantsComparison || features.wantsCases || (features.wantsMetrics && hasCitationIntent(text))) return 'research'
  if (LIGHT_ASSIGNMENT_PATTERN.test(text) || artifactType === 'slides') return 'briefing'
  return hasCitationIntent(text) ? 'research' : 'general'
}

const getDefaultCitationMode = ({ assignmentType = 'general', artifactType = 'report' } = {}) => {
  switch (assignmentType) {
    case 'ideation':
      return 'none'
    case 'research':
      return artifactType === 'report' ? 'strict' : 'selective'
    case 'execution':
      return artifactType === 'report' ? 'selective' : 'light'
    case 'briefing':
      return 'light'
    default:
      return artifactType === 'report' ? 'selective' : 'light'
  }
}

const getDefaultCitationVisibility = ({ mode = 'selective', artifactType = 'report' } = {}) => {
  if (mode === 'none') return 'hidden'
  if (artifactType === 'slides') return 'bibliography-only'
  if (mode === 'light') return 'bibliography-only'
  return 'inline'
}

const buildArtifactCitationPolicy = ({ request = '', artifactType = 'report', features = {}, explicitTitles = [], explicitMode = '', explicitVisibility = '' } = {}) => {
  const overrideMode = normalizeCitationMode(explicitMode)
  const overrideVisibility = normalizeCitationVisibility(explicitVisibility)
  const inferredMode = detectExplicitCitationMode(request)
  const inferredVisibility = detectExplicitCitationVisibility(request)
  const assignmentType = detectAssignmentType({ request, features, artifactType })
  const mode = overrideMode || inferredMode || getDefaultCitationMode({ assignmentType, artifactType })
  const visibility = overrideVisibility || inferredVisibility || getDefaultCitationVisibility({ mode, artifactType })
  const hasReferenceTitle = (Array.isArray(explicitTitles) ? explicitTitles : []).some((title) => /참고문헌|참고자료|references|bibliography|출처/i.test(cleanText(title)))
  const includeReferences = hasReferenceTitle || (mode !== 'none' && visibility !== 'hidden')

  return {
    assignmentType,
    mode,
    visibility,
    includeReferences,
    includeInlineCitations: visibility === 'inline',
    includeLedger: visibility === 'inline' && mode === 'strict',
    preferReferenceSlide: artifactType === 'slides' && visibility === 'bibliography-only',
    referenceLimit: artifactType === 'report' ? 10 : 3,
  }
}

const normalizeArtifactPreset = (value = '') => cleanText(value).toLowerCase().replace(/[^a-z-]/g, '')

const REPORT_PROFILE_BY_PRESET = {
  research: 'university-paper',
  analysis: 'evidence-analysis',
  brief: 'executive-brief',
  ideation: 'concept-note',
}

const SLIDE_PROFILE_BY_PRESET = {
  investor: 'investor-deck',
  evidence: 'evidence-deck',
  research: 'research-presentation',
  pitch: 'pitch-deck',
}

const UNIVERSITY_ASSIGNMENT_PATTERN = /(대학교|대학|과제|리포트|레포트|보고서 과제|발제문|논문|essay|term paper|research paper|seminar|세미나|교수|academic paper|literature review)/i
const EXECUTIVE_AUDIENCE_PATTERN = /(경영진|임원|executive|leadership|board|이사회|management|c-suite)/i
const INVESTOR_AUDIENCE_PATTERN = /(투자자|investor|vc|venture|fund|ir|board deck|이사회)/i
const PITCH_ASSIGNMENT_PATTERN = /(pitch|피치|storyline|스토리라인|sales deck|proposal deck|영업 발표|제안 발표)/i
const RESEARCH_PRESENTATION_PATTERN = /(연구발표|세미나 발표|학회 발표|research presentation|seminar presentation|colloquium)/i

const detectArtifactProfile = ({ artifactType = 'report', request = '', audience = '', citationPolicy = {}, presetId = '' } = {}) => {
  const normalizedPreset = normalizeArtifactPreset(presetId)
  const requestText = cleanText(request)
  const audienceText = cleanText(audience)
  const combined = `${requestText} ${audienceText}`.trim()

  if (artifactType === 'report') {
    if (REPORT_PROFILE_BY_PRESET[normalizedPreset]) return REPORT_PROFILE_BY_PRESET[normalizedPreset]
    if (UNIVERSITY_ASSIGNMENT_PATTERN.test(combined)) return 'university-paper'
    if (citationPolicy.assignmentType === 'ideation' || citationPolicy.mode === 'none') return 'concept-note'
    if (citationPolicy.assignmentType === 'research' && citationPolicy.mode === 'strict') return 'university-paper'
    if (EXECUTIVE_AUDIENCE_PATTERN.test(combined) || INVESTOR_AUDIENCE_PATTERN.test(combined) || citationPolicy.assignmentType === 'briefing' || citationPolicy.assignmentType === 'execution') {
      return 'executive-brief'
    }
    if (citationPolicy.assignmentType === 'research' || citationPolicy.mode === 'selective') return 'evidence-analysis'
    return 'executive-brief'
  }

  if (SLIDE_PROFILE_BY_PRESET[normalizedPreset]) return SLIDE_PROFILE_BY_PRESET[normalizedPreset]
  if (PITCH_ASSIGNMENT_PATTERN.test(combined) || citationPolicy.mode === 'none') return 'pitch-deck'
  if (RESEARCH_PRESENTATION_PATTERN.test(combined) || UNIVERSITY_ASSIGNMENT_PATTERN.test(combined) || (citationPolicy.assignmentType === 'research' && citationPolicy.mode === 'strict')) {
    return 'research-presentation'
  }
  if (INVESTOR_AUDIENCE_PATTERN.test(combined) || EXECUTIVE_AUDIENCE_PATTERN.test(combined) || citationPolicy.assignmentType === 'briefing' || citationPolicy.assignmentType === 'execution') {
    return 'investor-deck'
  }
  if (citationPolicy.assignmentType === 'research' || citationPolicy.mode === 'selective') return 'evidence-deck'
  return 'executive-deck'
}

const buildReportProfileSpecs = ({ profile = 'executive-brief', includeReferences = true } = {}) => {
  const templates = {
    'university-paper': [
      { title: '문제 제기', category: 'question' },
      { title: '이론적 배경', category: 'background' },
      { title: '분석 프레임', category: 'methodology' },
      { title: '핵심 분석', category: 'analysis' },
      { title: '결론 및 제언', category: 'conclusion' },
    ],
    'evidence-analysis': [
      { title: '과제 개요', category: 'abstract' },
      { title: '핵심 질문', category: 'question' },
      { title: '근거 비교 분석', category: 'analysis' },
      { title: '리스크와 한계', category: 'risk' },
      { title: '권고안', category: 'recommendation' },
    ],
    'executive-brief': [
      { title: 'Executive Summary', category: 'abstract' },
      { title: 'Why Now', category: 'background' },
      { title: 'Decision Drivers', category: 'analysis' },
      { title: 'Recommended Actions', category: 'recommendation' },
      { title: 'Risks & Assumptions', category: 'risk' },
    ],
    'concept-note': [
      { title: '핵심 제안', category: 'abstract' },
      { title: '배경과 문제', category: 'background' },
      { title: '메시지 구조', category: 'analysis' },
      { title: '활용 시나리오', category: 'case-study' },
      { title: '다음 단계', category: 'conclusion' },
    ],
  }

  const base = templates[profile] || templates['executive-brief']
  return includeReferences
    ? [...base, { title: profile === 'executive-brief' ? 'Appendix / Sources' : '참고문헌', category: 'references' }]
    : base
}

const buildSlideProfileSpecs = ({ profile = 'executive-deck', includeReferences = true, title = '' } = {}) => {
  const leadTitle = cleanText(title || 'AI Gods Deck')
  const templates = {
    'investor-deck': [
      { title: leadTitle, category: 'abstract' },
      { title: 'Why Now', category: 'background' },
      { title: 'Problem / Opportunity', category: 'analysis' },
      { title: 'Strategy & Operating Model', category: 'recommendation' },
      { title: 'ROI / KPI', category: 'metrics' },
    ],
    'evidence-deck': [
      { title: leadTitle, category: 'abstract' },
      { title: 'Decision Question', category: 'question' },
      { title: 'What Evidence Says', category: 'analysis' },
      { title: 'Strongest Signals', category: 'metrics' },
      { title: 'Risks / Gaps', category: 'risk' },
    ],
    'research-presentation': [
      { title: leadTitle, category: 'abstract' },
      { title: 'Research Question', category: 'question' },
      { title: 'Background & Method', category: 'methodology' },
      { title: 'Findings', category: 'analysis' },
      { title: 'Discussion', category: 'risk' },
    ],
    'pitch-deck': [
      { title: leadTitle, category: 'abstract' },
      { title: 'The Problem', category: 'background' },
      { title: 'The Bet', category: 'analysis' },
      { title: 'Why It Wins', category: 'metrics' },
      { title: 'Next Step', category: 'conclusion' },
    ],
    'executive-deck': [
      { title: leadTitle, category: 'abstract' },
      { title: 'Why This Matters', category: 'background' },
      { title: 'Current Reality', category: 'analysis' },
      { title: 'Recommended Move', category: 'recommendation' },
      { title: 'Risk & Guardrails', category: 'risk' },
    ],
  }

  const base = templates[profile] || templates['executive-deck']
  if (!includeReferences) {
    return base.concat(profile === 'pitch-deck' ? [] : [{ title: 'Next Step', category: 'conclusion' }]).slice(0, 6)
  }

  return [...base, { title: profile === 'investor-deck' ? 'Appendix / Sources' : 'References', category: 'references' }].slice(0, 6)
}

const REPORT_CITATION_REQUIREMENTS = {
  strict: { required: ['background', 'analysis', 'metrics', 'case-study', 'findings', 'risk'], optional: ['abstract', 'question', 'recommendation', 'conclusion'] },
  selective: { required: ['analysis', 'metrics', 'case-study'], optional: ['background', 'findings', 'risk'] },
  light: { required: [], optional: [] },
  none: { required: [], optional: [] },
}

const SLIDE_CITATION_REQUIREMENTS = {
  strict: { required: ['analysis', 'metrics', 'case-study'], optional: ['background', 'findings', 'risk'] },
  selective: { required: ['analysis', 'metrics'], optional: ['case-study'] },
  light: { required: [], optional: [] },
  none: { required: [], optional: [] },
}

const getCategoryCitationRequirement = (category = 'analysis', { artifactType = 'report', policy = {} } = {}) => {
  if (category === 'references') return policy.includeReferences ? 'required' : 'none'
  const requirementMap = artifactType === 'slides' ? SLIDE_CITATION_REQUIREMENTS : REPORT_CITATION_REQUIREMENTS
  const rules = requirementMap[policy.mode] || requirementMap.selective
  if (rules.required.includes(category)) return 'required'
  if (rules.optional.includes(category)) return 'optional'
  return 'none'
}

const getPolicyEvidenceLimit = ({ category = 'analysis', baseMaxEvidence = 0, artifactType = 'report', policy = {} } = {}) => {
  if (category === 'references') return policy.includeReferences ? policy.referenceLimit || baseMaxEvidence || 0 : 0
  if (policy.visibility !== 'inline') return 0

  const requirement = getCategoryCitationRequirement(category, { artifactType, policy })
  if (requirement === 'required') return baseMaxEvidence
  if (requirement === 'optional') return Math.min(baseMaxEvidence, 1)
  return 0
}

const applyCitationPolicyToOutlineItems = ({ items = [], artifactType = 'report', policy = {} } = {}) => (Array.isArray(items) ? items : []).map((item) => {
  const citationRequirement = getCategoryCitationRequirement(item?.category, { artifactType, policy })
  const maxEvidence = getPolicyEvidenceLimit({
    category: item?.category,
    baseMaxEvidence: Number(item?.maxEvidence || 0),
    artifactType,
    policy,
  })
  const citationDisplay = item?.category === 'references'
    ? 'bibliography'
    : (policy.visibility === 'inline' && citationRequirement !== 'none' ? 'inline' : policy.visibility)

  return {
    ...item,
    maxEvidence,
    citationRequirement,
    citationDisplay,
    showEvidenceSignals: policy.visibility === 'inline' && citationRequirement !== 'none',
    showEvidenceLines: policy.visibility === 'inline' && citationRequirement !== 'none',
  }
})

const detectOutlineCategory = (title = '', { artifactType = 'report', index = 0, total = 1 } = {}) => {
  const lowered = cleanText(title).toLowerCase()
  const matchedRule = OUTLINE_CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => lowered.includes(keyword)))
  if (matchedRule) return matchedRule.id

  if (artifactType === 'slides') {
    if (index === 0) return 'abstract'
    if (index === total - 1) return 'conclusion'
  }

  return index === 0 ? 'background' : 'analysis'
}

const getDefaultEvidenceLimit = (category = 'analysis', { artifactType = 'report' } = {}) => {
  const reportLimits = {
    abstract: 1,
    background: 1,
    question: 1,
    methodology: 0,
    analysis: 2,
    metrics: 1,
    'case-study': 2,
    findings: 2,
    recommendation: 2,
    risk: 1,
    conclusion: 1,
    references: 10,
  }
  const slideLimits = {
    abstract: 1,
    background: 1,
    question: 1,
    methodology: 0,
    analysis: 2,
    metrics: 2,
    'case-study': 3,
    findings: 2,
    recommendation: 2,
    risk: 1,
    conclusion: 1,
    references: 3,
  }
  const limits = artifactType === 'slides' ? slideLimits : reportLimits
  return limits[category] ?? (artifactType === 'slides' ? 2 : 1)
}

const buildOutlineEntries = ({ titles = [], artifactType = 'report', requestKeywords = [] } = {}) => titles.map((title, index, array) => {
  const category = detectOutlineCategory(title, { artifactType, index, total: array.length })
  return {
    id: `${artifactType === 'slides' ? 'slide' : 'section'}-${index + 1}`,
    title,
    category,
    keywords: uniqueSlideTexts([
      ...extractKeywordsFromText(title),
      ...requestKeywords.slice(0, 4),
    ]),
    maxEvidence: getDefaultEvidenceLimit(category, { artifactType }),
  }
})

const buildOutlineEntriesFromSpecs = ({ specs = [], artifactType = 'report', requestKeywords = [] } = {}) => (Array.isArray(specs) ? specs : []).map((spec, index, array) => {
  const title = typeof spec === 'string' ? spec : spec?.title || `${artifactType === 'slides' ? 'Slide' : 'Section'} ${index + 1}`
  const category = typeof spec === 'string'
    ? detectOutlineCategory(title, { artifactType, index, total: array.length })
    : cleanText(spec?.category || '') || detectOutlineCategory(title, { artifactType, index, total: array.length })

  return {
    id: `${artifactType === 'slides' ? 'slide' : 'section'}-${index + 1}`,
    title,
    category,
    keywords: uniqueSlideTexts([
      ...extractKeywordsFromText(title),
      ...requestKeywords.slice(0, 4),
    ]),
    maxEvidence: Number(spec?.maxEvidence || getDefaultEvidenceLimit(category, { artifactType })),
  }
})

const normalizeExplicitOutlineTitles = (items = [], { artifactType = 'report', maxItems = 6 } = {}) => uniqueBy(
  (Array.isArray(items) ? items : [])
    .map((item) => normalizeOutlineTitleFragment(item))
    .filter((item) => isLikelyOutlineTitle(item, { artifactType })),
  (item) => item.toLowerCase(),
).slice(0, maxItems)

const getContentDensityLimit = (textDensity = '', { artifactType = 'report' } = {}) => {
  const normalized = cleanText(textDensity).toLowerCase()
  if (artifactType === 'slides') {
    if (normalized === 'light') return 2
    if (normalized === 'dense') return 4
    return 3
  }

  if (normalized === 'light') return 3
  if (normalized === 'dense') return 5
  return 4
}

const buildCustomizationSummaryLines = (customization = {}) => [
  customization.briefDomain ? `- 도메인: ${customization.briefDomain}` : null,
  customization.visualTheme ? `- 시각 테마: ${customization.visualTheme}` : null,
  customization.visualPreset ? `- 테마 프리셋: ${customization.visualPreset}` : null,
  customization.textDensity ? `- 텍스트 양: ${customization.textDensity}` : null,
  customization.aiImageMode ? `- AI 이미지: ${customization.aiImageMode}` : null,
  customization.imageSource ? `- 이미지 출처: ${customization.imageSource}` : null,
  customization.imageStylePreset ? `- 이미지 스타일: ${customization.imageStylePreset}` : null,
  customization.cardCount ? `- 카드 수: ${customization.cardCount}` : null,
  customization.layoutPreset ? `- 레이아웃 모드: ${customization.layoutPreset}` : null,
  customization.language ? `- 언어: ${customization.language}` : null,
  customization.writingNote ? `- 추가 작성 메모: ${customization.writingNote}` : null,
  customization.toneNote ? `- 톤 메모: ${customization.toneNote}` : null,
].filter((line) => line !== null)

const buildReportSectionBlueprint = (dossier = {}, customization = {}) => {
  const request = cleanText(customization.reportRequest || '')
  const audience = cleanText(customization.audience || '')
  const requestKeywords = extractKeywordsFromText(request)
  const features = buildAssignmentFeatures(request)
  const structuredOutlineTitles = normalizeExplicitOutlineTitles(customization.reportOutlineTitles, { artifactType: 'report', maxItems: 6 })
  const explicitTitles = structuredOutlineTitles.length > 0
    ? structuredOutlineTitles
    : extractExplicitOutlineTitles(request, { artifactType: 'report', maxItems: 6 })
  const citationPolicy = buildArtifactCitationPolicy({
    request,
    artifactType: 'report',
    features,
    explicitTitles,
    explicitMode: customization.reportCitationMode,
    explicitVisibility: customization.reportCitationVisibility,
  })
  const profile = detectArtifactProfile({
    artifactType: 'report',
    request,
    audience,
    citationPolicy,
    presetId: customization.reportStylePreset,
  })

  let titles = []
  let specs = []
  let source = 'derived'

  if (explicitTitles.length >= 2) {
    titles = explicitTitles
    source = 'explicit'
  } else {
    specs = buildReportProfileSpecs({
      profile,
      includeReferences: citationPolicy.includeReferences,
    })
    if (features.wantsComparison && profile === 'evidence-analysis') {
      specs = [
        { title: '과제 개요', category: 'abstract' },
        { title: '비교 기준', category: 'question' },
        { title: '대안 비교 분석', category: 'analysis' },
        { title: '리스크와 한계', category: 'risk' },
        { title: '권고안', category: 'recommendation' },
        ...(citationPolicy.includeReferences ? [{ title: '참고문헌', category: 'references' }] : []),
      ]
    } else if (features.wantsCases && profile !== 'executive-brief') {
      specs = [
        { title: '과제 개요', category: 'abstract' },
        { title: profile === 'university-paper' ? '이론적 배경' : '문제 배경', category: 'background' },
        { title: '핵심 사례와 근거', category: 'case-study' },
        { title: '시사점 및 한계', category: 'risk' },
        { title: profile === 'university-paper' ? '결론 및 제언' : '권고안', category: profile === 'university-paper' ? 'conclusion' : 'recommendation' },
        ...(citationPolicy.includeReferences ? [{ title: profile === 'executive-brief' ? 'Appendix / Sources' : '참고문헌', category: 'references' }] : []),
      ]
    }
  }

  const hasReferenceSection = titles.some((title) => /참고문헌|references|bibliography|출처/i.test(cleanText(title)))
  if (citationPolicy.includeReferences && !hasReferenceSection) {
    titles = titles.length >= 6 ? [...titles.slice(0, 5), '참고문헌'] : [...titles, '참고문헌']
  }

  if (!citationPolicy.includeReferences) {
    titles = titles.filter((title) => !/참고문헌|references|bibliography|출처/i.test(cleanText(title)))
  }

  return {
    source,
    profile,
    citationPolicy,
    sections: applyCitationPolicyToOutlineItems({
      items: source === 'explicit'
        ? buildOutlineEntries({ titles: titles.slice(0, 6), artifactType: 'report', requestKeywords })
        : buildOutlineEntriesFromSpecs({ specs: specs.slice(0, 6), artifactType: 'report', requestKeywords }),
      artifactType: 'report',
      policy: citationPolicy,
    }),
  }
}

const buildSlideBlueprint = (dossier = {}, customization = {}) => {
  const request = cleanText(customization.slideRequest || '')
  const audience = cleanText(customization.audience || '')
  const requestKeywords = extractKeywordsFromText(request)
  const features = buildAssignmentFeatures(request)
  const requestedCount = parseRequestedSlideCount(request) || 6
  const structuredOutlineTitles = normalizeExplicitOutlineTitles(customization.slideOutlineTitles, { artifactType: 'slides', maxItems: requestedCount })
  const explicitTitles = structuredOutlineTitles.length > 0
    ? structuredOutlineTitles
    : extractExplicitOutlineTitles(request, { artifactType: 'slides', maxItems: requestedCount })
  const citationPolicy = buildArtifactCitationPolicy({
    request,
    artifactType: 'slides',
    features,
    explicitTitles,
    explicitMode: customization.slideCitationMode,
    explicitVisibility: customization.slideCitationVisibility,
  })
  const profile = detectArtifactProfile({
    artifactType: 'slides',
    request,
    audience,
    citationPolicy,
    presetId: customization.slideStylePreset,
  })

  let titles = []
  let specs = []
  let source = 'derived'

  if (explicitTitles.length >= 2) {
    titles = explicitTitles.slice(0, requestedCount)
    source = 'explicit'
  } else {
    specs = buildSlideProfileSpecs({
      profile,
      includeReferences: citationPolicy.includeReferences && citationPolicy.preferReferenceSlide,
      title: customization.slideTitle || dossier.topic,
    })
    if (features.wantsComparison && profile !== 'pitch-deck') {
      specs = [
        { title: customization.slideTitle || dossier.topic, category: 'abstract' },
        { title: 'Comparison Frame', category: 'question' },
        { title: 'Alternative A vs B', category: 'analysis' },
        { title: 'Trade-offs', category: 'risk' },
        { title: citationPolicy.includeReferences && citationPolicy.preferReferenceSlide ? 'References' : 'Decision / Next Step', category: citationPolicy.includeReferences && citationPolicy.preferReferenceSlide ? 'references' : 'conclusion' },
      ]
    }
  }

  if (source === 'derived' && features.wantsNextAction && titles.length > 0) {
    titles[titles.length - 1] = 'Next Action'
  }

  const hasReferenceSlide = titles.some((title) => /참고문헌|참고자료|references|bibliography|출처/i.test(cleanText(title)))
  if (citationPolicy.includeReferences && citationPolicy.preferReferenceSlide && !hasReferenceSlide && titles.length < requestedCount) {
    titles = [...titles, '참고자료']
  }

  if (!citationPolicy.includeReferences) {
    titles = titles.filter((title) => !/참고문헌|참고자료|references|bibliography|출처/i.test(cleanText(title)))
  }

  return {
    source,
    profile,
    citationPolicy,
    slides: applyCitationPolicyToOutlineItems({
      items: source === 'explicit'
        ? buildOutlineEntries({ titles: titles.slice(0, requestedCount), artifactType: 'slides', requestKeywords })
        : buildOutlineEntriesFromSpecs({ specs: specs.slice(0, requestedCount), artifactType: 'slides', requestKeywords }),
      artifactType: 'slides',
      policy: citationPolicy,
    }),
  }
}

const buildEvidenceSearchText = (item = {}) => {
  const metadata = item?.metadata || {}
  return [
    item?.label,
    item?.excerpt,
    metadata?.venue,
    metadata?.sourceLabel,
    metadata?.doi,
    Array.isArray(metadata?.authors) ? metadata.authors.join(' ') : '',
    Array.isArray(metadata?.sourceProviders) ? metadata.sourceProviders.join(' ') : '',
    Array.isArray(metadata?.benchmarkSignals?.matchedTerms) ? metadata.benchmarkSignals.matchedTerms.join(' ') : '',
    metadata?.venueSignals?.emphasisLabel || '',
    Array.isArray(item?.artifactPriorityReasons) ? item.artifactPriorityReasons.join(' ') : '',
  ].filter(Boolean).join(' ').toLowerCase()
}

const computeKeywordOverlapScore = (keywords = [], evidenceText = '') => uniqueSlideTexts(keywords).reduce((sum, keyword) => {
  if (!evidenceText.includes(String(keyword || '').toLowerCase())) return sum
  return sum + (String(keyword).length >= 4 ? 12 : 8)
}, 0)

const computeEvidenceAssignmentScore = (item = {}, outlineItem = {}, { usedCount = 0, index = 0 } = {}) => {
  const metadata = item?.metadata || {}
  const evidenceText = buildEvidenceSearchText(item)
  const citationScore = Number(item?.citationScore || 0)
  const scholarlyScore = getEvidenceScholarlyScore(item)
  const priorityScore = Number(item?.artifactPriorityScore || 0)

  let score = citationScore * 0.34 + scholarlyScore * 0.42 + priorityScore * 0.18
  score += computeKeywordOverlapScore(outlineItem?.keywords, evidenceText)

  if (outlineItem?.category === 'references') score += 60 - index
  if (outlineItem?.category === 'background' && /(review|survey|overview|현황|배경|trend|시장)/.test(evidenceText)) score += 12
  if (outlineItem?.category === 'analysis' && (metadata?.peerReviewed || Array.isArray(metadata?.sourceProviders) && metadata.sourceProviders.length > 1)) score += 14
  if (outlineItem?.category === 'metrics' && /(score|benchmark|leaderboard|지표|수치|metric)/.test(evidenceText)) score += 18
  if (outlineItem?.category === 'case-study' && /(case|사례|benchmark|기업|company|country|survey|experiment|dataset|정책)/.test(evidenceText)) score += 18
  if (outlineItem?.category === 'recommendation' && /(strategy|전략|policy|거버넌스|governance|implementation|adoption|deployment|시장|investment|기업)/.test(evidenceText)) score += 16
  if (outlineItem?.category === 'risk' && /(risk|리스크|한계|gap|limitation|bias|uncertainty|challenge|failure|regulation|규제|cost)/.test(evidenceText)) score += 18
  if (usedCount > 0 && outlineItem?.category !== 'references') score -= usedCount * 16

  return score
}

const assignEvidenceToOutlineItems = ({ items = [], evidence = [] } = {}) => {
  const usageCounts = new Map()

  return (Array.isArray(items) ? items : []).map((outlineItem) => {
    const maxEvidence = Math.max(0, Number(outlineItem?.maxEvidence || 0))
    if (maxEvidence === 0 || !Array.isArray(evidence) || evidence.length === 0) {
      return { ...outlineItem, evidenceItems: [] }
    }

    const ranked = evidence
      .map((item, index) => ({
        item,
        index,
        score: computeEvidenceAssignmentScore(item, outlineItem, {
          usedCount: usageCounts.get(item?.id || item?.url || item?.label || index) || 0,
          index,
        }),
      }))
      .sort((left, right) => right.score - left.score || Number(right.item?.citationScore || 0) - Number(left.item?.citationScore || 0))

    const selectedItems = []

    for (const candidate of ranked) {
      const candidateKey = candidate.item?.id || candidate.item?.url || candidate.item?.label || String(candidate.index)
      if (selectedItems.some((item) => (item?.id || item?.url || item?.label) === candidateKey)) continue
      selectedItems.push(candidate.item)
      usageCounts.set(candidateKey, (usageCounts.get(candidateKey) || 0) + 1)
      if (selectedItems.length >= maxEvidence) break
    }

    if (selectedItems.length === 0 && ranked[0]?.item) {
      selectedItems.push(ranked[0].item)
    }

    return {
      ...outlineItem,
      evidenceItems: selectedItems.slice(0, maxEvidence),
    }
  })
}

const buildEvidenceInsightBullets = (items = [], { maxItems = 2, includeExcerpt = false, maxLength = 110 } = {}) => uniqueSlideTexts(
  (Array.isArray(items) ? items : []).slice(0, maxItems).map((item) => {
    const label = truncate(item?.label || '근거 없음', Math.min(76, maxLength))
    const excerpt = includeExcerpt ? cleanStrategicText(item?.excerpt || '', Math.max(32, maxLength - 40)) : ''
    const venue = cleanText(item?.metadata?.venue || item?.metadata?.sourceLabel || item?.provider || '')
    return compactSlideText([label, excerpt, venue ? `출처 ${venue}` : ''].filter(Boolean).join(' · '), maxLength)
  }).filter(Boolean)
).slice(0, maxItems)

const buildSectionEvidenceLines = (items = [], { maxItems = 2, includeExcerpt = false } = {}) => uniqueSlideTexts(
  (Array.isArray(items) ? items : []).slice(0, maxItems).map((item) => {
    const excerpt = includeExcerpt ? cleanStrategicText(item?.excerpt || '', 72) : ''
    return compactSlideText([
      formatEvidenceReference(item, { compact: true }),
      excerpt ? `발췌 ${excerpt}` : '',
      cleanText(item?.url || ''),
    ].filter(Boolean).join(' | '), 220)
  }).filter(Boolean)
).slice(0, maxItems)

const buildReportReferenceLines = (items = []) => (Array.isArray(items) ? items : [])
  .slice(0, 10)
  .map((item, index) => `${index + 1}. ${formatEvidenceReference(item, { compact: true })}${cleanText(item?.url || '') ? ` | ${cleanText(item.url)}` : ''}`)

const buildGeneralDossierMetricLines = (dossier = {}, { includeEvidence = false } = {}) => {
  const claimCount = Number(dossier?.metrics?.claimCount || dossier?.claims?.length || 0)
  const actionCount = Number(dossier?.metrics?.actionItemCount || dossier?.actionItems?.length || 0)
  const evidenceCount = Number(dossier?.metrics?.evidenceCount || dossier?.evidence?.length || 0)

  return [
    `준비도 · ${dossier?.readinessScore || 0}/100`,
    claimCount > 0 ? `핵심 주장 · ${claimCount}개` : '',
    actionCount > 0 ? `실행 항목 · ${actionCount}개` : '',
    includeEvidence && evidenceCount > 0 ? `참고 근거 후보 · ${evidenceCount}개` : '',
  ].filter(Boolean)
}

const buildReportSectionSummaryBullets = ({ section = {}, dossier = {}, customization = {}, context = {} } = {}) => {
  const claims = context.claims || []
  const actionItems = context.actionItems || []
  const participantViews = context.participantViews || []
  const evidenceGaps = context.evidenceGaps || []
  const consensusPoints = context.consensusPoints || []
  const disagreementPoints = context.disagreementPoints || []
  const methodologyLines = context.methodologyLines || []
  const emphasizeEvidence = context.emphasizeEvidence === true
  const evidenceInsights = section.showEvidenceSignals
    ? buildEvidenceInsightBullets(section.evidenceItems, {
      maxItems: section.category === 'case-study' ? 3 : 2,
      includeExcerpt: section.category === 'case-study',
      maxLength: 108,
    })
    : []
  const generalMetricLines = buildGeneralDossierMetricLines(dossier, { includeEvidence: emphasizeEvidence })

  switch (section.category) {
    case 'abstract':
      return uniqueSlideTexts([
        dossier.executiveSummary || '',
        dossier.consensusSnapshot || '',
        claims[0] ? `핵심 주장 · ${claims[0]}` : '',
        evidenceInsights[0]
          ? `대표 근거 · ${evidenceInsights[0]}`
          : (!emphasizeEvidence && generalMetricLines[1] ? generalMetricLines[1] : ''),
      ]).slice(0, 4)
    case 'background':
      return uniqueSlideTexts([
        `주제 · ${dossier.topic}`,
        customization.reportRequest ? `요청 초점 · ${compactSlideText(customization.reportRequest, 96)}` : '',
        claims[0] ? `쟁점 · ${claims[0]}` : '',
        participantViews[0] ? `관점 · ${participantViews[0]}` : '',
      ]).slice(0, 4)
    case 'question':
      return uniqueSlideTexts([
        `과제 주제 · ${dossier.topic}`,
        customization.audience ? `독자 · ${compactSlideText(customization.audience, 72)}` : '',
        customization.reportRequest ? `요구 사항 · ${compactSlideText(customization.reportRequest, 92)}` : '',
      ]).slice(0, 4)
    case 'methodology':
      return methodologyLines.slice(0, 4)
    case 'analysis':
      return uniqueSlideTexts([
        ...claims.slice(0, 2).map((claim) => `주장 · ${claim}`),
        ...evidenceInsights.map((line) => `근거 · ${line}`),
        consensusPoints[0] ? `합의 · ${compactSlideText(consensusPoints[0], 90)}` : '',
      ]).slice(0, 4)
    case 'metrics':
      return uniqueSlideTexts(
        (section.showEvidenceSignals
          ? buildCitationSummaryLines(dossier.citationSummary, dossier.scholarlySummary)
          : generalMetricLines)
          .map((line) => compactSlideText(line, 100))
      ).slice(0, 4)
    case 'case-study':
      return uniqueSlideTexts([
        ...evidenceInsights.map((line) => `사례 · ${line}`),
        participantViews[0] ? `관점 · ${participantViews[0]}` : '',
      ]).slice(0, 4)
    case 'findings':
      return uniqueSlideTexts([
        dossier.consensusSnapshot || '',
        ...consensusPoints.map((point) => `핵심 · ${compactSlideText(point, 92)}`),
        evidenceInsights[0] ? `근거 · ${evidenceInsights[0]}` : '',
      ]).slice(0, 4)
    case 'recommendation':
      return uniqueSlideTexts([
        ...actionItems,
        dossier.nextStep ? `다음 단계 · ${cleanStrategicText(dossier.nextStep, 92)}` : '',
        evidenceInsights[0] ? `근거 · ${evidenceInsights[0]}` : '',
      ]).slice(0, 4)
    case 'risk':
      return uniqueSlideTexts([
        ...disagreementPoints.map((point) => `쟁점 · ${cleanStrategicText(point, 92)}`),
        ...evidenceGaps.map((gap) => `검증 공백 · ${cleanStrategicText(gap, 92)}`),
        dossier.citationSummary?.recommendedAction ? `품질 메모 · ${compactSlideText(dossier.citationSummary.recommendedAction, 92)}` : '',
      ]).slice(0, 4)
    case 'conclusion':
      return uniqueSlideTexts([
        dossier.consensusSnapshot || '',
        dossier.nextStep ? `결론 · ${cleanStrategicText(dossier.nextStep, 92)}` : '',
        `준비도 · ${dossier.readinessScore || 0}/100`,
        emphasizeEvidence && dossier.citationSummary?.averageCitationScore ? `평균 citation · ${dossier.citationSummary.averageCitationScore}/100` : '',
      ]).slice(0, 4)
    case 'references':
      return buildReportReferenceLines(section.evidenceItems.length > 0 ? section.evidenceItems : dossier.evidence || [])
    default:
      return uniqueSlideTexts([
        ...claims.slice(0, 2).map((claim) => `주장 · ${claim}`),
        ...evidenceInsights.map((line) => `근거 · ${line}`),
        dossier.executiveSummary || '',
      ]).slice(0, 4)
  }
}

const buildReportSections = (dossier = {}, customization = {}) => {
  const blueprint = buildReportSectionBlueprint(dossier, customization)
  const summaryDensityLimit = getContentDensityLimit(customization.textDensity, { artifactType: 'report' })
  const assignedSections = assignEvidenceToOutlineItems({
    items: blueprint.sections,
    evidence: dossier.evidence || [],
  })
  const emphasizeEvidence = ['strict', 'selective'].includes(blueprint.citationPolicy?.mode)
  const context = {
    claims: (dossier.claims || []).map((claim) => cleanStrategicText(claim.statement, 96)).filter(Boolean),
    actionItems: (dossier.actionItems || []).map((item) => `[${item.horizon}] ${cleanStrategicText(item.text, 92)}`).filter(Boolean),
    participantViews: (dossier.participantViews || []).map((view) => `${view.godName}: ${cleanStrategicText(view.summary, 88)}`).filter(Boolean),
    evidenceGaps: dossier.evidenceGaps || [],
    consensusPoints: dossier?.sections?.consensusPoints || [],
    disagreementPoints: dossier?.sections?.disagreements || [],
    emphasizeEvidence,
    methodologyLines: emphasizeEvidence
      ? [
        '멀티 에이전트 토론 결과를 바탕으로 주장, 반론, 실행 항목을 구조화했습니다.',
        '실시간 학술 검색 결과에서 citation, scholar score, peer-reviewed/preprint, 다중 인덱싱 신호를 함께 평가했습니다.',
        '직접 인용은 제공된 발췌/초록 범위 안에서만 사용하고, 각 근거에는 원문 링크를 함께 남겼습니다.',
        '커뮤니티 신호는 보조 근거로만 사용하고, 학술 신호가 강한 순서대로 우선 배치했습니다.',
      ]
      : [
        '멀티 에이전트 토론 결과를 바탕으로 주장, 반론, 실행 항목을 구조화했습니다.',
        '사용자 요청에 맞춰 핵심 쟁점과 실행 포인트를 먼저 드러내도록 보고서 흐름을 정리했습니다.',
        '학술 근거가 필수 과제가 아닌 경우 본문에서는 전달력과 실행성을 우선했습니다.',
        '필요한 출처는 참고문헌 영역이나 마지막 정리 파트에만 모으도록 제어했습니다.',
      ],
  }

  return {
    source: blueprint.source,
    profile: blueprint.profile,
    citationPolicy: blueprint.citationPolicy,
    sections: assignedSections.map((section) => ({
      ...section,
      evidenceItems: section.category === 'references'
        ? (section.evidenceItems.length > 0 ? section.evidenceItems.slice(0, blueprint.citationPolicy.referenceLimit) : (dossier.evidence || []).slice(0, blueprint.citationPolicy.referenceLimit))
        : section.evidenceItems,
      summaryBullets: buildReportSectionSummaryBullets({
        section: {
          ...section,
          evidenceItems: section.category === 'references'
            ? (section.evidenceItems.length > 0 ? section.evidenceItems.slice(0, blueprint.citationPolicy.referenceLimit) : (dossier.evidence || []).slice(0, blueprint.citationPolicy.referenceLimit))
            : section.evidenceItems,
        },
        dossier,
        customization,
        context,
      }).slice(0, summaryDensityLimit),
      evidenceLines: section.category === 'references' || !section.showEvidenceLines
        ? []
        : buildSectionEvidenceLines(section.evidenceItems, {
          maxItems: section.maxEvidence || 2,
          includeExcerpt: section.category === 'case-study',
        }),
    })),
  }
}

const buildReportCitationLedger = (reportSections = [], citationPolicy = {}) => {
  if (!citationPolicy?.includeLedger) return []

  return (Array.isArray(reportSections) ? reportSections : [])
  .map((section) => buildCitationLedgerEntry({
    locationType: 'report_section',
    locationId: section?.id || '',
    locationLabel: `Report / ${cleanText(section?.title || section?.id || 'Section')}`,
    items: section?.evidenceItems || [],
  }))
  .filter(Boolean)
}

export const buildSlideCitationLedger = (slides = [], citationPolicy = {}) => {
  if (!citationPolicy?.includeLedger) return []

  return (Array.isArray(slides) ? slides : [])
  .map((slide, index) => {
    const citations = Array.isArray(slide?.citationRefs) ? slide.citationRefs : []
    if (citations.length === 0) return null

    return {
      locationType: 'slide',
      locationId: `slide-${index + 1}`,
      locationLabel: `Slide ${index + 1} / ${cleanText(slide?.title || `Slide ${index + 1}`)}`,
      evidenceIds: uniqueSlideTexts(citations.map((item) => item.evidenceId)).slice(0, 8),
      citations,
    }
  })
  .filter(Boolean)
}

const buildRoadmapBullets = ({ dossier, disagreementPoints = [] } = {}) => {
  const explicitActions = (dossier?.actionItems || [])
    .map((item) => {
      const actionText = cleanStrategicText(item.text || '', 84)
      return actionText ? `[${item.horizon || '우선'}] ${actionText}` : ''
    })
    .filter(Boolean)

  if (explicitActions.length >= 2) return uniqueSlideTexts(explicitActions).slice(0, 3)

  return uniqueSlideTexts([
    ...explicitActions,
    disagreementPoints[0] ? `검증 과제 · ${cleanStrategicText(disagreementPoints[0], 80)}` : '',
    dossier?.evidenceGaps?.[0] ? `보강 과제 · ${cleanStrategicText(dossier.evidenceGaps[0], 80)}` : '',
    dossier?.nextStep ? `다음 단계 · ${cleanStrategicText(dossier.nextStep, 82)}` : '',
    '실행 메모 · 최종 합의안을 1페이지 브리프로 다시 정리합니다.',
  ]).slice(0, 3)
}

const getSlideLayoutForCategory = (category = 'analysis', index = 0, total = 1, profile = '') => {
  if (profile === 'research-presentation') {
    if (category === 'methodology') return 'split'
    if (category === 'analysis') return 'evidence'
    if (category === 'risk' || category === 'conclusion') return 'closing'
  }

  if (profile === 'investor-deck' || profile === 'executive-deck') {
    if (category === 'recommendation') return 'roadmap'
    if (category === 'metrics') return 'metrics'
    if (category === 'references') return 'evidence'
  }

  switch (category) {
    case 'abstract':
      return index === 0 ? 'hero' : 'split'
    case 'background':
    case 'question':
      return 'split'
    case 'analysis':
    case 'case-study':
    case 'references':
      return 'evidence'
    case 'metrics':
      return 'metrics'
    case 'recommendation':
      return 'roadmap'
    case 'risk':
      return index === total - 1 ? 'closing' : 'split'
    case 'conclusion':
      return 'closing'
    default:
      return index === 0 ? 'hero' : 'split'
  }
}

const getSlideAccentForCategory = (category = 'analysis', profile = '') => {
  if (profile === 'investor-deck') {
    switch (category) {
      case 'abstract': return 'slate'
      case 'background': return 'cobalt'
      case 'analysis': return 'amber'
      case 'metrics': return 'emerald'
      case 'recommendation': return 'teal'
      case 'risk':
      case 'conclusion':
      case 'references': return 'slate'
      default: return 'teal'
    }
  }

  if (profile === 'research-presentation') {
    switch (category) {
      case 'abstract': return 'cobalt'
      case 'background': return 'slate'
      case 'methodology': return 'teal'
      case 'analysis': return 'amber'
      case 'risk':
      case 'conclusion': return 'rose'
      case 'references': return 'slate'
      default: return 'teal'
    }
  }

  switch (category) {
    case 'abstract': return 'emerald'
    case 'background':
    case 'question': return 'cobalt'
    case 'analysis':
    case 'case-study':
    case 'references': return 'amber'
    case 'metrics': return 'teal'
    case 'recommendation': return 'slate'
    case 'risk':
    case 'conclusion': return 'rose'
    default: return 'teal'
  }
}

const getSlideKickerForCategory = (category = 'analysis', profile = '') => {
  if (profile === 'investor-deck') {
    switch (category) {
      case 'abstract': return 'Board / Investor View'
      case 'background': return 'Why now'
      case 'analysis': return 'Opportunity frame'
      case 'metrics': return 'Economics / KPI'
      case 'recommendation': return 'Operating move'
      case 'risk': return 'Risk / guardrails'
      case 'references': return 'Appendix / sources'
      default: return 'Decision support'
    }
  }

  if (profile === 'research-presentation') {
    switch (category) {
      case 'abstract': return 'Seminar opening'
      case 'question': return 'Research question'
      case 'background': return 'Background'
      case 'methodology': return 'Method'
      case 'analysis': return 'Findings'
      case 'risk': return 'Discussion'
      case 'references': return 'Source trail'
      default: return 'Research flow'
    }
  }

  if (profile === 'pitch-deck') {
    switch (category) {
      case 'abstract': return 'Core story'
      case 'background': return 'Pain'
      case 'analysis': return 'Promise'
      case 'metrics': return 'Why it wins'
      case 'conclusion': return 'Next move'
      default: return 'Narrative deck'
    }
  }

  switch (category) {
    case 'abstract': return 'Debate -> Dossier -> Deck'
    case 'background': return 'Context'
    case 'question': return 'Assignment frame'
    case 'analysis': return 'Core analysis'
    case 'metrics': return 'Signal quality'
    case 'case-study': return 'Evidence base'
    case 'recommendation': return 'Action now'
    case 'risk': return 'Risk and gaps'
    case 'conclusion': return 'Decide next'
    case 'references': return 'Source trail'
    default: return 'Structured brief'
  }
}

const buildSlidePlan = (dossier = {}, customization = {}) => {
  const blueprint = buildSlideBlueprint(dossier, customization)
  return {
    source: blueprint.source,
    profile: blueprint.profile,
    citationPolicy: blueprint.citationPolicy,
    slides: assignEvidenceToOutlineItems({
      items: blueprint.slides,
      evidence: dossier.evidence || [],
    }),
  }
}

export const normalizeSlideOutline = (slides = []) => (Array.isArray(slides) ? slides : [])
  .map((slide, index) => ({
    title: truncate(slide?.title || `Slide ${index + 1}`, 90),
    category: cleanText(slide?.category || ''),
    kicker: truncate(slide?.kicker || '', 48),
    layout: cleanText(slide?.layout || (index === 0 ? 'hero' : 'content')).toLowerCase(),
    accent: cleanText(slide?.accent || '').toLowerCase(),
    citationRequirement: cleanText(slide?.citationRequirement || ''),
    citationDisplay: cleanText(slide?.citationDisplay || ''),
    bullets: (Array.isArray(slide?.bullets) ? slide.bullets : [])
      .map((bullet) => compactSlideText(bullet, 120))
      .filter(Boolean)
      .slice(0, 5),
    highlights: normalizeSlideDataPoints(slide?.highlights, { maxItems: 4, preferValue: true }),
    metrics: normalizeSlideDataPoints(slide?.metrics, { maxItems: 4, preferValue: true }),
    quote: compactSlideText(slide?.quote || '', 140),
    footer: compactSlideText(slide?.footer || '', 96),
    citations: (Array.isArray(slide?.citations) ? slide.citations : [])
      .map((citation) => cleanText(citation))
      .filter(Boolean)
      .slice(0, 3),
    citationRefs: (Array.isArray(slide?.citationRefs) ? slide.citationRefs : [])
      .map((citation) => ({
        evidenceId: cleanText(citation?.evidenceId || ''),
        label: truncate(citation?.label || '', 140),
        url: cleanText(citation?.url || '') || null,
        sourceKind: cleanText(citation?.sourceKind || '') || null,
        type: cleanText(citation?.type || '') || null,
        citationScore: Number(citation?.citationScore || 0),
        scholarlyScore: Number(citation?.scholarlyScore || 0),
        note: cleanText(citation?.note || ''),
      }))
      .filter((citation) => citation.evidenceId || citation.label || citation.url)
      .slice(0, 4),
  }))
  .filter((slide) => slide.title)

export const enforceSlideCitationPolicy = (slides = [], citationPolicy = {}, fallbackEvidence = []) => {
  const normalizedSlides = normalizeSlideOutline(slides)
  if (!citationPolicy?.mode) return normalizedSlides

  if (citationPolicy.mode === 'none' || citationPolicy.visibility === 'hidden') {
    return normalizedSlides.map((slide) => ({
      ...slide,
      citations: [],
      citationRefs: [],
    }))
  }

  if (citationPolicy.visibility !== 'bibliography-only') {
    return normalizedSlides.map((slide) => ((slide.citationDisplay === 'inline' || slide.category === 'references')
      ? slide
      : {
        ...slide,
        citations: [],
        citationRefs: [],
      }))
  }

  const targetIndex = normalizedSlides.findIndex((slide) => slide.category === 'references' || slide.citationDisplay === 'bibliography')
  const bibliographyIndex = targetIndex >= 0 ? targetIndex : Math.max(0, normalizedSlides.length - 1)
  const fallbackItems = (Array.isArray(fallbackEvidence) ? fallbackEvidence : []).slice(0, citationPolicy.referenceLimit || 3)
  const fallbackCitations = fallbackItems.map((item, index) => buildSlideCitationNote(item, index)).filter(Boolean).slice(0, citationPolicy.referenceLimit || 3)
  const fallbackRefs = fallbackItems.map((item, index) => buildCitationRecord(item, index)).slice(0, citationPolicy.referenceLimit || 3)
  const fallbackBullets = buildReportReferenceLines(fallbackItems)
    .slice(0, citationPolicy.referenceLimit || 3)
    .map((line) => compactSlideText(line, 108))
    .filter(Boolean)

  return normalizedSlides.map((slide, index) => {
    if (index !== bibliographyIndex) {
      return {
        ...slide,
        citations: [],
        citationRefs: [],
      }
    }

    const nextCitations = slide.citations.length > 0 ? slide.citations : fallbackCitations
    const nextCitationRefs = slide.citationRefs.length > 0 ? slide.citationRefs : fallbackRefs

    return {
      ...slide,
      bullets: slide.category === 'references' && slide.bullets.length === 0 ? fallbackBullets : slide.bullets,
      citations: nextCitations,
      citationRefs: nextCitationRefs,
      footer: slide.footer || (slide.category === 'references' ? '' : '참고문헌을 마지막 slide에 모아 표기했습니다.'),
    }
  })
}

export const buildSlideMarkdown = (slides = []) => normalizeSlideOutline(slides).map((slide, index) => [
  `## Slide ${index + 1}. ${slide.title}`,
  '',
  slide.kicker ? `_${slide.kicker}_` : null,
  slide.kicker ? '' : null,
  markdownBulletList(slide.bullets, '- 내용 없음'),
  slide.highlights.length > 0 ? '' : null,
  slide.highlights.length > 0 ? '### Highlights' : null,
  slide.highlights.length > 0 ? markdownBulletList(slide.highlights.map((item) => formatSlideDataPoint(item))) : null,
  slide.metrics.length > 0 ? '' : null,
  slide.metrics.length > 0 ? '### Metrics' : null,
  slide.metrics.length > 0 ? markdownBulletList(slide.metrics.map((item) => formatSlideDataPoint(item))) : null,
  slide.quote ? '' : null,
  slide.quote ? `> ${slide.quote}` : null,
  slide.footer ? '' : null,
  slide.footer ? `_${slide.footer}_` : null,
  slide.citations.length > 0 ? '' : null,
  slide.citations.length > 0 ? '### Notes / Citations' : null,
  slide.citations.length > 0 ? markdownBulletList(slide.citations) : null,
].filter((line) => line !== null).join('\n')).join('\n\n')

const buildCitationSummaryLines = (citationSummary = {}, scholarlySummary = {}) => {
  if ((!citationSummary || !citationSummary.averageCitationScore) && !scholarlySummary?.academicEvidenceCount) {
    return ['citation 점수 데이터 없음']
  }

  return [
    `평균 citation 점수: ${citationSummary.averageCitationScore}/100`,
    `검증 완료 근거: ${citationSummary.verifiedCount || 0}개`,
    `학술 근거: ${citationSummary.scholarlyCount || 0}개`,
    `Peer-reviewed 추정 근거: ${citationSummary.peerReviewedCount || 0}개`,
    `프리프린트 근거: ${citationSummary.preprintCount || 0}개`,
    scholarlySummary.averageScholarlyScore ? `평균 scholar 점수: ${scholarlySummary.averageScholarlyScore}/100` : null,
    scholarlySummary.strongScholarlyCount ? `강한 학술 근거: ${scholarlySummary.strongScholarlyCount}개` : null,
    scholarlySummary.benchmarkBackedCount ? `benchmark/leaderboard 연계: ${scholarlySummary.benchmarkBackedCount}개` : null,
    scholarlySummary.communityBackedCount ? `HF/community 보강: ${scholarlySummary.communityBackedCount}개` : null,
    `고품질 근거: ${citationSummary.highQualityCount || 0}개`,
    `재검토 필요 근거: ${citationSummary.needsReviewCount || 0}개`,
    citationSummary.recommendedAction ? `권고: ${citationSummary.recommendedAction}` : null,
  ].filter(Boolean)
}

const buildScholarlySignalLines = (scholarlySummary = {}) => {
  if (!scholarlySummary || !scholarlySummary.academicEvidenceCount) {
    return ['학술 신호 집계 없음']
  }

  const topEvidenceLines = (Array.isArray(scholarlySummary.topEvidence) ? scholarlySummary.topEvidence : [])
    .slice(0, 2)
    .map((item) => {
      const details = [
        Number(item.scholarlyScore || 0) > 0 ? `scholar ${item.scholarlyScore}/100` : '',
        Number(item.citationScore || 0) > 0 ? `citation ${item.citationScore}/100` : '',
        Array.isArray(item.artifactPriorityReasons) ? item.artifactPriorityReasons.join(' · ') : '',
      ].filter(Boolean).join(' · ')
      return `우선 근거: ${truncate(item.label || '', 120)}${details ? ` (${details})` : ''}`
    })

  return [
    ...(Array.isArray(scholarlySummary.summaryLines) ? scholarlySummary.summaryLines : []),
    ...topEvidenceLines,
    scholarlySummary.recommendedAction || null,
  ].filter(Boolean)
}

const buildReportMarkdown = (dossier, customization = {}, reportPlanInput = null) => {
  const reportPlan = reportPlanInput || buildReportSections(dossier, customization)
  const reportCitationLedger = buildReportCitationLedger(reportPlan.sections, reportPlan.citationPolicy)
  const useParagraphSections = reportPlan.profile === 'university-paper'
  const reportSectionsMarkdown = reportPlan.sections.flatMap((section) => [
    `## ${section.title}`,
    useParagraphSections
      ? (Array.isArray(section.summaryBullets) && section.summaryBullets.length > 0
        ? section.summaryBullets.map((line) => cleanText(line)).filter(Boolean).join('\n\n')
        : '내용 없음')
      : markdownBulletList(section.summaryBullets, '- 내용 없음'),
    section.evidenceLines.length > 0 ? '' : null,
    section.evidenceLines.length > 0 ? '### Citations' : null,
    section.evidenceLines.length > 0 ? markdownBulletList(section.evidenceLines, '- 섹션별 인용 없음') : null,
    '',
  ].filter((line) => line !== null))

  return [
    `# ${customization.reportTitle || `${dossier.topic} 보고서`}`,
    '',
    `- 생성 시각: ${dossier.generatedAt}`,
    `- Debate ID: ${dossier.debateId || 'pending'}`,
    `- Dossier 상태: ${dossier.statusLabel || dossier.status}`,
    `- 준비도: ${dossier.readinessScore || 0}/100`,
    customization.audience ? `- 독자: ${customization.audience}` : null,
    customization.reportRequest ? `- 사용자 요청: ${customization.reportRequest}` : null,
    ...buildCustomizationSummaryLines(customization),
    reportPlan.profile ? `- 작성 프로필: ${reportPlan.profile}` : null,
    `- 섹션 설계: ${reportPlan.source === 'explicit' ? '사용자 지정 과제 파트 반영' : '요청 기반 자동 설계'}`,
    reportPlan.citationPolicy ? `- 인용 정책: ${reportPlan.citationPolicy.mode} / ${reportPlan.citationPolicy.visibility}` : null,
    '',
    ...reportSectionsMarkdown,
    ...(reportPlan.citationPolicy?.includeLedger
      ? [
        '',
        '## Citation Ledger',
        markdownBulletList(reportCitationLedger.map((entry) => formatCitationLedgerLine(entry)), '- 기록된 report citation 사용처 없음'),
      ]
      : []),
  ].filter((line) => line !== null).join('\n')
}

const buildSlideOutline = (dossier, customization = {}, slidePlanInput = null) => {
  const slidePlan = slidePlanInput || buildSlidePlan(dossier, customization)
  const bulletLimit = getContentDensityLimit(customization.textDensity, { artifactType: 'slides' })
  const slidePolicy = slidePlan.citationPolicy || buildArtifactCitationPolicy({
    request: cleanText(customization.slideRequest || ''),
    artifactType: 'slides',
    features: buildAssignmentFeatures(cleanText(customization.slideRequest || '')),
    explicitMode: customization.slideCitationMode,
    explicitVisibility: customization.slideCitationVisibility,
  })
  const evidenceById = new Map((dossier.evidence || []).map((item) => [item.id, item]))
  const topClaims = (dossier.claims || []).slice(0, 3).map((claim) => cleanStrategicText(claim.statement, 88)).filter(Boolean)
  const topEvidenceCandidates = (dossier.scholarlySummary?.topEvidence || dossier.evidence || [])
    .slice(0, 3)
    .map((item) => evidenceById.get(item.id) || item)
  const scholarSummaryLines = buildScholarlySignalLines(dossier.scholarlySummary).map((line) => compactSlideText(line, 96)).filter(Boolean).slice(0, 2)
  const evidenceCount = Number(dossier?.metrics?.evidenceCount || dossier.evidence?.length || 0)
  const claimCount = Number(dossier?.metrics?.claimCount || dossier.claims?.length || 0)
  const actionCount = Number(dossier?.metrics?.actionItemCount || dossier.actionItems?.length || 0)
  const verifiedCount = Number(dossier?.citationSummary?.verifiedCount || 0)
  const scholarlyCount = Number(dossier?.scholarlySummary?.academicEvidenceCount || dossier?.citationSummary?.scholarlyCount || 0)
  const highQualityCount = Number(dossier?.citationSummary?.highQualityCount || 0)
  const consensusPoints = uniqueSlideTexts((dossier?.sections?.consensusPoints || []).map((line) => compactSlideText(line, 96)).filter(Boolean))
  const disagreementPoints = uniqueSlideTexts((dossier?.sections?.disagreements || []).map((line) => compactSlideText(line, 96)).filter(Boolean))
  const participantSummaries = (dossier.participantViews || []).map((view) => `${view.godName}: ${cleanStrategicText(view.summary || '', 64)}`).filter(Boolean)
  const executiveSummaryLine = compactSlideText(dossier.executiveSummary || '', 110)
  const roadmapBullets = buildRoadmapBullets({ dossier, disagreementPoints })
  const actionBullets = (dossier.actionItems || []).map((item) => `[${item.horizon}] ${cleanStrategicText(item.text, 84)}`).filter(Boolean)
  const closingBullets = uniqueSlideTexts([
    ...(dossier.evidenceGaps || []).slice(0, 1).map((item) => `Gap · ${cleanStrategicText(item, 82)}`),
    disagreementPoints[0] ? `Tension · ${cleanStrategicText(disagreementPoints[0], 82)}` : '',
    dossier.nextStep ? `Next · ${cleanStrategicText(dossier.nextStep, 84)}` : '',
  ]).slice(0, 3)
  const emphasizeEvidence = ['strict', 'selective'].includes(slidePolicy.mode)
  const slideProfile = slidePlan.profile || 'executive-deck'
  const generalMetricHighlights = [
    { value: `${dossier.readinessScore || 0}/100`, label: 'Readiness', note: '논점 정리와 실행 준비도' },
    { value: `${claimCount}`, label: 'Claims', note: '핵심 주장 수' },
    { value: `${actionCount}`, label: 'Actions', note: '실행 항목 수' },
    { value: `${Math.max(1, participantSummaries.length)}`, label: 'Views', note: '정리된 관점 수' },
  ]
  const metricHighlights = [
    ...generalMetricHighlights.slice(0, 1),
    dossier.citationSummary?.averageCitationScore ? { value: `${dossier.citationSummary.averageCitationScore}/100`, label: 'Citation', note: '검증 가능한 참고근거 품질' } : null,
    dossier.scholarlySummary?.averageScholarlyScore ? { value: `${dossier.scholarlySummary.averageScholarlyScore}/100`, label: 'Scholar', note: '학술 신호 강도' } : null,
    { value: `${evidenceCount}`, label: 'Evidence', note: scholarlyCount > 0 ? `academic ${scholarlyCount}개` : '근거 수집량' },
  ].filter(Boolean)
  const participantHighlights = (dossier.participantViews || [])
    .slice(0, 2)
    .map((view) => ({
      value: view.godName,
      label: view.stance === 'support' ? '확장 관점' : view.stance === 'challenge' ? '리스크 관점' : '판단 관점',
      note: cleanStrategicText(view.summary || '', 42) || '핵심 판단 축 요약',
    }))
  const evidenceHighlights = [
    verifiedCount > 0 ? { value: `${verifiedCount}`, label: 'verified' } : null,
    scholarlyCount > 0 ? { value: `${scholarlyCount}`, label: 'academic' } : null,
    highQualityCount > 0 ? { value: `${highQualityCount}`, label: 'high-quality' } : null,
  ].filter(Boolean)
  const roadmapHighlights = [
    { value: `${roadmapBullets.length}`, label: 'priority moves', note: actionCount > 0 ? `structured ${actionCount}` : 'execution set' },
    emphasizeEvidence ? { value: `${evidenceCount}`, label: 'evidence linked', note: scholarlyCount > 0 ? `academic ${scholarlyCount}개` : 'source count' } : { value: `${claimCount}`, label: 'claim coverage', note: '핵심 논점 구조화' },
    { value: `${dossier.readinessScore || 0}/100`, label: 'execution readiness', note: dossier.statusLabel || dossier.status },
  ]
  const closingHighlights = [
    { value: `${dossier.readinessScore || 0}/100`, label: 'readiness', note: dossier.statusLabel || dossier.status },
    { value: `${Math.max(1, roadmapBullets.length)}`, label: 'next moves', note: emphasizeEvidence ? (scholarlyCount > 0 ? `academic ${scholarlyCount}개` : `evidence ${evidenceCount}개`) : `actions ${actionCount}개` },
    emphasizeEvidence && dossier.citationSummary?.averageCitationScore ? { value: `${dossier.citationSummary.averageCitationScore}/100`, label: 'citation signal', note: 'export readiness' } : null,
  ].filter(Boolean)

  return enforceSlideCitationPolicy(slidePlan.slides.map((plan, index, array) => {
    const referenceEvidenceItems = plan.category === 'references'
      ? (plan.evidenceItems.length > 0 ? plan.evidenceItems : (dossier.evidence || []).slice(0, slidePolicy.referenceLimit || 3))
      : plan.evidenceItems
    const citationItemsBase = referenceEvidenceItems.length > 0 ? referenceEvidenceItems : (index === 0 && plan.showEvidenceSignals ? topEvidenceCandidates.slice(0, 1) : [])
    const citationItems = plan.citationDisplay === 'inline' || plan.category === 'references' ? citationItemsBase : []
    const evidenceBullets = plan.showEvidenceSignals
      ? buildEvidenceInsightBullets(citationItemsBase, {
        maxItems: Math.max(1, Math.min(plan.maxEvidence || 2, 3)),
        includeExcerpt: plan.category === 'case-study',
        maxLength: 98,
      })
      : []

    let bullets = []
    let highlights = []
    let metrics = []
    let quote = ''
    let footer = ''

    switch (plan.category) {
      case 'abstract':
        bullets = uniqueSlideTexts([
          executiveSummaryLine,
          topClaims[0],
          emphasizeEvidence
            ? (scholarlyCount > 0 ? `학술 근거 ${scholarlyCount}개 · 평균 citation ${dossier.citationSummary?.averageCitationScore || 0}/100` : `근거 ${evidenceCount}개 연결`)
            : `핵심 주장 ${claimCount}개 · 실행 항목 ${actionCount}개`,
          customization.audience ? `대상 청중 · ${compactSlideText(customization.audience, 40)}` : '',
          evidenceBullets[0] ? `대표 근거 · ${evidenceBullets[0]}` : '',
        ]).slice(0, 3)
        highlights = (emphasizeEvidence ? metricHighlights : generalMetricHighlights).slice(0, 3)
        quote = consensusPoints[0] || executiveSummaryLine || ''
        footer = customization.slideRequest
          ? `요청 초점 · ${customization.slideRequest}`
          : customization.audience
            ? `대상 청중 · ${customization.audience}`
            : (emphasizeEvidence ? `근거 ${evidenceCount}개 연결` : `실행 항목 ${actionCount}개 정리`)
        break
      case 'background':
      case 'question':
        bullets = slideProfile === 'investor-deck'
          ? uniqueSlideTexts([
            plan.category === 'background' ? `Why now · ${compactSlideText(dossier.executiveSummary || dossier.topic, 96)}` : '',
            topClaims[0] ? `Opportunity · ${topClaims[0]}` : '',
            participantSummaries[0] ? `Signal · ${participantSummaries[0]}` : '',
            evidenceBullets[0] ? `Proof · ${evidenceBullets[0]}` : '',
          ]).slice(0, 3)
          : uniqueSlideTexts([
            `주제 · ${dossier.topic}`,
            customization.slideRequest ? `요청 · ${compactSlideText(customization.slideRequest, 88)}` : '',
            topClaims[0] ? `쟁점 · ${topClaims[0]}` : '',
            participantSummaries[0] ? `관점 · ${participantSummaries[0]}` : '',
            evidenceBullets[0] ? `근거 · ${evidenceBullets[0]}` : '',
          ]).slice(0, 3)
        highlights = participantHighlights.length > 0 ? participantHighlights : [
          { value: `${claimCount}`, label: '핵심 주장' },
          { value: `${actionCount}`, label: '실행 항목' },
        ]
        quote = consensusPoints[0] || executiveSummaryLine || ''
        break
      case 'methodology':
        bullets = uniqueSlideTexts([
          'Debate -> dossier -> artifact 흐름으로 논점을 구조화했습니다.',
          emphasizeEvidence ? '학술 신호와 citation score를 우선 반영했습니다.' : '핵심 주장과 실행 포인트를 먼저 정리했습니다.',
          customization.slideRequest ? `과제 조건 · ${compactSlideText(customization.slideRequest, 86)}` : '',
          evidenceBullets[0] ? `대표 근거 · ${evidenceBullets[0]}` : '',
        ]).slice(0, 3)
        highlights = emphasizeEvidence ? metricHighlights.slice(0, 3) : generalMetricHighlights.slice(0, 3)
        quote = executiveSummaryLine || ''
        break
      case 'analysis':
      case 'findings':
        bullets = uniqueSlideTexts([
          ...topClaims.slice(0, 2),
          ...evidenceBullets.map((bullet) => `근거 · ${bullet}`),
          consensusPoints[0] ? `합의 · ${compactSlideText(consensusPoints[0], 86)}` : '',
        ]).slice(0, 3)
        highlights = emphasizeEvidence && evidenceHighlights.length > 0 ? evidenceHighlights : generalMetricHighlights.slice(0, 3)
        quote = citationItems[0] ? buildSlideEvidenceQuote(citationItems[0]) : (consensusPoints[0] || executiveSummaryLine || '')
        break
      case 'metrics':
        bullets = uniqueSlideTexts([
          ...(emphasizeEvidence
            ? [
              dossier.citationSummary?.averageCitationScore ? `평균 citation ${dossier.citationSummary.averageCitationScore}/100` : '',
              dossier.scholarlySummary?.averageScholarlyScore ? `평균 scholar ${dossier.scholarlySummary.averageScholarlyScore}/100` : '',
              dossier.scholarlySummary?.strongScholarlyCount ? `강한 학술 근거 ${dossier.scholarlySummary.strongScholarlyCount}개` : '',
              compactSlideText(dossier.citationSummary?.recommendedAction || dossier.scholarlySummary?.recommendedAction || '', 94),
              ...scholarSummaryLines,
            ]
            : buildGeneralDossierMetricLines(dossier)),
          ...evidenceBullets.map((bullet) => `근거 · ${bullet}`),
        ]).slice(0, 4)
        metrics = emphasizeEvidence ? metricHighlights : generalMetricHighlights
        footer = emphasizeEvidence ? (dossier.citationSummary?.recommendedAction || dossier.scholarlySummary?.recommendedAction || '') : ''
        break
      case 'case-study':
      case 'references':
        bullets = (plan.category === 'references' ? [] : evidenceBullets).length > 0
          ? evidenceBullets
          : buildReportReferenceLines(referenceEvidenceItems).slice(0, 3).map((line) => compactSlideText(line, 108)).filter(Boolean)
        highlights = emphasizeEvidence && evidenceHighlights.length > 0 ? evidenceHighlights : generalMetricHighlights.slice(0, 2)
        quote = citationItems[0] ? buildSlideEvidenceQuote(citationItems[0]) : ''
        break
      case 'recommendation':
        bullets = slideProfile === 'investor-deck'
          ? uniqueSlideTexts([
            ...roadmapBullets.map((line) => line.replace(/^\[[^\]]+\]\s*/, '')),
            actionBullets[0] ? `Decision ask · ${actionBullets[0]}` : '',
            evidenceBullets[0] ? `Proof · ${evidenceBullets[0]}` : '',
          ]).slice(0, 3)
          : uniqueSlideTexts([
            ...roadmapBullets,
            ...actionBullets.slice(0, 2),
            evidenceBullets[0] ? `근거 · ${evidenceBullets[0]}` : '',
          ]).slice(0, 3)
        highlights = roadmapHighlights
        footer = dossier.nextStep ? `다음 단계 · ${cleanStrategicText(dossier.nextStep, 88)}` : ''
        break
      case 'risk':
        bullets = uniqueSlideTexts([
          ...closingBullets,
          disagreementPoints[0] ? `쟁점 · ${cleanStrategicText(disagreementPoints[0], 82)}` : '',
          evidenceBullets[0] ? `근거 · ${evidenceBullets[0]}` : '',
        ]).slice(0, 3)
        highlights = closingHighlights
        quote = compactSlideText(consensusPoints[0] || executiveSummaryLine || dossier.nextStep || '', 120)
        footer = 'Recommended flow · debate -> dossier -> report -> ppt'
        break
      case 'conclusion':
        bullets = uniqueSlideTexts([
          consensusPoints[0] ? `결론 · ${compactSlideText(consensusPoints[0], 86)}` : '',
          dossier.nextStep ? `다음 단계 · ${cleanStrategicText(dossier.nextStep, 84)}` : '',
          evidenceBullets[0] ? `대표 근거 · ${evidenceBullets[0]}` : '',
        ]).slice(0, 3)
        highlights = closingHighlights
        quote = compactSlideText(consensusPoints[0] || executiveSummaryLine || dossier.nextStep || '', 120)
        footer = 'Recommended flow · debate -> dossier -> report -> ppt'
        break
      default:
        bullets = uniqueSlideTexts([
          ...topClaims.slice(0, 1),
          ...evidenceBullets,
          executiveSummaryLine,
        ]).slice(0, 3)
        highlights = metricHighlights.slice(0, 2)
        quote = executiveSummaryLine
        break
    }

    return {
      title: plan.title,
      category: plan.category,
      kicker: getSlideKickerForCategory(plan.category, slideProfile),
      layout: getSlideLayoutForCategory(plan.category, index, array.length, slideProfile),
      accent: getSlideAccentForCategory(plan.category, slideProfile),
      citationRequirement: plan.citationRequirement,
      citationDisplay: plan.citationDisplay,
      bullets: (bullets.length > 0 ? bullets : ['핵심 메시지 없음']).slice(0, bulletLimit),
      highlights,
      metrics,
      quote,
      footer,
      citations: citationItems.map((item, citationIndex) => buildSlideCitationNote(item, citationIndex)).filter(Boolean).slice(0, 3),
      citationRefs: citationItems.map((item, citationIndex) => buildCitationRecord(item, citationIndex)).slice(0, 4),
    }
  }), slidePolicy, dossier.evidence || [])
}

export const estimateArtifactQuality = ({ dossier, artifactType = 'report', artifact } = {}) => {
  const readinessScore = Number(dossier?.readinessScore || 0)
  const citationScore = Number(dossier?.citationSummary?.averageCitationScore || 0)
  const scholarlyScore = Number(dossier?.scholarlySummary?.averageScholarlyScore || 0)
  const structureScore = artifactType === 'slides'
    ? Math.min(20, (artifact?.structuredContent?.slides || []).length * 4)
    : Math.min(20, Math.round(String(artifact?.markdown || '').length / 180))

  return clamp(Math.round(readinessScore * 0.4 + citationScore * 0.25 + scholarlyScore * 0.2 + structureScore), 0, 100)
}

export const buildDebateArtifacts = ({ dossier, customization = {} } = {}) => {
  if (!dossier) return { report: null, slides: null }

  const reportPlan = buildReportSections(dossier, customization)
  const reportMarkdown = buildReportMarkdown(dossier, customization, reportPlan)
  const slidePlan = buildSlidePlan(dossier, customization)
  const slideOutline = buildSlideOutline(dossier, customization, slidePlan)
  const slideMarkdown = buildSlideMarkdown(slideOutline)
  const reportCitationLedger = buildReportCitationLedger(reportPlan.sections, reportPlan.citationPolicy)
  const slideCitationLedger = buildSlideCitationLedger(slideOutline, slidePlan.citationPolicy)

  const report = {
    artifactType: 'report_markdown',
    title: customization.reportTitle || (reportPlan.profile === 'university-paper'
      ? `${truncate(dossier.topic, 80)} 과제 보고서`
      : reportPlan.profile === 'executive-brief'
        ? `${truncate(dossier.topic, 80)} Executive Brief`
        : reportPlan.profile === 'concept-note'
          ? `${truncate(dossier.topic, 80)} 콘셉트 노트`
          : `${truncate(dossier.topic, 80)} 분석 보고서`),
    format: 'markdown',
    status: 'ready',
    markdown: reportMarkdown,
    structuredContent: {
      topic: dossier.topic,
      executiveSummary: dossier.executiveSummary,
      claims: dossier.claims || [],
      evidence: dossier.evidence || [],
      reportSections: reportPlan.sections,
      actionItems: dossier.actionItems || [],
      evidenceGaps: dossier.evidenceGaps || [],
      citationSummary: dossier.citationSummary || null,
      citationLedger: reportCitationLedger,
      citationPolicy: reportPlan.citationPolicy,
      writingProfile: reportPlan.profile,
      scholarlySummary: dossier.scholarlySummary || null,
      briefPreferences: {
        domain: customization.briefDomain || null,
        visualTheme: customization.visualTheme || null,
        visualPreset: customization.visualPreset || null,
        textDensity: customization.textDensity || null,
        aiImageMode: customization.aiImageMode || null,
        imageSource: customization.imageSource || null,
        imageStylePreset: customization.imageStylePreset || null,
        cardCount: customization.cardCount || null,
        layoutPreset: customization.layoutPreset || null,
        language: customization.language || null,
        writingNote: customization.writingNote || null,
        toneNote: customization.toneNote || null,
      },
    },
    metadata: {
      readinessScore: dossier.readinessScore,
      citationScore: dossier.citationSummary?.averageCitationScore || 0,
      scholarlyScore: dossier.scholarlySummary?.averageScholarlyScore || 0,
      citationLedgerCount: reportCitationLedger.length,
      citationMode: reportPlan.citationPolicy?.mode || null,
      citationVisibility: reportPlan.citationPolicy?.visibility || null,
      profile: reportPlan.profile,
      sectionCount: reportPlan.sections.length,
      planSource: reportPlan.source,
      source: 'dossier_report_builder',
      audience: customization.audience || null,
      request: customization.reportRequest || null,
      visualTheme: customization.visualTheme || null,
      visualPreset: customization.visualPreset || null,
      textDensity: customization.textDensity || null,
      aiImageMode: customization.aiImageMode || null,
      imageSource: customization.imageSource || null,
      imageStylePreset: customization.imageStylePreset || null,
      cardCount: customization.cardCount || null,
      layoutPreset: customization.layoutPreset || null,
      language: customization.language || null,
      briefDomain: customization.briefDomain || null,
    },
  }

  const slides = {
    artifactType: 'slide_outline',
    title: customization.slideTitle || (slidePlan.profile === 'investor-deck'
      ? `${truncate(dossier.topic, 80)} Investor Deck`
      : slidePlan.profile === 'research-presentation'
        ? `${truncate(dossier.topic, 80)} Research Presentation`
        : slidePlan.profile === 'pitch-deck'
          ? `${truncate(dossier.topic, 80)} Pitch Deck`
          : slidePlan.profile === 'evidence-deck'
            ? `${truncate(dossier.topic, 80)} Evidence Deck`
            : `${truncate(dossier.topic, 80)} Executive Deck`),
    format: 'markdown',
    status: 'ready',
    markdown: slideMarkdown,
    structuredContent: {
      topic: dossier.topic,
      slides: slideOutline,
      slidePlanSource: slidePlan.source,
      deckProfile: slidePlan.profile,
      citationSummary: dossier.citationSummary || null,
      citationLedger: slideCitationLedger,
      citationPolicy: slidePlan.citationPolicy,
      scholarlySummary: dossier.scholarlySummary || null,
      briefPreferences: {
        domain: customization.briefDomain || null,
        visualTheme: customization.visualTheme || null,
        visualPreset: customization.visualPreset || null,
        textDensity: customization.textDensity || null,
        aiImageMode: customization.aiImageMode || null,
        imageSource: customization.imageSource || null,
        imageStylePreset: customization.imageStylePreset || null,
        cardCount: customization.cardCount || null,
        layoutPreset: customization.layoutPreset || null,
        language: customization.language || null,
        writingNote: customization.writingNote || null,
        toneNote: customization.toneNote || null,
      },
    },
    metadata: {
      slideCount: slideOutline.length,
      citationScore: dossier.citationSummary?.averageCitationScore || 0,
      scholarlyScore: dossier.scholarlySummary?.averageScholarlyScore || 0,
      citationLedgerCount: slideCitationLedger.length,
      citationMode: slidePlan.citationPolicy?.mode || null,
      citationVisibility: slidePlan.citationPolicy?.visibility || null,
      profile: slidePlan.profile,
      planSource: slidePlan.source,
      source: 'dossier_slide_builder',
      audience: customization.audience || null,
      request: customization.slideRequest || null,
      visualTheme: customization.visualTheme || null,
      visualPreset: customization.visualPreset || null,
      textDensity: customization.textDensity || null,
      aiImageMode: customization.aiImageMode || null,
      imageSource: customization.imageSource || null,
      imageStylePreset: customization.imageStylePreset || null,
      cardCount: customization.cardCount || null,
      layoutPreset: customization.layoutPreset || null,
      language: customization.language || null,
      briefDomain: customization.briefDomain || null,
    },
  }

  report.metadata.qualityScore = estimateArtifactQuality({ dossier, artifactType: 'report', artifact: report })
  slides.metadata.qualityScore = estimateArtifactQuality({ dossier, artifactType: 'slides', artifact: slides })

  return { report, slides }
}

export const debateArtifactsToRows = ({ debateId, artifacts = {} } = {}) => Object.values(artifacts)
  .filter(Boolean)
  .map((artifact) => ({
    debate_id: debateId,
    artifact_type: artifact.artifactType,
    title: artifact.title,
    format: artifact.format || 'markdown',
    status: artifact.status || 'ready',
    content_markdown: artifact.markdown || '',
    structured_content: artifact.structuredContent || {},
    metadata: artifact.metadata || {},
  }))