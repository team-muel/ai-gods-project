import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { google } from 'googleapis'
import { clearGoogleOAuthSession, createGoogleAuthError, getGoogleAuthForRequest } from '../_googleOAuth.js'
import { enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'

const require = createRequire(import.meta.url)
let cachedPptxGenJS = null

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const getPptxGenJS = async () => {
  if (cachedPptxGenJS) return cachedPptxGenJS

  try {
    const module = require('pptxgenjs')
    cachedPptxGenJS = module?.default || module
    return cachedPptxGenJS
  } catch {
    const module = await import('pptxgenjs')
    cachedPptxGenJS = module?.default || module
    return cachedPptxGenJS
  }
}

const sanitizeFileName = (value = '', extension = '') => {
  const safe = cleanText(value)
    .replace(/[<>:"/\\|?*;\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'artifact'

  return extension ? `${safe}.${extension}` : safe
}

const toAsciiFileName = (value = '') => {
  const normalized = cleanText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  const safe = normalized
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[<>:"/\\|?*;\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  if (!safe) return 'artifact'
  if (/^\.[A-Za-z0-9]+$/.test(safe)) return `artifact${safe}`
  return safe
}

const encodeHeaderFileName = (value = '') => (
  encodeURIComponent(String(value || 'artifact'))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
)

const buildContentDisposition = (filename = '') => {
  const safeFilename = cleanText(filename || 'artifact')
  const asciiFilename = toAsciiFileName(safeFilename)
  const encodedFilename = encodeHeaderFileName(safeFilename)
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
}

const markdownToParagraphs = (markdown = '') => {
  const lines = String(markdown).replace(/\r/g, '').split('\n')

  return lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return new Paragraph({ text: '' })
    if (trimmed.startsWith('# ')) return new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 })
    if (trimmed.startsWith('## ')) return new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 })
    if (trimmed.startsWith('### ')) return new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 })
    if (trimmed.startsWith('- ')) return new Paragraph({ text: trimmed.slice(2), bullet: { level: 0 } })
    return new Paragraph({ text: trimmed })
  })
}

const buildArtifactEvidenceLabel = (item = {}, { compact = false } = {}) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const authors = Array.isArray(metadata.authors) ? metadata.authors.slice(0, compact ? 2 : 3).join(', ') : ''
  const venue = cleanText(metadata.venue || metadata.sourceLabel || item?.provider || '')
  const year = cleanText(metadata.year || '')
  const doi = cleanText(metadata.doi || '')
  const venueSignals = metadata.venueSignals && typeof metadata.venueSignals === 'object' ? metadata.venueSignals : {}
  const sourceProviders = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders.filter(Boolean).slice(0, 3) : []
  const parts = [authors, year, venue].filter(Boolean)
  const signals = []

  if (Number.isFinite(Number(metadata?.scholarlyScore || metadata?.rankingSignals?.total))) {
    signals.push(`scholar ${Math.round(Number(metadata.scholarlyScore || metadata.rankingSignals?.total || 0))}/100`)
  }
  if (metadata.peerReviewed) signals.push('peer-reviewed est.')
  else if (metadata.preprint) signals.push('preprint')
  if (venueSignals.emphasisLabel) signals.push(venueSignals.emphasisLabel)
  if (sourceProviders.length > 1) signals.push(`indexed ${sourceProviders.join('+')}`)
  if (doi) signals.push(`DOI ${doi}`)

  return [parts.join(' · '), signals.join(' · '), cleanText(item?.url || '')].filter(Boolean).join(' | ')
}

const buildBulletParagraphs = (items = [], fallback = '내용 없음') => {
  const values = Array.isArray(items) && items.length > 0 ? items : [fallback]
  return values.map((item) => new Paragraph({
    text: cleanText(item),
    bullet: { level: 0 },
    spacing: { after: 90 },
  }))
}

const buildReportSectionParagraphs = (section = {}) => {
  const title = cleanText(section?.title || 'Section')
  const summaryBullets = Array.isArray(section?.summaryBullets) ? section.summaryBullets : []
  const evidenceLines = Array.isArray(section?.evidenceLines) ? section.evidenceLines : []

  return [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    ...buildBulletParagraphs(summaryBullets, '내용 없음'),
    ...(evidenceLines.length > 0
      ? [
          new Paragraph({ text: 'Citations', heading: HeadingLevel.HEADING_2 }),
          ...buildBulletParagraphs(evidenceLines, '인용 근거 없음'),
        ]
      : []),
  ]
}

const buildReportDocChildren = ({ title, artifact, markdown }) => {
  const structured = artifact?.structuredContent && typeof artifact.structuredContent === 'object' ? artifact.structuredContent : {}
  const reportSections = Array.isArray(structured.reportSections) ? structured.reportSections : []
  const claims = Array.isArray(structured.claims) ? structured.claims : []
  const evidence = Array.isArray(structured.evidence) ? structured.evidence : []
  const actionItems = Array.isArray(structured.actionItems) ? structured.actionItems : []
  const evidenceGaps = Array.isArray(structured.evidenceGaps) ? structured.evidenceGaps : []
  const citationLedger = Array.isArray(structured.citationLedger) ? structured.citationLedger : []
  const citationPolicy = structured.citationPolicy && typeof structured.citationPolicy === 'object' ? structured.citationPolicy : {}
  const citationSummary = structured.citationSummary && typeof structured.citationSummary === 'object' ? structured.citationSummary : {}
  const scholarlySummary = structured.scholarlySummary && typeof structured.scholarlySummary === 'object' ? structured.scholarlySummary : {}
  const executiveSummary = cleanText(structured.executiveSummary || '')
  const children = [
    new Paragraph({
      text: cleanText(title || structured.topic || 'AI Gods Research Brief'),
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'AI Gods Research Brief', bold: true, color: '5B6472' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      text: cleanText(artifact?.metadata?.audience ? `대상 독자: ${artifact.metadata.audience}` : '의사결정용 학술 브리프'),
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
    }),
  ]

  if (reportSections.length > 0) {
    children.push(
      ...reportSections.flatMap((section) => buildReportSectionParagraphs(section)),
      ...(citationPolicy.includeLedger
        ? [
          new Paragraph({ text: 'Citation Ledger', heading: HeadingLevel.HEADING_1 }),
          ...buildBulletParagraphs(citationLedger.map((entry) => {
            const citedLines = (Array.isArray(entry?.citations) ? entry.citations : [])
              .slice(0, 3)
              .map((citation) => `${cleanText(citation?.evidenceId || 'evidence')} ${cleanText(citation?.label || '')}${cleanText(citation?.url || '') ? ` | ${cleanText(citation.url)}` : ''}`)
            return `${cleanText(entry?.locationLabel || entry?.locationId || 'section')}: ${citedLines.join(' · ')}`
          }), '기록된 citation 사용처 없음'),
        ]
        : [])
    )

    return children
  }

  children.push(
    new Paragraph({ text: 'Abstract', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: executiveSummary || cleanText(markdown || '요약 없음'), spacing: { after: 160 }, }),
    new Paragraph({ text: 'Research Question', heading: HeadingLevel.HEADING_1 }),
    ...buildBulletParagraphs([
      cleanText(structured.topic || title || '주제 정보 없음'),
      artifact?.metadata?.request ? `사용자 요청: ${cleanText(artifact.metadata.request)}` : '사용자 요청 없음',
    ]),
    new Paragraph({ text: 'Key Findings', heading: HeadingLevel.HEADING_1 }),
    ...buildBulletParagraphs(claims.map((claim) => `[${cleanText(claim.ownerGodName || 'AI')}] ${cleanText(claim.statement || '')}`), '핵심 주장 없음'),
    new Paragraph({ text: 'Evidence Strength', heading: HeadingLevel.HEADING_1 }),
    ...buildBulletParagraphs([
      citationSummary.averageCitationScore ? `평균 citation 점수 ${citationSummary.averageCitationScore}/100` : 'citation 점수 데이터 없음',
      citationSummary.verifiedCount ? `검증 완료 근거 ${citationSummary.verifiedCount}개` : null,
      scholarlySummary.averageScholarlyScore ? `평균 scholar 점수 ${scholarlySummary.averageScholarlyScore}/100` : null,
      scholarlySummary.strongScholarlyCount ? `강한 학술 근거 ${scholarlySummary.strongScholarlyCount}개` : null,
    ].filter(Boolean)),
    new Paragraph({ text: 'Evidence Matrix', heading: HeadingLevel.HEADING_1 }),
  )

  if (evidence.length > 0) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['Evidence', 'Signal', 'Link'].map((label) => new TableCell({
            shading: { fill: 'E8EEF5' },
            borders: {
              top: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
              bottom: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
              left: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
              right: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
            },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
          })),
        }),
        ...evidence.slice(0, 6).map((item) => {
          const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
          const venueSignals = metadata.venueSignals && typeof metadata.venueSignals === 'object' ? metadata.venueSignals : {}
          const signalLabel = [
            Number.isFinite(Number(metadata?.scholarlyScore || metadata?.rankingSignals?.total)) ? `scholar ${Math.round(Number(metadata.scholarlyScore || metadata.rankingSignals?.total || 0))}` : '',
            metadata.peerReviewed ? 'peer-reviewed' : metadata.preprint ? 'preprint' : '',
            venueSignals.emphasisLabel || '',
          ].filter(Boolean).join(' · ')

          return new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: cleanText(item.label || '근거 없음') })] }),
              new TableCell({ children: [new Paragraph({ text: signalLabel || cleanText(metadata.venue || metadata.sourceLabel || '신호 없음') })] }),
              new TableCell({ children: [new Paragraph({ text: cleanText(item.url || '') || '링크 없음' })] }),
            ],
          })
        }),
      ],
    }))
  } else {
    children.push(new Paragraph({ text: '연결된 근거 없음', spacing: { after: 120 } }))
  }

  children.push(
    new Paragraph({ text: 'Recommendations', heading: HeadingLevel.HEADING_1 }),
    ...buildBulletParagraphs(actionItems.map((item) => `[${cleanText(item.horizon || 'horizon')}] ${cleanText(item.text || '')}`), '권고 없음'),
    new Paragraph({ text: 'Limitations', heading: HeadingLevel.HEADING_1 }),
    ...buildBulletParagraphs(evidenceGaps, '치명적 공백 없음'),
    ...(citationPolicy.includeReferences
      ? [
        new Paragraph({ text: 'References', heading: HeadingLevel.HEADING_1 }),
        ...buildBulletParagraphs(evidence.slice(0, 10).map((item) => buildArtifactEvidenceLabel(item, { compact: true })), '참고문헌 없음'),
      ]
      : []),
    ...(citationPolicy.includeLedger
      ? [
        new Paragraph({ text: 'Citation Ledger', heading: HeadingLevel.HEADING_1 }),
        ...buildBulletParagraphs(citationLedger.map((entry) => {
          const citedLines = (Array.isArray(entry?.citations) ? entry.citations : [])
            .slice(0, 3)
            .map((citation) => `${cleanText(citation?.evidenceId || 'evidence')} ${cleanText(citation?.label || '')}${cleanText(citation?.url || '') ? ` | ${cleanText(citation.url)}` : ''}`)
          return `${cleanText(entry?.locationLabel || entry?.locationId || 'section')}: ${citedLines.join(' · ')}`
        }), '기록된 citation 사용처 없음'),
      ]
      : [])
  )

  return children
}

const getSlideLayout = (slideData = {}, index = 0) => {
  const explicit = cleanText(slideData?.layout || '').toLowerCase()
  if (explicit) return explicit
  if (index === 0) return 'hero'
  return 'content'
}

const countMatches = (value = '', pattern) => (String(value || '').match(pattern) || []).length

const isPlaceholderHeavyText = (value = '') => {
  const text = cleanText(value).replace(/\s+/g, '')
  if (!text) return false

  const questionMarks = countMatches(text, /\?/g)
  const readableChars = countMatches(text, /[A-Za-z0-9가-힣]/g)
  return (questionMarks >= 6 && questionMarks / text.length >= 0.16)
    || (text.length >= 24 && readableChars < Math.max(8, Math.round(text.length * 0.22)))
}

const cleanRenderableText = (value = '', fallback = '') => {
  const text = cleanText(value)
  if (!text) return fallback
  return isPlaceholderHeavyText(text) ? fallback : text
}

const splitTaggedText = (value = '', { defaultLabel = 'POINT' } = {}) => {
  const text = cleanRenderableText(value)
  if (!text) return { label: defaultLabel, body: '' }

  const bracketMatch = text.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (bracketMatch) {
    return {
      label: cleanText(bracketMatch[1]).slice(0, 18) || defaultLabel,
      body: cleanText(bracketMatch[2]),
    }
  }

  const dividerMatch = text.match(/^([^·:]{1,18})\s*[·:]\s*(.+)$/)
  if (dividerMatch) {
    return {
      label: cleanText(dividerMatch[1]).slice(0, 18) || defaultLabel,
      body: cleanText(dividerMatch[2]),
    }
  }

  return { label: defaultLabel, body: text }
}

const getClosingCardMeta = (value = '', index = 0) => {
  const text = cleanRenderableText(value)
  if (!text) return { label: `POINT ${index + 1}`, body: '' }

  const parsed = splitTaggedText(text, { defaultLabel: '' })
  const labelSource = cleanText(parsed.label || text)
  const bodySource = cleanText(parsed.body || text)
  const lowered = `${labelSource} ${bodySource}`.toLowerCase()

  if (lowered.includes('next') || lowered.includes('다음 단계')) {
    return { label: 'NEXT STEP', body: bodySource.replace(/^다음 단계\s*[·:]\s*/i, '') }
  }
  if (lowered.includes('tension') || lowered.includes('이견') || lowered.includes('긴장')) {
    return { label: 'TENSION', body: bodySource.replace(/^(이견|긴장 지점)\s*[·:]\s*/i, '') }
  }
  if (lowered.includes('gap') || lowered.includes('공백') || lowered.includes('출처') || lowered.includes('risk')) {
    return { label: 'RISK / GAP', body: bodySource.replace(/^(갭|공백|근거 공백)\s*[·:]\s*/i, '') }
  }

  return {
    label: (labelSource || `POINT ${index + 1}`).toUpperCase(),
    body: bodySource,
  }
}

const ACCENT_PRESETS = {
  emerald: { accent: '22C55E', soft: 'BBF7D0', band: 'DCFCE7', panelAlt: 'F0FDF4', darkBg: '0E2218' },
  cobalt: { accent: '2563EB', soft: 'BFDBFE', band: 'DBEAFE', panelAlt: 'EFF6FF', darkBg: '10203D' },
  amber: { accent: 'D97706', soft: 'FDE68A', band: 'FDE7C1', panelAlt: 'FFF7ED', darkBg: '2A1D10' },
  teal: { accent: '0F766E', soft: '99F6E4', band: 'CCFBF1', panelAlt: 'ECFEFF', darkBg: '102929' },
  slate: { accent: '475569', soft: 'CBD5E1', band: 'E2E8F0', panelAlt: 'F8FAFC', darkBg: '18222D' },
  rose: { accent: 'E11D48', soft: 'FDA4AF', band: 'FFE4E6', panelAlt: 'FFF1F2', darkBg: '2D1320' },
}

const getAccentPreset = (accent = '') => ACCENT_PRESETS[cleanText(accent).toLowerCase()] || ACCENT_PRESETS.teal

const addSlideChrome = (pptx, slide, { title, kicker = '', dark = false, accent = '' }) => {
  const preset = getAccentPreset(accent)
  const palette = dark
    ? { bg: preset.darkBg, text: 'F8FAFC', muted: 'CBD5E1', accent: preset.accent, band: '17324A', panel: '102033', panelAlt: '183248', soft: preset.soft }
    : { bg: 'F8FAFC', text: '10253E', muted: '5B6472', accent: preset.accent, band: preset.band, panel: 'FFFFFF', panelAlt: preset.panelAlt, soft: preset.soft }

  slide.background = { color: palette.bg }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: dark ? 0.42 : 0.24, line: { color: palette.accent, transparency: 100 }, fill: { color: palette.accent } })
  slide.addShape(pptx.ShapeType.rect, { x: 10.9, y: dark ? 0.58 : 0.48, w: 1.78, h: 0.16, line: { color: palette.accent, transparency: 100 }, fill: { color: palette.soft, transparency: dark ? 35 : 0 } })
  slide.addShape(pptx.ShapeType.rect, { x: 11.28, y: dark ? 0.86 : 0.72, w: 1.4, h: 0.08, line: { color: palette.accent, transparency: 100 }, fill: { color: palette.accent, transparency: dark ? 18 : 0 } })
  slide.addShape(pptx.ShapeType.rect, { x: 0.58, y: 6.62, w: 12.12, h: 0.04, line: { color: palette.accent, transparency: 100 }, fill: { color: palette.accent, transparency: dark ? 28 : 42 } })
  slide.addText(cleanText(kicker || 'AI Gods'), {
    x: 0.55,
    y: dark ? 0.78 : 0.45,
    w: 4.8,
    h: 0.28,
    fontFace: 'Aptos',
    fontSize: 10,
    bold: true,
    color: palette.accent,
    margin: 0,
  })
  slide.addText(cleanText(title || 'Slide'), {
    x: 0.55,
    y: dark ? 1.05 : 0.75,
    w: 10.9,
    h: dark ? 0.9 : 0.65,
    fontFace: 'Aptos Display',
    fontSize: dark ? 25 : 22,
    bold: true,
    color: palette.text,
    margin: 0,
  })
  return palette
}

const formatBulletLines = (items = [], { numbered = false } = {}) => (Array.isArray(items) ? items : [])
  .map((item) => cleanRenderableText(item))
  .filter(Boolean)
  .map((item, index) => (numbered ? `${index + 1}. ${item}` : `• ${item}`))
  .join('\n')

const addFooterNote = (slide, footer = '', palette = {}) => {
  const text = cleanText(footer)
  if (!text) return

  slide.addText(text, {
    x: 0.65,
    y: 6.46,
    w: 12.0,
    h: 0.18,
    fontFace: 'Aptos',
    fontSize: 8,
    color: palette.muted || '64748B',
    margin: 0,
    fit: 'shrink',
    align: 'right',
  })
}

const addInfoCards = (pptx, slide, items = [], palette = {}, {
  x = 0.8,
  y = 5.2,
  w = 11.7,
  cardHeight = 0.92,
  gap = 0.18,
  valueSize = 18,
  valueHeight = 0.28,
  labelSize = 8,
  labelHeight = 0.16,
  noteSize = 7,
  noteHeight = 0.12,
  fillColor = palette.panelAlt || 'F8FAFC',
} = {}) => {
  const visible = (Array.isArray(items) ? items : [])
    .map((item) => ({
      value: cleanRenderableText(item?.value || ''),
      label: cleanRenderableText(item?.label || ''),
      note: cleanRenderableText(item?.note || ''),
    }))
    .filter((item) => item.value || item.label || item.note)
    .slice(0, 4)

  if (visible.length === 0) return

  const totalGap = gap * Math.max(0, visible.length - 1)
  const cardWidth = (w - totalGap) / visible.length

  visible.forEach((item, index) => {
    const left = x + index * (cardWidth + gap)
    slide.addShape(pptx.ShapeType.rect, {
      x: left,
      y,
      w: cardWidth,
      h: cardHeight,
      line: { color: palette.accent || '0F766E', transparency: 28 },
      fill: { color: fillColor, transparency: 0 },
    })
    if (item.value) {
      slide.addText(item.value, {
        x: left + 0.15,
        y: y + 0.1,
        w: cardWidth - 0.3,
        h: valueHeight,
        fontFace: 'Aptos Display',
        fontSize: valueSize,
        bold: true,
        color: palette.text || '10253E',
        margin: 0,
        fit: 'shrink',
      })
    }
    if (item.label) {
      slide.addText(item.label, {
        x: left + 0.15,
        y: y + (item.value ? 0.44 : 0.16),
        w: cardWidth - 0.3,
        h: labelHeight,
        fontFace: 'Aptos',
        fontSize: labelSize,
        color: palette.muted || '64748B',
        margin: 0,
        fit: 'shrink',
      })
    }
    if (item.note) {
      slide.addText(item.note, {
        x: left + 0.15,
        y: y + (item.value ? 0.62 : 0.36),
        w: cardWidth - 0.3,
        h: noteHeight,
        fontFace: 'Aptos',
        fontSize: noteSize,
        color: palette.muted || '64748B',
        margin: 0,
        fit: 'shrink',
      })
    }
  })
}

const addQuotePanel = (pptx, slide, quote = '', palette = {}, { x, y, w, h, fillColor = null } = {}) => {
  const text = cleanRenderableText(quote)
  if (!text) return

  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    line: { color: palette.accent || '0F766E', transparency: 28 },
    fill: { color: fillColor || palette.panelAlt || 'FFFFFF', transparency: 0 },
  })
  slide.addText(`“${text}”`, {
    x: x + 0.18,
    y: y + 0.18,
    w: w - 0.36,
    h: h - 0.3,
    fontFace: 'Aptos',
    fontSize: 12,
    color: palette.text || '10253E',
    margin: 0,
    fit: 'shrink',
    valign: 'mid',
  })
}

const addSlideCitations = (slide, citations = [], palette = {}) => {
  const note = (Array.isArray(citations) ? citations : []).map((item) => cleanRenderableText(item)).filter(Boolean).slice(0, 2).join(' | ')
  if (!note) return

  slide.addText(note, {
    x: 0.6,
    y: 6.85,
    w: 12.0,
    h: 0.28,
    fontFace: 'Aptos',
    fontSize: 8,
    color: palette.muted || '64748B',
    margin: 0,
    fit: 'shrink',
  })
}

const shouldRenderSlideCitations = ({ slideData = {}, slideIndex = 0, slides = [], citationPolicy = {} } = {}) => {
  if (!citationPolicy?.mode) return true
  if (citationPolicy.mode === 'none' || citationPolicy.visibility === 'hidden') return false
  if (citationPolicy.visibility !== 'bibliography-only') return true

  const referenceIndex = (Array.isArray(slides) ? slides : []).findIndex((item) => {
    const category = cleanText(item?.category || '').toLowerCase()
    const display = cleanText(item?.citationDisplay || '').toLowerCase()
    return category === 'references' || display === 'bibliography'
  })
  const targetIndex = referenceIndex >= 0 ? referenceIndex : Math.max(0, (Array.isArray(slides) ? slides.length : 1) - 1)
  const currentCategory = cleanText(slideData?.category || '').toLowerCase()

  return currentCategory === 'references' || slideIndex === targetIndex
}

const buildDocxBuffer = async ({ title, markdown, artifact }) => {
  const hasStructuredReport = Boolean(artifact?.structuredContent?.topic)
  const doc = new Document({
    sections: [
      {
        children: hasStructuredReport
          ? buildReportDocChildren({ title, artifact, markdown })
          : [
            new Paragraph({ text: cleanText(title || 'AI Gods Export'), heading: HeadingLevel.TITLE }),
            ...markdownToParagraphs(markdown),
          ],
      },
    ],
  })

  return await Packer.toBuffer(doc)
}

const buildPptxBuffer = async ({ title, slides = [], artifact }) => {
  const PptxGenJS = await getPptxGenJS()
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'AI Gods'
  pptx.company = 'AI Gods'
  pptx.subject = cleanText(title || 'AI Gods deck')
  pptx.title = cleanText(title || 'AI Gods deck')
  const citationPolicy = artifact?.structuredContent?.citationPolicy && typeof artifact.structuredContent.citationPolicy === 'object'
    ? artifact.structuredContent.citationPolicy
    : {}
  const normalizedSlides = Array.isArray(slides) && slides.length > 0
    ? slides
    : (Array.isArray(artifact?.structuredContent?.slides) ? artifact.structuredContent.slides : [])

  normalizedSlides.forEach((slideData, index) => {
    const slide = pptx.addSlide()
    const layout = getSlideLayout(slideData, index)
    const bullets = (Array.isArray(slideData?.bullets) ? slideData.bullets : []).map((bullet) => cleanRenderableText(bullet)).filter(Boolean)
    const highlights = Array.isArray(slideData?.highlights) ? slideData.highlights : []
    const metrics = Array.isArray(slideData?.metrics) ? slideData.metrics : []
    const citations = shouldRenderSlideCitations({ slideData, slideIndex: index, slides: normalizedSlides, citationPolicy })
      ? (Array.isArray(slideData?.citations) ? slideData.citations : []).map((item) => cleanRenderableText(item)).filter(Boolean)
      : []
    const quote = cleanRenderableText(slideData?.quote || '')
    const footer = cleanRenderableText(slideData?.footer || '')
    const palette = addSlideChrome(pptx, slide, {
      title: cleanText(slideData?.title || `Slide ${index + 1}`),
      kicker: cleanText(slideData?.kicker || ''),
      dark: layout === 'hero' || layout === 'closing',
      accent: cleanText(slideData?.accent || ''),
    })

    if (layout === 'hero') {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.68,
        y: 1.95,
        w: 7.25,
        h: 3.15,
        line: { color: palette.accent, transparency: 25 },
        fill: { color: palette.panel, transparency: 0 },
      })
      slide.addText(formatBulletLines(bullets.length > 0 ? bullets : ['핵심 요약 없음']), {
        x: 0.95,
        y: 2.28,
        w: 6.7,
        h: 2.3,
        fontFace: 'Aptos',
        fontSize: 16,
        color: palette.text,
        fit: 'shrink',
        margin: 0.04,
        valign: 'mid',
      })
      addQuotePanel(pptx, slide, quote, palette, { x: 8.2, y: 1.95, w: 4.4, h: 1.8, fillColor: palette.panelAlt })
      addInfoCards(pptx, slide, highlights, palette, { x: 0.95, y: 5.28, w: 11.55, cardHeight: 0.94, valueSize: 18, labelSize: 8, noteSize: 7, fillColor: palette.panelAlt })
    } else if (layout === 'split') {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.72,
        y: 1.75,
        w: 4.35,
        h: 4.55,
        line: { color: palette.accent, transparency: 18 },
        fill: { color: palette.panel, transparency: 0 },
      })
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.72,
        y: 1.75,
        w: 4.35,
        h: 0.14,
        line: { color: palette.accent, transparency: 100 },
        fill: { color: palette.accent, transparency: 0 },
      })
      slide.addText('Main thesis', {
        x: 0.98,
        y: 1.97,
        w: 1.8,
        h: 0.16,
        fontFace: 'Aptos',
        fontSize: 8,
        bold: true,
        color: palette.accent,
        margin: 0,
      })
      slide.addText(bullets[0] || '핵심 메시지 없음', {
        x: 0.98,
        y: 2.18,
        w: 3.75,
        h: 1.88,
        fontFace: 'Aptos Display',
        fontSize: 20,
        bold: true,
        color: palette.text,
        fit: 'shrink',
        valign: 'mid',
        margin: 0.04,
      })
      const splitCards = bullets.slice(1).length > 0 ? bullets.slice(1, 3) : ['세부 설명 없음']
      splitCards.forEach((bullet, cardIndex) => {
        const cardTop = 1.92 + (cardIndex * 1.36)
        slide.addShape(pptx.ShapeType.rect, {
          x: 5.15,
          y: cardTop,
          w: 6.75,
          h: 1.08,
          line: { color: palette.accent, transparency: 28 },
          fill: { color: cardIndex === 0 ? palette.panelAlt : palette.panel, transparency: 0 },
        })
        slide.addText(`0${cardIndex + 1}`, {
          x: 5.38,
          y: cardTop + 0.16,
          w: 0.46,
          h: 0.2,
          fontFace: 'Aptos Display',
          fontSize: 16,
          bold: true,
          color: palette.accent,
          margin: 0,
        })
        slide.addText(bullet, {
          x: 5.86,
          y: cardTop + 0.2,
          w: 5.72,
          h: 0.58,
          fontFace: 'Aptos',
          fontSize: 13.5,
          color: palette.text,
          fit: 'shrink',
          margin: 0.02,
          valign: 'mid',
        })
      })
      addQuotePanel(pptx, slide, quote, palette, { x: 0.98, y: 4.66, w: 3.75, h: 1.1, fillColor: palette.panelAlt })
      addInfoCards(pptx, slide, highlights, palette, { x: 5.15, y: 4.82, w: 6.75, cardHeight: 0.98, valueSize: 13, valueHeight: 0.24, labelSize: 8, labelHeight: 0.14, noteSize: 8, noteHeight: 0.22, fillColor: palette.panelAlt })
    } else if (layout === 'evidence') {
      addInfoCards(pptx, slide, highlights, palette, { x: 0.78, y: 1.72, w: 11.8, cardHeight: 0.9, valueSize: 16, labelSize: 8, noteSize: 7, fillColor: palette.panel })
      const evidenceCards = bullets.length > 0 ? bullets.slice(0, 3) : ['근거 없음']
      evidenceCards.forEach((bullet, cardIndex) => {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.78,
          y: 2.82 + (cardIndex * 1.15),
          w: 11.8,
          h: 0.95,
          line: { color: palette.accent, transparency: 22 },
          fill: { color: palette.panel, transparency: 0 },
        })
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.96,
          y: 3.0 + (cardIndex * 1.15),
          w: 0.18,
          h: 0.58,
          line: { color: palette.accent, transparency: 100 },
          fill: { color: palette.accent, transparency: 0 },
        })
        slide.addText(bullet, {
          x: 1.32,
          y: 3.0 + (cardIndex * 1.15),
          w: 11.0,
          h: 0.55,
          fontFace: 'Aptos',
          fontSize: 11.5,
          color: palette.text,
          fit: 'shrink',
          margin: 0.02,
          valign: 'mid',
        })
      })
    } else if (layout === 'metrics') {
      const metricItems = metrics.length > 0 ? metrics : highlights
      addInfoCards(pptx, slide, metricItems, palette, { x: 0.78, y: 1.95, w: 11.8, cardHeight: 1.45, valueSize: 24, labelSize: 10, noteSize: 7, fillColor: palette.panel })
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.78,
        y: 4.1,
        w: 11.8,
        h: 1.62,
        line: { color: palette.accent, transparency: 28 },
        fill: { color: palette.panelAlt, transparency: 0 },
      })
      slide.addText(formatBulletLines(bullets.length > 0 ? bullets : ['품질 요약 없음']), {
        x: 1.02,
        y: 4.34,
        w: 11.3,
        h: 1.08,
        fontFace: 'Aptos',
        fontSize: 13.5,
        color: palette.text,
        fit: 'shrink',
        margin: 0.02,
      })
    } else if (layout === 'roadmap') {
      addInfoCards(pptx, slide, highlights, palette, { x: 0.78, y: 1.72, w: 11.8, cardHeight: 0.82, valueSize: 14, labelSize: 8, noteSize: 7, fillColor: palette.panelAlt })
      const steps = bullets.length > 0 ? bullets.slice(0, 3) : ['실행 권고 없음']
      const stepGap = 0.22
      const stepWidth = (11.8 - stepGap * Math.max(0, steps.length - 1)) / steps.length
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.06,
        y: 3.08,
        w: 10.95,
        h: 0.05,
        line: { color: palette.accent, transparency: 100 },
        fill: { color: palette.accent, transparency: 40 },
      })
      steps.forEach((bullet, stepIndex) => {
        const left = 0.78 + stepIndex * (stepWidth + stepGap)
        const stepMeta = splitTaggedText(bullet, { defaultLabel: `STEP ${stepIndex + 1}` })
        slide.addShape(pptx.ShapeType.rect, {
          x: left,
          y: 3.22,
          w: stepWidth,
          h: 2.14,
          line: { color: palette.accent, transparency: 18 },
          fill: { color: palette.panel, transparency: 0 },
        })
        slide.addShape(pptx.ShapeType.rect, {
          x: left,
          y: 3.22,
          w: stepWidth,
          h: 0.14,
          line: { color: palette.accent, transparency: 100 },
          fill: { color: palette.accent, transparency: 0 },
        })
        slide.addShape(pptx.ShapeType.rect, {
          x: left + 0.18,
          y: 3.5,
          w: 1.02,
          h: 0.26,
          line: { color: palette.accent, transparency: 100 },
          fill: { color: palette.band, transparency: 0 },
        })
        slide.addText(stepMeta.label || `STEP ${stepIndex + 1}`, {
          x: left + 0.28,
          y: 3.54,
          w: 0.82,
          h: 0.14,
          fontFace: 'Aptos',
          fontSize: 7,
          bold: true,
          color: palette.accent,
          margin: 0,
          fit: 'shrink',
        })
        slide.addText(`0${stepIndex + 1}`, {
          x: left + 0.18,
          y: 3.88,
          w: 0.62,
          h: 0.28,
          fontFace: 'Aptos Display',
          fontSize: 20,
          bold: true,
          color: palette.accent,
          margin: 0,
        })
        slide.addText(stepMeta.body || bullet, {
          x: left + 0.18,
          y: 4.32,
          w: stepWidth - 0.36,
          h: 0.9,
          fontFace: 'Aptos',
          fontSize: 12.8,
          color: palette.text,
          fit: 'shrink',
          margin: 0.02,
          valign: 'mid',
        })
      })
    } else if (layout === 'closing') {
      const closingBullets = bullets.length > 0 ? bullets : ['다음 단계 미정']
      const closingHighlights = Array.isArray(slideData?.highlights) ? slideData.highlights : []
      const closingCards = closingBullets.slice(0, 3).map((bullet, index) => getClosingCardMeta(bullet, index)).filter((item) => item.body)
      const leadText = cleanRenderableText(quote || closingBullets[closingBullets.length - 1] || '다음 단계 미정', '다음 단계 미정')
      addQuotePanel(pptx, slide, leadText, palette, { x: 0.85, y: 1.72, w: 11.7, h: 0.92, fillColor: palette.panel })
      const cardFrames = closingCards.length >= 3
        ? [
            { x: 0.85, y: 2.92, w: 3.85, h: 1.12 },
            { x: 5.0, y: 2.92, w: 3.85, h: 1.12 },
            { x: 0.85, y: 4.22, w: 8.0, h: 1.2 },
          ]
        : closingCards.length === 2
          ? [
              { x: 0.85, y: 2.92, w: 8.0, h: 1.08 },
              { x: 0.85, y: 4.2, w: 8.0, h: 1.08 },
            ]
          : [
              { x: 0.85, y: 3.2, w: 8.0, h: 1.72 },
            ]

      closingCards.forEach((item, index) => {
        const frame = cardFrames[index]
        if (!frame) return
        slide.addShape(pptx.ShapeType.rect, {
          x: frame.x,
          y: frame.y,
          w: frame.w,
          h: frame.h,
          line: { color: palette.accent, transparency: 24 },
          fill: { color: index === 2 ? palette.panel : palette.panelAlt, transparency: 0 },
        })
        slide.addText(item.label, {
          x: frame.x + 0.18,
          y: frame.y + 0.16,
          w: frame.w - 0.36,
          h: 0.14,
          fontFace: 'Aptos',
          fontSize: 7.5,
          bold: true,
          color: palette.accent,
          margin: 0,
          fit: 'shrink',
        })
        slide.addText(item.body, {
          x: frame.x + 0.18,
          y: frame.y + 0.38,
          w: frame.w - 0.36,
          h: frame.h - 0.52,
          fontFace: 'Aptos',
          fontSize: index === 2 ? 13 : 12.4,
          color: palette.text,
          fit: 'shrink',
          margin: 0.02,
          valign: 'mid',
        })
      })
      addInfoCards(pptx, slide, closingHighlights.length > 0 ? closingHighlights : [
        { value: 'READY', label: 'decision lane', note: 'closing summary' },
        { value: 'NEXT', label: leadText, note: footer || 'follow-up' },
      ], palette, {
        x: 9.1,
        y: 3.02,
        w: 3.45,
        cardHeight: 0.86,
        gap: 0.14,
        valueSize: 14,
        labelSize: 7,
        noteSize: 6,
        fillColor: palette.panel,
      })
    } else {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.74,
        y: 1.8,
        w: 0.18,
        h: 4.35,
        line: { color: palette.accent, transparency: 100 },
        fill: { color: palette.accent, transparency: 0 },
      })
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.1,
        y: 1.8,
        w: 11.2,
        h: 4.35,
        line: { color: palette.accent, transparency: 35 },
        fill: { color: palette.panel, transparency: 0 },
      })
      slide.addText(formatBulletLines(bullets.length > 0 ? bullets : ['내용 없음']), {
        x: 1.45,
        y: 2.02,
        w: 10.5,
        h: 2.9,
        fontFace: 'Aptos',
        fontSize: 15,
        color: palette.text,
        fit: 'shrink',
        margin: 0.02,
      })
      addQuotePanel(pptx, slide, quote, palette, { x: 1.45, y: 5.05, w: 5.0, h: 0.78, fillColor: palette.panelAlt })
      addInfoCards(pptx, slide, highlights, palette, { x: 6.75, y: 4.98, w: 5.0, cardHeight: 0.84, valueSize: 14, labelSize: 8, noteSize: 7, fillColor: palette.panelAlt })
    }

    addFooterNote(slide, footer, palette)
    addSlideCitations(slide, citations, palette)
  })

  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }))
}

const getGoogleExportFolderId = () => cleanText(process.env.GOOGLE_EXPORT_FOLDER_ID || '')

const normalizeGoogleExportError = (error) => {
  const upstreamCode = cleanText(error?.response?.data?.error || error?.code || '')
  const upstreamMessage = cleanText(
    error?.response?.data?.error_description ||
    error?.response?.data?.error?.message ||
    error?.message ||
    ''
  )
  const combined = `${upstreamCode} ${upstreamMessage}`.toLowerCase()

  if (combined.includes('invalid_grant') || combined.includes('invalid credentials') || combined.includes('token has been expired')) {
    return createGoogleAuthError(401, 'oauth_reconnect_required', 'Google 계정 연결이 만료되었거나 취소되었습니다. 다시 연결해주세요.')
  }

  return error
}

const createGoogleNativeFile = async ({ drive, title, mimeType }) => {
  const folderId = getGoogleExportFolderId()

  const created = await drive.files.create({
    requestBody: {
      name: cleanText(title || 'AI Gods Export'),
      mimeType,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })

  return created.data
}

const createGoogleDoc = async ({ auth, title, markdown }) => {
  const docs = google.docs({ version: 'v1', auth })
  const drive = google.drive({ version: 'v3', auth })

  const created = await createGoogleNativeFile({
    drive,
    title: title || 'AI Gods Report',
    mimeType: 'application/vnd.google-apps.document',
  })
  const documentId = created.id
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: String(markdown || ''),
          },
        },
      ],
    },
  })

  return {
    id: documentId,
    url: created.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
  }
}

const createGoogleSlides = async ({ auth, title, slides }) => {
  const slidesApi = google.slides({ version: 'v1', auth })
  const drive = google.drive({ version: 'v3', auth })

  const created = await createGoogleNativeFile({
    drive,
    title: title || 'AI Gods Slides',
    mimeType: 'application/vnd.google-apps.presentation',
  })
  const presentationId = created.id
  const requests = []

  ;(Array.isArray(slides) ? slides : []).forEach((slideData, index) => {
    const slideId = `slide_${index + 1}`
    const titleId = `slide_${index + 1}_title`
    const bodyId = `slide_${index + 1}_body`

    requests.push({
      createSlide: {
        objectId: slideId,
        insertionIndex: index,
        slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
        placeholderIdMappings: [
          { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: titleId },
          { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyId },
        ],
      },
    })

    requests.push({
      insertText: {
        objectId: titleId,
        insertionIndex: 0,
        text: cleanText(slideData?.title || `Slide ${index + 1}`),
      },
    })

    requests.push({
      insertText: {
        objectId: bodyId,
        insertionIndex: 0,
        text: (Array.isArray(slideData?.bullets) ? slideData.bullets : [])
          .map((bullet) => `• ${cleanText(bullet)}`)
          .join('\n'),
      },
    })
  })

  if (requests.length > 0) {
    await slidesApi.presentations.batchUpdate({
      presentationId,
      requestBody: { requests },
    })
  }

  return {
    id: presentationId,
    url: created.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`,
  }
}

const sendBinary = (res, { buffer, contentType, filename }) => {
  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', buildContentDisposition(filename))
  res.end(buffer)
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'artifact-export', limit: 20, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const target = cleanText(body?.target || '').toLowerCase()
  const artifact = body?.artifact && typeof body.artifact === 'object' ? body.artifact : null
  const topic = cleanText(body?.topic || artifact?.title || 'AI Gods Export')

  if (!artifact) {
    return sendJson(res, 400, { error: 'export할 artifact가 필요합니다.' })
  }

  try {
    if (target === 'docx') {
      const buffer = await buildDocxBuffer({ title: artifact.title || topic, markdown: artifact.markdown || '', artifact })
      return sendBinary(res, {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: sanitizeFileName(artifact.title || topic, 'docx'),
      })
    }

    if (target === 'pptx') {
      const slides = artifact?.structuredContent?.slides || []
      const buffer = await buildPptxBuffer({ title: artifact.title || topic, slides, artifact })
      return sendBinary(res, {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        filename: sanitizeFileName(artifact.title || topic, 'pptx'),
      })
    }

    if (target === 'google-docs') {
      const auth = getGoogleAuthForRequest(req)
      const result = await createGoogleDoc({ auth, title: artifact.title || topic, markdown: artifact.markdown || '' })
      return sendJson(res, 200, { ok: true, target, ...result })
    }

    if (target === 'google-slides') {
      const auth = getGoogleAuthForRequest(req)
      const result = await createGoogleSlides({ auth, title: artifact.title || topic, slides: artifact?.structuredContent?.slides || [] })
      return sendJson(res, 200, { ok: true, target, ...result })
    }

    return sendJson(res, 400, { error: '지원하지 않는 export 대상입니다.' })
  } catch (error) {
    const normalized = normalizeGoogleExportError(error)

    if (normalized?.code === 'oauth_reconnect_required') {
      clearGoogleOAuthSession(req, res)
    }

    return sendJson(res, normalized?.status || 500, {
      error: normalized?.message || '산출물 export 중 오류가 발생했습니다.',
      ...(normalized?.code ? { code: normalized.code } : {}),
    })
  }
}