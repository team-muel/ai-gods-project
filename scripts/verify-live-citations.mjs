import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'

const TOPIC = String(process.env.VERIFY_CITATION_TOPIC || '멀티모달 AI 에이전트 벤치마크와 업무 자동화 적용 전략').trim()
const OUTPUT_PATH = path.resolve(process.cwd(), process.env.VERIFY_CITATION_OUTPUT_PATH || 'outputs/live-citation-verification.json')
const REQUESTED_AGENT_IDS = String(process.env.VERIFY_AGENT_IDS || 'cto,cdo')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

const listen = async (server, port = 0) => await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, '127.0.0.1', () => resolve(server.address()))
})

const analyzeMessage = (message = {}) => {
  const content = String(message.content || '')
  return {
    phase: message.phase || 'unknown',
    agentId: message.agentId || '',
    hasEvidenceTag: /\[E\d+\]/.test(content),
    hasUrl: /https?:\/\//.test(content),
    hasSourceLine: /(^|\n)출처\s*:/m.test(content),
    preview: content.slice(0, 320),
  }
}

const makeRelativeFetch = (baseUrl) => {
  const originalFetch = global.fetch.bind(global)

  global.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      return originalFetch(new URL(input, baseUrl), init)
    }

    if (input instanceof URL && String(input).startsWith('/')) {
      return originalFetch(new URL(String(input), baseUrl), init)
    }

    if (typeof Request !== 'undefined' && input instanceof Request && input.url.startsWith('/')) {
      return originalFetch(new Request(new URL(input.url, baseUrl), input), init)
    }

    return originalFetch(input, init)
  }

  return () => {
    global.fetch = originalFetch
  }
}

const main = async () => {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const server = http.createServer((req, res) => vite.middlewares(req, res))

  let restoreFetch = null

  try {
    const address = await listen(server)
    const baseUrl = `http://127.0.0.1:${address.port}`
    restoreFetch = makeRelativeFetch(baseUrl)

    const aiService = await vite.ssrLoadModule('/src/services/aiService.js')
    const evidenceModule = await vite.ssrLoadModule('/src/lib/debateEvidence.js')
    const dossierModule = await vite.ssrLoadModule('/src/lib/dossierBuilder.js')
    const artifactModule = await vite.ssrLoadModule('/src/lib/artifactBuilder.js')
    const configModule = await vite.ssrLoadModule('/src/config/aiGods.js')

    const [firstAgentId, secondAgentId] = REQUESTED_AGENT_IDS.length >= 2 ? REQUESTED_AGENT_IDS : ['cto', 'cdo']
    const firstAgent = configModule.getAgentConfigById(firstAgentId)
    const secondAgent = configModule.getAgentConfigById(secondAgentId)

    if (!firstAgent || !secondAgent) {
      throw new Error(`Invalid VERIFY_AGENT_IDS: ${REQUESTED_AGENT_IDS.join(',')}`)
    }

    const initialA = await aiService.callAI(firstAgent.id, TOPIC)
    const initialB = await aiService.callAI(secondAgent.id, TOPIC)

    let evidence = evidenceModule.mergeEvidenceItems([
      ...(initialA.evidence || []),
      ...(initialB.evidence || []),
    ])

    const debateA = await aiService.callAIDebate(firstAgent.id, TOPIC, [
      { god: secondAgent.name, content: initialB.response },
    ], { evidence })
    evidence = evidenceModule.mergeEvidenceItems([...evidence, ...(debateA.evidence || [])])

    const debateB = await aiService.callAIDebate(secondAgent.id, TOPIC, [
      { god: firstAgent.name, content: debateA.response },
    ], { evidence })
    evidence = evidenceModule.mergeEvidenceItems([...evidence, ...(debateB.evidence || [])])

    const messages = [
      { phase: 'initial', round: 1, godId: firstAgent.id, god: firstAgent.name, content: initialA.response },
      { phase: 'initial', round: 1, godId: secondAgent.id, god: secondAgent.name, content: initialB.response },
      { phase: 'debate', round: 2, godId: firstAgent.id, god: firstAgent.name, content: debateA.response },
      { phase: 'debate', round: 2, godId: secondAgent.id, god: secondAgent.name, content: debateB.response },
    ]

    const dossier = dossierModule.buildDebateDossier({
      debateId: null,
      topic: TOPIC,
      totalRounds: 2,
      consensus: 'live citation verification run',
      messages,
      evidence,
      isYoutube: false,
      source: 'verify_live_citations_script',
    })
    const artifacts = artifactModule.buildDebateArtifacts({ dossier })
    const slideCitations = (artifacts?.slides?.structuredContent?.slides || [])
      .flatMap((slide) => (Array.isArray(slide?.citations) ? slide.citations : []))
      .slice(0, 6)

    const result = {
      topic: TOPIC,
      baseUrl,
      agentIds: [firstAgent.id, secondAgent.id],
      evidenceCount: evidence.length,
      evidencePreview: evidence.slice(0, 4).map((item) => ({
        label: item.label,
        url: item.url,
        excerpt: String(item.excerpt || '').slice(0, 240),
        excerptSource: item?.metadata?.excerptSource || 'summary',
        excerptSourceLabel: item?.metadata?.excerptSourceLabel || '',
        fullTextUrl: item?.metadata?.fullTextUrl || '',
      })),
      messageChecks: messages.map((message) => analyzeMessage({
        phase: message.phase,
        agentId: message.godId,
        content: message.content,
      })),
      reportHasUrl: /https?:\/\//.test(String(artifacts?.report?.markdown || '')),
      reportPreview: String(artifacts?.report?.markdown || '').slice(0, 800),
      slideCitationSamples: slideCitations,
      timestamp: new Date().toISOString(),
    }
    const debateChecks = result.messageChecks.filter((item) => item.phase === 'debate')
    const debateFormattingOk = debateChecks.every((item) => item.hasEvidenceTag && item.hasUrl && item.hasSourceLine)

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify({
      outputPath: OUTPUT_PATH,
      debateChecks,
      evidenceCount: result.evidenceCount,
      reportHasUrl: result.reportHasUrl,
      slideCitationSamples: result.slideCitationSamples,
    }, null, 2))

    if (!debateFormattingOk) {
      throw new Error('Debate citation formatting verification failed')
    }
  } finally {
    if (restoreFetch) restoreFetch()
    await new Promise((resolve) => server.close(() => resolve()))
    await vite.close()
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })