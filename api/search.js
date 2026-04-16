import { clampInteger, enforceRateLimit, ensureRequestAllowed, getRequestQuery, sendJson } from './_requestGuard.js'
import { enrichAcademicResultsWithFullText } from './_academicFullText.js'

const DEFAULT_TIMEOUT_MS = 12000
const ACADEMIC_RESULT_CAP = 8
const HF_PAPERS_ENRICH_CAP = 3
const DOAJ_SEARCH_CAP = 6
const SEMANTICSCHOLAR_SEARCH_CAP = 6
const EUROPEPMC_SEARCH_CAP = 6
const OPENREVIEW_SEARCH_FETCH_CAP = 12
const OPENREVIEW_ENRICH_CAP = 3
const OPENREVIEW_SESSION_SKEW_MS = 60 * 1000
const OPENREVIEW_DEFAULT_BASE_URL = 'https://api2.openreview.net'
const CROSSREF_ALLOWED_TYPES = new Set(['journal-article', 'proceedings-article', 'posted-content', 'book-chapter', 'dissertation'])
const OPENALEX_PEER_REVIEWED_TYPES = new Set(['journal-article', 'proceedings-article', 'book-chapter', 'dissertation'])
const PROVIDER_PRIORITY = {
  openreview: 7,
  semanticscholar: 6,
  openalex: 5,
  europepmc: 4,
  pubmed: 4,
  doaj: 4,
  crossref: 3,
  arxiv: 2,
}
const SOURCE_KIND_PRIORITY = {
  journal_search: 3,
  academic_search: 2,
  preprint_search: 1,
}
const TYPE_PRIORITY = {
  paper: 2,
  preprint: 1,
}
const VERIFICATION_PRIORITY = {
  indexed: 3,
  preprint_indexed: 2,
  retrieved: 1,
}
const QUERY_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'using', 'from', 'into', 'about', 'paper', 'research', 'study', 'analysis', 'report', 'strategy', '관련', '대한', '연구', '논문', '분석'])
const TERM_ALIASES = {
  llm: ['llm', 'large language model', 'large language models'],
  ai: ['ai', 'artificial intelligence'],
  ml: ['ml', 'machine learning'],
  rag: ['rag', 'retrieval augmented generation'],
  benchmark: ['benchmark', 'benchmarks', 'leaderboard', 'evaluation', 'eval'],
  multimodal: ['multimodal', 'multi modal', 'vision language', 'vision-language', 'vision language model', 'vlm'],
  agent: ['agent', 'agents', 'agentic', 'multi-agent', 'tool use', 'autonomous agent'],
  automation: ['automation', 'automated', 'workflow', 'workflows', 'orchestration', 'productivity', 'operations'],
  업무: ['업무', 'workflow', 'workflows', 'task', 'tasks', 'operations', 'enterprise'],
  자동화: ['자동화', 'automation', 'automated', 'workflow', 'workflows', 'orchestration', 'process automation'],
  에이전트: ['에이전트', 'agent', 'agents', 'agentic', 'multi-agent', 'tool use'],
  멀티모달: ['멀티모달', 'multimodal', 'multi modal', 'vision language', 'vision-language', 'vlm'],
  벤치마크: ['벤치마크', 'benchmark', 'benchmarks', 'leaderboard', 'evaluation', 'eval', 'agentbench', 'swe-bench', 'livebench', 'mmmu', 'mmlu'],
  적용: ['적용', 'application', 'adoption', 'deployment', 'use case', 'use-case', 'implementation'],
  전략: ['전략', 'strategy', 'roadmap', 'adoption', 'deployment', 'implementation'],
  인공지능: ['인공지능', 'ai', 'artificial intelligence'],
  머신러닝: ['머신러닝', 'ml', 'machine learning'],
  딥러닝: ['딥러닝', 'deep learning'],
  경제학: ['경제학', 'economics', 'economic', 'economy'],
  경제: ['경제', 'economics', 'economic', 'economy', 'macroeconomics', 'microeconomics'],
  금융: ['금융', 'finance', 'financial', 'banking'],
  비즈니스: ['비즈니스', 'business', 'business model', 'management', 'corporate strategy'],
  사회학: ['사회학', 'sociology', 'social science', 'social theory'],
  사회과학: ['사회과학', 'social science', 'sociology', 'political science', 'anthropology', 'public policy'],
  정치학: ['정치학', 'political science', 'public policy', 'governance'],
  인문학: ['인문학', 'humanities', 'philosophy', 'history', 'literature'],
  철학: ['철학', 'philosophy', 'ethics'],
  역사: ['역사', 'history', 'historical'],
  윤리: ['윤리', 'ethics', 'moral philosophy'],
  행동경제학: ['행동경제학', 'behavioral economics', 'nudge', 'nudging'],
  기술윤리: ['기술윤리', 'technology ethics', 'tech ethics', 'ethics of technology'],
  인간성: ['인간성', 'humanity', 'human nature', 'personhood'],
  정책: ['정책', 'policy', 'public policy', 'governance'],
  법학: ['법학', 'law', 'legal studies', 'jurisprudence'],
  법률: ['법률', 'law', 'legal', 'legislation'],
  규제: ['규제', 'regulation', 'regulatory', 'governance'],
  판례: ['판례', 'case law', 'judicial decision', 'precedent'],
  헌법: ['헌법', 'constitutional law', 'constitution'],
  행정법: ['행정법', 'administrative law', 'public administration law'],
  개인정보보호: ['개인정보보호', 'privacy law', 'data protection', 'information privacy'],
  국제정치: ['국제정치', 'international relations', 'geopolitics', 'foreign policy'],
  민주주의: ['민주주의', 'democracy', 'democratic theory'],
  공공행정: ['공공행정', 'public administration', 'governance', 'state capacity'],
  경영전략: ['경영전략', 'strategic management', 'business strategy', 'corporate strategy'],
  전략경영: ['전략경영', 'strategic management', 'corporate strategy'],
  경쟁전략: ['경쟁전략', 'competitive strategy', 'industry strategy', 'market strategy'],
  자원기반관점: ['자원기반관점', 'resource based view', 'resource-based view', 'rbv'],
}
const DOMAIN_TERM_SETS = {
  aiOrCs: [
    'ai',
    'artificial intelligence',
    'machine learning',
    'deep learning',
    'language model',
    'machine intelligence',
    'llm',
    'agent',
    'agentic',
    'multi-agent',
    'benchmark',
    'leaderboard',
    'evaluation',
    'tool use',
    'multimodal',
    'vision language',
    'computer vision',
    'nlp',
    'transformer',
    'reasoning',
    'retrieval augmented generation',
    'rag',
    'openreview',
    'arxiv',
    'github',
    '인공지능',
    '머신러닝',
    '딥러닝',
    '에이전트',
    '벤치마크',
    '멀티모달',
  ],
  biomedical: [
    'medical',
    'medicine',
    'health',
    'healthcare',
    'clinical',
    'patient',
    'disease',
    'biology',
    'biological',
    'biotech',
    'genome',
    'genomic',
    'microbiota',
    'microbiome',
    'cancer',
    'drug',
    'therapy',
    'pubmed',
    'medrxiv',
    'biorxiv',
    '의학',
    '의료',
    '환자',
    '질환',
    '치료',
    '바이오',
    '유전체',
  ],
  economicsBusiness: [
    'economics',
    'economic',
    'economy',
    'finance',
    'financial',
    'banking',
    'macroeconomics',
    'microeconomics',
    'inflation',
    'monetary policy',
    'fiscal policy',
    'trade',
    'labor economics',
    'industrial organization',
    'corporate governance',
    'business model',
    'management',
    'accounting',
    'marketing',
    'operations research',
    'nber',
    'ssrn',
    'repec',
    '경제학',
    '경제',
    '금융',
    '통화정책',
    '재정정책',
    '무역',
    '노동경제',
    '산업조직',
    '기업지배구조',
    '비즈니스 모델',
    '경영',
    '회계',
    '마케팅',
    '운영관리',
  ],
  socialSciences: [
    'sociology',
    'social science',
    'political science',
    'politics',
    'political theory',
    'international relations',
    'anthropology',
    'public policy',
    'public administration',
    'governance',
    'demography',
    'education research',
    'psychology',
    'inequality',
    'social theory',
    'culture studies',
    'organizational behavior',
    'democracy',
    'election',
    'state capacity',
    'comparative politics',
    '사회학',
    '사회과학',
    '정치학',
    '정치',
    '국제정치',
    '인류학',
    '공공정책',
    '공공행정',
    '거버넌스',
    '인구학',
    '교육학',
    '심리학',
    '불평등',
    '사회이론',
    '문화연구',
    '민주주의',
    '선거',
    '국가역량',
  ],
  humanities: [
    'humanities',
    'philosophy',
    'history',
    'historical',
    'ethics',
    'literature',
    'literary',
    'religion',
    'theology',
    'linguistics',
    'art history',
    'philology',
    'classics',
    'hermeneutics',
    '인문학',
    '철학',
    '역사',
    '윤리',
    '문학',
    '종교',
    '신학',
    '언어학',
    '예술사',
    '문헌학',
    '고전학',
    '해석학',
  ],
  lawPolicy: [
    'law',
    'legal',
    'legal studies',
    'jurisprudence',
    'legislation',
    'regulation',
    'regulatory',
    'case law',
    'precedent',
    'constitutional law',
    'administrative law',
    'privacy law',
    'data protection',
    'intellectual property',
    'antitrust',
    'compliance',
    'governance law',
    'law review',
    '법학',
    '법률',
    '규제',
    '판례',
    '헌법',
    '행정법',
    '개인정보보호',
    '공정거래',
    '준법감시',
  ],
  managementStrategy: [
    'strategic management',
    'business strategy',
    'corporate strategy',
    'competitive strategy',
    'resource based view',
    'resource-based view',
    'rbv',
    'dynamic capabilities',
    'organizational strategy',
    'innovation strategy',
    'platform strategy',
    'ecosystem strategy',
    'academy of management',
    'strategic management journal',
    'administrative science quarterly',
    'organization science',
    'harvard business review',
    '경영전략',
    '전략경영',
    '경쟁전략',
    '자원기반관점',
    '동적역량',
    '플랫폼 전략',
    '생태계 전략',
    '조직전략',
    '혁신전략',
  ],
}
const DOMAIN_SCORE_KEYS = {
  aiOrCs: 'aiScore',
  biomedical: 'biomedicalScore',
  economicsBusiness: 'economicsBusinessScore',
  socialSciences: 'socialSciencesScore',
  humanities: 'humanitiesScore',
  lawPolicy: 'lawPolicyScore',
  managementStrategy: 'managementStrategyScore',
}
const GENERIC_STRATEGY_TOKENS = new Set(['업무', '자동화', '전략', '적용', 'automation', 'workflow', 'strategy', 'application', 'adoption'])
const OPENREVIEW_ACCEPT_PATTERNS = /(accept|accepted|oral|spotlight|poster|award|best paper|conditional accept)/i
const OPENREVIEW_REJECT_PATTERNS = /(reject|rejected|withdrawn|desk reject|declined)/i
const OPENREVIEW_DECISION_INVITATION_RE = /decision|recommendation/i
const OPENREVIEW_METAREVIEW_INVITATION_RE = /meta[_\s-]*review|area[_\s-]*chair|senior[_\s-]*area[_\s-]*chair|program[_\s-]*chair/i
const OPENREVIEW_REVIEW_INVITATION_RE = /official[_\s-]*review|ethics[_\s-]*review|review/i
const OPENREVIEW_COMMENT_INVITATION_RE = /comment|public[_\s-]*comment/i
const VENUE_SIGNAL_RULES = [
  { label: 'Nature Portfolio', family: 'top_journal', prestigeScore: 18, pattern: /nature machine intelligence|nature medicine|nature biotechnology|nature communications|\bnature\b/i },
  { label: 'Science / AAAS', family: 'top_journal', prestigeScore: 18, pattern: /science\.org|sciencemag|\bscience\b/i },
  { label: 'Cell Press', family: 'top_journal', prestigeScore: 17, pattern: /cell press|\bcell\b|\bneuron\b|\bjoule\b|immunity/i },
  { label: 'IEEE Xplore', family: 'society_library', prestigeScore: 14, pattern: /ieee xplore|\bieee\b|transactions on|conference on computer vision and pattern recognition/i },
  { label: 'ACM Digital Library', family: 'society_library', prestigeScore: 14, pattern: /acm digital library|\bacm\b|sigkdd|sigir|the web conference|chi conference/i },
  { label: 'Springer', family: 'publisher', prestigeScore: 10, pattern: /springer nature|\bspringer\b|lecture notes in computer science|\blncs\b/i },
  { label: 'Elsevier', family: 'publisher', prestigeScore: 10, pattern: /elsevier|sciencedirect|the lancet|patterns/i },
  { label: 'JSTOR', family: 'journal_archive', prestigeScore: 12, pattern: /jstor/i },
  { label: 'SSRN', family: 'economics_research', prestigeScore: 12, pattern: /ssrn|social science research network/i },
  { label: 'NBER', family: 'economics_research', prestigeScore: 14, pattern: /\bnber\b|national bureau of economic research/i },
  { label: 'RePEc', family: 'economics_research', prestigeScore: 11, pattern: /\brepec\b|ideas\.repec/i },
  { label: 'SAGE Journals', family: 'social_science_publisher', prestigeScore: 12, pattern: /\bsage\b|sage journals/i },
  { label: 'Wiley', family: 'social_science_publisher', prestigeScore: 10, pattern: /\bwiley\b/i },
  { label: 'Taylor & Francis / Routledge', family: 'humanities_publisher', prestigeScore: 11, pattern: /taylor\s*&\s*francis|routledge/i },
  { label: 'Oxford University Press', family: 'humanities_publisher', prestigeScore: 13, pattern: /oxford university press|academic\.oup\.com/i },
  { label: 'Cambridge University Press', family: 'humanities_publisher', prestigeScore: 13, pattern: /cambridge university press|cambridge core/i },
  { label: 'Law Review / HeinOnline', family: 'law_review', prestigeScore: 14, pattern: /heinonline|law review|journal of legal studies|oxford journal of legal studies|modern law review|yale law journal|harvard law review|stanford law review/i },
  { label: 'Political Science / Governance', family: 'policy_journal', prestigeScore: 13, pattern: /american political science review|journal of politics|world politics|public administration review|governance|international organization/i },
  { label: 'Strategic Management / Organization', family: 'management_journal', prestigeScore: 14, pattern: /strategic management journal|academy of management|administrative science quarterly|organization science|harvard business review|journal of management studies/i },
  { label: 'DOAJ', family: 'open_access_index', prestigeScore: 8, pattern: /\bdoaj\b|directory of open access journals/i },
  { label: 'bioRxiv', family: 'preprint_server', prestigeScore: 7, pattern: /biorxiv/i },
  { label: 'medRxiv', family: 'preprint_server', prestigeScore: 7, pattern: /medrxiv/i },
  { label: 'arXiv', family: 'preprint_server', prestigeScore: 6, pattern: /arxiv/i },
  { label: 'OpenReview', family: 'open_peer_review', prestigeScore: 8, pattern: /openreview/i },
  { label: 'Papers with Code', family: 'benchmark_platform', prestigeScore: 6, pattern: /papers with code/i },
]

const openReviewSessionCache = {
  baseUrl: '',
  id: '',
  cookieHeader: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  refreshExpiresAt: 0,
  authMode: '',
}

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()
const truncate = (value = '', maxLength = 420) => {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const decodeEntities = (value = '') => String(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/<[^>]+>/g, ' ')

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toHttpsUrl = (value = '') => cleanText(value).replace(/^http:\/\//i, 'https://')

const toAbsoluteUrl = (value = '', baseUrl = '') => {
  const text = cleanText(value)
  if (!text) return ''

  try {
    return toHttpsUrl(new URL(text, baseUrl).toString())
  } catch {
    return toHttpsUrl(text)
  }
}

const normalizeDoi = (value = '') => cleanText(value)
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  .replace(/^doi:/i, '')
  .toLowerCase()

const normalizeTitleKey = (value = '') => cleanText(value)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9가-힣]+/g, ' ')
  .trim()

const mergeStringArrays = (...groups) => {
  const seen = new Set()
  const merged = []

  for (const group of groups) {
    for (const value of Array.isArray(group) ? group : [group]) {
      const text = cleanText(value)
      const key = text.toLowerCase()
      if (!text || seen.has(key)) continue
      seen.add(key)
      merged.push(text)
    }
  }

  return merged
}

const parseMetricNumber = (value = '') => {
  const text = cleanText(value).toLowerCase().replace(/,/g, '')
  if (!text) return 0

  const match = text.match(/^(\d+(?:\.\d+)?)([km])?$/i)
  if (!match) {
    const numeric = Number(text)
    return Number.isFinite(numeric) ? numeric : 0
  }

  const base = Number(match[1])
  if (!Number.isFinite(base)) return 0
  if (match[2] === 'k') return Math.round(base * 1000)
  if (match[2] === 'm') return Math.round(base * 1000000)
  return base
}

const toIsoDate = (value = '') => {
  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue >= 1000000000) {
    const normalizedMs = numericValue > 100000000000 ? numericValue : numericValue * 1000
    return new Date(normalizedMs).toISOString()
  }

  const timestamp = Date.parse(String(value || ''))
  if (Number.isNaN(timestamp)) return null
  return new Date(timestamp).toISOString()
}

const yearFromDate = (value = '') => {
  const match = String(value || '').match(/(19|20)\d{2}/)
  return match ? match[0] : ''
}

const stripArxivVersion = (value = '') => cleanText(value).replace(/v\d+$/i, '')

const isLikelyArxivId = (value = '') => /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z-]+)?\/\d{7})(?:v\d+)?$/i.test(cleanText(value))

const extractArxivId = (value = '') => {
  const text = cleanText(value)
  if (!text) return ''

  if (/arxiv\.org\/(abs|pdf)\//i.test(text)) {
    const match = text.match(/arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:\.pdf)?$/i)
    return stripArxivVersion(match?.[1] || '')
  }

  if (/^arxiv:/i.test(text)) {
    return stripArxivVersion(text.replace(/^arxiv:/i, ''))
  }

  return isLikelyArxivId(text) ? stripArxivVersion(text) : ''
}

const extractPubMedArticleId = (summaryItem = {}, idType = '') => {
  const articleIds = Array.isArray(summaryItem?.articleids) ? summaryItem.articleids : []
  const entry = articleIds.find((candidate) => cleanText(candidate?.idtype || '').toLowerCase() === cleanText(idType).toLowerCase())
  return cleanText(entry?.value || '')
}

const normalizeQueryToken = (token = '') => {
  const text = cleanText(token).toLowerCase()
  if (!/[가-힣]/.test(text)) return text

  const normalized = text.replace(/(으로|와|과|를|을|의|에|는|은|이|가|로|도|만|랑|이랑)$/u, '')
  return normalized.length >= 2 ? normalized : text
}

const extractQueryTokens = (query = '') => {
  const tokens = String(query).toLowerCase().match(/[a-z0-9가-힣]+/g) || []
  return mergeStringArrays(tokens
    .map((token) => normalizeQueryToken(token))
    .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token)))
    .slice(0, 8)
}

const tokenizeNormalizedText = (value = '') => cleanText(value).split(/\s+/).filter(Boolean)

const hasNormalizedPhrase = (haystack = '', phrase = '') => {
  const normalizedHaystack = normalizeTitleKey(haystack)
  const normalizedPhrase = normalizeTitleKey(phrase)
  if (!normalizedHaystack || !normalizedPhrase) return false

  const haystackTokens = tokenizeNormalizedText(normalizedHaystack)
  if (normalizedPhrase.includes(' ')) {
    return ` ${normalizedHaystack} `.includes(` ${normalizedPhrase} `)
  }

  return haystackTokens.some((token) => token === normalizedPhrase || (normalizedPhrase.length >= 5 && token.includes(normalizedPhrase)))
}

const matchesQueryToken = (haystack = '', token = '') => {
  const variants = TERM_ALIASES[token] || [token]
  return variants.some((variant) => hasNormalizedPhrase(haystack, variant))
}

const buildQueryProfile = (query = '') => {
  const text = cleanText(query).toLowerCase()
  const aiOrCs = /(\bai\b|artificial intelligence|machine learning|deep learning|llm|\bagent\b|agentic|multi-agent|transformer|rag|computer vision|\bnlp\b|multimodal|benchmark|papers with code|openreview|\bieee\b|\bacm\b|인공지능|머신러닝|딥러닝|에이전트|트랜스포머|멀티모달|벤치마크)/i.test(text)
  const biomedical = /(medical|medicine|health|healthcare|drug|therapy|clinical|patient|disease|biology|biological|biomedical|genome|biotech|pubmed|medrxiv|biorxiv|의학|의료|헬스|헬스케어|환자|질환|치료|약물|임상|바이오|유전체)/i.test(text)
  const economicsBusiness = /(economics|economic|economy|finance|financial|banking|macroeconomics|microeconomics|inflation|monetary policy|fiscal policy|trade|labor economics|industrial organization|corporate governance|business model|management|accounting|marketing|operations research|ssrn|nber|repec|경제학|경제|금융|은행|인플레이션|통화정책|재정정책|무역|노동경제|산업조직|기업지배구조|비즈니스 모델|경영|회계|마케팅|운영관리)/i.test(text)
  const socialSciences = /(sociology|social science|political science|politics|political theory|international relations|anthropology|public policy|public administration|governance|demography|education research|psychology|inequality|social theory|culture studies|organizational behavior|democracy|election|state capacity|comparative politics|사회학|사회과학|정치학|정치|국제정치|인류학|공공정책|공공행정|거버넌스|인구학|교육학|심리학|불평등|사회이론|문화연구|민주주의|선거|국가역량)/i.test(text)
  const humanities = /(humanities|philosophy|history|historical|ethics|literature|literary|religion|theology|linguistics|art history|philology|classics|hermeneutics|인문학|철학|역사|윤리|문학|종교|신학|언어학|예술사|문헌학|고전학|해석학)/i.test(text)
  const lawPolicy = /(law|legal|legal studies|jurisprudence|legislation|regulation|regulatory|case law|precedent|constitutional law|administrative law|privacy law|data protection|intellectual property|antitrust|compliance|law review|법학|법률|규제|판례|헌법|행정법|개인정보보호|공정거래|준법감시)/i.test(text)
  const managementStrategy = /(strategic management|business strategy|corporate strategy|competitive strategy|resource based view|resource-based view|\brbv\b|dynamic capabilities|organizational strategy|innovation strategy|platform strategy|ecosystem strategy|academy of management|strategic management journal|administrative science quarterly|organization science|harvard business review|journal of management studies|경영전략|전략경영|경쟁전략|자원기반관점|동적역량|플랫폼 전략|생태계 전략|조직전략|혁신전략)/i.test(text)
  const scholarlyIntent = /(paper|research|study|journal|preprint|survey|benchmark|scholar|citation|google scholar|ieee xplore|acm digital library|nature|science|cell|springer|elsevier|medrxiv|biorxiv|working paper|ssrn|nber|repec|jstor|sage|routledge|oxford university press|cambridge university press|law review|heinonline|public administration review|strategic management journal|논문|연구|학술|인용|저널|프리프린트|워킹페이퍼)/i.test(text) || aiOrCs || biomedical || economicsBusiness || socialSciences || humanities || lawPolicy || managementStrategy
  const preprintFriendly = /(arxiv|preprint|benchmark|transformer|llm|machine learning|deep learning|medrxiv|biorxiv|멀티모달|인공지능|머신러닝|딥러닝|프리프린트)/i.test(text) || aiOrCs || biomedical
  const queryTokens = extractQueryTokens(query)
  const targetDomains = ['aiOrCs', 'biomedical', 'economicsBusiness', 'socialSciences', 'humanities', 'lawPolicy', 'managementStrategy']
    .filter((key) => Boolean({ aiOrCs, biomedical, economicsBusiness, socialSciences, humanities, lawPolicy, managementStrategy }[key]))
  return { aiOrCs, biomedical, economicsBusiness, socialSciences, humanities, lawPolicy, managementStrategy, scholarlyIntent, preprintFriendly, queryTokens, targetDomains }
}

const getActiveQueryDomains = (queryProfile = {}) => {
  return ['aiOrCs', 'biomedical', 'economicsBusiness', 'socialSciences', 'humanities', 'lawPolicy', 'managementStrategy']
    .filter((key) => Boolean(queryProfile?.[key]))
}

const getHighestCompetingDomainScore = (domainSignals = {}, targetDomain = '') => {
  return Object.entries(DOMAIN_SCORE_KEYS)
    .filter(([domainKey]) => domainKey !== targetDomain)
    .reduce((maxScore, [, scoreKey]) => Math.max(maxScore, Number(domainSignals?.[scoreKey] || 0)), 0)
}

const buildAcademicSearchQuery = (query = '', queryProfile = {}) => {
  const text = cleanText(query)
  if (!text || !/[가-힣]/.test(text)) return text

  const baseTokens = Array.isArray(queryProfile?.queryTokens) ? queryProfile.queryTokens : extractQueryTokens(text)
  const aliasTerms = mergeStringArrays(
    baseTokens.flatMap((token) => (TERM_ALIASES[token] || []).filter((variant) => /[a-z]/i.test(variant)).slice(0, 2))
  ).slice(0, 8)

  if (aliasTerms.length === 0) return text
  return cleanText(`${text} ${aliasTerms.join(' ')}`).slice(0, 240)
}

const shouldUseSemanticScholar = (queryProfile = {}) => {
  const override = cleanText(process.env.SEMANTICSCHOLAR_ENABLED || '').toLowerCase()
  if (['false', '0', 'off', 'no'].includes(override)) return false
  if (['true', '1', 'on', 'yes'].includes(override)) return true

  const hasApiKey = Boolean(cleanText(process.env.SEMANTICSCHOLAR_API_KEY || ''))
  if (hasApiKey) return true

  return Boolean(queryProfile?.aiOrCs || queryProfile?.biomedical)
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const buildAcademicMeta = ({
  authors = [],
  publishedAt = null,
  venue = '',
  doi = '',
  citationCount = null,
  peerReviewed = false,
  preprint = false,
  scholarly = true,
  sourceLabel = '',
  openAccess = false,
  externalIds = {},
  sourceProviders = [],
  relevanceScore = null,
  primaryTopic = '',
  topics = [],
  keywords = [],
  reviewSignals = {},
  benchmarkSignals = {},
  communitySignals = {},
  venueSignals = {},
  rankingSignals = {},
  scholarlyScore = null,
  excerptSource = '',
  excerptSourceLabel = '',
  abstractSnippet = '',
  fullTextUrl = '',
  fullTextSourceType = '',
  fullTextFetched = false,
  fullTextCharCount = null,
  fullTextMatchedTokens = [],
} = {}) => {
  const normalizedSourceProviders = mergeStringArrays(sourceProviders).slice(0, 6)
  const normalizedExternalIds = externalIds && typeof externalIds === 'object' ? externalIds : {}
  const resolvedVenueSignals = venueSignals && typeof venueSignals === 'object' && Object.keys(venueSignals).length > 0
    ? venueSignals
    : buildVenueSignals({
      venue,
      sourceLabel,
      provider: normalizedSourceProviders[0] || '',
      link: cleanText(normalizedExternalIds.primaryUrl || ''),
    })

  return {
    authors: Array.isArray(authors) ? authors.filter(Boolean).slice(0, 8) : [],
    publishedAt,
    year: yearFromDate(publishedAt || ''),
    venue: cleanText(venue),
    doi: cleanText(doi),
    citationCount: Number.isFinite(Number(citationCount)) ? Number(citationCount) : null,
    peerReviewed: Boolean(peerReviewed),
    preprint: Boolean(preprint),
    scholarly: scholarly !== false,
    sourceLabel: cleanText(sourceLabel),
    openAccess: Boolean(openAccess),
    externalIds: normalizedExternalIds,
    sourceProviders: normalizedSourceProviders,
    relevanceScore: Number.isFinite(Number(relevanceScore)) ? Number(relevanceScore) : null,
    primaryTopic: cleanText(primaryTopic),
    topics: mergeStringArrays(topics).slice(0, 8),
    keywords: mergeStringArrays(keywords).slice(0, 8),
    reviewSignals: reviewSignals && typeof reviewSignals === 'object' ? reviewSignals : {},
    benchmarkSignals: benchmarkSignals && typeof benchmarkSignals === 'object' ? benchmarkSignals : {},
    communitySignals: communitySignals && typeof communitySignals === 'object' ? communitySignals : {},
    venueSignals: resolvedVenueSignals,
    rankingSignals: rankingSignals && typeof rankingSignals === 'object' ? rankingSignals : {},
    scholarlyScore: Number.isFinite(Number(scholarlyScore)) ? Number(scholarlyScore) : null,
    excerptSource: cleanText(excerptSource),
    excerptSourceLabel: cleanText(excerptSourceLabel),
    abstractSnippet: truncate(abstractSnippet, 600),
    fullTextUrl: toHttpsUrl(fullTextUrl),
    fullTextSourceType: cleanText(fullTextSourceType),
    fullTextFetched: Boolean(fullTextFetched),
    fullTextCharCount: Number.isFinite(Number(fullTextCharCount)) ? Number(fullTextCharCount) : null,
    fullTextMatchedTokens: mergeStringArrays(fullTextMatchedTokens).slice(0, 8),
  }
}

const buildVenueSignals = ({ venue = '', sourceLabel = '', provider = '', link = '' } = {}) => {
  const haystack = [venue, sourceLabel, provider, link].filter(Boolean).join(' ')
  const matchedRules = VENUE_SIGNAL_RULES.filter(({ pattern }) => pattern.test(haystack))
  const topRule = matchedRules.slice().sort((left, right) => right.prestigeScore - left.prestigeScore)[0] || null
  const labels = mergeStringArrays(matchedRules.map((rule) => rule.label)).slice(0, 4)

  return {
    labels,
    emphasisLabel: cleanText(topRule?.label || ''),
    sourceFamily: cleanText(topRule?.family || ''),
    prestigeScore: Number(topRule?.prestigeScore || 0),
    isTopVenue: Boolean(topRule && topRule.family === 'top_journal'),
    isPreprintVenue: Boolean(topRule && topRule.family === 'preprint_server'),
  }
}

const mergeVenueSignals = (baseSignals = {}, incomingSignals = {}, context = {}) => {
  const basePrestige = Number(baseSignals?.prestigeScore || 0)
  const incomingPrestige = Number(incomingSignals?.prestigeScore || 0)
  const primarySignals = incomingPrestige >= basePrestige ? incomingSignals : baseSignals
  const fallbackSignals = buildVenueSignals(context)

  return {
    ...fallbackSignals,
    ...primarySignals,
    labels: mergeStringArrays(baseSignals?.labels || [], incomingSignals?.labels || [], fallbackSignals?.labels || []).slice(0, 5),
    emphasisLabel: cleanText(primarySignals?.emphasisLabel || fallbackSignals?.emphasisLabel || ''),
    sourceFamily: cleanText(primarySignals?.sourceFamily || fallbackSignals?.sourceFamily || ''),
    prestigeScore: Math.max(basePrestige, incomingPrestige, Number(fallbackSignals?.prestigeScore || 0)),
    isTopVenue: Boolean(baseSignals?.isTopVenue || incomingSignals?.isTopVenue || fallbackSignals?.isTopVenue),
    isPreprintVenue: Boolean(baseSignals?.isPreprintVenue || incomingSignals?.isPreprintVenue || fallbackSignals?.isPreprintVenue),
  }
}

const splitAuthorString = (value = '') => mergeStringArrays(
  String(value || '')
    .split(/,|;|\band\b/gi)
    .map((part) => cleanText(part))
    .filter(Boolean)
).slice(0, 8)

const parseDuckDuckGoResults = (html = '', limit = 5) => {
  const titleMatches = [...String(html).matchAll(/class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g)]
  const snippetMatches = [...String(html).matchAll(/class="result__snippet"[^>]*>([^<]+)<\/a>/g)]
  const count = Math.min(limit, titleMatches.length)
  const results = []

  for (let index = 0; index < count; index += 1) {
    const title = cleanText(decodeEntities(titleMatches[index]?.[2] || ''))
    const link = cleanText(titleMatches[index]?.[1] || '')
    const snippet = truncate(decodeEntities(snippetMatches[index]?.[1] || ''), 320)
    if (!title) continue

    results.push({
      title,
      snippet,
      link,
      provider: 'duckduckgo-html',
      resultType: 'web',
      sourceKind: 'web_search',
      type: /\.pdf($|\?)/i.test(link) ? 'document' : 'web',
      verificationStatus: 'retrieved',
      metadata: {
        sourceLabel: 'Web search',
      },
    })
  }

  return results
}

const searchDuckDuckGo = async (query, num) => {
  const response = await fetchWithTimeout(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept': 'text/html',
      },
    }
  )

  if (!response.ok) {
    if (response.status === 403) return []
    throw new Error(`DuckDuckGo 응답 오류: ${response.status}`)
  }

  const html = await response.text()
  return parseDuckDuckGoResults(html, num)
}

const buildArxivSearchQuery = (query = '') => {
  const tokens = extractQueryTokens(query).slice(0, 5)
  if (tokens.length === 0) {
    return `all:${cleanText(query)}`
  }

  return tokens.map((token) => `all:${token}`).join(' AND ')
}

const searchArxiv = async (query, limit = 3) => {
  const searchQuery = buildArxivSearchQuery(query)
  const response = await fetchWithTimeout(
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=${limit}&sortBy=relevance&sortOrder=descending`,
    {
      headers: {
        'User-Agent': 'AI-Gods-Project/1.0 (academic search)',
        'Accept': 'application/atom+xml, text/xml;q=0.9, */*;q=0.8',
      },
    }
  )

  if (!response.ok) throw new Error(`arXiv 응답 오류: ${response.status}`)
  const xml = await response.text()
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]

  return entries.map((match, index) => {
    const entry = match[1]
    const title = cleanText(decodeEntities(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''))
    const summary = truncate(decodeEntities(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || ''), 340)
    const link = cleanText(decodeEntities(entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || ''))
    const publishedAt = toIsoDate(entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '')
    const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)].map((author) => cleanText(decodeEntities(author[1] || ''))).filter(Boolean)
    const doi = cleanText(decodeEntities(entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] || ''))
    const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map((category) => cleanText(category[1] || '')).filter(Boolean)
    const arxivId = extractArxivId(link)

    return {
      title: title || `arXiv result ${index + 1}`,
      snippet: summary,
      link: toHttpsUrl(link),
      provider: 'arxiv',
      resultType: 'academic',
      sourceKind: 'preprint_search',
      type: 'preprint',
      verificationStatus: 'preprint_indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: 'arXiv',
        doi,
        peerReviewed: false,
        preprint: true,
        sourceLabel: 'arXiv preprint',
        openAccess: true,
        externalIds: {
          arxivId,
          categories,
          pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : '',
          primaryUrl: toHttpsUrl(link),
        },
        sourceProviders: ['arxiv'],
      }),
    }
  }).filter((item) => item.title && item.link)
}

const extractPubMedDoi = (summaryItem = {}) => normalizeDoi(extractPubMedArticleId(summaryItem, 'doi'))

const extractPubMedPmcid = (summaryItem = {}) => cleanText(
  extractPubMedArticleId(summaryItem, 'pmc') || extractPubMedArticleId(summaryItem, 'pmcid')
).toUpperCase()

const searchPubMed = async (query, limit = 3) => {
  const searchResponse = await fetchWithTimeout(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${limit}&term=${encodeURIComponent(query)}`)
  if (!searchResponse.ok) throw new Error(`PubMed esearch 오류: ${searchResponse.status}`)
  const searchJson = await searchResponse.json().catch(() => ({}))
  const ids = Array.isArray(searchJson?.esearchresult?.idlist) ? searchJson.esearchresult.idlist.filter(Boolean) : []
  if (ids.length === 0) return []

  const summaryResponse = await fetchWithTimeout(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`)
  if (!summaryResponse.ok) throw new Error(`PubMed esummary 오류: ${summaryResponse.status}`)
  const summaryJson = await summaryResponse.json().catch(() => ({}))
  const resultBlock = summaryJson?.result || {}

  return ids.map((id, index) => {
    const item = resultBlock[id] || {}
    const title = cleanText(item?.title || `PubMed result ${index + 1}`)
    const authors = Array.isArray(item?.authors) ? item.authors.map((author) => cleanText(author?.name || '')).filter(Boolean) : []
    const publishedAt = toIsoDate(item?.pubdate || item?.sortpubdate || '')
    const doi = extractPubMedDoi(item)
    const pmcid = extractPubMedPmcid(item)
    const pubTypes = Array.isArray(item?.pubtype) ? item.pubtype : []
    const isPreprint = pubTypes.some((pubType) => /preprint/i.test(cleanText(pubType || '')))
    return {
      title,
      snippet: truncate(item?.sortfirstauthor ? `${item.sortfirstauthor} 등. ${item.fulljournalname || 'PubMed'} ${yearFromDate(item?.pubdate || '')}` : item?.fulljournalname || 'PubMed', 320),
      link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      provider: 'pubmed',
      resultType: 'academic',
      sourceKind: isPreprint ? 'preprint_search' : 'journal_search',
      type: isPreprint ? 'preprint' : 'paper',
      verificationStatus: isPreprint ? 'preprint_indexed' : 'indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: item?.fulljournalname || 'PubMed indexed literature',
        doi,
        peerReviewed: !isPreprint,
        preprint: isPreprint,
        sourceLabel: isPreprint ? 'PubMed indexed preprint' : 'PubMed indexed article',
        openAccess: Boolean(pmcid),
        externalIds: {
          pubmedId: id,
          pubType: pubTypes,
          pmcid,
          fullTextUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : '',
        },
        sourceProviders: ['pubmed'],
      }),
    }
  }).filter((item) => item.title && item.link)
}

const extractCrossrefDate = (item = {}) => {
  const dateParts = item?.['published-print']?.['date-parts']?.[0]
    || item?.['published-online']?.['date-parts']?.[0]
    || item?.issued?.['date-parts']?.[0]
  if (!Array.isArray(dateParts) || dateParts.length === 0) return null
  const [year, month = 1, day = 1] = dateParts
  if (!year) return null
  return new Date(Date.UTC(year, Math.max(0, month - 1), day)).toISOString()
}

const searchCrossref = async (query, limit = 4) => {
  const response = await fetchWithTimeout(`https://api.crossref.org/works?rows=${limit}&query.bibliographic=${encodeURIComponent(query)}&select=DOI,title,author,container-title,published-print,published-online,issued,type,is-referenced-by-count,URL,abstract`)
  if (!response.ok) throw new Error(`Crossref 응답 오류: ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  const items = Array.isArray(payload?.message?.items)
    ? payload.message.items.filter((item) => CROSSREF_ALLOWED_TYPES.has(cleanText(item?.type || '')))
    : []

  return items.map((item, index) => {
    const title = cleanText(Array.isArray(item?.title) ? item.title[0] : item?.title || `Crossref result ${index + 1}`)
    const authors = Array.isArray(item?.author)
      ? item.author.map((author) => cleanText([author?.given, author?.family].filter(Boolean).join(' '))).filter(Boolean)
      : []
    const publishedAt = extractCrossrefDate(item)
    const doi = cleanText(item?.DOI || '')
    const venue = cleanText(Array.isArray(item?.['container-title']) ? item['container-title'][0] : item?.['container-title'] || '')
    const abstract = truncate(decodeEntities(item?.abstract || ''), 340)
    const crossrefType = cleanText(item?.type || '')
    const type = /preprint/i.test(crossrefType) ? 'preprint' : 'paper'
    const isPreprint = type === 'preprint'
    const isJournalArticle = crossrefType === 'journal-article'

    return {
      title,
      snippet: abstract || truncate(`${venue || 'Crossref indexed work'} ${yearFromDate(publishedAt || '')}`.trim(), 320),
      link: toHttpsUrl(item?.URL || (doi ? `https://doi.org/${doi}` : '')),
      provider: 'crossref',
      resultType: 'academic',
      sourceKind: isPreprint ? 'preprint_search' : (isJournalArticle ? 'journal_search' : 'academic_search'),
      type,
      verificationStatus: 'indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: venue || 'Crossref indexed work',
        doi,
        citationCount: item?.['is-referenced-by-count'],
        peerReviewed: isJournalArticle,
        preprint: isPreprint,
        sourceLabel: isPreprint ? 'Crossref preprint metadata' : (isJournalArticle ? 'Crossref journal metadata' : 'Crossref scholarly metadata'),
        openAccess: false,
        externalIds: {
          crossrefType,
        },
        sourceProviders: ['crossref'],
      }),
    }
  }).filter((item) => item.title && item.link)
}

const buildOpenAlexSnippet = (item = {}) => {
  const venue = cleanText(item?.primary_location?.source?.display_name || item?.best_oa_location?.source?.display_name || '')
  const year = cleanText(item?.publication_year || '')
  const primaryTopic = cleanText(item?.primary_topic?.display_name || '')
  const conceptNames = Array.isArray(item?.concepts) ? item.concepts.map((concept) => cleanText(concept?.display_name || '')).filter(Boolean).slice(0, 3) : []
  const keywordNames = Array.isArray(item?.keywords) ? item.keywords.map((keyword) => cleanText(keyword?.display_name || keyword || '')).filter(Boolean).slice(0, 3) : []
  const topicBits = mergeStringArrays(primaryTopic, keywordNames, conceptNames)

  return truncate([
    topicBits.slice(0, 4).join(', '),
    [venue, year].filter(Boolean).join(' '),
  ].filter(Boolean).join(' | '), 340)
}

const searchOpenAlex = async (query, limit = 5) => {
  const response = await fetchWithTimeout(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&select=id,doi,title,display_name,relevance_score,publication_year,publication_date,ids,open_access,primary_location,best_oa_location,authorships,type,type_crossref,cited_by_count,concepts,keywords,primary_topic`,
    {
      headers: {
        'User-Agent': 'AI-Gods-Project/1.0 (academic search)',
        'Accept': 'application/json',
      },
    }
  )

  if (!response.ok) throw new Error(`OpenAlex 응답 오류: ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  const results = Array.isArray(payload?.results) ? payload.results : []

  return results.map((item, index) => {
    const title = cleanText(item?.display_name || item?.title || `OpenAlex result ${index + 1}`)
    const publishedAt = toIsoDate(item?.publication_date || (item?.publication_year ? `${item.publication_year}-01-01` : ''))
    const authors = Array.isArray(item?.authorships)
      ? item.authorships.map((authorship) => cleanText(authorship?.author?.display_name || '')).filter(Boolean)
      : []
    const doi = normalizeDoi(item?.doi || item?.ids?.doi || '')
    const venue = cleanText(item?.primary_location?.source?.display_name || item?.best_oa_location?.source?.display_name || '')
    const arxivId = extractArxivId(item?.ids?.arxiv || item?.best_oa_location?.landing_page_url || '')
    const typeCrossref = cleanText(item?.type_crossref || item?.type || '')
    const isPreprint = Boolean(arxivId) || /preprint|posted-content/i.test(typeCrossref) || /arxiv/i.test(venue)
    const peerReviewed = !isPreprint && OPENALEX_PEER_REVIEWED_TYPES.has(typeCrossref)
    const primaryTopic = cleanText(item?.primary_topic?.display_name || '')
    const topics = Array.isArray(item?.concepts) ? item.concepts.map((concept) => cleanText(concept?.display_name || '')).filter(Boolean).slice(0, 6) : []
    const keywords = Array.isArray(item?.keywords) ? item.keywords.map((keyword) => cleanText(keyword?.display_name || keyword || '')).filter(Boolean).slice(0, 6) : []
    const landingPageUrl = toHttpsUrl(item?.best_oa_location?.landing_page_url || item?.primary_location?.landing_page_url || '')
    const pdfUrl = toHttpsUrl(item?.best_oa_location?.pdf_url || item?.primary_location?.pdf_url || item?.open_access?.oa_url || '')
    const link = toHttpsUrl(
      landingPageUrl
        || item?.ids?.doi
        || item?.doi
        || item?.id
        || ''
    )

    return {
      title,
      snippet: buildOpenAlexSnippet(item),
      link,
      provider: 'openalex',
      resultType: 'academic',
      sourceKind: isPreprint ? 'preprint_search' : (peerReviewed ? 'journal_search' : 'academic_search'),
      type: isPreprint ? 'preprint' : 'paper',
      verificationStatus: 'indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: venue || 'OpenAlex indexed work',
        doi,
        citationCount: item?.cited_by_count,
        peerReviewed,
        preprint: isPreprint,
        sourceLabel: isPreprint ? 'OpenAlex preprint metadata' : (peerReviewed ? 'OpenAlex scholarly metadata' : 'OpenAlex indexed work'),
        openAccess: Boolean(item?.open_access?.is_oa),
        externalIds: {
          openalexId: cleanText(item?.id || ''),
          arxivId,
          pubmedId: cleanText(item?.ids?.pmid || '').replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, ''),
          pmcid: cleanText(item?.ids?.pmcid || ''),
          typeCrossref,
          landingPageUrl,
          pdfUrl,
        },
        sourceProviders: ['openalex'],
        relevanceScore: item?.relevance_score,
        primaryTopic,
        topics,
        keywords,
      }),
    }
  }).filter((item) => item.title && item.link)
}

const getIdentifierByType = (identifiers = [], identifierType = '') => {
  if (!Array.isArray(identifiers)) return ''
  const normalizedType = cleanText(identifierType).toLowerCase()
  return cleanText(identifiers.find((entry) => cleanText(entry?.type || '').toLowerCase() === normalizedType)?.id || '')
}

const buildDoajLink = (bibjson = {}) => {
  const links = Array.isArray(bibjson?.link) ? bibjson.link : []
  const preferredLink = links.find((entry) => /fulltext|full text|html|pdf/i.test(cleanText([entry?.type, entry?.content_type].filter(Boolean).join(' ')))) || links[0]
  const doi = normalizeDoi(getIdentifierByType(bibjson?.identifier, 'doi'))
  return toHttpsUrl(preferredLink?.url || (doi ? `https://doi.org/${doi}` : ''))
}

const searchDoaj = async (query, limit = 4) => {
  const response = await fetchWithTimeout(
    `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${Math.min(DOAJ_SEARCH_CAP, limit)}`,
    {
      headers: {
        'User-Agent': 'AI-Gods-Project/1.0 (academic search)',
        'Accept': 'application/json',
      },
    }
  )

  if (!response.ok) throw new Error(`DOAJ 응답 오류: ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  const results = Array.isArray(payload?.results) ? payload.results : []

  return results.map((item, index) => {
    const bibjson = item?.bibjson && typeof item.bibjson === 'object' ? item.bibjson : {}
    const title = cleanText(decodeEntities(bibjson?.title || `DOAJ result ${index + 1}`))
    const abstract = truncate(decodeEntities(bibjson?.abstract || ''), 340)
    const authors = Array.isArray(bibjson?.author) ? bibjson.author.map((author) => cleanText(author?.name || '')).filter(Boolean) : []
    const venue = cleanText(decodeEntities(bibjson?.journal?.title || ''))
    const publisher = cleanText(decodeEntities(bibjson?.journal?.publisher || ''))
    const doi = normalizeDoi(getIdentifierByType(bibjson?.identifier, 'doi'))
    const publishedAt = toIsoDate(`${cleanText(bibjson?.year || '')} ${cleanText(bibjson?.month || '')} 1`)
    const subjects = Array.isArray(bibjson?.subject) ? bibjson.subject.map((subject) => cleanText(decodeEntities(subject?.term || subject || ''))).filter(Boolean) : []
    const link = buildDoajLink(bibjson)

    return {
      title,
      snippet: abstract || truncate([venue || publisher || 'DOAJ open-access journal', yearFromDate(publishedAt || cleanText(bibjson?.year || ''))].filter(Boolean).join(' | '), 320),
      link,
      provider: 'doaj',
      resultType: 'academic',
      sourceKind: 'journal_search',
      type: 'paper',
      verificationStatus: 'indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: venue || 'DOAJ indexed journal',
        doi,
        citationCount: null,
        peerReviewed: true,
        preprint: false,
        sourceLabel: 'DOAJ open-access journal',
        openAccess: true,
        externalIds: {
          doajId: cleanText(item?.id || ''),
          eissn: getIdentifierByType(bibjson?.identifier, 'eissn'),
          pissn: getIdentifierByType(bibjson?.identifier, 'pissn'),
          journalPublisher: publisher,
        },
        sourceProviders: ['doaj'],
        primaryTopic: subjects[0] || '',
        topics: subjects,
        keywords: subjects,
      }),
    }
  }).filter((item) => item.title && item.link)
}

const searchSemanticScholar = async (query, limit = 5) => {
  const apiKey = cleanText(process.env.SEMANTICSCHOLAR_API_KEY || '')
  const response = await fetchWithTimeout(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(SEMANTICSCHOLAR_SEARCH_CAP, limit)}&fields=title,abstract,venue,year,authors,citationCount,externalIds,url,openAccessPdf,publicationTypes,publicationDate,journal,fieldsOfStudy`,
    {
      headers: {
        'User-Agent': 'AI-Gods-Project/1.0 (academic search)',
        'Accept': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
    }
  )

  if (!response.ok) throw new Error(`Semantic Scholar 응답 오류: ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  const results = Array.isArray(payload?.data) ? payload.data : []

  return results.map((item, index) => {
    const title = cleanText(item?.title || `Semantic Scholar result ${index + 1}`)
    const abstract = truncate(item?.abstract || '', 340)
    const authors = Array.isArray(item?.authors) ? item.authors.map((author) => cleanText(author?.name || '')).filter(Boolean) : []
    const venue = cleanText(item?.journal?.name || item?.venue || '')
    const publishedAt = toIsoDate(item?.publicationDate || (item?.year ? `${item.year}-01-01` : ''))
    const externalIds = item?.externalIds && typeof item.externalIds === 'object' ? item.externalIds : {}
    const doi = normalizeDoi(externalIds.DOI || '')
    const arxivId = extractArxivId(externalIds.ArXiv || externalIds.ARXIV || '')
    const pubmedId = cleanText(externalIds.PubMed || externalIds.PMID || '')
    const publicationTypes = Array.isArray(item?.publicationTypes) ? item.publicationTypes.map((entry) => cleanText(entry)).filter(Boolean) : []
    const fieldsOfStudy = Array.isArray(item?.fieldsOfStudy) ? item.fieldsOfStudy.map((entry) => cleanText(entry)).filter(Boolean) : []
    const isPreprint = Boolean(arxivId) || publicationTypes.some((entry) => /preprint/i.test(entry)) || /biorxiv|medrxiv|arxiv/i.test(venue)
    const peerReviewed = !isPreprint && (publicationTypes.some((entry) => /journal|review|conference/i.test(entry)) || /transactions|journal|nature|science|cell|ieee|acm/i.test(venue))
    const link = toHttpsUrl(item?.url || item?.openAccessPdf?.url || (doi ? `https://doi.org/${doi}` : ''))
    const openAccessPdfUrl = toHttpsUrl(item?.openAccessPdf?.url || '')

    return {
      title,
      snippet: abstract || truncate([venue, yearFromDate(publishedAt || '')].filter(Boolean).join(' | '), 320),
      link,
      provider: 'semanticscholar',
      resultType: 'academic',
      sourceKind: isPreprint ? 'preprint_search' : (peerReviewed ? 'journal_search' : 'academic_search'),
      type: isPreprint ? 'preprint' : 'paper',
      verificationStatus: isPreprint ? 'preprint_indexed' : 'indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: venue || 'Semantic Scholar indexed work',
        doi,
        citationCount: item?.citationCount,
        peerReviewed,
        preprint: isPreprint,
        sourceLabel: isPreprint ? 'Semantic Scholar preprint' : (peerReviewed ? 'Semantic Scholar scholarly graph' : 'Semantic Scholar indexed paper'),
        openAccess: Boolean(item?.openAccessPdf?.url),
        externalIds: {
          semanticScholarId: cleanText(item?.paperId || ''),
          corpusId: cleanText(item?.corpusId || ''),
          arxivId,
          pubmedId,
          publicationTypes,
          openAccessPdfUrl,
        },
        sourceProviders: ['semanticscholar'],
        topics: fieldsOfStudy,
        keywords: fieldsOfStudy,
      }),
    }
  }).filter((item) => item.title && item.link)
}

const buildEuropePmcLink = (item = {}) => {
  const pmcid = cleanText(item?.pmcid || '')
  const pmid = cleanText(item?.pmid || '')
  const doi = normalizeDoi(item?.doi || '')
  const fullTextUrl = toHttpsUrl(item?.fullTextUrl || '')

  if (pmcid) return `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
  if (doi) return `https://doi.org/${doi}`
  return fullTextUrl
}

const searchEuropePmc = async (query, limit = 4) => {
  const response = await fetchWithTimeout(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${Math.min(EUROPEPMC_SEARCH_CAP, limit)}&resultType=core`,
    {
      headers: {
        'User-Agent': 'AI-Gods-Project/1.0 (academic search)',
        'Accept': 'application/json',
      },
    }
  )

  if (!response.ok) throw new Error(`Europe PMC 응답 오류: ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  const results = Array.isArray(payload?.resultList?.result) ? payload.resultList.result : []

  return results.map((item, index) => {
    const title = cleanText(item?.title || `Europe PMC result ${index + 1}`)
    const abstract = truncate(item?.abstractText || '', 340)
    const authors = splitAuthorString(item?.authorString || '')
    const venue = cleanText(item?.journalTitle || '')
    const publishedAt = toIsoDate(item?.firstPublicationDate || (item?.pubYear ? `${item.pubYear}-01-01` : ''))
    const doi = normalizeDoi(item?.doi || '')
    const pubType = cleanText(item?.pubType || '')
    const source = cleanText(item?.source || '')
    const link = buildEuropePmcLink(item)
    const isPreprint = /preprint|biorxiv|medrxiv|research square|arxiv/i.test([venue, pubType, source].join(' '))
    const peerReviewed = !isPreprint && Boolean(cleanText(item?.pmid || ''))

    return {
      title,
      snippet: abstract || truncate([venue || source || 'Europe PMC', yearFromDate(publishedAt || '')].filter(Boolean).join(' | '), 320),
      link,
      provider: 'europepmc',
      resultType: 'academic',
      sourceKind: isPreprint ? 'preprint_search' : (peerReviewed ? 'journal_search' : 'academic_search'),
      type: isPreprint ? 'preprint' : 'paper',
      verificationStatus: isPreprint ? 'preprint_indexed' : 'indexed',
      metadata: buildAcademicMeta({
        authors,
        publishedAt,
        venue: venue || 'Europe PMC indexed literature',
        doi,
        citationCount: item?.citedByCount,
        peerReviewed,
        preprint: isPreprint,
        sourceLabel: isPreprint ? 'Europe PMC preprint' : 'Europe PMC indexed article',
        openAccess: /y/i.test(cleanText(item?.isOpenAccess || '')),
        externalIds: {
          europePmcId: cleanText(item?.id || ''),
          pubmedId: cleanText(item?.pmid || ''),
          pmcid: cleanText(item?.pmcid || ''),
          source,
          pubType,
          fullTextUrl: toHttpsUrl(item?.fullTextUrl || ''),
          primaryUrl: link,
        },
        sourceProviders: ['europepmc'],
      }),
    }
  }).filter((item) => item.title && item.link)
}

const getOpenReviewConfig = () => {
  const id = cleanText(process.env.OPENREVIEW_ID || process.env.OPENREVIEW_EMAIL || process.env.OPENREVIEW_USERNAME || '')
  const password = cleanText(process.env.OPENREVIEW_PASSWORD || '')
  const accessToken = cleanText(process.env.OPENREVIEW_ACCESS_TOKEN || '')
  const refreshToken = cleanText(process.env.OPENREVIEW_REFRESH_TOKEN || '')
  const rawCookie = cleanText(process.env.OPENREVIEW_COOKIE || '')
  const enabledFlag = cleanText(process.env.OPENREVIEW_ENABLED || '')
  const baseUrl = cleanText(process.env.OPENREVIEW_API_BASE_URL || OPENREVIEW_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const hasStaticCookie = Boolean(rawCookie || accessToken)
  const hasLogin = Boolean(id && password)
  const enabled = enabledFlag
    ? !/^(0|false|off|no)$/i.test(enabledFlag)
    : (hasStaticCookie || hasLogin)

  return {
    baseUrl: baseUrl || OPENREVIEW_DEFAULT_BASE_URL,
    id,
    password,
    accessToken,
    refreshToken,
    rawCookie,
    hasStaticCookie,
    hasLogin,
    loginIdLooksLikeEmail: !id || id.includes('@'),
    enabled,
  }
}

const buildOpenReviewLoginIdFormatError = () => {
  const error = new Error('OPENREVIEW_ID 에 @ 가 없습니다. OpenReview ID/password 로그인은 실제 로그인 이메일을 사용하세요. 다른 식별자를 써야 한다면 OPENREVIEW_ACCESS_TOKEN 또는 OPENREVIEW_REFRESH_TOKEN 을 사용하세요.')
  error.code = 'openreview_login_id_format'
  error.status = 400
  return error
}

const isOpenReviewEnabled = () => {
  const config = getOpenReviewConfig()
  return Boolean(config.enabled && (config.hasStaticCookie || config.hasLogin))
}

const splitCookieLikeHeader = (value = '') => String(value)
  .split(/,(?=[^;,]+=)/g)
  .map((part) => part.trim())
  .filter(Boolean)

const extractCookiePair = (value = '') => {
  const pair = cleanText(String(value || '').split(';')[0] || '')
  return pair.includes('=') ? pair : ''
}

const buildCookieHeader = (...groups) => {
  const pairsByName = new Map()

  for (const group of groups) {
    const candidates = Array.isArray(group)
      ? group
      : String(group || '').includes('; ')
        ? String(group).split(/;\s*/)
        : [group]

    for (const candidate of candidates) {
      const pair = extractCookiePair(candidate)
      if (!pair) continue
      const separatorIndex = pair.indexOf('=')
      if (separatorIndex <= 0) continue
      const name = pair.slice(0, separatorIndex).trim()
      if (!name) continue
      pairsByName.set(name, pair)
    }
  }

  return [...pairsByName.values()].join('; ')
}

const getCookieValueFromHeader = (cookieHeader = '', cookieName = '') => {
  const pairs = String(cookieHeader || '').split(/;\s*/)
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=')
    if (separatorIndex <= 0) continue
    const name = pair.slice(0, separatorIndex).trim()
    if (name !== cookieName) continue
    return pair.slice(separatorIndex + 1).trim()
  }
  return ''
}

const decodeJwtPayload = (token = '') => {
  const segments = String(token || '').split('.')
  if (segments.length < 2) return null

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

const getTokenExpiryMs = (token = '') => {
  const payload = decodeJwtPayload(token)
  const expiresAtSeconds = Number(payload?.exp || 0)
  return Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0 ? expiresAtSeconds * 1000 : 0
}

const resetOpenReviewSessionCache = () => {
  openReviewSessionCache.baseUrl = ''
  openReviewSessionCache.id = ''
  openReviewSessionCache.cookieHeader = ''
  openReviewSessionCache.accessToken = ''
  openReviewSessionCache.refreshToken = ''
  openReviewSessionCache.expiresAt = 0
  openReviewSessionCache.refreshExpiresAt = 0
  openReviewSessionCache.authMode = ''
}

const seedOpenReviewSessionCache = (config = getOpenReviewConfig()) => {
  const staticCookieHeader = buildCookieHeader(
    config.rawCookie,
    config.accessToken ? `openreview.accessToken=${config.accessToken}` : '',
    config.refreshToken ? `openreview.refreshToken=${config.refreshToken}` : ''
  )

  if (!staticCookieHeader) return

  if (
    openReviewSessionCache.baseUrl === config.baseUrl
    && openReviewSessionCache.id === config.id
    && openReviewSessionCache.cookieHeader === staticCookieHeader
  ) {
    return
  }

  openReviewSessionCache.baseUrl = config.baseUrl
  openReviewSessionCache.id = config.id
  openReviewSessionCache.cookieHeader = staticCookieHeader
  openReviewSessionCache.accessToken = getCookieValueFromHeader(staticCookieHeader, 'openreview.accessToken') || config.accessToken
  openReviewSessionCache.refreshToken = getCookieValueFromHeader(staticCookieHeader, 'openreview.refreshToken') || config.refreshToken
  openReviewSessionCache.expiresAt = getTokenExpiryMs(openReviewSessionCache.accessToken) || (Date.now() + 45 * 60 * 1000)
  openReviewSessionCache.refreshExpiresAt = getTokenExpiryMs(openReviewSessionCache.refreshToken) || (Date.now() + 7 * 24 * 60 * 60 * 1000)
  openReviewSessionCache.authMode = 'static'
}

const extractSetCookiePairs = (response) => {
  if (typeof response?.headers?.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((value) => extractCookiePair(value)).filter(Boolean)
  }

  return splitCookieLikeHeader(response?.headers?.get('set-cookie') || '')
    .map((value) => extractCookiePair(value))
    .filter(Boolean)
}

const updateOpenReviewSessionCache = ({ payload = {}, response = null, config = getOpenReviewConfig(), authMode = '' } = {}) => {
  const bodyAccessToken = cleanText(payload?.token || payload?.accessToken || payload?.access_token || '')
  const bodyRefreshToken = cleanText(payload?.refreshToken || payload?.refresh_token || '')
  const cookieHeader = buildCookieHeader(
    openReviewSessionCache.cookieHeader,
    extractSetCookiePairs(response),
    bodyAccessToken ? `openreview.accessToken=${bodyAccessToken}` : '',
    bodyRefreshToken ? `openreview.refreshToken=${bodyRefreshToken}` : ''
  )

  openReviewSessionCache.baseUrl = config.baseUrl
  openReviewSessionCache.id = config.id
  openReviewSessionCache.cookieHeader = cookieHeader
  openReviewSessionCache.accessToken = getCookieValueFromHeader(cookieHeader, 'openreview.accessToken') || bodyAccessToken
  openReviewSessionCache.refreshToken = getCookieValueFromHeader(cookieHeader, 'openreview.refreshToken') || bodyRefreshToken
  openReviewSessionCache.expiresAt = getTokenExpiryMs(openReviewSessionCache.accessToken) || (Date.now() + 45 * 60 * 1000)
  openReviewSessionCache.refreshExpiresAt = getTokenExpiryMs(openReviewSessionCache.refreshToken) || (Date.now() + 7 * 24 * 60 * 60 * 1000)
  openReviewSessionCache.authMode = authMode || openReviewSessionCache.authMode || (config.hasStaticCookie ? 'static' : 'login')
}

const buildOpenReviewError = (status, payload = {}, fallbackMessage = '') => {
  const error = new Error(cleanText(payload?.message || payload?.error || payload?.details || fallbackMessage || `OpenReview 응답 오류: ${status}`))
  error.status = status
  return error
}

const loginOpenReview = async () => {
  const config = getOpenReviewConfig()
  if (!config.enabled || !config.hasLogin) return false
  if (!config.loginIdLooksLikeEmail) throw buildOpenReviewLoginIdFormatError()

  const response = await fetchWithTimeout(`${config.baseUrl}/login`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: config.id,
      password: config.password,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = buildOpenReviewError(response.status, payload, `OpenReview 로그인 오류: ${response.status}`)
    if (/mfa|2fa|two-factor|verification/i.test(cleanText(error.message))) {
      error.code = 'openreview_mfa_required'
    }
    throw error
  }

  updateOpenReviewSessionCache({ payload, response, config, authMode: 'login' })
  return Boolean(openReviewSessionCache.cookieHeader)
}

const refreshOpenReviewSession = async () => {
  const config = getOpenReviewConfig()
  seedOpenReviewSessionCache(config)
  if (!config.enabled || !openReviewSessionCache.cookieHeader) return false

  const response = await fetchWithTimeout(`${config.baseUrl}/refreshToken`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Cookie': openReviewSessionCache.cookieHeader,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) return false

  updateOpenReviewSessionCache({ payload, response, config, authMode: openReviewSessionCache.authMode || 'refresh' })
  return Boolean(openReviewSessionCache.cookieHeader)
}

const ensureOpenReviewSession = async () => {
  const config = getOpenReviewConfig()
  if (!config.enabled) return ''

  seedOpenReviewSessionCache(config)

  const sessionMatchesConfig = openReviewSessionCache.baseUrl === config.baseUrl && openReviewSessionCache.id === config.id
  if (sessionMatchesConfig && openReviewSessionCache.cookieHeader && openReviewSessionCache.expiresAt > Date.now() + OPENREVIEW_SESSION_SKEW_MS) {
    return openReviewSessionCache.cookieHeader
  }

  if (sessionMatchesConfig && openReviewSessionCache.cookieHeader && openReviewSessionCache.refreshExpiresAt > Date.now() + OPENREVIEW_SESSION_SKEW_MS) {
    const refreshed = await refreshOpenReviewSession()
    if (refreshed) return openReviewSessionCache.cookieHeader
  }

  if (config.hasLogin) {
    await loginOpenReview()
    return openReviewSessionCache.cookieHeader
  }

  return openReviewSessionCache.cookieHeader || ''
}

const requestOpenReviewJson = async (path, params = {}, allowRetry = true) => {
  const config = getOpenReviewConfig()
  if (!config.enabled) throw new Error('OpenReview가 비활성화되어 있습니다.')

  const cookieHeader = await ensureOpenReviewSession()
  const url = new URL(`${config.baseUrl}${path}`)
  for (const [key, value] of Object.entries(params || {})) {
    const text = cleanText(value)
    if (!text) continue
    url.searchParams.set(key, text)
  }

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      'Accept': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (response.ok) {
    updateOpenReviewSessionCache({ payload, response, config })
    return payload
  }

  if ((response.status === 401 || response.status === 403) && allowRetry) {
    if (config.hasLogin) {
      resetOpenReviewSessionCache()
      seedOpenReviewSessionCache(config)
      try {
        await loginOpenReview()
        return await requestOpenReviewJson(path, params, false)
      } catch (error) {
        if (error?.code === 'openreview_mfa_required' || error?.code === 'openreview_login_id_format') throw error
      }
    }

    if (openReviewSessionCache.refreshExpiresAt > Date.now() + OPENREVIEW_SESSION_SKEW_MS) {
      const refreshed = await refreshOpenReviewSession()
      if (refreshed) return await requestOpenReviewJson(path, params, false)
    }
  }

  throw buildOpenReviewError(response.status, payload, `OpenReview 응답 오류: ${response.status}`)
}

const unwrapOpenReviewValue = (value) => {
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const unwrapped = unwrapOpenReviewValue(entry)
      return Array.isArray(unwrapped) ? unwrapped : [unwrapped]
    })
  }

  if (typeof value === 'object') {
    if ('value' in value) return unwrapOpenReviewValue(value.value)
    if ('values' in value) return unwrapOpenReviewValue(value.values)
    if ('items' in value) return unwrapOpenReviewValue(value.items)
    if ('choices' in value) return unwrapOpenReviewValue(value.choices)
    if ('text' in value) return unwrapOpenReviewValue(value.text)
    if ('name' in value) return cleanText(value.name)
    if ('label' in value) return cleanText(value.label)
    if ('id' in value) return cleanText(value.id)
  }

  return value
}

const openReviewValueToArray = (value) => {
  const unwrapped = unwrapOpenReviewValue(value)
  if (Array.isArray(unwrapped)) {
    return mergeStringArrays(unwrapped.map((entry) => {
      if (typeof entry === 'object') return cleanText(entry?.name || entry?.label || entry?.id || '')
      return cleanText(entry)
    }).filter(Boolean))
  }

  if (typeof unwrapped === 'object') {
    return mergeStringArrays([cleanText(unwrapped?.name || unwrapped?.label || unwrapped?.id || '')])
  }

  const text = cleanText(unwrapped)
  return text ? [text] : []
}

const openReviewValueToString = (value) => openReviewValueToArray(value).join(', ')

const getOpenReviewNoteField = (note = {}, aliases = []) => {
  for (const alias of aliases) {
    if (note?.content && note.content[alias] != null) return note.content[alias]
    if (note?.details?.content && note.details.content[alias] != null) return note.details.content[alias]
    if (note?.[alias] != null) return note[alias]
  }
  return null
}

const parseOpenReviewNumber = (value) => {
  const match = openReviewValueToString(value).match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

const prettifyOpenReviewVenue = (value = '') => {
  const text = cleanText(value)
  if (!text) return ''
  return text
    .replace(/\/-\/.+$/, '')
    .split('/')
    .filter(Boolean)
    .slice(-3)
    .join(' ')
    .replace(/_/g, ' ')
}

const buildOpenReviewForumUrl = (note = {}) => {
  const forumId = cleanText(note?.forum || note?.id || '')
  if (!forumId) return ''
  return `https://openreview.net/forum?id=${encodeURIComponent(forumId)}`
}

const isOpenReviewSubmissionLike = (note = {}) => {
  const invitation = cleanText(note?.invitation || '')
  if (
    OPENREVIEW_DECISION_INVITATION_RE.test(invitation)
    || OPENREVIEW_METAREVIEW_INVITATION_RE.test(invitation)
    || OPENREVIEW_COMMENT_INVITATION_RE.test(invitation)
    || OPENREVIEW_REVIEW_INVITATION_RE.test(invitation)
  ) {
    return false
  }

  const title = openReviewValueToString(getOpenReviewNoteField(note, ['title', 'paper_title']))
  const abstract = openReviewValueToString(getOpenReviewNoteField(note, ['abstract', 'summary', 'TL;DR', 'tldr']))
  return Boolean(title) && (Boolean(abstract) || /submission|blind[_\s-]*submission|paper/i.test(invitation))
}

const extractOpenReviewReplies = (note = {}) => {
  const directReplies = Array.isArray(note?.details?.directReplies)
    ? note.details.directReplies
    : Array.isArray(note?.details?.replies)
      ? note.details.replies
      : []
  return directReplies.filter(Boolean)
}

const fetchOpenReviewReplies = async (note = {}) => {
  const existingReplies = extractOpenReviewReplies(note)
  if (existingReplies.length > 0) return existingReplies

  const forumId = cleanText(note?.forum || note?.id || '')
  if (!forumId) return []

  const forumPayload = await requestOpenReviewJson('/notes', {
    forum: forumId,
    details: 'directReplies',
    limit: '1',
  }).catch(() => null)
  const forumNote = Array.isArray(forumPayload?.notes) ? forumPayload.notes[0] : null
  const forumReplies = extractOpenReviewReplies(forumNote)
  if (forumReplies.length > 0) return forumReplies

  const noteId = cleanText(note?.id || '')
  if (!noteId) return []

  const notePayload = await requestOpenReviewJson('/notes', {
    id: noteId,
    details: 'directReplies',
    limit: '1',
  }).catch(() => null)
  const noteDetails = Array.isArray(notePayload?.notes) ? notePayload.notes[0] : null
  return extractOpenReviewReplies(noteDetails)
}

const fetchOpenReviewRootNote = async (note = {}) => {
  if (isOpenReviewSubmissionLike(note)) return note

  const rootId = cleanText(note?.forum || note?.id || '')
  if (!rootId) return null

  const payload = await requestOpenReviewJson('/notes', {
    id: rootId,
    details: 'directReplies',
    limit: '1',
  }).catch(() => null)

  return Array.isArray(payload?.notes) ? payload.notes[0] || null : null
}

const normalizeOpenReviewDecisionStatus = (decisionText = '') => {
  if (OPENREVIEW_ACCEPT_PATTERNS.test(decisionText)) return 'accepted'
  if (OPENREVIEW_REJECT_PATTERNS.test(decisionText)) return 'rejected'
  return decisionText ? 'under_review' : 'submitted'
}

const buildOpenReviewReviewSignals = (replies = []) => {
  const reviewNotes = []
  const metaReviewNotes = []
  const decisionNotes = []
  let publicCommentCount = 0

  for (const reply of Array.isArray(replies) ? replies : []) {
    const invitation = cleanText(reply?.invitation || '')
    const decisionText = openReviewValueToString(getOpenReviewNoteField(reply, ['decision', 'recommendation', 'final_decision', 'venue']))
    const hasRating = Number.isFinite(parseOpenReviewNumber(getOpenReviewNoteField(reply, ['rating'])))
    const hasConfidence = Number.isFinite(parseOpenReviewNumber(getOpenReviewNoteField(reply, ['confidence'])))

    if (OPENREVIEW_DECISION_INVITATION_RE.test(invitation) || decisionText) {
      decisionNotes.push(reply)
      continue
    }

    if (OPENREVIEW_METAREVIEW_INVITATION_RE.test(invitation)) {
      metaReviewNotes.push(reply)
      continue
    }

    if (OPENREVIEW_COMMENT_INVITATION_RE.test(invitation)) {
      publicCommentCount += 1
      continue
    }

    if (OPENREVIEW_REVIEW_INVITATION_RE.test(invitation) || hasRating || hasConfidence) {
      reviewNotes.push(reply)
    }
  }

  const ratings = reviewNotes.map((reply) => parseOpenReviewNumber(getOpenReviewNoteField(reply, ['rating']))).filter(Number.isFinite)
  const confidences = reviewNotes.map((reply) => parseOpenReviewNumber(getOpenReviewNoteField(reply, ['confidence']))).filter(Number.isFinite)
  const decisionText = decisionNotes
    .map((reply) => openReviewValueToString(getOpenReviewNoteField(reply, ['decision', 'recommendation', 'final_decision', 'venue'])))
    .find(Boolean) || ''

  return {
    reviewCount: reviewNotes.length,
    metaReviewCount: metaReviewNotes.length,
    decisionCount: decisionNotes.length,
    publicCommentCount,
    replyCount: Array.isArray(replies) ? replies.length : 0,
    averageRating: ratings.length > 0 ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)) : null,
    averageConfidence: confidences.length > 0 ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(1)) : null,
    decisionLabel: truncate(decisionText, 120),
    decisionStatus: normalizeOpenReviewDecisionStatus(decisionText),
  }
}

const buildOpenReviewSourceLabel = (reviewSignals = {}) => {
  if (reviewSignals.decisionStatus === 'accepted') return 'OpenReview accepted peer-review record'
  if (reviewSignals.decisionStatus === 'rejected') return 'OpenReview reviewed submission'
  if (Number(reviewSignals.reviewCount || 0) > 0 || Number(reviewSignals.metaReviewCount || 0) > 0) {
    return 'OpenReview peer-review discussion'
  }
  return 'OpenReview submission metadata'
}

const buildOpenReviewSnippet = ({ abstract = '', reviewSignals = {}, venue = '', year = '', keywords = [] } = {}) => {
  const reviewBits = []
  if (reviewSignals.decisionLabel) reviewBits.push(reviewSignals.decisionLabel)
  else if (reviewSignals.decisionStatus === 'under_review') reviewBits.push('under review')
  if (Number(reviewSignals.reviewCount || 0) > 0) reviewBits.push(`reviews ${reviewSignals.reviewCount}`)
  if (Number(reviewSignals.metaReviewCount || 0) > 0) reviewBits.push(`meta reviews ${reviewSignals.metaReviewCount}`)
  if (Number.isFinite(Number(reviewSignals.averageRating))) reviewBits.push(`avg rating ${Number(reviewSignals.averageRating).toFixed(1)}`)
  if (Number.isFinite(Number(reviewSignals.averageConfidence))) reviewBits.push(`avg confidence ${Number(reviewSignals.averageConfidence).toFixed(1)}`)

  const topicBits = mergeStringArrays(keywords.slice(0, 3), [venue, year].filter(Boolean))
  return truncate([
    reviewBits.join(' | '),
    abstract,
    topicBits.join(' | '),
  ].filter(Boolean).join(' | '), 340)
}

const mapOpenReviewNote = (note = {}, replies = []) => {
  const title = cleanText(openReviewValueToString(getOpenReviewNoteField(note, ['title', 'paper_title'])))
  if (!title) return null

  const abstract = truncate(openReviewValueToString(getOpenReviewNoteField(note, ['abstract', 'summary', 'TL;DR', 'tldr'])), 340)
  const authors = openReviewValueToArray(getOpenReviewNoteField(note, ['authors', 'authorids']))
  const keywords = openReviewValueToArray(getOpenReviewNoteField(note, ['keywords', 'subject_areas', 'areas']))
  const decisionSignals = buildOpenReviewReviewSignals(replies)
  const venue = cleanText(
    openReviewValueToString(getOpenReviewNoteField(note, ['venue', 'venueid']))
    || prettifyOpenReviewVenue(note?.invitation || '')
  )
  const forumId = cleanText(note?.forum || note?.id || '')
  const noteId = cleanText(note?.id || '')
  const pdfUrl = toAbsoluteUrl(openReviewValueToString(getOpenReviewNoteField(note, ['pdf'])), 'https://openreview.net')
  const doi = normalizeDoi(openReviewValueToString(getOpenReviewNoteField(note, ['doi'])))
  const publishedAt = toIsoDate(note?.pdate || note?.tcdate || note?.tmdate || note?.cdate || '')
  const primaryTopic = keywords[0] || venue
  const relevanceScore = Number(note?.score || note?.searchScore || note?.details?.score || 0) || null
  const peerReviewed = ['accepted', 'rejected'].includes(decisionSignals.decisionStatus) || Number(decisionSignals.reviewCount || 0) > 0 || Number(decisionSignals.metaReviewCount || 0) > 0

  return {
    title,
    snippet: buildOpenReviewSnippet({
      abstract,
      reviewSignals: decisionSignals,
      venue,
      year: yearFromDate(publishedAt || ''),
      keywords,
    }),
    link: buildOpenReviewForumUrl(note),
    provider: 'openreview',
    resultType: 'academic',
    sourceKind: peerReviewed ? 'academic_search' : 'preprint_search',
    type: 'paper',
    verificationStatus: peerReviewed ? 'indexed' : 'retrieved',
    metadata: buildAcademicMeta({
      authors,
      publishedAt,
      venue: venue || 'OpenReview submission',
      doi,
      peerReviewed,
      preprint: !peerReviewed,
      scholarly: true,
      sourceLabel: buildOpenReviewSourceLabel(decisionSignals),
      openAccess: Boolean(pdfUrl),
      externalIds: {
        openreviewForumId: forumId,
        openreviewNoteId: noteId,
        invitation: cleanText(note?.invitation || ''),
        pdfUrl,
      },
      sourceProviders: ['openreview'],
      relevanceScore,
      primaryTopic,
      topics: mergeStringArrays(keywords, decisionSignals.decisionLabel ? [decisionSignals.decisionLabel] : []),
      keywords,
      reviewSignals: decisionSignals,
    }),
  }
}

const searchOpenReview = async (query, limit = 4) => {
  if (!isOpenReviewEnabled()) return []

  const payload = await requestOpenReviewJson('/notes/search', {
    term: query,
    limit: String(Math.min(OPENREVIEW_SEARCH_FETCH_CAP, Math.max(limit * 3, limit + 4))),
  })

  const rawNotes = Array.isArray(payload?.notes) ? payload.notes : Array.isArray(payload?.results) ? payload.results : []
  const seenRootIds = new Set()
  const rootNoteCandidates = rawNotes
    .map((note) => ({ note, rootId: cleanText(note?.forum || note?.id || '') }))
    .filter(({ rootId }) => {
      if (!rootId || seenRootIds.has(rootId)) return false
      seenRootIds.add(rootId)
      return true
    })
    .slice(0, Math.min(OPENREVIEW_SEARCH_FETCH_CAP, Math.max(limit * 3, limit + 4)))

  const notes = (await Promise.all(rootNoteCandidates.map(async ({ note }) => {
    try {
      return await fetchOpenReviewRootNote(note)
    } catch (error) {
      console.warn('[Search] OpenReview root note fetch 실패:', error.message || error)
      return isOpenReviewSubmissionLike(note) ? note : null
    }
  })))
    .filter((note) => note && isOpenReviewSubmissionLike(note))
    .slice(0, Math.min(OPENREVIEW_SEARCH_FETCH_CAP, Math.max(limit * 2, limit + 2)))

  const enrichedNotes = await Promise.all(notes.map(async (note, index) => {
    if (index >= OPENREVIEW_ENRICH_CAP) return { note, replies: extractOpenReviewReplies(note) }

    try {
      return { note, replies: await fetchOpenReviewReplies(note) }
    } catch (error) {
      console.warn('[Search] OpenReview reply fetch 실패:', error.message || error)
      return { note, replies: extractOpenReviewReplies(note) }
    }
  }))

  return enrichedNotes
    .map(({ note, replies }) => mapOpenReviewNote(note, replies))
    .filter((item) => item?.title && item?.link)
    .slice(0, limit)
}

const selectStrongerValue = (left, right, priorityMap = {}) => {
  const leftScore = priorityMap[cleanText(left)] || 0
  const rightScore = priorityMap[cleanText(right)] || 0
  return rightScore > leftScore ? right : left
}

const scoreLink = (url = '') => {
  const value = cleanText(url).toLowerCase()
  if (!value) return 0
  if (/pubmed\.ncbi\.nlm\.nih\.gov/.test(value)) return 40
  if (/arxiv\.org\/(abs|pdf)\//.test(value)) return 36
  if (/doi\.org\//.test(value)) return 34
  if (/\/papers\//.test(value)) return 32
  if (/\.pdf($|\?)/.test(value)) return 26
  if (/openalex\.org/.test(value)) return 8
  return 20
}

const pickPreferredLink = (left = '', right = '') => {
  const leftUrl = toHttpsUrl(left)
  const rightUrl = toHttpsUrl(right)
  if (!leftUrl) return rightUrl
  if (!rightUrl) return leftUrl
  return scoreLink(rightUrl) > scoreLink(leftUrl) ? rightUrl : leftUrl
}

const selectPrimaryProvider = (left = '', right = '') => {
  const leftScore = PROVIDER_PRIORITY[cleanText(left)] || 0
  const rightScore = PROVIDER_PRIORITY[cleanText(right)] || 0
  return rightScore > leftScore ? right : left
}

const pickPreferredText = (left = '', right = '') => {
  const leftText = cleanText(left)
  const rightText = cleanText(right)
  if (!leftText) return rightText
  if (!rightText) return leftText
  return rightText.length > leftText.length + 6 ? rightText : leftText
}

const pickPreferredDate = (left = '', right = '') => {
  const leftTime = Date.parse(String(left || ''))
  const rightTime = Date.parse(String(right || ''))
  if (Number.isNaN(leftTime)) return right || null
  if (Number.isNaN(rightTime)) return left || null
  return rightTime > leftTime ? right : left
}

const OPENREVIEW_DECISION_STATUS_PRIORITY = {
  accepted: 4,
  rejected: 3,
  under_review: 2,
  submitted: 1,
}

const mergeReviewSignals = (baseSignals = {}, incomingSignals = {}) => {
  const baseStatus = cleanText(baseSignals.decisionStatus || '')
  const incomingStatus = cleanText(incomingSignals.decisionStatus || '')
  const decisionStatus = (OPENREVIEW_DECISION_STATUS_PRIORITY[incomingStatus] || 0) > (OPENREVIEW_DECISION_STATUS_PRIORITY[baseStatus] || 0)
    ? incomingStatus
    : baseStatus

  return {
    ...baseSignals,
    ...incomingSignals,
    reviewCount: Math.max(Number(baseSignals.reviewCount || 0), Number(incomingSignals.reviewCount || 0)) || 0,
    metaReviewCount: Math.max(Number(baseSignals.metaReviewCount || 0), Number(incomingSignals.metaReviewCount || 0)) || 0,
    decisionCount: Math.max(Number(baseSignals.decisionCount || 0), Number(incomingSignals.decisionCount || 0)) || 0,
    publicCommentCount: Math.max(Number(baseSignals.publicCommentCount || 0), Number(incomingSignals.publicCommentCount || 0)) || 0,
    replyCount: Math.max(Number(baseSignals.replyCount || 0), Number(incomingSignals.replyCount || 0)) || 0,
    averageRating: Number.isFinite(Number(incomingSignals.averageRating)) ? Number(incomingSignals.averageRating) : (Number.isFinite(Number(baseSignals.averageRating)) ? Number(baseSignals.averageRating) : null),
    averageConfidence: Number.isFinite(Number(incomingSignals.averageConfidence)) ? Number(incomingSignals.averageConfidence) : (Number.isFinite(Number(baseSignals.averageConfidence)) ? Number(baseSignals.averageConfidence) : null),
    decisionLabel: pickPreferredText(baseSignals.decisionLabel, incomingSignals.decisionLabel),
    decisionStatus,
  }
}

const mergeAcademicMeta = (baseMeta = {}, incomingMeta = {}) => {
  const peerReviewed = Boolean(baseMeta.peerReviewed || incomingMeta.peerReviewed)
  const baseCommunity = baseMeta.communitySignals && typeof baseMeta.communitySignals === 'object' ? baseMeta.communitySignals : {}
  const incomingCommunity = incomingMeta.communitySignals && typeof incomingMeta.communitySignals === 'object' ? incomingMeta.communitySignals : {}
  const baseBenchmark = baseMeta.benchmarkSignals && typeof baseMeta.benchmarkSignals === 'object' ? baseMeta.benchmarkSignals : {}
  const incomingBenchmark = incomingMeta.benchmarkSignals && typeof incomingMeta.benchmarkSignals === 'object' ? incomingMeta.benchmarkSignals : {}
  const baseReview = baseMeta.reviewSignals && typeof baseMeta.reviewSignals === 'object' ? baseMeta.reviewSignals : {}
  const incomingReview = incomingMeta.reviewSignals && typeof incomingMeta.reviewSignals === 'object' ? incomingMeta.reviewSignals : {}
  const mergedVenue = pickPreferredText(baseMeta.venue, incomingMeta.venue)
  const mergedSourceLabel = pickPreferredText(baseMeta.sourceLabel, incomingMeta.sourceLabel)
  const mergedPrimaryUrl = cleanText(baseMeta?.externalIds?.primaryUrl || incomingMeta?.externalIds?.primaryUrl || '')

  return buildAcademicMeta({
    ...baseMeta,
    ...incomingMeta,
    authors: mergeStringArrays(baseMeta.authors || [], incomingMeta.authors || []).slice(0, 8),
    publishedAt: pickPreferredDate(baseMeta.publishedAt, incomingMeta.publishedAt),
    venue: mergedVenue,
    doi: cleanText(baseMeta.doi || incomingMeta.doi || ''),
    citationCount: Math.max(Number(baseMeta.citationCount || 0), Number(incomingMeta.citationCount || 0)) || null,
    peerReviewed,
    preprint: !peerReviewed && Boolean(baseMeta.preprint || incomingMeta.preprint),
    sourceLabel: mergedSourceLabel,
    openAccess: Boolean(baseMeta.openAccess || incomingMeta.openAccess),
    externalIds: {
      ...(baseMeta.externalIds || {}),
      ...(incomingMeta.externalIds || {}),
      primaryUrl: mergedPrimaryUrl,
    },
    sourceProviders: mergeStringArrays(baseMeta.sourceProviders || [], incomingMeta.sourceProviders || []).slice(0, 6),
    relevanceScore: Math.max(Number(baseMeta.relevanceScore || 0), Number(incomingMeta.relevanceScore || 0)) || null,
    primaryTopic: pickPreferredText(baseMeta.primaryTopic, incomingMeta.primaryTopic),
    topics: mergeStringArrays(baseMeta.topics || [], incomingMeta.topics || []).slice(0, 8),
    keywords: mergeStringArrays(baseMeta.keywords || [], incomingMeta.keywords || []).slice(0, 8),
    reviewSignals: mergeReviewSignals(baseReview, incomingReview),
    benchmarkSignals: {
      matchedTerms: mergeStringArrays(baseBenchmark.matchedTerms || [], incomingBenchmark.matchedTerms || []).slice(0, 6),
      matchedCount: Math.max(Number(baseBenchmark.matchedCount || 0), Number(incomingBenchmark.matchedCount || 0)),
      queryAligned: Boolean(baseBenchmark.queryAligned || incomingBenchmark.queryAligned),
    },
    communitySignals: {
      ...baseCommunity,
      ...incomingCommunity,
      source: cleanText(baseCommunity.source || incomingCommunity.source || ''),
      pageUrl: toHttpsUrl(baseCommunity.pageUrl || incomingCommunity.pageUrl || ''),
      githubUrl: toHttpsUrl(baseCommunity.githubUrl || incomingCommunity.githubUrl || ''),
      upvotes: Math.max(Number(baseCommunity.upvotes || 0), Number(incomingCommunity.upvotes || 0)) || null,
      collectionsCount: Math.max(Number(baseCommunity.collectionsCount || 0), Number(incomingCommunity.collectionsCount || 0)) || null,
      modelsCiting: Math.max(Number(baseCommunity.modelsCiting || 0), Number(incomingCommunity.modelsCiting || 0)) || null,
      datasetsCiting: Math.max(Number(baseCommunity.datasetsCiting || 0), Number(incomingCommunity.datasetsCiting || 0)) || null,
      spacesCiting: Math.max(Number(baseCommunity.spacesCiting || 0), Number(incomingCommunity.spacesCiting || 0)) || null,
    },
    venueSignals: mergeVenueSignals(baseMeta.venueSignals, incomingMeta.venueSignals, {
      venue: mergedVenue,
      sourceLabel: mergedSourceLabel,
      provider: mergeStringArrays(baseMeta.sourceProviders || [], incomingMeta.sourceProviders || [])[0] || '',
      link: mergedPrimaryUrl,
    }),
    rankingSignals: {
      ...(baseMeta.rankingSignals || {}),
      ...(incomingMeta.rankingSignals || {}),
    },
    scholarlyScore: Math.max(Number(baseMeta.scholarlyScore || 0), Number(incomingMeta.scholarlyScore || 0)) || null,
    excerptSource: pickPreferredText(baseMeta.excerptSource, incomingMeta.excerptSource),
    excerptSourceLabel: pickPreferredText(baseMeta.excerptSourceLabel, incomingMeta.excerptSourceLabel),
    abstractSnippet: pickPreferredText(baseMeta.abstractSnippet, incomingMeta.abstractSnippet),
    fullTextUrl: toHttpsUrl(baseMeta.fullTextUrl || incomingMeta.fullTextUrl || ''),
    fullTextSourceType: pickPreferredText(baseMeta.fullTextSourceType, incomingMeta.fullTextSourceType),
    fullTextFetched: Boolean(baseMeta.fullTextFetched || incomingMeta.fullTextFetched),
    fullTextCharCount: Math.max(Number(baseMeta.fullTextCharCount || 0), Number(incomingMeta.fullTextCharCount || 0)) || null,
    fullTextMatchedTokens: mergeStringArrays(baseMeta.fullTextMatchedTokens || [], incomingMeta.fullTextMatchedTokens || []).slice(0, 8),
  })
}

const getAcademicIdentityKeys = (item = {}) => {
  const metadata = item?.metadata || {}
  const keys = []
  const doi = normalizeDoi(metadata.doi || '')
  const arxivId = extractArxivId(metadata?.externalIds?.arxivId || '')
  const pubmedId = cleanText(metadata?.externalIds?.pubmedId || '')
  const openalexId = cleanText(metadata?.externalIds?.openalexId || '')
  const titleKey = normalizeTitleKey(item.title || '')
  const link = toHttpsUrl(item.link || '').toLowerCase()

  if (doi) keys.push(`doi:${doi}`)
  if (arxivId) keys.push(`arxiv:${arxivId}`)
  if (pubmedId) keys.push(`pubmed:${pubmedId}`)
  if (openalexId) keys.push(`openalex:${openalexId}`)
  if (link) keys.push(`link:${link}`)
  if (titleKey && titleKey.length >= 24) keys.push(`title:${titleKey}`)

  return mergeStringArrays(keys)
}

const mergeAcademicRecord = (baseItem = {}, incomingItem = {}) => {
  const primaryProvider = selectPrimaryProvider(baseItem.provider, incomingItem.provider)
  const primary = primaryProvider === incomingItem.provider ? incomingItem : baseItem

  return {
    ...baseItem,
    ...primary,
    title: pickPreferredText(baseItem.title, incomingItem.title) || primary.title,
    snippet: pickPreferredText(baseItem.snippet, incomingItem.snippet) || baseItem.snippet || incomingItem.snippet,
    link: pickPreferredLink(baseItem.link, incomingItem.link),
    provider: primaryProvider,
    resultType: 'academic',
    sourceKind: selectStrongerValue(baseItem.sourceKind, incomingItem.sourceKind, SOURCE_KIND_PRIORITY),
    type: selectStrongerValue(baseItem.type, incomingItem.type, TYPE_PRIORITY),
    verificationStatus: selectStrongerValue(baseItem.verificationStatus, incomingItem.verificationStatus, VERIFICATION_PRIORITY),
    metadata: mergeAcademicMeta(baseItem.metadata, incomingItem.metadata),
  }
}

const mergeAcademicResults = (items = []) => {
  const records = []
  const keyToRecord = new Map()

  for (const rawItem of items) {
    if (!rawItem?.title || !rawItem?.link) continue
    const item = {
      ...rawItem,
      link: toHttpsUrl(rawItem.link),
      metadata: buildAcademicMeta({
        ...(rawItem.metadata || {}),
        externalIds: {
          ...((rawItem.metadata && typeof rawItem.metadata === 'object' && rawItem.metadata.externalIds && typeof rawItem.metadata.externalIds === 'object') ? rawItem.metadata.externalIds : {}),
          primaryUrl: toHttpsUrl(rawItem.link),
        },
        sourceProviders: mergeStringArrays(rawItem?.metadata?.sourceProviders || [], [rawItem.provider]),
      }),
    }
    const identityKeys = getAcademicIdentityKeys(item)
    const existingRecord = identityKeys.map((key) => keyToRecord.get(key)).find(Boolean)

    if (!existingRecord) {
      records.push(item)
      for (const key of identityKeys) keyToRecord.set(key, item)
      continue
    }

    Object.assign(existingRecord, mergeAcademicRecord(existingRecord, item))
    for (const key of identityKeys) keyToRecord.set(key, existingRecord)
  }

  return records
}

const buildBenchmarkSignals = (item = {}, queryProfile = {}) => {
  const metadata = item?.metadata || {}
  const haystack = [
    item.title,
    item.snippet,
    metadata.primaryTopic,
    metadata.venue,
    ...(Array.isArray(metadata.topics) ? metadata.topics : []),
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
  ].filter(Boolean).join(' ')

  const patterns = [
    { label: 'benchmark', pattern: /benchmark|leaderboard|state of the art|sota|eval(?:uation|s)?|arena/i },
    { label: 'agent', pattern: /agentbench|swe-bench|tool use|multi-agent|agentic/i },
    { label: 'reasoning', pattern: /mmlu|gsm8k|gpqa|hellaswag|mmmu|livebench|reasoning/i },
    { label: 'systematic-review', pattern: /systematic review|meta-analysis/i },
    { label: 'clinical-trial', pattern: /clinical trial|randomized|cohort|guideline/i },
  ]

  const matchedTerms = patterns.filter(({ pattern }) => pattern.test(haystack)).map(({ label }) => label)
  const queryAligned = queryProfile.aiOrCs
    ? matchedTerms.some((term) => ['benchmark', 'agent', 'reasoning'].includes(term))
    : queryProfile.biomedical
      ? matchedTerms.some((term) => ['systematic-review', 'clinical-trial'].includes(term))
      : matchedTerms.length > 0

  return {
    matchedTerms,
    matchedCount: matchedTerms.length,
    queryAligned,
  }
}

const computeOpenReviewProcessScore = (reviewSignals = {}) => {
  let score = 0
  const decisionStatus = cleanText(reviewSignals.decisionStatus || '')

  if (decisionStatus === 'accepted') score += 12
  else if (decisionStatus === 'rejected') score += 7
  else if (decisionStatus === 'under_review') score += 4

  score += Math.min(8, Number(reviewSignals.reviewCount || 0) * 2)
  score += Math.min(4, Number(reviewSignals.metaReviewCount || 0) * 2)
  score += Math.min(3, Number(reviewSignals.publicCommentCount || 0))
  if (Number.isFinite(Number(reviewSignals.averageRating))) score += Math.min(8, Math.max(0, Math.round(Number(reviewSignals.averageRating))))
  if (Number.isFinite(Number(reviewSignals.averageConfidence))) score += Math.min(4, Math.max(0, Math.round(Number(reviewSignals.averageConfidence))))

  return Math.min(24, score)
}

const computeRecencyScore = (value = '') => {
  const year = Number(yearFromDate(value) || value)
  if (!Number.isFinite(year) || year <= 0) return 2
  const currentYear = new Date().getUTCFullYear()
  const age = Math.max(0, currentYear - year)
  if (age <= 1) return 10
  if (age <= 3) return 8
  if (age <= 5) return 6
  if (age <= 8) return 4
  return 2
}

const computeCommunitySignalScore = (communitySignals = {}) => {
  const upvotes = parseMetricNumber(communitySignals?.upvotes || 0)
  const collectionsCount = parseMetricNumber(communitySignals?.collectionsCount || 0)
  const modelsCiting = parseMetricNumber(communitySignals?.modelsCiting || 0)
  const datasetsCiting = parseMetricNumber(communitySignals?.datasetsCiting || 0)
  const spacesCiting = parseMetricNumber(communitySignals?.spacesCiting || 0)
  const githubScore = cleanText(communitySignals?.githubUrl || '') ? 3 : 0

  const upvoteScore = upvotes > 0 ? Math.min(10, Math.round(Math.log10(upvotes + 1) * 4)) : 0
  const collectionScore = collectionsCount > 0 ? Math.min(6, Math.round(Math.log10(collectionsCount + 1) * 4)) : 0
  const citationSurfaceScore = Math.min(6, modelsCiting * 2 + datasetsCiting * 2 + spacesCiting)

  return Math.min(18, upvoteScore + collectionScore + citationSurfaceScore + githubScore)
}

const computeQueryOverlapScore = (item = {}, queryTokens = []) => {
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
    return { score: 0, matchedTokens: [] }
  }

  const metadata = item?.metadata || {}
  const titleHaystack = [item.title, metadata.primaryTopic].filter(Boolean).join(' ')
  const secondaryHaystack = [
    item.snippet,
    metadata.venue,
    metadata.abstractSnippet,
    ...(Array.isArray(metadata.topics) ? metadata.topics : []),
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
    ...(Array.isArray(metadata.fullTextMatchedTokens) ? metadata.fullTextMatchedTokens : []),
  ].filter(Boolean).join(' ')

  const titleMatchedTokens = []
  const secondaryMatchedTokens = []
  let score = 0

  for (const token of queryTokens) {
    if (matchesQueryToken(titleHaystack, token)) {
      score += 7
      titleMatchedTokens.push(token)
      continue
    }

    if (matchesQueryToken(secondaryHaystack, token)) {
      score += 2
      secondaryMatchedTokens.push(token)
    }
  }

  const matchedTokens = mergeStringArrays(titleMatchedTokens, secondaryMatchedTokens)

  if (titleMatchedTokens.length === queryTokens.length && queryTokens.length > 1) {
    score += 6
  } else if (matchedTokens.length === queryTokens.length && queryTokens.length > 1) {
    score += 2
  }

  if (queryTokens.length >= 3 && matchedTokens.length <= 1) {
    score -= 12
  } else if (queryTokens.length >= 2 && titleMatchedTokens.length === 0) {
    score -= 8
  }

  return {
    score: clamp(score, -12, 30),
    matchedTokens,
  }
}

const countDomainTermMatches = (haystack = '', terms = []) => {
  return mergeStringArrays(
    (Array.isArray(terms) ? terms : []).filter((term) => hasNormalizedPhrase(haystack, term))
  )
}

const buildDomainSignals = (item = {}) => {
  const metadata = item?.metadata || {}
  const venueSignals = metadata.venueSignals && typeof metadata.venueSignals === 'object' ? metadata.venueSignals : {}
  const sourceFamily = cleanText(venueSignals.sourceFamily || '')
  const haystack = [
    item.title,
    item.snippet,
    metadata.primaryTopic,
    metadata.venue,
    metadata.sourceLabel,
    metadata.abstractSnippet,
    ...(Array.isArray(metadata.topics) ? metadata.topics : []),
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
    ...(Array.isArray(metadata.fullTextMatchedTokens) ? metadata.fullTextMatchedTokens : []),
  ].filter(Boolean).join(' ')

  const aiMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.aiOrCs)
  const biomedicalMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.biomedical)
  const economicsBusinessMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.economicsBusiness)
  const socialSciencesMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.socialSciences)
  const humanitiesMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.humanities)
  const lawPolicyMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.lawPolicy)
  const managementStrategyMatches = countDomainTermMatches(haystack, DOMAIN_TERM_SETS.managementStrategy)
  let aiScore = aiMatches.length
  let biomedicalScore = biomedicalMatches.length
  let economicsBusinessScore = economicsBusinessMatches.length
  let socialSciencesScore = socialSciencesMatches.length
  let humanitiesScore = humanitiesMatches.length
  let lawPolicyScore = lawPolicyMatches.length
  let managementStrategyScore = managementStrategyMatches.length

  if (cleanText(metadata?.externalIds?.arxivId || '')) aiScore += 2
  if (cleanText(metadata?.communitySignals?.githubUrl || '')) aiScore += 1
  if (/benchmark_platform|open_peer_review|society_library/.test(sourceFamily)) aiScore += 1
  if (cleanText(metadata?.externalIds?.pubmedId || '')) biomedicalScore += 2
  if (/top_journal|publisher/.test(sourceFamily) && biomedicalMatches.length > 0) biomedicalScore += 1
  if (/economics_research/.test(sourceFamily)) economicsBusinessScore += 2
  if (/journal_archive/.test(sourceFamily) && economicsBusinessMatches.length > 0) economicsBusinessScore += 1
  if (/open_access_index/.test(sourceFamily) && economicsBusinessMatches.length > 0) economicsBusinessScore += 1
  if (/social_science_publisher/.test(sourceFamily)) socialSciencesScore += 2
  if (/policy_journal/.test(sourceFamily)) socialSciencesScore += 2
  if (/journal_archive/.test(sourceFamily) && socialSciencesMatches.length > 0) socialSciencesScore += 1
  if (/open_access_index/.test(sourceFamily) && socialSciencesMatches.length > 0) socialSciencesScore += 1
  if (/humanities_publisher/.test(sourceFamily)) humanitiesScore += 2
  if (/journal_archive/.test(sourceFamily) && humanitiesMatches.length > 0) humanitiesScore += 1
  if (/open_access_index/.test(sourceFamily) && humanitiesMatches.length > 0) humanitiesScore += 1
  if (/law_review/.test(sourceFamily)) lawPolicyScore += 2
  if (/open_access_index/.test(sourceFamily) && lawPolicyMatches.length > 0) lawPolicyScore += 1
  if (/management_journal/.test(sourceFamily)) managementStrategyScore += 2
  if (/open_access_index/.test(sourceFamily) && managementStrategyMatches.length > 0) managementStrategyScore += 1

  return {
    aiMatches,
    biomedicalMatches,
    economicsBusinessMatches,
    socialSciencesMatches,
    humanitiesMatches,
    lawPolicyMatches,
    managementStrategyMatches,
    aiScore,
    biomedicalScore,
    economicsBusinessScore,
    socialSciencesScore,
    humanitiesScore,
    lawPolicyScore,
    managementStrategyScore,
  }
}

const computeDomainAlignmentScore = ({ item = {}, queryProfile = {}, querySignals = {}, benchmarkSignals = {} } = {}) => {
  const metadata = item?.metadata || {}
  const mixedDomainQuery = getActiveQueryDomains(queryProfile).length > 1
  const domainSignals = buildDomainSignals(item)
  const matchedQueryTokens = Array.isArray(querySignals.matchedTokens) ? querySignals.matchedTokens.map((token) => cleanText(token).toLowerCase()) : []
  const genericOnlyMatch = matchedQueryTokens.length > 0 && matchedQueryTokens.every((token) => GENERIC_STRATEGY_TOKENS.has(token))
  let score = 0

  if (queryProfile.aiOrCs) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'aiOrCs')
    if (domainSignals.aiScore > 0) score += Math.min(14, domainSignals.aiScore * 3)
    if (benchmarkSignals.queryAligned) score += 4

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.aiScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(24, competingScore * 4)
      } else if (domainSignals.aiScore === 0 && Number(querySignals.score || 0) <= 0 && !benchmarkSignals.queryAligned) {
        score -= 10
      }

      if (domainSignals.aiScore === 0 && genericOnlyMatch) score -= 6

      if (cleanText(metadata?.externalIds?.pubmedId || '') && domainSignals.aiScore === 0) score -= 6
    }
  }

  if (queryProfile.biomedical) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'biomedical')
    if (domainSignals.biomedicalScore > 0) score += Math.min(16, domainSignals.biomedicalScore * 3)

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.biomedicalScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(24, competingScore * 4)
      } else if (domainSignals.biomedicalScore === 0 && Number(querySignals.score || 0) <= 0) {
        score -= 10
      }

      if (cleanText(metadata?.externalIds?.arxivId || '') && domainSignals.biomedicalScore === 0) score -= 4
    }
  }

  if (queryProfile.economicsBusiness) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'economicsBusiness')
    if (domainSignals.economicsBusinessScore > 0) score += Math.min(14, domainSignals.economicsBusinessScore * 3)

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.economicsBusinessScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(18, competingScore * 3)
      } else if (domainSignals.economicsBusinessScore === 0 && Number(querySignals.score || 0) <= 0) {
        score -= 8
      }
    }
  }

  if (queryProfile.socialSciences) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'socialSciences')
    if (domainSignals.socialSciencesScore > 0) score += Math.min(14, domainSignals.socialSciencesScore * 3)

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.socialSciencesScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(18, competingScore * 3)
      } else if (domainSignals.socialSciencesScore === 0 && Number(querySignals.score || 0) <= 0) {
        score -= 8
      }
    }
  }

  if (queryProfile.humanities) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'humanities')
    if (domainSignals.humanitiesScore > 0) score += Math.min(12, domainSignals.humanitiesScore * 3)

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.humanitiesScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(16, competingScore * 3)
      } else if (domainSignals.humanitiesScore === 0 && Number(querySignals.score || 0) <= 0) {
        score -= 6
      }
    }
  }

  if (queryProfile.lawPolicy) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'lawPolicy')
    if (domainSignals.lawPolicyScore > 0) score += Math.min(14, domainSignals.lawPolicyScore * 3)

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.lawPolicyScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(18, competingScore * 3)
      } else if (domainSignals.lawPolicyScore === 0 && Number(querySignals.score || 0) <= 0) {
        score -= 8
      }
    }
  }

  if (queryProfile.managementStrategy) {
    const competingScore = getHighestCompetingDomainScore(domainSignals, 'managementStrategy')
    if (domainSignals.managementStrategyScore > 0) score += Math.min(14, domainSignals.managementStrategyScore * 3)

    if (!mixedDomainQuery) {
      if (competingScore > Math.max(1, domainSignals.managementStrategyScore) && Number(querySignals.score || 0) <= 4) {
        score -= Math.min(18, competingScore * 3)
      } else if (domainSignals.managementStrategyScore === 0 && Number(querySignals.score || 0) <= 0) {
        score -= 8
      }
    }
  }

  return {
    score: clamp(score, -28, 22),
    aiMatches: domainSignals.aiMatches,
    biomedicalMatches: domainSignals.biomedicalMatches,
    economicsBusinessMatches: domainSignals.economicsBusinessMatches,
    socialSciencesMatches: domainSignals.socialSciencesMatches,
    humanitiesMatches: domainSignals.humanitiesMatches,
    lawPolicyMatches: domainSignals.lawPolicyMatches,
    managementStrategyMatches: domainSignals.managementStrategyMatches,
  }
}

const buildRankingSignals = (item = {}, queryProfile = {}) => {
  const metadata = item?.metadata || {}
  const citationCount = Number(metadata.citationCount || 0)
  const relevanceScore = Number(metadata.relevanceScore || 0)
  const sourceProviders = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders : []
  const benchmarkSignals = metadata.benchmarkSignals && typeof metadata.benchmarkSignals === 'object' ? metadata.benchmarkSignals : {}
  const reviewSignals = metadata.reviewSignals && typeof metadata.reviewSignals === 'object' ? metadata.reviewSignals : {}
  const venueSignals = metadata.venueSignals && typeof metadata.venueSignals === 'object' ? metadata.venueSignals : {}
  const querySignals = computeQueryOverlapScore(item, queryProfile.queryTokens || [])
  const domainAlignment = computeDomainAlignmentScore({ item, queryProfile, querySignals, benchmarkSignals })

  const citationScore = citationCount > 0 ? Math.min(28, Math.round(Math.log10(citationCount + 1) * 11)) : 0
  const relevanceComponent = relevanceScore > 0 ? Math.min(18, Math.round(Math.log10(relevanceScore + 1) * 7)) : 0
  const recencyScore = computeRecencyScore(metadata.publishedAt || metadata.year)
  const prestigeBoost = Math.min(10, Math.round(Number(venueSignals.prestigeScore || 0) / 2))
  const venueScore = clamp((metadata.peerReviewed ? 11 : metadata.preprint ? 4 : 7) + prestigeBoost + (venueSignals.isTopVenue ? 2 : 0), 0, 22)
  const openAccessScore = metadata.openAccess ? 3 : 0
  const coverageScore = Math.min(6, Math.max(0, sourceProviders.length - 1) * 3)
  const benchmarkScore = Math.min(10, Number(benchmarkSignals.matchedCount || 0) * (queryProfile.aiOrCs ? 4 : queryProfile.biomedical ? 3 : 2))
  const communityScore = computeCommunitySignalScore(metadata.communitySignals || {})
  const reviewProcessScore = computeOpenReviewProcessScore(reviewSignals)

  let intentScore = 0
  if (queryProfile.aiOrCs && cleanText(metadata?.externalIds?.arxivId || '')) {
    intentScore += 4
  }
  if (queryProfile.aiOrCs && cleanText(metadata?.communitySignals?.githubUrl || '')) {
    intentScore += 2
  }
  if (queryProfile.aiOrCs && Boolean(benchmarkSignals.queryAligned)) {
    intentScore += 3
  }
  if (queryProfile.aiOrCs && cleanText(metadata?.externalIds?.openreviewForumId || '') && (domainAlignment.aiMatches.length > 0 || Boolean(benchmarkSignals.queryAligned) || Number(querySignals.score || 0) > 0)) {
    intentScore += 4
  }
  if (queryProfile.biomedical && cleanText(metadata?.externalIds?.pubmedId || '')) {
    intentScore += 8
  }
  if (queryProfile.biomedical && /top_journal|publisher/.test(cleanText(venueSignals.sourceFamily || ''))) {
    intentScore += 3
  }
  if (!queryProfile.aiOrCs && !queryProfile.biomedical && metadata.peerReviewed) {
    intentScore += 4
  }
  if (queryProfile.aiOrCs && /society_library|open_peer_review|benchmark_platform/.test(cleanText(venueSignals.sourceFamily || '')) && (domainAlignment.aiMatches.length > 0 || Boolean(benchmarkSignals.queryAligned))) {
    intentScore += 3
  }
  if (queryProfile.economicsBusiness && /economics_research|journal_archive|open_access_index/.test(cleanText(venueSignals.sourceFamily || '')) && (domainAlignment.economicsBusinessMatches.length > 0 || Number(querySignals.score || 0) > 0)) {
    intentScore += 4
  }
  if (queryProfile.socialSciences && /social_science_publisher|policy_journal|journal_archive|open_access_index/.test(cleanText(venueSignals.sourceFamily || '')) && (domainAlignment.socialSciencesMatches.length > 0 || Number(querySignals.score || 0) > 0)) {
    intentScore += 4
  }
  if (queryProfile.humanities && /humanities_publisher|journal_archive|open_access_index/.test(cleanText(venueSignals.sourceFamily || '')) && (domainAlignment.humanitiesMatches.length > 0 || Number(querySignals.score || 0) > 0)) {
    intentScore += 4
  }
  if (queryProfile.lawPolicy && /law_review|open_access_index/.test(cleanText(venueSignals.sourceFamily || '')) && (domainAlignment.lawPolicyMatches.length > 0 || Number(querySignals.score || 0) > 0)) {
    intentScore += 4
  }
  if (queryProfile.managementStrategy && /management_journal|open_access_index/.test(cleanText(venueSignals.sourceFamily || '')) && (domainAlignment.managementStrategyMatches.length > 0 || Number(querySignals.score || 0) > 0)) {
    intentScore += 4
  }

  return {
    citationScore,
    relevanceScore: relevanceComponent,
    recencyScore,
    venueScore,
    openAccessScore,
    coverageScore,
    benchmarkScore,
    communityScore,
    reviewProcessScore,
    intentScore,
    domainAlignmentScore: domainAlignment.score,
    queryOverlapScore: querySignals.score,
    matchedAiTerms: domainAlignment.aiMatches,
    matchedBiomedicalTerms: domainAlignment.biomedicalMatches,
    matchedEconomicsBusinessTerms: domainAlignment.economicsBusinessMatches,
    matchedSocialScienceTerms: domainAlignment.socialSciencesMatches,
    matchedHumanitiesTerms: domainAlignment.humanitiesMatches,
    matchedLawPolicyTerms: domainAlignment.lawPolicyMatches,
    matchedManagementStrategyTerms: domainAlignment.managementStrategyMatches,
    matchedQueryTokens: querySignals.matchedTokens,
    total: clamp(Math.round(citationScore + relevanceComponent + recencyScore + venueScore + openAccessScore + coverageScore + benchmarkScore + communityScore + reviewProcessScore + intentScore + domainAlignment.score + querySignals.score), 0, 100),
  }
}

const rankAcademicResults = (items = [], queryProfile = {}) => {
  const ranked = items.map((item) => {
    const metadata = item?.metadata || {}
    const benchmarkSignals = buildBenchmarkSignals(item, queryProfile)
    const rankingSignals = buildRankingSignals({
      ...item,
      metadata: {
        ...metadata,
        benchmarkSignals,
      },
    }, queryProfile)

    return {
      ...item,
      metadata: buildAcademicMeta({
        ...metadata,
        sourceProviders: mergeStringArrays(metadata.sourceProviders || [], [item.provider]),
        benchmarkSignals,
        rankingSignals,
        scholarlyScore: rankingSignals.total,
      }),
    }
  })

  return ranked.sort((left, right) => {
    const scoreDiff = Number(right?.metadata?.scholarlyScore || 0) - Number(left?.metadata?.scholarlyScore || 0)
    if (scoreDiff !== 0) return scoreDiff

    const citationDiff = Number(right?.metadata?.citationCount || 0) - Number(left?.metadata?.citationCount || 0)
    if (citationDiff !== 0) return citationDiff

    const relevanceDiff = Number(right?.metadata?.relevanceScore || 0) - Number(left?.metadata?.relevanceScore || 0)
    if (relevanceDiff !== 0) return relevanceDiff

    return Number(right?.metadata?.year || 0) - Number(left?.metadata?.year || 0)
  })
}

const fetchHfPaperSignals = async (arxivId = '') => {
  const normalizedId = extractArxivId(arxivId)
  if (!normalizedId) return null

  const pageUrl = `https://huggingface.co/papers/${encodeURIComponent(normalizedId)}`
  const response = await fetchWithTimeout(pageUrl, {
    headers: {
      'User-Agent': 'AI-Gods-Project/1.0 (community enrichment)',
      'Accept': 'text/html',
    },
  })

  if (!response.ok) return null
  const html = await response.text()
  if (!new RegExp(`arxiv\\.org/abs/${escapeRegExp(normalizedId)}`, 'i').test(html) && !new RegExp(`hf papers read ${escapeRegExp(normalizedId)}`, 'i').test(html)) {
    return null
  }

  const upvotes = parseMetricNumber(html.match(/Upvote <div class="font-semibold text-orange-500">([^<]+)<\/div>/i)?.[1] || '')
  const collectionsCount = parseMetricNumber(html.match(/Collections including this paper <span[^>]*>([^<]+)<\/span>/i)?.[1] || '')
  const modelsCiting = parseMetricNumber(html.match(/Models citing this paper <span[^>]*>([^<]+)<\/span>/i)?.[1] || '')
  const datasetsCiting = parseMetricNumber(html.match(/Datasets citing this paper <span[^>]*>([^<]+)<\/span>/i)?.[1] || '')
  const spacesCiting = parseMetricNumber(html.match(/Spaces citing this paper <span[^>]*>([^<]+)<\/span>/i)?.[1] || '')
  const githubUrl = toHttpsUrl(html.match(/https:\/\/github\.com\/[^\s"'<>)]*/i)?.[0] || '')

  if (![upvotes, collectionsCount, modelsCiting, datasetsCiting, spacesCiting].some((value) => value > 0) && !githubUrl) {
    return null
  }

  return {
    source: 'huggingface-papers',
    pageUrl,
    githubUrl,
    upvotes: upvotes || null,
    collectionsCount: collectionsCount || null,
    modelsCiting: modelsCiting || null,
    datasetsCiting: datasetsCiting || null,
    spacesCiting: spacesCiting || null,
  }
}

const enrichWithHfPaperSignals = async (items = [], queryProfile = {}) => {
  if (!queryProfile.aiOrCs) return items

  const candidateIds = items
    .map((item) => extractArxivId(item?.metadata?.externalIds?.arxivId || ''))
    .filter(Boolean)
    .slice(0, HF_PAPERS_ENRICH_CAP)

  if (candidateIds.length === 0) return items

  const signalsByArxivId = new Map()
  await Promise.all(candidateIds.map(async (arxivId) => {
    try {
      const signals = await fetchHfPaperSignals(arxivId)
      if (signals) signalsByArxivId.set(arxivId, signals)
    } catch (error) {
      console.warn('[Search] Hugging Face Papers enrichment 실패:', error.message || error)
    }
  }))

  if (signalsByArxivId.size === 0) return items

  return items.map((item) => {
    const arxivId = extractArxivId(item?.metadata?.externalIds?.arxivId || '')
    const signals = arxivId ? signalsByArxivId.get(arxivId) : null
    if (!signals) return item

    return {
      ...item,
      metadata: mergeAcademicMeta(item.metadata, { communitySignals: signals }),
    }
  })
}

const dedupeResults = (items = []) => {
  const seen = new Set()
  return items.filter((item) => {
    const linkKey = toHttpsUrl(item?.link || '').toLowerCase()
    const titleKey = normalizeTitleKey(item?.title || '')
    const key = linkKey ? `link:${linkKey}` : titleKey ? `title:${titleKey}` : ''
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const buildAcademicSourceSummary = (items = []) => {
  return items.reduce((acc, item) => {
    const providers = Array.isArray(item?.metadata?.sourceProviders) && item.metadata.sourceProviders.length > 0
      ? item.metadata.sourceProviders
      : [cleanText(item?.provider || 'academic') || 'academic']

    for (const provider of providers) {
      acc[provider] = (acc[provider] || 0) + 1
    }

    const communitySource = cleanText(item?.metadata?.communitySignals?.source || '')
    if (communitySource) {
      acc[communitySource] = (acc[communitySource] || 0) + 1
    }

    return acc
  }, {})
}

// DuckDuckGo HTML 스크래핑 (Serper 대체 - 무료/무제한)
export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'search', limit: 30, windowMs: 10 * 60 * 1000 })) return

  const query = getRequestQuery(req)
  const q = String(query.q || '').trim().slice(0, 200)
  const num = clampInteger(query.num, 1, 10, 5)

  if (!q) return sendJson(res, 400, { error: 'q 파라미터가 필요합니다.' })

  const profile = buildQueryProfile(q)
  const academicQuery = buildAcademicSearchQuery(q, profile)
  const broadScholarlyQuery = Boolean(profile.scholarlyIntent && !profile.aiOrCs && !profile.biomedical)
  const academicTasks = [
    searchOpenAlex(academicQuery, broadScholarlyQuery ? Math.min(8, Math.max(4, num + 2)) : Math.min(6, Math.max(3, num + 1))),
    searchCrossref(academicQuery, broadScholarlyQuery ? Math.min(6, Math.max(3, num + 1)) : Math.min(4, Math.max(2, num))),
  ]

  if (shouldUseSemanticScholar(profile)) {
    academicTasks.push(searchSemanticScholar(academicQuery, broadScholarlyQuery ? Math.min(6, Math.max(4, num + 1)) : Math.min(5, Math.max(3, num))))
  }

  if (broadScholarlyQuery) {
    academicTasks.push(searchDoaj(academicQuery, Math.min(5, Math.max(3, num + 1))))
  }

  if (profile.aiOrCs && isOpenReviewEnabled()) {
    academicTasks.push(searchOpenReview(academicQuery, Math.min(4, Math.max(2, num))))
  }

  if (profile.preprintFriendly) {
    academicTasks.push(searchArxiv(academicQuery, Math.min(4, Math.max(2, num))))
  }

  if (profile.biomedical) {
    academicTasks.push(searchPubMed(academicQuery, Math.min(4, Math.max(2, num))))
    academicTasks.push(searchEuropePmc(academicQuery, Math.min(4, Math.max(2, num))))
  }

  try {
    const [webResults, ...academicSettled] = await Promise.all([
      searchDuckDuckGo(q, num).catch((error) => {
        console.warn('[Search] web source 실패:', error.message || error)
        return []
      }),
      ...academicTasks.map((task) => task.catch((error) => {
        console.warn('[Search] academic source 실패:', error.message || error)
        return []
      })),
    ])

    const mergedAcademicResults = mergeAcademicResults(academicSettled.flat())
    const baseRankedAcademicResults = rankAcademicResults(mergedAcademicResults, profile)
    const enrichedAcademicResults = await enrichWithHfPaperSignals(baseRankedAcademicResults, profile)
    const fullTextAcademicResults = await enrichAcademicResultsWithFullText(enrichedAcademicResults, { query: q })
    const academicResults = rankAcademicResults(fullTextAcademicResults, profile).slice(0, ACADEMIC_RESULT_CAP)
    const results = dedupeResults([...academicResults, ...webResults])

    return sendJson(res, 200, {
      results,
      webResults,
      academicResults,
      academicSourceSummary: buildAcademicSourceSummary(academicResults),
      knowledgePanel: null,
      query: q,
      queryProfile: profile,
    })
  } catch (e) {
    console.error('[Search] 크롤링 실패:', e.message)
    return sendJson(res, 200, {
      results: [],
      webResults: [],
      academicResults: [],
      academicSourceSummary: {},
      knowledgePanel: null,
      query: q,
      queryProfile: profile,
    })
  }
}
