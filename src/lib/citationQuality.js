const HIGH_TRUST_PATTERNS = [
  /(^|\.)gov(\.|$)/i,
  /(^|\.)go\.kr$/i,
  /(^|\.)edu(\.|$)/i,
  /(^|\.)ac\.kr$/i,
  /(^|\.)mil(\.|$)/i,
  /(^|\.)who\.int$/i,
  /(^|\.)oecd\.org$/i,
  /(^|\.)worldbank\.org$/i,
  /(^|\.)imf\.org$/i,
  /(^|\.)nature\.com$/i,
  /(^|\.)sciencedirect\.com$/i,
  /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)doi\.org$/i,
  /(^|\.)ieeexplore\.ieee\.org$/i,
  /(^|\.)dl\.acm\.org$/i,
  /(^|\.)openalex\.org$/i,
  /(^|\.)openreview\.net$/i,
]

const MEDIUM_TRUST_PATTERNS = [
  /(^|\.)org(\.|$)/i,
  /(^|\.)reuters\.com$/i,
  /(^|\.)apnews\.com$/i,
  /(^|\.)bloomberg\.com$/i,
  /(^|\.)arxiv\.org$/i,
  /(^|\.)github\.com$/i,
  /(^|\.)developer\./i,
]

const VERIFICATION_SCORES = {
  corroborated: 22,
  verified: 20,
  indexed: 18,
  preprint_indexed: 14,
  retrieved: 12,
  context_ingested: 10,
  unverified: 0,
}

const SOURCE_KIND_SCORES = {
  web_search: 12,
  academic_search: 18,
  journal_search: 22,
  preprint_search: 16,
  youtube_transcript: 10,
  external: 8,
  repository: 8,
  consensus_url: 4,
  message_url: 2,
}

const TYPE_SCORES = {
  paper: 10,
  preprint: 8,
  document: 8,
  repository: 7,
  transcript: 6,
  video: 5,
  web: 4,
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

export const getCitationDomain = (url = '') => {
  try {
    return new URL(String(url)).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const getDomainTrust = (domain = '') => {
  if (!domain) return { score: 0, tier: 'unknown' }
  if (HIGH_TRUST_PATTERNS.some((pattern) => pattern.test(domain))) {
    return { score: 20, tier: 'high' }
  }
  if (MEDIUM_TRUST_PATTERNS.some((pattern) => pattern.test(domain))) {
    return { score: 12, tier: 'medium' }
  }
  return { score: 4, tier: 'low' }
}

const getCitationTier = (score) => {
  if (score >= 80) return 'strong'
  if (score >= 60) return 'usable'
  if (score >= 40) return 'weak'
  return 'needs_review'
}

const buildIssues = ({ hasUrl, excerptLength, verificationStatus, domainTrustTier, sourceKind, metadata }) => {
  const issues = []

  if (!hasUrl) issues.push('원문 URL이 없어 직접 인용 추적이 어렵습니다.')
  if (excerptLength < 40) issues.push('근거 발췌가 짧아 문맥 확인이 부족합니다.')
  if (verificationStatus === 'unverified') issues.push('검증 상태가 아직 unverified 입니다.')
  if (domainTrustTier === 'low') issues.push('도메인 신뢰도가 낮아 추가 교차검증이 필요합니다.')
  if (sourceKind === 'message_url') issues.push('토론 발언에서만 언급된 링크라 별도 검증이 필요합니다.')
  if (metadata?.preprint) issues.push('프리프린트이므로 동료심사 전일 수 있습니다.')
  if ((sourceKind === 'academic_search' || sourceKind === 'journal_search' || sourceKind === 'preprint_search') && !cleanText(metadata?.doi || '')) {
    issues.push('DOI 또는 명확한 식별자가 없어 인용 정밀도가 떨어질 수 있습니다.')
  }

  return issues
}

export const evaluateEvidenceCitation = (item = {}) => {
  const url = cleanText(item.url || '')
  const label = cleanText(item.label || item.title || '')
  const excerpt = cleanText(item.excerpt || '')
  const verificationStatus = cleanText(item.verificationStatus || item.verification_status || 'unverified') || 'unverified'
  const sourceKind = cleanText(item.sourceKind || item.source_kind || 'external') || 'external'
  const type = cleanText(item.type || 'web') || 'web'
  const mentionCount = Math.max(1, Number(item.mentionCount || item.mention_count) || 1)
  const domain = getCitationDomain(url)
  const domainTrust = getDomainTrust(domain)
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const authors = Array.isArray(metadata.authors) ? metadata.authors.filter(Boolean) : []
  const citationCount = Number.isFinite(Number(metadata.citationCount)) ? Number(metadata.citationCount) : 0
  const sourceProviders = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders.filter(Boolean) : []
  const communitySignals = metadata.communitySignals && typeof metadata.communitySignals === 'object' ? metadata.communitySignals : {}
  const communityUpvotes = Number.isFinite(Number(communitySignals.upvotes)) ? Number(communitySignals.upvotes) : 0
  const communityCollections = Number.isFinite(Number(communitySignals.collectionsCount)) ? Number(communitySignals.collectionsCount) : 0
  const communityCitationSurface = [communitySignals.modelsCiting, communitySignals.datasetsCiting, communitySignals.spacesCiting]
    .map((value) => Number.isFinite(Number(value)) ? Number(value) : 0)
    .reduce((sum, value) => sum + value, 0)

  let score = 22
  if (url) score += 10
  if (url.startsWith('https://')) score += 5
  if (label && label !== url) score += 4
  if (excerpt.length >= 120) score += 8
  else if (excerpt.length >= 40) score += 4
  score += Math.min(6, Math.max(0, mentionCount - 1) * 2)
  score += VERIFICATION_SCORES[verificationStatus] || 0
  score += SOURCE_KIND_SCORES[sourceKind] || 0
  score += TYPE_SCORES[type] || 0
  score += domainTrust.score
  if (cleanText(metadata.doi || '')) score += 6
  if (authors.length > 0) score += 4
  if (cleanText(metadata.year || metadata.publishedAt || '')) score += 3
  if (metadata.peerReviewed) score += 12
  if (metadata.preprint) score += 4
  if (sourceProviders.includes('openalex')) score += 2
  if (sourceProviders.length >= 2) score += Math.min(6, (sourceProviders.length - 1) * 2)
  if (citationCount >= 50) score += 8
  else if (citationCount >= 10) score += 4
  if (metadata.openAccess) score += 2
  if (cleanText(metadata.excerptSource || '') === 'full_text') score += 5
  if (communityUpvotes >= 100) score += 2
  else if (communityUpvotes >= 20) score += 1
  if (communityCollections >= 20) score += 2
  else if (communityCollections >= 5) score += 1
  if (communityCitationSurface > 0) score += 2
  if (cleanText(communitySignals.githubUrl || '')) score += 1

  if (!url && !cleanText(item.externalId || item.external_id || '')) score -= 24
  if (verificationStatus === 'unverified' && (sourceKind === 'message_url' || sourceKind === 'consensus_url')) score -= 10

  const citationScore = clamp(Math.round(score), 0, 100)
  const citationTier = getCitationTier(citationScore)
  const issues = buildIssues({
    hasUrl: Boolean(url),
    excerptLength: excerpt.length,
    verificationStatus,
    domainTrustTier: domainTrust.tier,
    sourceKind,
    metadata,
  })

  return {
    ...item,
    citationScore,
    citationTier,
    citationDomain: domain || null,
    citationTrustTier: domainTrust.tier,
    citationIssues: issues,
    citationCount,
    needsReview: citationTier === 'needs_review' || citationTier === 'weak' || issues.length >= 2,
  }
}

export const evaluateCitationPortfolio = (evidence = []) => {
  const items = (Array.isArray(evidence) ? evidence : []).map((item) => evaluateEvidenceCitation(item))
  const averageCitationScore = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + Number(item.citationScore || 0), 0) / items.length)
    : 0

  const verifiedCount = items.filter((item) => ['verified', 'corroborated'].includes(String(item.verificationStatus || ''))).length
  const indexedCount = items.filter((item) => ['indexed', 'preprint_indexed'].includes(String(item.verificationStatus || ''))).length
  const scholarlyCount = items.filter((item) => item?.metadata?.scholarly || ['academic_search', 'journal_search', 'preprint_search'].includes(String(item.sourceKind || ''))).length
  const peerReviewedCount = items.filter((item) => item?.metadata?.peerReviewed === true).length
  const preprintCount = items.filter((item) => item?.metadata?.preprint === true).length
  const highQualityCount = items.filter((item) => Number(item.citationScore || 0) >= 80).length
  const lowQualityCount = items.filter((item) => Number(item.citationScore || 0) < 60).length
  const needsReviewCount = items.filter((item) => item.needsReview).length
  const strongest = [...items].sort((left, right) => Number(right.citationScore || 0) - Number(left.citationScore || 0))[0] || null
  const weakest = [...items].sort((left, right) => Number(left.citationScore || 0) - Number(right.citationScore || 0))[0] || null

  return {
    items,
    averageCitationScore,
    verifiedCount,
    indexedCount,
    scholarlyCount,
    peerReviewedCount,
    preprintCount,
    highQualityCount,
    lowQualityCount,
    needsReviewCount,
    strongest,
    weakest,
    status: averageCitationScore >= 75
      ? 'citation_ready'
      : averageCitationScore >= 55
        ? 'citation_watch'
        : 'citation_risk',
    recommendedAction: averageCitationScore >= 75
      ? '현재 citation 품질로 보고서와 발표 자료 생성이 가능합니다.'
      : averageCitationScore >= 55
        ? '핵심 주장에 연결된 근거만 추가 검증하면 최종 산출물 품질을 끌어올릴 수 있습니다.'
        : '근거 도메인과 원문 링크를 다시 확인해 citation 신뢰도를 먼저 보강해야 합니다.',
  }
}