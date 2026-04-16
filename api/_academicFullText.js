import { Buffer } from 'node:buffer'
import { PDFParse } from 'pdf-parse'

const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_MAX_ITEMS = 2
const FULL_TEXT_CHAR_LIMIT = 24000
const EXCERPT_CHAR_LIMIT = 900
const PDF_PAGE_LIMIT = [1, 2, 3, 4, 5]
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'about', 'paper', 'research', 'study', 'analysis', 'report',
  'this', 'that', 'these', 'those', 'using', 'based', '대한', '관련', '논문', '연구', '분석', '전략', '모델', '학습',
])
const ALLOWED_HTML_HOST_PATTERNS = [
  /(?:^|\.)pmc\.ncbi\.nlm\.nih\.gov$/i,
  /(?:^|\.)europepmc\.org$/i,
  /(?:^|\.)ar5iv\.labs\.arxiv\.org$/i,
  /(?:^|\.)arxiv\.org$/i,
  /(?:^|\.)openreview\.net$/i,
  /(?:^|\.)biorxiv\.org$/i,
  /(?:^|\.)medrxiv\.org$/i,
]

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const toHttpsUrl = (value = '', baseUrl = '') => {
  const text = cleanText(value)
  if (!text) return ''

  try {
    const url = baseUrl ? new URL(text, baseUrl) : new URL(text)
    return url.toString().replace(/^http:\/\//i, 'https://')
  } catch {
    return text.replace(/^http:\/\//i, 'https://')
  }
}

const truncate = (value = '', maxLength = EXCERPT_CHAR_LIMIT) => {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const decodeEntities = (value = '') => String(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ')

const uniqueStrings = (items = []) => {
  const seen = new Set()
  const output = []

  for (const item of items) {
    const text = cleanText(item)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    output.push(text)
  }

  return output
}

const extractQueryTokens = (value = '') => {
  const tokens = String(value).toLowerCase().match(/[a-z0-9가-힣]+/g) || []
  return uniqueStrings(tokens.filter((token) => token.length >= 2 && !STOP_WORDS.has(token))).slice(0, 10)
}

const normalizePmcId = (value = '') => {
  const text = cleanText(value).toUpperCase()
  if (!text) return ''
  if (text.startsWith('PMC')) return text
  return /^\d+$/.test(text) ? `PMC${text}` : text
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Gods-Project/1.0 (academic full text)',
        ...options.headers,
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

const stripStructuredMarkup = (value = '') => {
  const withBreaks = decodeEntities(value)
    .replace(/<\/(?:p|div|section|sec|title|subtitle|h\d|li|tr|abstract|body|caption|figcaption|article-title)>/gi, '\n\n')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')

  return withBreaks
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const trimReferenceTail = (value = '') => {
  const text = String(value || '')
  const match = text.match(/(?:^|\n\n)(references|bibliography|acknowledg?ments?)\b/i)
  if (!match || typeof match.index !== 'number' || match.index < 1800) return text
  return text.slice(0, match.index).trim()
}

const normalizeExtractedText = (value = '') => truncate(
  trimReferenceTail(
    stripStructuredMarkup(value)
      .replace(/\f/g, '\n\n')
      .replace(/\u0000/g, ' ')
  ),
  FULL_TEXT_CHAR_LIMIT,
)

const splitIntoPassages = (value = '') => {
  const paragraphs = String(value || '')
    .split(/\n{2,}/)
    .map((paragraph) => cleanText(paragraph))
    .filter((paragraph) => paragraph.length >= 60)

  const passages = []
  let buffer = ''

  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph
      continue
    }

    if (buffer.length < 240) {
      buffer = `${buffer} ${paragraph}`
      continue
    }

    passages.push(buffer)
    buffer = paragraph
  }

  if (buffer) passages.push(buffer)

  if (passages.length > 0) {
    return passages
      .map((passage) => cleanText(passage))
      .filter((passage) => passage.length >= 80)
      .slice(0, 40)
  }

  const sentences = String(value || '').match(/[^.!?。]+[.!?。]?/g) || []
  const fallback = []
  let sentenceBuffer = ''

  for (const sentence of sentences.map((sentence) => cleanText(sentence)).filter(Boolean)) {
    sentenceBuffer = sentenceBuffer ? `${sentenceBuffer} ${sentence}` : sentence
    if (sentenceBuffer.length >= 220) {
      fallback.push(sentenceBuffer)
      sentenceBuffer = ''
    }
  }

  if (sentenceBuffer) fallback.push(sentenceBuffer)
  return fallback.filter((passage) => passage.length >= 80).slice(0, 20)
}

const countTokenMatches = (value = '', tokens = []) => {
  const haystack = String(value || '').toLowerCase()
  return tokens.filter((token) => haystack.includes(token.toLowerCase()))
}

const scorePassage = (passage = '', queryTokens = [], titleTokens = []) => {
  const lower = String(passage || '').toLowerCase()
  const matchedQueryTokens = countTokenMatches(lower, queryTokens)
  const matchedTitleTokens = countTokenMatches(lower, titleTokens)
  let score = matchedQueryTokens.length * 8 + matchedTitleTokens.length * 4

  if (passage.length >= 180 && passage.length <= 900) score += 4
  if (/\d/.test(passage)) score += 1
  if (/result|finding|experiment|benchmark|conclusion|method|dataset|accuracy|abstract|introduction/i.test(passage)) score += 2
  if (/copyright|all rights reserved|references|bibliography/i.test(lower)) score -= 10

  return {
    score,
    matchedQueryTokens: uniqueStrings([...matchedQueryTokens, ...matchedTitleTokens]),
  }
}

const pickRelevantExcerpt = ({ text = '', query = '', title = '' } = {}) => {
  const passages = splitIntoPassages(text)
  if (passages.length === 0) return null

  const queryTokens = extractQueryTokens(query)
  const titleTokens = extractQueryTokens(title).slice(0, 4)
  const ranked = passages
    .map((passage, index) => ({
      passage,
      index,
      ...scorePassage(passage, queryTokens, titleTokens),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)

  const best = ranked[0]
  if (!best) return null

  let excerpt = best.passage
  const nextPassage = passages[best.index + 1] || ''
  if (excerpt.length < EXCERPT_CHAR_LIMIT * 0.6 && nextPassage) {
    excerpt = `${excerpt} ${nextPassage}`
  }

  return {
    excerpt: truncate(excerpt, EXCERPT_CHAR_LIMIT),
    matchedTokens: best.matchedQueryTokens,
  }
}

const isAllowedHtmlUrl = (value = '') => {
  const url = toHttpsUrl(value)
  if (!url || /\.pdf($|\?)/i.test(url)) return false

  try {
    const host = new URL(url).hostname
    return ALLOWED_HTML_HOST_PATTERNS.some((pattern) => pattern.test(host))
  } catch {
    return false
  }
}

const detectCandidateKind = (value = '') => (/\.pdf($|\?)/i.test(value) ? 'pdf' : 'html')

const buildCandidateList = (item = {}) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const externalIds = metadata.externalIds && typeof metadata.externalIds === 'object' ? metadata.externalIds : {}
  const primaryUrl = toHttpsUrl(externalIds.primaryUrl || item?.link || '')
  const landingPageUrl = toHttpsUrl(externalIds.landingPageUrl || '')
  const rawFullTextUrl = toHttpsUrl(externalIds.fullTextUrl || '', primaryUrl)
  const rawPdfUrl = toHttpsUrl(externalIds.pdfUrl || externalIds.openAccessPdfUrl || '', primaryUrl || 'https://openreview.net')
  const pmcid = normalizePmcId(externalIds.pmcid || '')
  const arxivId = cleanText(externalIds.arxivId || '')
  const openreviewForumId = cleanText(externalIds.openreviewForumId || '')

  const candidates = []
  const addCandidate = (url, kind, label) => {
    const normalizedUrl = toHttpsUrl(url, primaryUrl || 'https://openreview.net')
    if (!normalizedUrl) return
    candidates.push({
      url: normalizedUrl,
      kind,
      label,
    })
  }

  if (pmcid) {
    addCandidate(`https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`, 'pmc_xml', 'Europe PMC full text XML')
    addCandidate(`https://pmc.ncbi.nlm.nih.gov/articles/${encodeURIComponent(pmcid)}/`, 'html', 'PMC article HTML')
  }

  if (rawFullTextUrl) addCandidate(rawFullTextUrl, detectCandidateKind(rawFullTextUrl), 'Provider full text')
  if (rawPdfUrl) addCandidate(rawPdfUrl, 'pdf', 'Open-access PDF')

  if (arxivId) {
    addCandidate(`https://ar5iv.labs.arxiv.org/html/${encodeURIComponent(arxivId)}`, 'html', 'ar5iv HTML')
    addCandidate(`https://arxiv.org/pdf/${encodeURIComponent(arxivId)}.pdf`, 'pdf', 'arXiv PDF')
  }

  if (openreviewForumId) {
    addCandidate(`https://openreview.net/pdf?id=${encodeURIComponent(openreviewForumId)}`, 'pdf', 'OpenReview PDF')
  }

  if (isAllowedHtmlUrl(landingPageUrl)) addCandidate(landingPageUrl, 'html', 'Landing page HTML')
  if (isAllowedHtmlUrl(primaryUrl)) addCandidate(primaryUrl, 'html', 'Primary article HTML')
  if (/\.pdf($|\?)/i.test(primaryUrl)) addCandidate(primaryUrl, 'pdf', 'Primary PDF')

  const seen = new Set()
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.url}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const extractXmlText = async (url, timeoutMs) => {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`full text xml fetch failed: ${response.status}`)
  return normalizeExtractedText(await response.text())
}

const extractHtmlText = async (url, timeoutMs) => {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`full text html fetch failed: ${response.status}`)
  return normalizeExtractedText(await response.text())
}

const extractPdfText = async (url, timeoutMs) => {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/pdf,*/*;q=0.8',
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`full text pdf fetch failed: ${response.status}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText({ partial: PDF_PAGE_LIMIT })
    return normalizeExtractedText(result?.text || '')
  } finally {
    await parser.destroy().catch(() => {})
  }
}

const extractFullText = async (candidate, timeoutMs) => {
  if (candidate.kind === 'pmc_xml') return await extractXmlText(candidate.url, timeoutMs)
  if (candidate.kind === 'pdf') return await extractPdfText(candidate.url, timeoutMs)
  return await extractHtmlText(candidate.url, timeoutMs)
}

const shouldAttemptFullText = (item = {}) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  if (item?.resultType !== 'academic') return false
  if (metadata.openAccess !== true) return false
  if (cleanText(metadata.excerptSource || '').toLowerCase() === 'full_text') return false
  return buildCandidateList(item).length > 0
}

const enrichAcademicResultWithFullText = async (item = {}, { query = '', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  if (!shouldAttemptFullText(item)) return item

  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const originalSnippet = cleanText(metadata.abstractSnippet || item?.snippet || '')

  for (const candidate of buildCandidateList(item)) {
    try {
      const extractedText = await extractFullText(candidate, timeoutMs)
      if (!extractedText || extractedText.length < 200) continue

      const selection = pickRelevantExcerpt({
        text: extractedText,
        query,
        title: item?.title || '',
      })

      if (!selection?.excerpt) continue

      return {
        ...item,
        snippet: selection.excerpt,
        metadata: {
          ...metadata,
          excerptSource: 'full_text',
          excerptSourceLabel: candidate.label,
          abstractSnippet: originalSnippet,
          fullTextUrl: candidate.url,
          fullTextSourceType: candidate.kind,
          fullTextFetched: true,
          fullTextCharCount: extractedText.length,
          fullTextMatchedTokens: selection.matchedTokens,
        },
      }
    } catch {
      continue
    }
  }

  return item
}

export const enrichAcademicResultsWithFullText = async (items = [], { query = '', maxItems = DEFAULT_MAX_ITEMS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0 || maxItems <= 0) return list

  const targetIndexes = list
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => shouldAttemptFullText(item))
    .slice(0, maxItems)

  if (targetIndexes.length === 0) return list

  const results = [...list]
  await Promise.all(targetIndexes.map(async ({ item, index }) => {
    results[index] = await enrichAcademicResultWithFullText(item, { query, timeoutMs })
  }))

  return results
}