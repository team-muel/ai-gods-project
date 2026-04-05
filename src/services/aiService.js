import { getRelevantMemories, memoriesToContext } from './memoryService'
import { searchWeb, searchResultsToContext } from './searchService'

const OLLAMA_URL = 'http://localhost:11434/api/chat'

// 각 신마다 고유 모델 (Modelfile로 개별 생성)
const GOD_MODELS = {
  cco: 'ai-muse',
  cso: 'ai-atlas',
  cpo: 'ai-forge',
  cmo: 'ai-mercury',
  cxo: 'ai-empathy',
  cfo: 'ai-prudence',
  cdo: 'ai-oracle',
  cto: 'ai-nexus',
}

// Ollama 호출 (시스템 프롬프트는 Modelfile에 내장)
const ollamaChat = async (godId, userMessage, numPredict = 500) => {
  const model = GOD_MODELS[godId]
  if (!model) throw new Error(`Unknown godId: ${godId}`)

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: userMessage }],
      stream: false,
      options: { num_predict: numPredict },
    }),
  })

  if (!response.ok) throw new Error(`Ollama 오류: ${response.status} (model: ${model})`)
  const data = await response.json()
  return data.message?.content || '응답을 받지 못했습니다.'
}

// Round 1: 초기 의견 (과거 기억 + 실시간 검색 주입)
export const callAI = async (godId, topic, transcript = null) => {
  // 관련 과거 기억 + 실시간 검색 병렬 조회
  const [memories, searchData] = await Promise.all([
    getRelevantMemories(godId, topic),
    transcript ? null : searchWeb(topic, 4),
  ])

  const memoryContext = memoriesToContext(memories)
  const searchContext = searchResultsToContext(searchData)

  let userMessage
  if (transcript) {
    userMessage = [
      memoryContext,
      `다음은 YouTube 영상의 내용입니다:\n\n"${transcript.slice(0, 2000)}"\n\n위 영상에 대해 당신의 전문 분야 관점에서 분석하고 초기 의견을 제시하세요.`,
    ].filter(Boolean).join('\n\n')
  } else {
    userMessage = [
      memoryContext,
      searchContext,
      `주제: ${topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.`,
    ].filter(Boolean).join('\n\n')
  }

  const content = await ollamaChat(godId, userMessage)
  return { godId, response: content, timestamp: new Date().toISOString() }
}

// Round 2+: 토론 (다른 신들 의견 반응)
export const callAIDebate = async (godId, topic, otherOpinions) => {
  const opinionsText = otherOpinions
    .map(op => `[${op.god}]: ${op.content}`)
    .join('\n\n')

  const userMessage = `주제: ${topic}\n\n다른 임원들의 의견:\n${opinionsText}\n\n위 의견들에 대해 동의/반박/보완하며 토론하세요. 누구의 의견에 반응하는지 구체적으로 언급하세요.`

  const content = await ollamaChat(godId, userMessage)
  return { godId, response: content, timestamp: new Date().toISOString() }
}

// 합의 체크
export const checkConsensus = async (topic, roundMessages) => {
  const summary = roundMessages
    .map(m => `[${m.god}]: ${m.content.slice(0, 120)}`)
    .join('\n')

  // ai-oracle(CDO)이 합의 판단
  const content = await ollamaChat('cdo',
    `토론 주제: ${topic}\n\n최근 발언:\n${summary}\n\n이 토론에서 충분한 합의가 도출되었습니까? "예" 또는 "아니오"로만 답하세요.`,
    10
  )
  return content.trim().startsWith('예') || content.toLowerCase().includes('yes')
}

// 최종 합의안 생성 (ai-oracle이 종합)
export const generateFinalConsensus = async (topic, allMessages) => {
  const summary = allMessages
    .map(m => `[${m.god} R${m.round}]: ${m.content}`)
    .join('\n\n')

  const content = await ollamaChat('cdo',
    `당신은 지금 회의 진행자 역할입니다. 반드시 한국어로 작성하세요.\n\n주제: ${topic}\n\n전체 토론:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요:\n\n📊 핵심 합의점 (3가지)\n⚡ 주요 쟁점 및 이견\n✅ 최종 권고사항 (단기/중기/장기)`,
    800
  )
  return content
}
