import { getRelevantMemories, memoriesToContext } from './memoryService'
import { searchWeb, searchResultsToContext } from './searchService'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'
const GROQ_KEY   = import.meta.env.VITE_GROQ_API_KEY

// 각 신의 시스템 프롬프트 (Ollama Modelfile 대체)
const GOD_PROMPTS = {
  cco: `당신은 AI 기업의 최고 창의 책임자(CCO) Muse입니다. 창의성, 브랜드 스토리텔링, 감성적 메시지 관점에서 날카롭게 분석합니다. 항상 창의적이고 독창적인 시각을 제시하세요. 반드시 한국어로 답변하세요.`,
  cso: `당신은 AI 기업의 최고 전략 책임자(CSO) Atlas입니다. 장기 전략, 경쟁 우위, 시장 포지셔닝 관점에서 분석합니다. 데이터와 트렌드를 기반으로 전략적 통찰을 제시하세요. 반드시 한국어로 답변하세요.`,
  cpo: `당신은 AI 기업의 최고 제품 책임자(CPO) Forge입니다. 제품 개발, 사용자 경험, 로드맵 관점에서 분석합니다. 실용적이고 실행 가능한 제품 전략을 제시하세요. 반드시 한국어로 답변하세요.`,
  cmo: `당신은 AI 기업의 최고 마케팅 책임자(CMO) Mercury입니다. 마케팅, 고객 획득, 브랜드 인지도 관점에서 분석합니다. 시장 반응과 고객 심리를 중심으로 전략을 제시하세요. 반드시 한국어로 답변하세요.`,
  cxo: `당신은 AI 기업의 최고 경험 책임자(CXO) Empathy입니다. 고객 경험, 사용자 만족, 감성적 연결 관점에서 분석합니다. 인간 중심적 시각을 잃지 마세요. 반드시 한국어로 답변하세요.`,
  cfo: `당신은 AI 기업의 최고 재무 책임자(CFO) Prudence입니다. 재무 건전성, ROI, 리스크 관리 관점에서 분석합니다. 숫자와 현실적 제약을 기반으로 냉철하게 판단하세요. 반드시 한국어로 답변하세요.`,
  cdo: `당신은 AI 기업의 최고 데이터 책임자(CDO) Oracle입니다. 데이터 분석, 인사이트 도출, 의사결정 지원 관점에서 분석합니다. 근거 있는 데이터로 판단을 지원하세요. 반드시 한국어로 답변하세요.`,
  cto: `당신은 AI 기업의 최고 기술 책임자(CTO) Nexus입니다. 기술 아키텍처, 인프라, 기술적 실현 가능성 관점에서 분석합니다. 기술적 현실과 혁신 가능성을 균형 있게 제시하세요. 반드시 한국어로 답변하세요.`,
}

// Groq API 호출
const groqChat = async (godId, userMessage, maxTokens = 500) => {
  const systemPrompt = GOD_PROMPTS[godId]
  if (!systemPrompt) throw new Error(`Unknown godId: ${godId}`)

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.8,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Groq 오류: ${response.status} — ${err.error?.message || ''}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || '응답을 받지 못했습니다.'
}

// Round 1: 초기 의견 (기억 + 실시간 검색 주입)
export const callAI = async (godId, topic, transcript = null) => {
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

  const content = await groqChat(godId, userMessage)
  return { godId, response: content, timestamp: new Date().toISOString() }
}

// Round 2+: 토론
export const callAIDebate = async (godId, topic, otherOpinions) => {
  const opinionsText = otherOpinions
    .map(op => `[${op.god}]: ${op.content}`)
    .join('\n\n')

  const userMessage = `주제: ${topic}\n\n다른 임원들의 의견:\n${opinionsText}\n\n위 의견들에 대해 동의/반박/보완하며 토론하세요. 누구의 의견에 반응하는지 구체적으로 언급하세요.`

  const content = await groqChat(godId, userMessage)
  return { godId, response: content, timestamp: new Date().toISOString() }
}

// 합의 체크 (Oracle)
export const checkConsensus = async (topic, roundMessages) => {
  const summary = roundMessages
    .map(m => `[${m.god}]: ${m.content.slice(0, 120)}`)
    .join('\n')

  const content = await groqChat('cdo',
    `토론 주제: ${topic}\n\n최근 발언:\n${summary}\n\n이 토론에서 충분한 합의가 도출되었습니까? "예" 또는 "아니오"로만 답하세요.`,
    10
  )
  return content.trim().startsWith('예') || content.toLowerCase().includes('yes')
}

// 최종 합의안 생성
export const generateFinalConsensus = async (topic, allMessages) => {
  const summary = allMessages
    .map(m => `[${m.god} R${m.round}]: ${m.content}`)
    .join('\n\n')

  const content = await groqChat('cdo',
    `당신은 지금 회의 진행자 역할입니다. 반드시 한국어로 작성하세요.\n\n주제: ${topic}\n\n전체 토론:\n${summary}\n\n위 토론을 종합하여 최종 합의안을 작성하세요:\n\n📊 핵심 합의점 (3가지)\n⚡ 주요 쟁점 및 이견\n✅ 최종 권고사항 (단기/중기/장기)`,
    800
  )
  return content
}
