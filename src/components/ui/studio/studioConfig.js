export const STUDIO_HOME_CARDS = [
  {
    id: 'debate',
    label: '토론',
    eyebrow: 'DEBATE LAB',
    accent: '#f59e0b',
    description: '자동 토론과 학습용 reasoning 수집을 위한 기존 실험실입니다.',
  },
  {
    id: 'ppt',
    label: 'PPT 제작',
    eyebrow: 'DECK STUDIO',
    accent: '#60a5fa',
    description: 'Gamma처럼 카드 흐름을 먼저 잡고 PPTX까지 바로 생성합니다.',
  },
  {
    id: 'docs',
    label: '문서 제작 (DOCX)',
    eyebrow: 'DOCUMENT STUDIO',
    accent: '#34d399',
    description: 'outline과 커스터마이징을 거쳐 DOCX 문서를 바로 생성합니다.',
  },
]

export const CREATION_METHOD_CARDS = [
  {
    id: 'oneLine',
    label: '한줄 프롬프트 생성',
    eyebrow: 'QUICK PROMPT',
    accent: '#38bdf8',
    description: '한 문장 아이디어로 시작하고 추천 프롬프트를 빠르게 고릅니다.',
  },
  {
    id: 'text',
    label: '텍스트 생성',
    eyebrow: 'TEXT TO CONTENT',
    accent: '#22c55e',
    description: '메모나 초안을 붙여 넣고 구조화된 outline으로 전환합니다.',
  },
  {
    id: 'template',
    label: '템플릿 생성',
    eyebrow: 'TEMPLATE START',
    accent: '#a78bfa',
    description: '자주 쓰는 deck/document 템플릿에서 출발합니다.',
  },
  {
    id: 'source',
    label: '파일 또는 URL로 생성',
    eyebrow: 'SOURCE IMPORT',
    accent: '#f97316',
    description: 'URL, 텍스트 파일, 메모 소스를 바탕으로 구조를 추출합니다.',
  },
]

export const SIZE_PRESET_OPTIONS = [
  { id: 'a4', label: 'A4', note: '문서형 레이아웃' },
  { id: '16:9', label: '16:9', note: '일반 발표용 와이드' },
  { id: '9:16', label: '9:16', note: '세로형 short deck' },
  { id: 'instagram', label: 'Instagram', note: '정사각 카드형' },
]

export const LANGUAGE_OPTIONS = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
]

export const DENSITY_OPTIONS = [
  { id: 'simple', label: '간단하게', note: 'headline과 핵심 bullet 위주로 압축' },
  { id: 'balanced', label: '보통', note: '메시지와 설명의 균형 유지' },
  { id: 'detailed', label: '자세하게', note: '배경과 근거를 충분히 포함' },
  { id: 'maximum', label: '최대', note: '카드당 설명량을 가장 크게 확보' },
]

export const VISUAL_THEME_OPTIONS = [
  { id: 'modern', label: 'Modern', note: '또렷한 대비와 clean headline 중심' },
  { id: 'minimal', label: 'Minimal', note: '여백이 큰 단정한 프리젠테이션' },
  { id: 'corporate', label: 'Corporate', note: '임원 보고용 안정적 톤' },
  { id: 'creative', label: 'Creative', note: '이미지와 시각 포인트를 강하게 사용' },
  { id: 'education', label: 'Education', note: '설명과 단계 전개를 강조' },
  { id: 'dark', label: 'Dark', note: '어두운 배경의 immersive deck' },
  { id: 'colorful', label: 'Colorful', note: '강한 색 분리와 카드 리듬' },
]

export const IMAGE_STYLE_OPTIONS = [
  { id: 'realistic', label: 'Realistic', swatch: 'linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)' },
  { id: 'illustration', label: 'Illustration', swatch: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)' },
  { id: 'flat', label: 'Flat Design', swatch: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
]

export const TEMPLATE_LIBRARY = {
  docs: [
    {
      id: 'docs-business-brief',
      title: '경영진 브리프',
      seed: 'AI 도입 전략을 경영진이 5분 안에 파악할 수 있는 브리프 문서로 정리',
      outline: ['표지', '상황 요약', '핵심 판단', '우선순위', '권고안'],
    },
    {
      id: 'docs-research-note',
      title: '리서치 노트',
      seed: '핵심 개념과 사례, 참고자료가 분리된 리서치 노트 문서로 정리',
      outline: ['표지', '연구 질문', '배경', '핵심 사례', '시사점', '참고자료'],
    },
    {
      id: 'docs-learning-guide',
      title: '학습 가이드',
      seed: '초보자도 단계별로 이해할 수 있는 교육용 가이드 문서로 정리',
      outline: ['표지', '무엇을 배우는가', '기초 개념', '예시', '실전 팁', '다음 단계'],
    },
  ],
  ppt: [
    {
      id: 'ppt-investor-deck',
      title: '투자자 덱',
      seed: '투자 포인트가 첫 장부터 선명하게 보이는 설득형 발표자료로 정리',
      outline: ['Cover', 'Why Now', 'Market Signal', 'Proof', 'Business Model', 'Ask'],
    },
    {
      id: 'ppt-education-deck',
      title: '교육 발표',
      seed: '복잡한 개념을 단계적으로 이해시키는 교육용 슬라이드로 구성',
      outline: ['Title', 'Learning Goal', 'Context', 'Core Concept', 'Example', 'Summary'],
    },
    {
      id: 'ppt-story-deck',
      title: '스토리 덱',
      seed: '문제와 전환점, 해결 메시지가 분명한 스토리형 발표자료로 정리',
      outline: ['Cover', 'Problem', 'Tension', 'Shift', 'Solution', 'Takeaway'],
    },
  ],
}

export const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()

export const normalizeStructuredText = (value = '') => String(value || '')
  .replace(/\r/g, '')
  .split('\n')
  .map((line) => cleanText(line))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

export const extractOverviewHeadline = (value = '') => {
  const firstLine = normalizeStructuredText(value)
    .split('\n')
    .map((line) => cleanText(line))
    .find(Boolean) || ''
  return firstLine.length > 120 ? `${firstLine.slice(0, 120).trim()}…` : firstLine
}

export const clampCardCount = (value, fallback = 10) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(4, Math.min(15, parsed))
}

const hashString = (value = '') => Array.from(String(value)).reduce((hash, char) => (((hash * 31) + char.charCodeAt(0)) >>> 0), 2166136261)

const createSeededRandom = (seedValue = 1) => {
  let seed = (seedValue >>> 0) || 1
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const shuffleWithSeed = (items = [], random = Math.random) => {
  const nextItems = [...items]
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]]
  }
  return nextItems
}

const DOC_RECOMMENDATION_FRAMES = [
  '경영진 브리프 문서',
  '분석 메모 문서',
  '교육형 가이드 문서',
  '근거 중심 리서치 문서',
  '실행 제안 문서',
  '비교 분석 문서',
  '요약형 원페이지 문서',
  '해설형 보고서',
]

const PPT_RECOMMENDATION_FRAMES = [
  '투자자 설득 deck',
  '사내 브리핑 deck',
  '교육용 발표 deck',
  'keynote 스타일 deck',
  'story-driven deck',
  '데이터 설명 deck',
  '전략 공유 deck',
  '세미나 발표 deck',
]

const RECOMMENDATION_INTENTS = [
  '첫 카드에서 결론이 바로 보이게',
  '배경보다 핵심 판단이 먼저 보이게',
  '초보자도 흐름을 따라올 수 있게',
  '데이터와 사례를 분리해서 읽기 쉽게',
  '한 카드에 한 메시지만 남기게',
  '실행 포인트가 마지막에 또렷하게 남게',
  '중간 카드마다 전환 리듬이 보이게',
  '시각 cue가 들어갈 위치가 자연스럽게 보이게',
]

const mapDensityToLegacy = (density = 'balanced') => {
  if (density === 'simple') return 'light'
  if (density === 'balanced') return 'balanced'
  return 'dense'
}

const mapThemeToLegacy = (theme = 'modern') => {
  const mapping = {
    modern: 'business',
    minimal: 'minimal-research',
    corporate: 'business',
    creative: 'pitch',
    education: 'academic',
    dark: 'editorial',
    colorful: 'pitch',
  }
  return mapping[theme] || 'business'
}

const mapThemeToVisualPreset = (theme = 'modern') => {
  const mapping = {
    modern: 'stardust',
    minimal: 'clementa',
    corporate: 'bee-happy',
    creative: 'aurum',
    education: 'seafoam',
    dark: 'stardust',
    colorful: 'terracotta',
  }
  return mapping[theme] || 'stardust'
}

const mapSizeToLayoutPreset = (sizePreset = '16:9') => {
  const mapping = {
    a4: 'basic',
    '16:9': 'story',
    '9:16': 'grid',
    instagram: 'grid',
  }
  return mapping[sizePreset] || 'basic'
}

export const buildDefaultStudioBrief = (mode = 'docs') => ({
  promptLine: '',
  sourceText: '',
  sourceUrl: '',
  sourceDigest: '',
  uploadedSources: [],
  templateId: '',
  overview: '',
  audience: mode === 'docs' ? '경영진' : '투자자 / 경영진',
  userRole: '',
  cardCount: mode === 'docs' ? 10 : 10,
  sizePreset: mode === 'docs' ? 'a4' : '16:9',
  language: 'ko',
  density: 'balanced',
  visualTheme: mode === 'docs' ? 'corporate' : 'modern',
  aiImagesEnabled: mode === 'ppt',
  imageStyle: 'illustration',
  extraInstructions: '',
  debateUsage: 'auto',
})

export const buildInitialStudioSession = (mode = 'docs') => ({
  mode,
  method: null,
  step: 'method',
  brief: buildDefaultStudioBrief(mode),
  recommendations: {
    items: [],
    refreshSeed: 0,
    loading: false,
    error: '',
  },
  outline: {
    items: [],
    source: '',
    loading: false,
    error: '',
  },
  generation: {
    status: 'idle',
    progress: 0,
    phase: '',
    error: '',
  },
  result: null,
})

export const buildPromptRecommendations = ({ mode = 'docs', promptLine = '', language = 'ko', seed = 0 } = {}) => {
  const topic = extractOverviewHeadline(promptLine)
  if (topic.length < 4) return []

  const random = createSeededRandom(hashString(`${mode}:${topic}:${language}:${seed}`))
  const frames = shuffleWithSeed(mode === 'docs' ? DOC_RECOMMENDATION_FRAMES : PPT_RECOMMENDATION_FRAMES, random)
  const intents = shuffleWithSeed(RECOMMENDATION_INTENTS, random)
  const count = 6 + Math.floor(random() * 2)
  const languageLabel = LANGUAGE_OPTIONS.find((item) => item.id === language)?.label || '한국어'

  return frames.slice(0, count).map((frame, index) => {
    const intent = intents[index % intents.length]
    const text = mode === 'docs'
      ? `${topic}를 ${frame}로 정리하되 ${intent} 구성하고 ${languageLabel}로 작성`
      : `${topic}를 ${frame}으로 만들되 ${intent} 발표 흐름으로 정리하고 ${languageLabel}로 작성`

    return {
      id: `${mode}-${seed}-${index}`,
      title: `${topic} · ${frame}`,
      text,
      description: `${intent}. 클릭하면 입력창에 자동 반영됩니다.`,
    }
  })
}

export const buildMethodOverview = ({ method = 'oneLine', brief = {}, mode = 'docs' } = {}) => {
  if (method === 'text') return normalizeStructuredText(brief.sourceText || brief.promptLine)
  if (method === 'template') {
    const template = (TEMPLATE_LIBRARY[mode] || []).find((item) => item.id === brief.templateId)
    return normalizeStructuredText(brief.promptLine || template?.seed || brief.overview)
  }
  if (method === 'source') {
    if (cleanText(brief.sourceDigest)) return normalizeStructuredText(brief.sourceDigest)
    const sourceTexts = (Array.isArray(brief.uploadedSources) ? brief.uploadedSources : [])
      .map((item) => cleanText(item?.text || ''))
      .filter(Boolean)
      .slice(0, 3)
    const sourceLine = cleanText(brief.sourceUrl)
    return normalizeStructuredText([
      brief.promptLine,
      sourceLine ? `참조 URL: ${sourceLine}` : '',
      ...sourceTexts,
    ].filter(Boolean).join('\n\n'))
  }
  return normalizeStructuredText(brief.promptLine || brief.overview)
}

export const buildOutlineItemsFromDraft = ({ mode = 'docs', items = [], fallbackOutline = [] } = {}) => {
  const draftItems = (Array.isArray(items) ? items : []).filter(Boolean)
  const safeItems = draftItems.length > 0
    ? draftItems
    : (Array.isArray(fallbackOutline) ? fallbackOutline : []).map((title) => ({ title, bullets: [] }))

  return safeItems.map((item, index) => {
    const title = cleanText(item?.title || item || '') || (mode === 'ppt' ? `슬라이드 ${index + 1}` : `섹션 ${index + 1}`)
    const bullets = (Array.isArray(item?.bullets) ? item.bullets : [])
      .map((entry) => cleanText(String(entry || '').replace(/^[-*•]\s*/, '')))
      .filter(Boolean)
      .slice(0, 3)

    return {
      id: `${mode}-outline-${index + 1}`,
      title,
      selected: true,
      kind: /^\[image\]/i.test(title) ? 'image' : index === 0 ? 'cover' : 'section',
      bullets,
      note: bullets.join('\n'),
    }
  })
}

export const buildFallbackOutline = ({ mode = 'docs', promptLine = '', cardCount = 10 } = {}) => {
  const topic = extractOverviewHeadline(promptLine) || (mode === 'ppt' ? 'Presentation Topic' : '문서 주제')
  const base = mode === 'ppt'
    ? ['Cover', 'Why Now', 'Core Insight', 'Evidence', 'How It Works', 'Use Case', 'Risk', 'Takeaway']
    : ['표지', '핵심 요약', '배경', '문제 정의', '핵심 분석', '사례', '리스크', '결론']
  const next = [...base]
  while (next.length < cardCount) {
    next.push(mode === 'ppt' ? `추가 슬라이드 ${next.length + 1}` : `추가 섹션 ${next.length + 1}`)
  }
  next[0] = topic
  return next.slice(0, clampCardCount(cardCount))
}

export const buildGenerationInstructions = ({ mode = 'docs', session = {} } = {}) => {
  const { brief = {}, outline = {} } = session
  const selectedItems = (Array.isArray(outline.items) ? outline.items : []).filter((item) => item.selected)
  const overview = buildMethodOverview({ method: session.method, brief, mode })
  const density = DENSITY_OPTIONS.find((item) => item.id === brief.density)?.label || '보통'
  const theme = VISUAL_THEME_OPTIONS.find((item) => item.id === brief.visualTheme)?.label || 'Modern'
  const imageStyle = IMAGE_STYLE_OPTIONS.find((item) => item.id === brief.imageStyle)?.label || 'Illustration'

  return [
    overview ? `주제 개요 원문:\n${overview}` : '',
    `형식: ${mode === 'ppt' ? 'PPT 발표자료' : 'DOCX 문서'}`,
    `카드 수: ${clampCardCount(brief.cardCount)}`,
    `크기 프리셋: ${brief.sizePreset}`,
    `언어: ${brief.language}`,
    `텍스트 양: ${density}`,
    `시각 테마: ${theme}`,
    mode === 'docs'
      ? '문서 모드이므로 AI 이미지 생성 지시는 비활성화합니다.'
      : `AI 이미지: ${brief.aiImagesEnabled ? `사용 (${imageStyle})` : '사용 안 함'}`,
    selectedItems.length > 0 ? `선택된 outline: ${selectedItems.map((item) => item.title).join(' -> ')}` : '',
    ...selectedItems.map((item, index) => {
      const bulletLine = item.bullets.length > 0 ? ` | bullet: ${item.bullets.join(' / ')}` : ''
      return `${mode === 'ppt' ? '슬라이드' : '섹션'} ${index + 1}: ${item.title}${bulletLine}`
    }),
    brief.extraInstructions ? `추가 지침사항: ${cleanText(brief.extraInstructions)}` : '',
    brief.userRole ? `작성자 역할: ${cleanText(brief.userRole)}` : '',
    brief.audience ? `대상 독자/청중: ${cleanText(brief.audience)}` : '',
    mode === 'ppt'
      ? '각 슬라이드는 headline-first 구조로 만들고, 필요할 때만 짧은 supporting bullets를 붙이세요.'
      : '문서는 바로 제출 가능한 문체와 섹션 흐름으로 정리하세요.',
  ].filter(Boolean).join('\n')
}

export const buildArtifactBrief = ({ mode = 'docs', session = {} } = {}) => {
  const { brief = {}, outline = {} } = session
  const overview = buildMethodOverview({ method: session.method, brief, mode })
  const selectedItems = (Array.isArray(outline.items) ? outline.items : []).filter((item) => item.selected)

  return {
    overview,
    userRole: cleanText(brief.userRole),
    audience: cleanText(brief.audience),
    domain: 'other',
    domainLabel: '일반',
    visualTheme: mapThemeToLegacy(brief.visualTheme),
    visualPreset: mapThemeToVisualPreset(brief.visualTheme),
    textDensity: mapDensityToLegacy(brief.density),
    aiImageMode: mode === 'docs' ? 'off' : (brief.aiImagesEnabled ? 'hero' : 'off'),
    imageSource: 'ai',
    imageStylePreset: brief.imageStyle || 'illustration',
    cardCount: clampCardCount(selectedItems.length || brief.cardCount),
    layoutPreset: mapSizeToLayoutPreset(brief.sizePreset),
    language: brief.language,
    writingNote: cleanText(brief.extraInstructions),
    toneNote: '',
    debateUsage: cleanText(brief.debateUsage || 'auto'),
    outlineTitles: selectedItems.map((item) => item.title).slice(0, 15),
    sectionPlans: selectedItems.map((item) => ({
      title: item.title,
      contentNote: normalizeStructuredText(item.note || item.bullets.join('\n')),
      citationMode: item.kind === 'image' || item.kind === 'cover' ? 'off' : 'optional',
      citationQuery: cleanText(`${extractOverviewHeadline(overview)} ${item.title} 관련 자료`).slice(0, 180),
      citations: [],
    })),
    sizePreset: brief.sizePreset,
    mode,
  }
}

export const buildResultPreview = ({ mode = 'docs', artifacts = null } = {}) => {
  const artifact = mode === 'docs' ? artifacts?.report : artifacts?.slides
  if (!artifact) return []

  if (mode === 'docs') {
    return String(artifact?.markdown || '')
      .split('\n')
      .map((line) => cleanText(line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '')))
      .filter(Boolean)
      .slice(0, 10)
  }

  return (Array.isArray(artifact?.structuredContent?.slides) ? artifact.structuredContent.slides : [])
    .map((slide) => cleanText(slide?.title || slide?.headline || ''))
    .filter(Boolean)
    .slice(0, 10)
}

export const getStudioPanelWidth = ({ activeMode = 'home', step = 'method' } = {}) => {
  if (activeMode === 'home') return '420px'
  if (activeMode === 'debate') return '430px'
  if (step === 'outline') return 'min(1180px, calc(100vw - 40px))'
  if (step === 'customize') return 'min(980px, calc(100vw - 40px))'
  if (step === 'result') return 'min(980px, calc(100vw - 40px))'
  if (step === 'generate') return 'min(760px, calc(100vw - 40px))'
  return '520px'
}

export const getStepTitle = (mode = 'docs', step = 'method') => {
  const modeLabel = mode === 'ppt' ? 'PPT 제작' : '문서 제작'
  if (step === 'method') return `${modeLabel} 방법 선택`
  if (step === 'setup') return `${modeLabel} 입력 설정`
  if (step === 'outline') return `${modeLabel} 목차 검토`
  if (step === 'customize') return `${modeLabel} 커스터마이징`
  if (step === 'generate') return `${modeLabel} 생성 중`
  if (step === 'result') return `${modeLabel} 결과물`
  return modeLabel
}