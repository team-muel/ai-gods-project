import { enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()

const cleanMultilineText = (value = '') => String(value || '')
  .replace(/\r/g, '')
  .split('\n')
  .map((line) => cleanText(line))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const decodeHtmlEntities = (value = '') => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => {
    const parsed = Number.parseInt(code, 10)
    return Number.isNaN(parsed) ? '' : String.fromCharCode(parsed)
  })

const stripHtml = (html = '') => cleanMultilineText(
  decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
  )
)

const extractHtmlTitle = (html = '') => {
  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return cleanText(stripHtml(titleMatch?.[1] || ''))
}

const buildExcerptLines = (text = '', maxLines = 3, maxChars = 420) => {
  const normalized = cleanMultilineText(text).replace(/\n+/g, ' ')
  if (!normalized) return []

  const pieces = normalized
    .split(/(?<=[.!?。！？])\s+|\s*[-•]\s+/)
    .map((piece) => cleanText(piece))
    .filter(Boolean)

  const lines = []
  let currentLength = 0
  for (const piece of pieces) {
    if (lines.length >= maxLines) break
    if ((currentLength + piece.length) > maxChars && lines.length > 0) break
    const value = piece.length > 150 ? `${piece.slice(0, 150).trim()}…` : piece
    lines.push(value)
    currentLength += value.length
  }

  if (lines.length === 0 && normalized) {
    return [normalized.length > 160 ? `${normalized.slice(0, 160).trim()}…` : normalized]
  }

  return lines
}

const getExtension = (value = '') => {
  const match = String(value || '').toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)
  return match?.[1] || ''
}

const isPrivateHostname = (hostname = '') => {
  const lower = String(hostname || '').trim().toLowerCase()
  if (!lower) return true
  if (['localhost', '127.0.0.1', '::1'].includes(lower)) return true
  if (lower.endsWith('.local')) return true
  if (/^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(lower)) return true
  return false
}

const normalizeRemoteUrl = (value = '') => {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    if (isPrivateHostname(url.hostname)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

const parseDataUrl = (value = '') => {
  const match = String(value || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i)
  if (!match?.[2]) return null

  try {
    return {
      mimeType: cleanText(match[1] || 'application/octet-stream').toLowerCase(),
      buffer: Buffer.from(match[2], 'base64'),
    }
  } catch {
    return null
  }
}

const detectKind = ({ name = '', mimeType = '', url = '' } = {}) => {
  const extension = getExtension(name || url)
  const normalizedMime = cleanText(mimeType).toLowerCase()
  if (normalizedMime.includes('pdf') || extension === 'pdf') return 'pdf'
  if (normalizedMime.includes('wordprocessingml') || extension === 'docx') return 'docx'
  if (normalizedMime.includes('html') || ['html', 'htm'].includes(extension)) return 'html'
  if (normalizedMime.startsWith('text/') || ['txt', 'md', 'markdown', 'csv', 'json'].includes(extension)) return 'text'
  return 'binary'
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timeoutId)
  }
}

const extractTextFromBuffer = async ({ buffer, name = '', mimeType = '' } = {}) => {
  const kind = detectKind({ name, mimeType })
  if (!buffer || buffer.length === 0) return { kind, title: cleanText(name), text: '' }

  if (kind === 'text') {
    return {
      kind,
      title: cleanText(name),
      text: cleanMultilineText(buffer.toString('utf-8')).slice(0, 12000),
    }
  }

  if (kind === 'html') {
    const raw = buffer.toString('utf-8')
    return {
      kind,
      title: extractHtmlTitle(raw) || cleanText(name),
      text: stripHtml(raw).slice(0, 12000),
    }
  }

  if (kind === 'pdf') {
    const module = await import('pdf-parse')
    const pdfParse = module?.default || module
    const result = await pdfParse(buffer)
    return {
      kind,
      title: cleanText(name),
      text: cleanMultilineText(result?.text || '').slice(0, 12000),
    }
  }

  if (kind === 'docx') {
    const module = await import('mammoth')
    const mammoth = module?.default || module
    const result = await mammoth.extractRawText({ buffer })
    return {
      kind,
      title: cleanText(name),
      text: cleanMultilineText(result?.value || '').slice(0, 12000),
    }
  }

  return {
    kind,
    title: cleanText(name),
    text: '',
  }
}

const ingestUploadedSource = async (source = {}) => {
  const name = cleanText(source?.name || '업로드 파일')
  const explicitText = cleanMultilineText(source?.text || '')
  if (explicitText) {
    return {
      origin: 'upload',
      name,
      title: name,
      kind: 'text',
      text: explicitText.slice(0, 12000),
      preview: buildExcerptLines(explicitText, 2, 240).join(' / '),
    }
  }

  const parsedData = parseDataUrl(source?.dataUrl || '')
  if (!parsedData?.buffer) {
    throw new Error(`${name} 파일 데이터를 읽지 못했습니다.`)
  }

  if (parsedData.buffer.length > (2.5 * 1024 * 1024)) {
    throw new Error(`${name} 파일이 너무 큽니다. 2.5MB 이하 파일만 업로드할 수 있습니다.`)
  }

  const extracted = await extractTextFromBuffer({
    buffer: parsedData.buffer,
    name,
    mimeType: source?.type || parsedData.mimeType,
  })

  return {
    origin: 'upload',
    name,
    title: cleanText(extracted.title || name),
    kind: extracted.kind,
    text: cleanMultilineText(extracted.text || '').slice(0, 12000),
    preview: buildExcerptLines(extracted.text || '', 2, 240).join(' / '),
  }
}

const ingestRemoteSource = async (rawUrl = '') => {
  const url = normalizeRemoteUrl(rawUrl)
  if (!url) throw new Error('허용되지 않거나 잘못된 URL입니다.')

  const response = await fetchWithTimeout(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 AI-GODS-INGEST',
      accept: 'text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,*/*',
    },
  })

  if (!response.ok) throw new Error(`URL 본문을 가져오지 못했습니다. (${response.status})`)

  const contentType = cleanText(response.headers.get('content-type') || '').toLowerCase()
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (buffer.length > (2.5 * 1024 * 1024)) {
    throw new Error('URL 원문이 너무 큽니다. 2.5MB 이하 자료만 바로 가져올 수 있습니다.')
  }

  const extracted = await extractTextFromBuffer({ buffer, name: url, mimeType: contentType })
  return {
    origin: 'url',
    url,
    name: cleanText(extracted.title || url),
    title: cleanText(extracted.title || url),
    kind: extracted.kind,
    text: cleanMultilineText(extracted.text || '').slice(0, 12000),
    preview: buildExcerptLines(extracted.text || '', 2, 240).join(' / '),
  }
}

const buildStructuredOverview = ({ promptLine = '', sourceUrl = '', sources = [] } = {}) => {
  const headline = cleanText(promptLine)
    || cleanText(sources[0]?.title || sources[0]?.name || '')
    || '참고 자료 기반 콘텐츠 초안'

  const blocks = [headline]
  if (sourceUrl) {
    blocks.push(`참조 URL\n- ${cleanText(sourceUrl)}`)
  }

  sources.slice(0, 4).forEach((source, index) => {
    const blockTitle = `${index + 1}부 ${cleanText(source.title || source.name || `참고 자료 ${index + 1}`)}`
    const bulletLines = buildExcerptLines(source.text || source.preview || '', 3, 360)
    blocks.push([
      blockTitle,
      ...bulletLines.map((line) => `- ${line}`),
    ].filter(Boolean).join('\n'))
  })

  return blocks.join('\n\n').slice(0, 1200)
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'artifacts-ingest', limit: 20, windowMs: 10 * 60 * 1000 })) return

  try {
    const body = parseJsonBody(req)
    const promptLine = cleanText(body?.promptLine || '').slice(0, 240)
    const sourceUrl = cleanText(body?.sourceUrl || '').slice(0, 1000)
    const uploadedSources = Array.isArray(body?.uploadedSources) ? body.uploadedSources.slice(0, 3) : []

    if (!promptLine && !sourceUrl && uploadedSources.length === 0) {
      return sendJson(res, 400, { error: 'URL 또는 파일 소스가 필요합니다.' })
    }

    const extractedSources = []

    if (sourceUrl) {
      extractedSources.push(await ingestRemoteSource(sourceUrl))
    }

    for (const source of uploadedSources) {
      extractedSources.push(await ingestUploadedSource(source))
    }

    const validSources = extractedSources
      .map((source) => ({
        ...source,
        text: cleanMultilineText(source.text || '').slice(0, 5000),
      }))
      .filter((source) => cleanText(source.text || source.preview || ''))

    if (validSources.length === 0) {
      return sendJson(res, 400, { error: '본문을 추출할 수 있는 유효한 소스를 찾지 못했습니다.' })
    }

    return sendJson(res, 200, {
      ok: true,
      overview: buildStructuredOverview({ promptLine, sourceUrl, sources: validSources }),
      sources: validSources.map((source) => ({
        origin: source.origin,
        name: source.name,
        title: source.title,
        kind: source.kind,
        url: source.url || '',
        text: source.text,
        preview: source.preview,
      })),
    })
  } catch (error) {
    return sendJson(res, 500, { error: error?.message || '소스 본문 추출에 실패했습니다.' })
  }
}