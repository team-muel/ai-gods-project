const MAX_LABEL_LENGTH = 220
const MAX_EXCERPT_LENGTH = 420

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const truncate = (value = '', maxLength = MAX_EXCERPT_LENGTH) => {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const uniqueStrings = (items = []) => [...new Set(items.map((item) => cleanText(item)).filter(Boolean))]

const uniqueBy = (items = [], getKey = (item) => item) => {
  const seen = new Set()

  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = cleanText(getKey(item))
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const extractUrls = (value = '') => uniqueStrings(
  String(value).match(/https?:\/\/[^\s)\]}"']+/g) || [],
).map((url) => url.replace(/[),.;!?]+$/g, ''))

export const inferEvidenceType = (url = '', fallback = 'web') => {
  if (!url) return fallback
  if (/youtube\.com|youtu\.be/.test(url)) return 'video'
  if (/github\.com/.test(url)) return 'repository'
  if (/arxiv\.org/.test(url)) return 'preprint'
  if (/pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|openreview\.net|ieeexplore\.ieee\.org|dl\.acm\.org/.test(url)) return 'paper'
  if (/\.pdf($|\?)/.test(url)) return 'document'
  return 'web'
}

const extractYouTubeUrl = (value = '') => extractUrls(value).find((url) => /youtube\.com|youtu\.be/.test(url)) || null

const extractVideoId = (url = '') => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = String(url).match(pattern)
    if (match) return match[1]
  }

  return ''
}

export const normalizeEvidenceItem = (item = {}, index = 0) => {
  const url = cleanText(item.url || item.link || '')
  const externalId = cleanText(item.externalId || item.external_id || (url ? extractVideoId(url) : ''))
  const type = cleanText(item.type || inferEvidenceType(url, cleanText(item.type || 'web'))) || 'web'
  const sourceKind = cleanText(item.sourceKind || item.source_kind || 'external') || 'external'
  const label = truncate(item.label || item.title || url || `${type} source ${index + 1}`, MAX_LABEL_LENGTH)
  const mentionedBy = uniqueStrings(Array.isArray(item.mentionedBy) ? item.mentionedBy : [item.mentionedBy])
  const mentionCount = Math.max(1, Number(item.mentionCount || item.mention_count) || mentionedBy.length || 1)

  return {
    id: cleanText(item.id || `evidence-${index + 1}`),
    type,
    sourceKind,
    provider: cleanText(item.provider || ''),
    url: url || null,
    externalId: externalId || null,
    label,
    excerpt: truncate(item.excerpt || item.snippet || item.description || '', MAX_EXCERPT_LENGTH),
    verificationStatus: cleanText(item.verificationStatus || item.verification_status || 'unverified') || 'unverified',
    mentionedBy,
    mentionCount,
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  }
}

export const buildEvidenceKey = (item = {}) => [
  cleanText(item.sourceKind || ''),
  cleanText(item.url || ''),
  cleanText(item.externalId || ''),
  cleanText(item.label || ''),
  cleanText(item.type || ''),
].join('::').toLowerCase()

const extractEvidenceTagNumbers = (value = '') => uniqueStrings(
  Array.from(String(value || '').matchAll(/\[E(\d+)\]/g), (match) => match?.[1] || '')
).map((value) => Number.parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0)

export const buildCitationRef = (item = {}, options = {}) => {
  const normalized = normalizeEvidenceItem(item)

  return {
    evidenceKey: buildEvidenceKey(normalized),
    evidenceId: cleanText(normalized.id || ''),
    localTag: cleanText(options.localTag || ''),
    label: normalized.label,
    url: normalized.url || null,
    sourceKind: normalized.sourceKind || null,
    type: normalized.type || null,
  }
}

export const buildCitationRefsFromResponse = ({ content = '', selectedEvidence = [] } = {}) => {
  const evidenceItems = mergeEvidenceItems(Array.isArray(selectedEvidence) ? selectedEvidence : [])
  const taggedRefs = extractEvidenceTagNumbers(content)
    .map((tagNumber) => {
      const evidenceItem = evidenceItems[tagNumber - 1]
      return evidenceItem ? buildCitationRef(evidenceItem, { localTag: `E${tagNumber}` }) : null
    })
    .filter(Boolean)

  const responseUrls = extractUrls(content)
  const urlRefs = evidenceItems
    .filter((item) => item?.url && responseUrls.includes(cleanText(item.url)))
    .map((item) => buildCitationRef(item))

  return uniqueBy([...taggedRefs, ...urlRefs], (item) => `${item.evidenceKey}::${item.localTag || item.url || item.label}`)
}

export const mergeEvidenceItems = (items = []) => {
  const merged = new Map()

  for (const [index, rawItem] of (Array.isArray(items) ? items : []).entries()) {
    const item = normalizeEvidenceItem(rawItem, index)
    const key = buildEvidenceKey(item)
    if (!key) continue

    if (!merged.has(key)) {
      merged.set(key, { ...item })
      continue
    }

    const existing = merged.get(key)
    existing.mentionedBy = uniqueStrings([...(existing.mentionedBy || []), ...(item.mentionedBy || [])])
    existing.mentionCount = Math.max(existing.mentionCount || 1, item.mentionCount || 1) + 1
    if (!existing.excerpt && item.excerpt) existing.excerpt = item.excerpt
    if ((!existing.url || existing.url === existing.label) && item.url) existing.url = item.url
    if (!existing.externalId && item.externalId) existing.externalId = item.externalId
    if (!existing.provider && item.provider) existing.provider = item.provider
    existing.metadata = { ...(existing.metadata || {}), ...(item.metadata || {}) }
  }

  return Array.from(merged.values()).map((item, index) => ({
    ...item,
    id: `evidence-${index + 1}`,
  }))
}

export const searchResultsToEvidenceItems = (searchData, { requestedBy = 'system' } = {}) => {
  const results = Array.isArray(searchData?.results)
    ? searchData.results
    : [
        ...(Array.isArray(searchData?.academicResults) ? searchData.academicResults : []),
        ...(Array.isArray(searchData?.webResults) ? searchData.webResults : []),
      ]

  return mergeEvidenceItems(results.map((result, index) => ({
    id: `search-${index + 1}`,
    type: cleanText(result?.type || inferEvidenceType(result?.link, result?.resultType === 'academic' ? 'paper' : 'web')) || 'web',
    sourceKind: cleanText(result?.sourceKind || (result?.resultType === 'academic' ? 'academic_search' : 'web_search')) || 'external',
    provider: cleanText(result?.provider || (result?.resultType === 'academic' ? 'academic-search' : 'duckduckgo-html')),
    url: result?.link || null,
    label: result?.title || result?.link || `search result ${index + 1}`,
    excerpt: result?.snippet || '',
    verificationStatus: cleanText(result?.verificationStatus || (result?.resultType === 'academic' ? 'indexed' : 'retrieved')) || 'retrieved',
    mentionedBy: [requestedBy],
    metadata: {
      query: cleanText(searchData?.query || ''),
      rank: index + 1,
      ...(result?.metadata && typeof result.metadata === 'object' ? result.metadata : {}),
    },
  })))
}

export const buildTranscriptEvidenceItem = ({ topic = '', transcript = '', requestedBy = 'system' } = {}) => {
  const youtubeUrl = extractYouTubeUrl(topic)
  const videoId = extractVideoId(youtubeUrl || '')
  const excerpt = truncate(transcript, MAX_EXCERPT_LENGTH)

  if (!youtubeUrl && !excerpt) return null

  return normalizeEvidenceItem({
    id: videoId || 'youtube-transcript',
    type: youtubeUrl ? 'video' : 'transcript',
    sourceKind: 'youtube_transcript',
    provider: 'youtube-transcript',
    url: youtubeUrl,
    externalId: videoId || null,
    label: youtubeUrl ? `YouTube transcript: ${videoId || 'video'}` : 'Transcript context',
    excerpt,
    verificationStatus: 'context_ingested',
    mentionedBy: [requestedBy],
    metadata: {
      topic: cleanText(topic),
      transcript_chars: cleanText(transcript).length,
    },
  })
}

export const evidenceItemsToRows = ({ debateId, evidence = [] } = {}) => mergeEvidenceItems(evidence).map((item) => ({
  debate_id: debateId,
  evidence_type: item.type,
  source_kind: item.sourceKind,
  provider: item.provider || null,
  source_url: item.url || null,
  external_id: item.externalId || null,
  title: item.label,
  excerpt: item.excerpt || null,
  verification_status: item.verificationStatus || 'unverified',
  mention_count: Math.max(1, Number(item.mentionCount) || 1),
  mentioned_by: item.mentionedBy || [],
  metadata: item.metadata || {},
}))

export const dossierClaimsToRows = ({ debateId, claims = [] } = {}) => (Array.isArray(claims) ? claims : []).map((claim, index) => ({
  debate_id: debateId,
  claim_key: cleanText(claim.id || `claim-${index + 1}`) || `claim-${index + 1}`,
  owner_god_id: cleanText(claim.ownerGodId || '') || null,
  owner_god_name: cleanText(claim.ownerGodName || '') || null,
  round: Math.max(1, Number(claim.round) || 1),
  statement: truncate(claim.statement || '', 600),
  evidence_status: cleanText(claim.evidenceStatus || 'missing') || 'missing',
  supporting_urls: extractUrls((claim.supportingUrls || []).join(' ')),
  metadata: claim.metadata && typeof claim.metadata === 'object' ? claim.metadata : {},
}))