/**
 * Serper 검색 서비스
 * - 토론 주제에 대한 실시간 Google 검색 결과를 가져옴
 * - AI들의 Round 1 프롬프트에 주입 → 최신 정보 기반 토론
 */

import { searchResultsToEvidenceItems } from '../lib/debateEvidence.js'

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const getResultLink = (result = {}) => cleanText(result?.link || result?.url || '')

const formatAcademicMeta = (result = {}) => {
  const metadata = result?.metadata || {}
  const bits = []
  const authors = Array.isArray(metadata.authors) ? metadata.authors.slice(0, 3).join(', ') : ''
  const year = cleanText(metadata.year || '')
  const venue = cleanText(metadata.venue || '')
  const sourceLabel = cleanText(metadata.sourceLabel || result?.provider || '')
  const citationCount = Number.isFinite(Number(metadata.citationCount)) ? Number(metadata.citationCount) : 0
  const sourceProviders = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders.filter(Boolean) : []
  const reviewSignals = metadata.reviewSignals && typeof metadata.reviewSignals === 'object' ? metadata.reviewSignals : {}
  const communitySignals = metadata.communitySignals && typeof metadata.communitySignals === 'object' ? metadata.communitySignals : {}
  const venueSignals = metadata.venueSignals && typeof metadata.venueSignals === 'object' ? metadata.venueSignals : {}
  const benchmarkTerms = Array.isArray(metadata?.benchmarkSignals?.matchedTerms) ? metadata.benchmarkSignals.matchedTerms.slice(0, 2) : []

  if (sourceLabel) bits.push(sourceLabel)
  if (year) bits.push(year)
  if (authors) bits.push(authors)
  if (venue && venue !== sourceLabel) bits.push(venue)
  if (venueSignals.emphasisLabel && venueSignals.emphasisLabel !== venue && venueSignals.emphasisLabel !== sourceLabel) bits.push(venueSignals.emphasisLabel)
  if (metadata.peerReviewed) bits.push('Peer-reviewed est.')
  else if (metadata.preprint) bits.push('Preprint')
  if (metadata.doi) bits.push(`DOI ${metadata.doi}`)
  if (citationCount > 0) bits.push(`Cited by ${citationCount}`)
  if (reviewSignals.decisionLabel) bits.push(reviewSignals.decisionLabel)
  else if (Number(reviewSignals.reviewCount || 0) > 0) bits.push(`OpenReview reviews ${reviewSignals.reviewCount}`)
  if (Number.isFinite(Number(reviewSignals.averageRating))) bits.push(`Rating ${Number(reviewSignals.averageRating).toFixed(1)}`)
  if (sourceProviders.length > 1) bits.push(sourceProviders.slice(0, 3).join('+'))
  if (Number(venueSignals.prestigeScore || 0) >= 12) bits.push(`Venue tier ${Number(venueSignals.prestigeScore || 0)}`)
  if (Number(communitySignals.upvotes || 0) > 0) bits.push(`HF upvotes ${communitySignals.upvotes}`)
  else if (Number(communitySignals.collectionsCount || 0) > 0) bits.push(`HF collections ${communitySignals.collectionsCount}`)
  if (benchmarkTerms.length > 0) bits.push(`Signals ${benchmarkTerms.join(', ')}`)
  if (cleanText(metadata.excerptSource || '').toLowerCase() === 'full_text') bits.push(cleanText(metadata.excerptSourceLabel || 'Full-text excerpt'))

  return bits.join(' | ')
}

const formatSearchLine = (result = {}, index = 0) => {
  const title = cleanText(result?.title || result?.link || `result ${index + 1}`)
  const snippet = cleanText(result?.snippet || '')
  const sourceLink = getResultLink(result)

  if (result?.resultType === 'academic') {
    const meta = formatAcademicMeta(result)
    const scholarlyScore = Number.isFinite(Number(result?.metadata?.scholarlyScore || result?.metadata?.rankingSignals?.total))
      ? Math.round(Number(result.metadata?.scholarlyScore || result.metadata?.rankingSignals?.total))
      : 0
    const excerptLabel = cleanText(result?.metadata?.excerptSource || '').toLowerCase() === 'full_text' ? '본문 발췌' : '발췌/초록'
    return `${index + 1}. ${title}${scholarlyScore > 0 ? ` [scholar ${scholarlyScore}/100]` : ''}${meta ? `\n   ${meta}` : ''}${snippet ? `\n   ${excerptLabel}: ${snippet}` : ''}${sourceLink ? `\n   원문 링크: ${sourceLink}` : ''}`
  }

  return `${index + 1}. ${title}${snippet ? `\n   발췌: ${snippet}` : ''}${sourceLink ? `\n   원문 링크: ${sourceLink}` : ''}`
}

export const searchWeb = async (query, num = 5) => {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&num=${num}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// 검색 결과 → 프롬프트 컨텍스트 변환
export const searchResultsToContext = (searchData) => {
  if (!searchData) return ''

  const academicResults = Array.isArray(searchData.academicResults) ? searchData.academicResults.slice(0, 6) : []
  const webResults = Array.isArray(searchData.webResults) ? searchData.webResults.slice(0, 4) : []
  const fallbackResults = Array.isArray(searchData.results) ? searchData.results.slice(0, 6) : []
  const sections = []

  if (academicResults.length > 0) {
    sections.push(`[학술 검색 결과: "${searchData.query}"]\n${academicResults.map((result, index) => formatSearchLine(result, index)).join('\n\n')}`)
  }

  if (webResults.length > 0) {
    sections.push(`[보조 웹 검색 결과: "${searchData.query}"]\n${webResults.map((result, index) => formatSearchLine(result, index)).join('\n\n')}`)
  }

  if (sections.length === 0 && fallbackResults.length > 0) {
    sections.push(`[검색 결과: "${searchData.query}"]\n${fallbackResults.map((result, index) => formatSearchLine(result, index)).join('\n\n')}`)
  }

  if (sections.length === 0) return ''

  let context = sections.join('\n\n')

  if (searchData.knowledgePanel) {
    const kp = searchData.knowledgePanel
    context += `\n\n[핵심 정보] ${kp.title || ''}: ${kp.description || ''}`
  }

  if (academicResults.length > 0) {
    context += '\n\n학술 검색 결과를 우선 근거로 사용하고, preprint는 동료심사 전일 수 있음을 구분해서 설명하세요.'
    context += '\n직접 인용은 위 발췌/초록에 들어 있는 표현 범위 안에서만 사용하고, 원문을 읽은 것처럼 쓰지 마세요.'
    context += '\n근거를 사용했다면 가능한 한 원문 링크를 함께 남기세요.'
  } else {
    context += '\n\n위 최신 정보를 참고하여 답변하세요.'
    context += '\n직접 인용은 위 발췌 범위 안에서만 사용하고, 근거를 사용했다면 가능한 한 원문 링크를 함께 남기세요.'
  }

  return context
}

export const searchResultsToEvidence = (searchData, options = {}) => (
  searchResultsToEvidenceItems(searchData, options)
)
