import { evaluateCitationPortfolio } from './citationQuality.js'
import { buildEvidenceKey, buildTranscriptEvidenceItem, extractUrls, inferEvidenceType, mergeEvidenceItems } from './debateEvidence.js'

const MAX_SUMMARY_LENGTH = 320
const MAX_CLAIMS = 8
const MAX_ACTION_ITEMS = 9
const MAX_EVIDENCE_ITEMS = 10

const POSITIVE_STANCE_KEYWORDS = ['동의', '공감', '맞습니다', '찬성', '지지']
const NEGATIVE_STANCE_KEYWORDS = ['반박', '우려', '문제', '아니다', '동의하지']

const STATUS_LABELS = {
  needs_evidence: '근거 수집 필요',
  draft_ready: '초안 준비 완료',
  report_ready: '보고서 생성 가능',
}

const cleanText = (value = '') => String(value)
  .replace(/\r/g, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/^#{1,6}\s+/gm, '')
  .trim()

const normalizeLine = (line = '') => cleanText(line)
  .replace(/^[\s>*-]+/, '')
  .replace(/^\d+[.)]\s+/, '')
  .trim()

const truncate = (value = '', maxLength = 180) => {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const uniqueBy = (items, getKey) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = getKey(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const uniqueStrings = (items = []) => [...new Set((Array.isArray(items) ? items : [])
  .map((item) => cleanText(item))
  .filter(Boolean))]

const countMatches = (value = '', pattern) => (String(value || '').match(pattern) || []).length

const isSuspiciousText = (value = '') => {
  const text = String(value || '').replace(/\s+/g, '')
  if (!text) return false

  const questionMarks = countMatches(text, /\?/g)
  const replacementChars = countMatches(text, /�/g)
  const readableChars = countMatches(text, /[A-Za-z0-9가-힣]/g)

  if (replacementChars > 0) return true
  if (questionMarks >= 6 && questionMarks / text.length >= 0.16) return true
  if (text.length >= 24 && readableChars < Math.max(8, Math.round(text.length * 0.22))) return true
  return false
}

const firstMeaningfulSentence = (value = '', maxLength = 220) => {
  const text = cleanText(value)
  if (!text) return ''

  const candidates = text
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .filter(Boolean)

  const sentence = candidates.find((line) => line.length >= 18) || candidates[0] || text
  return truncate(sentence, maxLength)
}

const extractStrategicSummary = (value = '', maxLength = 180) => {
  const lines = cleanText(value)
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .map((line) => {
      const structuredMatch = line.match(/^(반응 대상|판단|근거|제안)\s*[:：]\s*(.+)$/)
      if (!structuredMatch) return line
      if (structuredMatch[1] === '반응 대상') return ''
      return structuredMatch[2]
    })
    .filter((line) => line && !isSuspiciousText(line))

  const sentence = lines.find((line) => line.length >= 18) || lines[0] || ''
  return sentence ? truncate(sentence, maxLength) : ''
}

const groupMessagesByGod = (messages) => {
  const grouped = new Map()
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message?.godId || !String(message?.content || '').trim()) continue
    if (!grouped.has(message.godId)) grouped.set(message.godId, [])
    grouped.get(message.godId).push(message)
  }
  return grouped
}

const extractConsensusSections = (consensus = '') => {
  const sections = {
    consensusPoints: [],
    disagreements: [],
    recommendations: [],
    rationale: [],
  }

  let activeSection = null
  const lines = cleanText(consensus).split('\n')

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine)
    if (!line) continue
    if (isSuspiciousText(line)) continue

    if (/핵심 합의점|공통 합의점|합의 판정/.test(line)) {
      activeSection = 'consensusPoints'
      continue
    }

    if (/주요 이견|남은 이견/.test(line)) {
      activeSection = 'disagreements'
      continue
    }

    if (/권고사항|단기 권고|중기 권고|장기 권고/.test(line)) {
      activeSection = 'recommendations'
      const inlineRecommendation = line.match(/^(단기|중기|장기)\s*[:：-]\s*(.+)$/)
      if (inlineRecommendation) {
        sections.recommendations.push(`${inlineRecommendation[1]}: ${inlineRecommendation[2]}`)
      }
      continue
    }

    if (/판정 근거/.test(line)) {
      activeSection = 'rationale'
      continue
    }

    if (activeSection) {
      sections[activeSection].push(line)
    }
  }

  if (sections.consensusPoints.length === 0) {
    sections.consensusPoints = lines
      .map((line) => normalizeLine(line))
      .filter((line) => line && !/주요 이견|권고사항|단기 권고|중기 권고|장기 권고|판정 근거/.test(line))
      .slice(0, 3)
  }

  return sections
}

const buildExecutiveSummary = ({ topic, consensus, sections }) => {
  const candidates = [
    ...(sections?.consensusPoints || []),
    isSuspiciousText(consensus) ? '' : firstMeaningfulSentence(consensus, MAX_SUMMARY_LENGTH),
    `이 토론은 "${topic}"에 대한 실행 가능한 결론 도출을 목표로 진행되었습니다.`,
  ].filter((item) => item && !isSuspiciousText(item))

  return truncate(candidates.slice(0, 3).join(' '), MAX_SUMMARY_LENGTH)
}

const buildParticipantViews = (messages) => {
  const grouped = groupMessagesByGod(messages)
  return Array.from(grouped.entries()).map(([godId, godMessages]) => {
    const stableMessages = godMessages.filter((message) => !isSuspiciousText(message.content))
    const latest = stableMessages[stableMessages.length - 1] || godMessages[godMessages.length - 1]
    const content = String(latest?.content || '')
    let stance = 'position'

    if (NEGATIVE_STANCE_KEYWORDS.some((keyword) => content.includes(keyword))) {
      stance = 'challenge'
    } else if (POSITIVE_STANCE_KEYWORDS.some((keyword) => content.includes(keyword))) {
      stance = 'support'
    }

    return {
      godId,
      godName: String(latest?.god || godId),
      latestRound: Math.max(1, Number(latest?.round) || 1),
      stance,
      summary: extractStrategicSummary(content, 170) || firstMeaningfulSentence(content, 170),
      sourceUrls: extractUrls(content),
    }
  })
}

const buildClaims = ({ messages = [], consensus = '' }) => {
  const spokenMessages = Array.isArray(messages) ? messages : []
  if (spokenMessages.length === 0) return []

  const stableMessages = spokenMessages.filter((message) => !isSuspiciousText(message?.content || ''))
  const sourceMessages = stableMessages.length > 0 ? stableMessages : spokenMessages
  const finalRound = Math.max(...sourceMessages.map((message) => Math.max(1, Number(message?.round) || 1)))
  const finalRoundMessages = sourceMessages.filter((message) => Math.max(1, Number(message?.round) || 1) === finalRound)
  const candidates = finalRoundMessages.length > 0 ? finalRoundMessages : sourceMessages

  const claims = candidates.map((message, index) => {
    const statement = firstMeaningfulSentence(message.content, 220)
    const supportingUrls = extractUrls(message.content)

    return {
      id: `claim-${index + 1}`,
      ownerGodId: String(message.godId || ''),
      ownerGodName: String(message.god || message.godId || ''),
      round: Math.max(1, Number(message.round) || 1),
      statement,
      evidenceStatus: supportingUrls.length > 0 ? 'linked' : 'missing',
      supportingUrls,
    }
  }).filter((claim) => claim.statement)

  const consensusClaim = isSuspiciousText(consensus) ? '' : firstMeaningfulSentence(consensus, 220)
  if (consensusClaim) {
    claims.unshift({
      id: 'claim-consensus',
      ownerGodId: 'judge',
      ownerGodName: 'Aegis',
      round: finalRound,
      statement: consensusClaim,
      evidenceStatus: extractUrls(consensus).length > 0 ? 'linked' : 'missing',
      supportingUrls: extractUrls(consensus),
    })
  }

  return uniqueBy(claims, (claim) => claim.statement.toLowerCase()).slice(0, MAX_CLAIMS)
}

const buildEvidenceInventory = ({ topic = '', consensus = '', messages = [], isYoutube = false, evidenceItems = [] }) => {
  const evidenceMap = new Map()

  const registerEvidence = ({
    url = '',
    label = '',
    type = 'web',
    sourceKind = 'external',
    provider = '',
    externalId = null,
    excerpt = '',
    mentionedBy = 'system',
    verificationStatus = 'unverified',
    mentionCount = 1,
    metadata = {},
  }) => {
    const key = [sourceKind, url || '', externalId || '', label || '', type].join('::')
    if (!key) return

    if (!evidenceMap.has(key)) {
      evidenceMap.set(key, {
        id: `evidence-${evidenceMap.size + 1}`,
        type,
        sourceKind,
        provider: provider || null,
        url: url || null,
        externalId: externalId || null,
        label: label || url,
        excerpt: excerpt || '',
        verificationStatus,
        mentionedBy: [],
        mentionCount: 0,
        metadata,
      })
    }

    const item = evidenceMap.get(key)
    if (!item.mentionedBy.includes(mentionedBy)) item.mentionedBy.push(mentionedBy)
    item.mentionCount += Math.max(1, Number(mentionCount) || 1)
    if (!item.excerpt && excerpt) item.excerpt = excerpt
    if (!item.provider && provider) item.provider = provider
    item.metadata = { ...(item.metadata || {}), ...(metadata || {}) }
  }

  for (const item of mergeEvidenceItems(evidenceItems)) {
    registerEvidence(item)
  }

  for (const message of Array.isArray(messages) ? messages : []) {
    const urls = extractUrls(message.content)
    for (const url of urls) {
      registerEvidence({
        url,
        label: url,
        type: inferEvidenceType(url),
        sourceKind: 'message_url',
        mentionedBy: String(message.god || message.godId || 'agent'),
      })
    }
  }

  for (const url of extractUrls(consensus)) {
    registerEvidence({
      url,
      label: url,
      type: inferEvidenceType(url),
      sourceKind: 'consensus_url',
      mentionedBy: 'Aegis',
    })
  }

  if (isYoutube) {
    const fallbackTranscriptEvidence = buildTranscriptEvidenceItem({ topic, transcript: '', requestedBy: 'system' })
    if (fallbackTranscriptEvidence) registerEvidence(fallbackTranscriptEvidence)
  }

  return Array.from(evidenceMap.values())
    .map((item, index) => ({ ...item, id: `evidence-${index + 1}` }))
}

const buildEvidenceLookup = (evidence = []) => {
  const byKey = new Map()
  const byUrl = new Map()

  for (const item of Array.isArray(evidence) ? evidence : []) {
    const evidenceKey = buildEvidenceKey(item)
    if (evidenceKey) byKey.set(evidenceKey, item)

    const url = cleanText(item?.url || '')
    if (url && !byUrl.has(url)) byUrl.set(url, item)
  }

  return { byKey, byUrl }
}

const getEvidenceMetadata = (item = {}) => (item?.metadata && typeof item.metadata === 'object' ? item.metadata : {})

const getEvidenceScholarlyScore = (item = {}) => {
  const metadata = getEvidenceMetadata(item)
  const directScore = Number(metadata.scholarlyScore)
  if (Number.isFinite(directScore)) return Math.round(directScore)

  const rankingScore = Number(metadata?.rankingSignals?.total)
  return Number.isFinite(rankingScore) ? Math.round(rankingScore) : 0
}

const toLedgerCitation = (item = {}, ref = {}) => ({
  evidenceId: cleanText(item.id || ref.evidenceId || ''),
  localTag: cleanText(ref.localTag || ''),
  label: truncate(item.label || ref.label || '근거 없음', 160),
  url: cleanText(item.url || ref.url || '') || null,
  sourceKind: cleanText(item.sourceKind || ref.sourceKind || '') || null,
  type: cleanText(item.type || ref.type || '') || null,
  citationScore: Number(item.citationScore || 0),
  scholarlyScore: getEvidenceScholarlyScore(item),
})

const resolveMessageCitationRefs = (message = {}, lookup = {}) => {
  const explicitRefs = (Array.isArray(message?.citationRefs) ? message.citationRefs : [])
    .map((ref) => {
      const evidenceKey = cleanText(ref?.evidenceKey || '').toLowerCase()
      const url = cleanText(ref?.url || '')
      const matched = (evidenceKey && lookup?.byKey?.get(evidenceKey)) || (url && lookup?.byUrl?.get(url)) || null
      return matched ? toLedgerCitation(matched, ref) : null
    })
    .filter(Boolean)

  const fallbackRefs = explicitRefs.length === 0
    ? extractUrls(message?.content || '')
        .map((url) => lookup?.byUrl?.get(cleanText(url)) || null)
        .filter(Boolean)
        .map((item) => toLedgerCitation(item))
    : []

  return uniqueBy([...explicitRefs, ...fallbackRefs], (item) => `${item.evidenceId}::${item.localTag || item.url || item.label}`)
}

const buildDebateCitationLedger = ({ messages = [], consensus = '', evidence = [] } = {}) => {
  const lookup = buildEvidenceLookup(evidence)
  const entries = []

  for (const [index, message] of (Array.isArray(messages) ? messages : []).entries()) {
    if (!message || message.type || !message.godId || !cleanText(message.content)) continue

    const citations = resolveMessageCitationRefs(message, lookup)
    if (citations.length === 0) continue

    const round = Math.max(1, Number(message.round) || 1)
    entries.push({
      locationType: 'debate_message',
      locationId: `round-${round}-${cleanText(message.godId || '') || `message-${index + 1}`}`,
      locationLabel: `Round ${round} / ${cleanText(message.god || message.godId || `message ${index + 1}`)}`,
      round,
      ownerGodId: cleanText(message.godId || ''),
      ownerGodName: cleanText(message.god || message.godId || ''),
      excerpt: extractStrategicSummary(message.content, 150) || firstMeaningfulSentence(message.content, 150),
      evidenceIds: uniqueStrings(citations.map((item) => item.evidenceId)),
      citations,
    })
  }

  const consensusCitations = extractUrls(consensus)
    .map((url) => lookup?.byUrl?.get(cleanText(url)) || null)
    .filter(Boolean)
    .map((item) => toLedgerCitation(item))

  if (consensusCitations.length > 0) {
    entries.push({
      locationType: 'consensus',
      locationId: 'final-consensus',
      locationLabel: 'Final Consensus',
      round: null,
      ownerGodId: 'judge',
      ownerGodName: 'Aegis',
      excerpt: firstMeaningfulSentence(consensus, 150),
      evidenceIds: uniqueStrings(consensusCitations.map((item) => item.evidenceId)),
      citations: uniqueBy(consensusCitations, (item) => `${item.evidenceId}::${item.url || item.label}`),
    })
  }

  return entries
}

const annotateEvidenceUsage = (evidence = [], ledger = []) => {
  const usageByEvidenceId = new Map()

  for (const entry of Array.isArray(ledger) ? ledger : []) {
    for (const citation of Array.isArray(entry.citations) ? entry.citations : []) {
      const evidenceId = cleanText(citation.evidenceId || '')
      if (!evidenceId) continue
      if (!usageByEvidenceId.has(evidenceId)) usageByEvidenceId.set(evidenceId, [])

      usageByEvidenceId.get(evidenceId).push({
        locationId: entry.locationId,
        locationLabel: entry.locationLabel,
        locationType: entry.locationType,
        round: entry.round,
        ownerGodId: entry.ownerGodId || null,
        ownerGodName: entry.ownerGodName || null,
        localTag: citation.localTag || '',
      })
    }
  }

  return (Array.isArray(evidence) ? evidence : []).map((item) => {
    const locations = usageByEvidenceId.get(cleanText(item.id || '')) || []
    return {
      ...item,
      citationUsageCount: locations.length,
      citationLocations: locations.slice(0, 8),
    }
  })
}

const attachClaimCitationLinks = (claims = [], evidence = [], ledger = []) => {
  const lookup = buildEvidenceLookup(evidence)

  return (Array.isArray(claims) ? claims : []).map((claim) => {
    const supportingFromUrls = (Array.isArray(claim.supportingUrls) ? claim.supportingUrls : [])
      .map((url) => lookup?.byUrl?.get(cleanText(url))?.id || '')
      .filter(Boolean)

    const ledgerMatches = (Array.isArray(ledger) ? ledger : []).filter((entry) => (
      entry.locationType === 'debate_message'
      && cleanText(entry.ownerGodId || '') === cleanText(claim.ownerGodId || '')
      && Number(entry.round || 0) === Number(claim.round || 0)
    ))

    const supportingEvidenceIds = uniqueStrings([
      ...supportingFromUrls,
      ...ledgerMatches.flatMap((entry) => Array.isArray(entry.evidenceIds) ? entry.evidenceIds : []),
    ])

    return {
      ...claim,
      evidenceStatus: supportingEvidenceIds.length > 0 ? 'linked' : claim.evidenceStatus,
      supportingEvidenceIds,
      citationLocations: uniqueStrings(ledgerMatches.map((entry) => entry.locationId)).slice(0, 6),
      metadata: {
        ...(claim.metadata && typeof claim.metadata === 'object' ? claim.metadata : {}),
        supportingEvidenceIds,
        citationLocations: uniqueStrings(ledgerMatches.map((entry) => entry.locationId)).slice(0, 6),
      },
    }
  })
}

const getEvidenceProviders = (item = {}) => {
  const metadata = getEvidenceMetadata(item)
  return uniqueStrings(Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders : [])
}

const getEvidenceBenchmarkTerms = (item = {}) => {
  const metadata = getEvidenceMetadata(item)
  return uniqueStrings(Array.isArray(metadata?.benchmarkSignals?.matchedTerms)
    ? metadata.benchmarkSignals.matchedTerms
    : [])
}

const getEvidenceCommunitySignals = (item = {}) => {
  const communitySignals = getEvidenceMetadata(item).communitySignals
  return communitySignals && typeof communitySignals === 'object' ? communitySignals : {}
}

const getEvidenceCommunityScore = (item = {}) => {
  const communitySignals = getEvidenceCommunitySignals(item)
  const upvotes = Number.isFinite(Number(communitySignals.upvotes)) ? Number(communitySignals.upvotes) : 0
  const collectionsCount = Number.isFinite(Number(communitySignals.collectionsCount)) ? Number(communitySignals.collectionsCount) : 0
  const communityCitationSurface = [communitySignals.modelsCiting, communitySignals.datasetsCiting, communitySignals.spacesCiting]
    .map((value) => Number.isFinite(Number(value)) ? Number(value) : 0)
    .reduce((sum, value) => sum + value, 0)

  let score = 0
  if (upvotes >= 100) score += 8
  else if (upvotes >= 20) score += 4
  else if (upvotes > 0) score += 2

  if (collectionsCount >= 20) score += 6
  else if (collectionsCount >= 5) score += 3
  else if (collectionsCount > 0) score += 1

  if (communityCitationSurface >= 20) score += 6
  else if (communityCitationSurface > 0) score += 3

  if (cleanText(communitySignals.githubUrl || '')) score += 2
  return Math.min(18, score)
}

const buildEvidencePriorityReasons = (item = {}) => {
  const metadata = getEvidenceMetadata(item)
  const scholarlyScore = getEvidenceScholarlyScore(item)
  const citationScore = Number(item.citationScore || 0)
  const sourceProviders = getEvidenceProviders(item)
  const benchmarkTerms = getEvidenceBenchmarkTerms(item)
  const communitySignals = getEvidenceCommunitySignals(item)
  const reasons = []

  if (scholarlyScore >= 70) reasons.push(`scholar ${scholarlyScore}/100`)
  if (citationScore >= 80) reasons.push(`citation ${citationScore}/100`)
  if (benchmarkTerms.length > 0) reasons.push(`benchmark ${benchmarkTerms.slice(0, 2).join(', ')}`)
  if (sourceProviders.length >= 2) reasons.push(`indexed ${sourceProviders.slice(0, 3).join('+')}`)
  if (metadata.peerReviewed) reasons.push('peer-reviewed')
  else if (metadata.preprint) reasons.push('preprint')
  if (Number(communitySignals.upvotes || 0) > 0) reasons.push(`HF upvotes ${communitySignals.upvotes}`)
  else if (Number(communitySignals.collectionsCount || 0) > 0) reasons.push(`HF collections ${communitySignals.collectionsCount}`)

  return uniqueStrings(reasons).slice(0, 3)
}

const computeArtifactEvidencePriority = (item = {}) => {
  const metadata = getEvidenceMetadata(item)
  const citationScore = Number(item.citationScore || 0)
  const scholarlyScore = getEvidenceScholarlyScore(item)
  const benchmarkTerms = getEvidenceBenchmarkTerms(item)
  const sourceProviders = getEvidenceProviders(item)
  const verificationStatus = cleanText(item.verificationStatus || '')

  let score = citationScore * 0.5 + scholarlyScore * 0.35
  score += Math.min(10, benchmarkTerms.length * 4)
  score += Math.min(8, sourceProviders.length * 2 + (sourceProviders.includes('openalex') ? 2 : 0))
  score += Math.min(10, getEvidenceCommunityScore(item) * 0.55)
  if (metadata.peerReviewed) score += 6
  else if (metadata.preprint) score += 2
  if (['corroborated', 'verified'].includes(verificationStatus)) score += 4
  else if (['indexed', 'preprint_indexed'].includes(verificationStatus)) score += 2
  if (metadata.openAccess) score += 1

  return clamp(Math.round(score), 0, 100)
}

const prioritizeEvidenceInventory = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => ({
    ...item,
    artifactPriorityScore: computeArtifactEvidencePriority(item),
    artifactPriorityReasons: buildEvidencePriorityReasons(item),
  }))
  .sort((left, right) => (
    Number(right.artifactPriorityScore || 0) - Number(left.artifactPriorityScore || 0)
    || getEvidenceScholarlyScore(right) - getEvidenceScholarlyScore(left)
    || Number(right.citationScore || 0) - Number(left.citationScore || 0)
    || Number(right.mentionCount || 0) - Number(left.mentionCount || 0)
  ))

const buildScholarlySignalSummary = (evidence = []) => {
  const prioritizedEvidence = Array.isArray(evidence) ? evidence : []
  const academicEvidence = prioritizedEvidence.filter((item) => {
    const metadata = getEvidenceMetadata(item)
    return Boolean(metadata.scholarly)
      || getEvidenceScholarlyScore(item) > 0
      || ['academic_search', 'journal_search', 'preprint_search'].includes(cleanText(item.sourceKind || ''))
  })

  const averageScholarlyScore = academicEvidence.length > 0
    ? Math.round(academicEvidence.reduce((sum, item) => sum + getEvidenceScholarlyScore(item), 0) / academicEvidence.length)
    : 0

  const strongScholarlyCount = academicEvidence.filter((item) => (
    getEvidenceScholarlyScore(item) >= 70 || Number(item.citationScore || 0) >= 80
  )).length
  const benchmarkBackedCount = academicEvidence.filter((item) => getEvidenceBenchmarkTerms(item).length > 0).length
  const communityBackedCount = academicEvidence.filter((item) => getEvidenceCommunityScore(item) > 0).length
  const crossIndexedCount = academicEvidence.filter((item) => getEvidenceProviders(item).length >= 2).length
  const openAlexBackedCount = academicEvidence.filter((item) => getEvidenceProviders(item).includes('openalex')).length
  const topEvidence = academicEvidence.slice(0, 3).map((item) => ({
    id: item.id,
    label: item.label,
    url: item.url || null,
    scholarlyScore: getEvidenceScholarlyScore(item),
    citationScore: Number(item.citationScore || 0),
    artifactPriorityScore: Number(item.artifactPriorityScore || 0),
    artifactPriorityReasons: Array.isArray(item.artifactPriorityReasons) ? item.artifactPriorityReasons.slice(0, 3) : [],
    benchmarkTerms: getEvidenceBenchmarkTerms(item).slice(0, 2),
    sourceProviders: getEvidenceProviders(item).slice(0, 3),
    communitySignals: getEvidenceCommunitySignals(item),
  }))

  const summaryLines = [
    academicEvidence.length > 0 ? `학술 근거 ${academicEvidence.length}개, 평균 scholar ${averageScholarlyScore}/100` : null,
    strongScholarlyCount > 0 ? `강한 학술 근거 ${strongScholarlyCount}개` : null,
    benchmarkBackedCount > 0 ? `벤치마크/리더보드 연계 근거 ${benchmarkBackedCount}개` : null,
    crossIndexedCount > 0 ? `다중 인덱싱 근거 ${crossIndexedCount}개` : null,
    communityBackedCount > 0 ? `커뮤니티 보강 신호 ${communityBackedCount}개` : null,
  ].filter(Boolean)

  const recommendedAction = academicEvidence.length === 0
    ? '학술 근거가 없어 대외 설득력 확보용 문장에는 보수적 표현이 필요합니다.'
    : strongScholarlyCount === 0
      ? '학술 근거는 있으나 상위 scholar 신호가 약해 핵심 메시지를 보수적으로 표현하는 편이 안전합니다.'
      : benchmarkBackedCount === 0 && communityBackedCount === 0
        ? '학술 근거는 확보됐지만 벤치마크나 커뮤니티 보강 신호는 약하므로 일반화 범위를 좁혀 설명하는 편이 좋습니다.'
        : '상위 scholar 근거를 우선 배치하면 보고서와 발표자료의 설득력을 높일 수 있습니다.'

  return {
    academicEvidenceCount: academicEvidence.length,
    averageScholarlyScore,
    strongScholarlyCount,
    benchmarkBackedCount,
    communityBackedCount,
    crossIndexedCount,
    openAlexBackedCount,
    topEvidence,
    summaryLines,
    recommendedAction,
    status: academicEvidence.length === 0
      ? 'scholarly_gap'
      : strongScholarlyCount > 0
        ? 'scholarly_ready'
        : 'scholarly_watch',
  }
}

const buildActionItems = (consensus = '', sections = null) => {
  const items = []
  const lines = cleanText(consensus).split('\n')

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine)
    if (!line) continue

    const match = line.match(/^(단기|중기|장기)\s*[:：-]\s*(.+)$/)
    if (match) {
      items.push({
        horizon: match[1],
        text: truncate(match[2], 180),
      })
    }
  }

  if (items.length > 0) return items.slice(0, MAX_ACTION_ITEMS)

  const structuredRecommendations = (sections?.recommendations || [])
    .map((line, index) => ({
      horizon: index === 0 ? '우선' : index === 1 ? '후속' : '추가',
      text: truncate(line, 180),
    }))
    .filter((item) => item.text)

  if (structuredRecommendations.length > 0) {
    return structuredRecommendations.slice(0, MAX_ACTION_ITEMS)
  }

  return [
    sections?.consensusPoints?.[0] ? {
      horizon: '우선',
      text: truncate(`핵심 합의 문장을 평가 기준과 성공 조건으로 다시 명시합니다: ${sections.consensusPoints[0]}`, 180),
    } : null,
    sections?.disagreements?.[0] ? {
      horizon: '후속',
      text: truncate(`남은 이견을 검증할 추가 데이터와 benchmark 기준을 분리합니다: ${sections.disagreements[0]}`, 180),
    } : null,
    cleanText(consensus) ? {
      horizon: '추가',
      text: '최종 합의안을 1페이지 실행 메모와 발표자료용 요약으로 압축합니다.',
    } : null,
  ].filter(Boolean).slice(0, MAX_ACTION_ITEMS)
}

const buildEvidenceGaps = ({ evidence = [], claims = [], actionItems = [], citationSummary = {}, scholarlySummary = {} }) => {
  const gaps = []

  if (evidence.length === 0) {
    gaps.push('외부 출처 URL 또는 문서 식별자가 없어 근거 검증이 불가능합니다.')
  }

  if (claims.some((claim) => claim.evidenceStatus === 'missing')) {
    gaps.push('핵심 주장 중 출처와 직접 연결되지 않은 항목이 남아 있습니다.')
  }

  if (actionItems.length === 0) {
    gaps.push('실행 항목이 구조화되지 않아 보고서나 PPT 생성 파이프라인에 넘기기 어렵습니다.')
  }

  if (evidence.length > 0 && Number(citationSummary.averageCitationScore || 0) < 60) {
    gaps.push('근거는 있지만 citation 평균 점수가 낮아 보고서 신뢰도가 떨어질 수 있습니다.')
  }

  if (Number(citationSummary.needsReviewCount || 0) > 0) {
    gaps.push(`${citationSummary.needsReviewCount}개의 근거는 출처 또는 발췌 검토가 더 필요합니다.`)
  }

  if (evidence.length > 0 && Number(scholarlySummary.academicEvidenceCount || 0) === 0) {
    gaps.push('학술 근거가 없어 외부 설득력과 대외 인용 신뢰도를 설명하기 어렵습니다.')
  }

  if (Number(scholarlySummary.academicEvidenceCount || 0) > 0 && Number(scholarlySummary.strongScholarlyCount || 0) === 0) {
    gaps.push('학술 근거는 있으나 scholar 신호가 약해 핵심 메시지의 강도를 낮춰 제시해야 합니다.')
  }

  return uniqueBy(gaps, (gap) => gap)
}

const computeReadiness = ({ consensus = '', evidence = [], claims = [], actionItems = [], citationSummary = {}, scholarlySummary = {} }) => {
  const linkedClaims = claims.filter((claim) => claim.evidenceStatus === 'linked').length
  const citationScore = Number(citationSummary.averageCitationScore || 0)
  const scholarlyScore = Number(scholarlySummary.averageScholarlyScore || 0)
  const strongScholarlyCount = Number(scholarlySummary.strongScholarlyCount || 0)
  const score = Math.min(100,
    (cleanText(consensus).length >= 240 ? 30 : cleanText(consensus).length >= 120 ? 20 : 10)
    + Math.min(30, evidence.length * 15)
    + Math.min(20, actionItems.length * 6)
    + Math.min(15, linkedClaims * 5)
    + Math.min(15, Math.round(citationScore / 6.5))
    + Math.min(10, Math.round(scholarlyScore / 10))
    + Math.min(5, strongScholarlyCount * 2),
  )

  if (evidence.length === 0 || citationScore < 40) {
    return { status: 'needs_evidence', readinessScore: score }
  }

  if (score >= 70) {
    return { status: 'report_ready', readinessScore: score }
  }

  return { status: 'draft_ready', readinessScore: score }
}

const buildDossierMarkdown = (dossier) => {
  const metrics = dossier.metrics || {}
  const claims = dossier.claims || []
  const actionItems = dossier.actionItems || []
  const evidence = dossier.evidence || []
  const gaps = dossier.evidenceGaps || []
  const citationSummary = dossier.citationSummary || {}
  const scholarlySummary = dossier.scholarlySummary || {}
  const debateCitationLedger = Array.isArray(dossier?.citationLedger?.debate) ? dossier.citationLedger.debate : []

  return [
    `# Dossier - ${dossier.topic}`,
    '',
    `- Debate ID: ${dossier.debateId || 'pending'}`,
    `- 상태: ${STATUS_LABELS[dossier.status] || dossier.status}`,
    `- 준비도: ${dossier.readinessScore}/100`,
    `- Claims: ${metrics.claimCount || 0} / Evidence: ${metrics.evidenceCount || 0} / Actions: ${metrics.actionItemCount || 0}`,
    '',
    '## Executive Summary',
    dossier.executiveSummary || '요약 없음',
    '',
    '## Key Claims',
    ...(claims.length > 0
      ? claims.map((claim, index) => `${index + 1}. [${claim.ownerGodName}] ${claim.statement}`)
      : ['1. 핵심 주장 추출 실패']),
    '',
    '## Evidence Inventory',
    ...(evidence.length > 0
      ? evidence.map((item) => [
          `- ${item.label}${Number.isFinite(Number(item.citationScore)) ? ` [citation ${item.citationScore}/100]` : ''}`,
          item.excerpt ? `  발췌/초록: "${truncate(item.excerpt, 220)}"` : null,
          item.url ? `  원문 링크: ${item.url}` : null,
        ].filter(Boolean).join('\n'))
      : ['- 현재 연결된 외부 출처 없음']),
    '',
    '## Citation Quality',
    `- 평균 citation 점수: ${citationSummary.averageCitationScore || 0}/100`,
    `- 검증 완료 근거: ${citationSummary.verifiedCount || 0}개`,
    `- 재검토 필요 근거: ${citationSummary.needsReviewCount || 0}개`,
    citationSummary.recommendedAction ? `- 권고: ${citationSummary.recommendedAction}` : '- 권고 없음',
    '',
    '## Scholarly Signals',
    ...((Array.isArray(scholarlySummary.summaryLines) && scholarlySummary.summaryLines.length > 0)
      ? scholarlySummary.summaryLines.map((line) => `- ${line}`)
      : ['- 학술 신호 요약 없음']),
    ...((Array.isArray(scholarlySummary.topEvidence) && scholarlySummary.topEvidence.length > 0)
      ? scholarlySummary.topEvidence.map((item) => `- 우선 근거: ${item.label}${Number(item.scholarlyScore || 0) > 0 ? ` [scholar ${item.scholarlyScore}/100]` : ''}${Number(item.citationScore || 0) > 0 ? ` [citation ${item.citationScore}/100]` : ''}${item.artifactPriorityReasons?.length ? ` · ${item.artifactPriorityReasons.join(' · ')}` : ''}`)
      : []),
    scholarlySummary.recommendedAction ? `- 권고: ${scholarlySummary.recommendedAction}` : null,
    '',
    '## Citation Ledger',
    ...(debateCitationLedger.length > 0
      ? debateCitationLedger.map((entry) => `- ${entry.locationLabel}: ${(Array.isArray(entry.citations) ? entry.citations : []).slice(0, 3).map((citation) => `[${citation.evidenceId || 'evidence'}] ${citation.label}${citation.url ? ` · ${citation.url}` : ''}`).join(' | ')}`)
      : ['- 기록된 debate citation 사용처 없음']),
    '',
    '## Action Items',
    ...(actionItems.length > 0
      ? actionItems.map((item) => `- [${item.horizon}] ${item.text}`)
      : ['- 구조화된 실행 항목 없음']),
    '',
    '## Evidence Gaps',
    ...(gaps.length > 0 ? gaps.map((gap) => `- ${gap}`) : ['- 치명적 공백 없음']),
    '',
    '## Next Step',
    dossier.nextStep || '다음 단계가 아직 계산되지 않았습니다.',
  ].join('\n')
}

export const buildDebateDossier = ({
  debateId = null,
  topic = '',
  totalRounds = 1,
  consensus = '',
  messages = [],
  evidence = [],
  isYoutube = false,
  source = 'debate_complete',
} = {}) => {
  const sections = extractConsensusSections(consensus)
  const participantViews = buildParticipantViews(messages)
  const baseClaims = buildClaims({ messages, consensus })
  const rawEvidenceInventory = buildEvidenceInventory({ topic, consensus, messages, isYoutube, evidenceItems: evidence })
  const evaluatedEvidence = evaluateCitationPortfolio(rawEvidenceInventory)
  const prioritizedEvidenceInventory = prioritizeEvidenceInventory(evaluatedEvidence.items)
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((item, index) => ({ ...item, id: `evidence-${index + 1}` }))
  const debateCitationEntries = buildDebateCitationLedger({ messages, consensus, evidence: prioritizedEvidenceInventory })
  const evidenceInventory = annotateEvidenceUsage(prioritizedEvidenceInventory, debateCitationEntries)
  const claims = attachClaimCitationLinks(baseClaims, evidenceInventory, debateCitationEntries)
  const citationSummary = {
    ...evaluateCitationPortfolio(evidenceInventory),
    items: evidenceInventory,
  }
  const scholarlySummary = buildScholarlySignalSummary(evidenceInventory)
  const actionItems = buildActionItems(consensus, sections)
  const evidenceGaps = buildEvidenceGaps({ evidence: evidenceInventory, claims, actionItems, citationSummary, scholarlySummary })
  const { status, readinessScore } = computeReadiness({
    consensus,
    evidence: evidenceInventory,
    claims,
    actionItems,
    citationSummary,
    scholarlySummary,
  })
  const generatedAt = new Date().toISOString()
  const executiveSummary = buildExecutiveSummary({ topic, consensus, sections })
  const spokenMessageCount = (Array.isArray(messages) ? messages : []).filter((message) => message && !message.type && message.godId && cleanText(message.content)).length
  const citedDebateMessageCount = debateCitationEntries.filter((entry) => entry.locationType === 'debate_message').length
  const citedEvidenceCount = uniqueStrings(debateCitationEntries.flatMap((entry) => Array.isArray(entry.evidenceIds) ? entry.evidenceIds : [])).length

  const dossier = {
    schemaVersion: 4,
    debateId,
    topic: String(topic || '').trim(),
    totalRounds: Math.max(1, Number(totalRounds) || 1),
    isYoutube: Boolean(isYoutube),
    status,
    statusLabel: STATUS_LABELS[status] || status,
    readinessScore,
    generatedAt,
    source,
    executiveSummary,
    consensusSnapshot: truncate(consensus, 1200),
    sections,
    claims,
    evidence: evidenceInventory,
    citationSummary,
    citationLedger: {
      debate: debateCitationEntries,
      summary: {
        citedDebateMessageCount,
        uncitedDebateMessageCount: Math.max(0, spokenMessageCount - citedDebateMessageCount),
        citedEvidenceCount,
        citedConsensus: debateCitationEntries.some((entry) => entry.locationType === 'consensus'),
      },
    },
    scholarlySummary,
    actionItems,
    evidenceGaps,
    participantViews,
    nextStep: status === 'needs_evidence'
      ? Number(scholarlySummary.academicEvidenceCount || 0) > 0
        ? '상위 scholar 또는 benchmark 신호가 있는 근거를 더 확보하고 citation 점수를 끌어올린 뒤 보고서/PPT 생성 단계로 넘겨야 합니다.'
        : '웹 검색·학술 검색·문서 근거를 보강하고 citation 점수를 끌어올린 뒤 보고서/PPT 생성 단계로 넘겨야 합니다.'
      : status === 'draft_ready'
        ? Number(scholarlySummary.strongScholarlyCount || 0) > 0
          ? '상위 scholar 근거를 앞쪽에 배치하고 citation 정규화만 조금 더 보강하면 최종 문서와 발표 자료 품질이 안정됩니다.'
          : '강한 scholar 또는 peer-reviewed 근거를 1~2개 더 확보하면 최종 문서와 발표 자료 품질이 안정됩니다.'
        : Number(scholarlySummary.strongScholarlyCount || 0) > 0
          ? '현재 구조와 citation 품질이면 상위 scholar 근거를 중심으로 보고서/PPT 생성 파이프라인 입력물로 사용할 수 있습니다.'
          : '현재 구조와 citation 품질이면 보고서/PPT 생성 파이프라인 입력물로 사용할 수 있습니다.',
    metrics: {
      claimCount: claims.length,
      evidenceCount: evidenceInventory.length,
      actionItemCount: actionItems.length,
      participantCount: participantViews.length,
      evidenceGapCount: evidenceGaps.length,
      consensusLength: cleanText(consensus).length,
      averageCitationScore: citationSummary.averageCitationScore || 0,
      averageScholarlyScore: scholarlySummary.averageScholarlyScore || 0,
      benchmarkBackedEvidenceCount: scholarlySummary.benchmarkBackedCount || 0,
      communityBackedEvidenceCount: scholarlySummary.communityBackedCount || 0,
      verifiedEvidenceCount: citationSummary.verifiedCount || 0,
      citationReviewCount: citationSummary.needsReviewCount || 0,
      citedDebateMessageCount,
      uncitedDebateMessageCount: Math.max(0, spokenMessageCount - citedDebateMessageCount),
      citedEvidenceCount,
    },
  }

  dossier.markdown = buildDossierMarkdown(dossier)
  return dossier
}