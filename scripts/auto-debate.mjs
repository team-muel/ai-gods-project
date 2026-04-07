/**
 * GitHub Actions 자동 토론 스크립트
 * - 하루 5~10회 자동 실행
 * - Groq API로 8명 임원 토론
 * - 결과를 Supabase에 저장 (RAG 학습 데이터 축적)
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'
const GROQ_KEY   = process.env.GROQ_API_KEY
const SERPER_KEY = process.env.SERPER_API_KEY

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const slugify = (text) =>
  text.toLowerCase().replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, '-').slice(0, 50)

const writeDebateFile = (fileName, content) => {
  const dir = path.resolve('debates')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileName), content, 'utf-8')
  console.log(`  📄 파일 저장: debates/${fileName}`)
}

// ── 신 설정 ───────────────────────────────────────────────
const GODS = [
  { id: 'cco', name: 'Muse(CCO)',     prompt: `당신은 AI 기업의 최고 창의 책임자(CCO) Muse입니다. 창의성, 브랜드 스토리텔링 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cso', name: 'Atlas(CSO)',    prompt: `당신은 AI 기업의 최고 전략 책임자(CSO) Atlas입니다. 장기 전략, 경쟁 우위 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cpo', name: 'Forge(CPO)',    prompt: `당신은 AI 기업의 최고 제품 책임자(CPO) Forge입니다. 제품 개발, 사용자 경험 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cmo', name: 'Mercury(CMO)', prompt: `당신은 AI 기업의 최고 마케팅 책임자(CMO) Mercury입니다. 마케팅, 고객 획득 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cxo', name: 'Empathy(CXO)', prompt: `당신은 AI 기업의 최고 경험 책임자(CXO) Empathy입니다. 고객 경험, 사용자 만족 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cfo', name: 'Prudence(CFO)',prompt: `당신은 AI 기업의 최고 재무 책임자(CFO) Prudence입니다. 재무, ROI, 리스크 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cdo', name: 'Oracle(CDO)',   prompt: `당신은 AI 기업의 최고 데이터 책임자(CDO) Oracle입니다. 데이터 분석, 인사이트 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
  { id: 'cto', name: 'Nexus(CTO)',    prompt: `당신은 AI 기업의 최고 기술 책임자(CTO) Nexus입니다. 기술 아키텍처, 실현 가능성 관점에서 분석합니다. 반드시 한국어로 답변하세요.` },
]

// ── 자동 토론 주제 풀 ────────────────────────────────────
const TOPIC_POOL = [
  'AI 스타트업의 2025년 투자 전략',
  '생성형 AI 시대의 콘텐츠 마케팅',
  '국내 AI 규제 강화가 기업에 미치는 영향',
  '멀티모달 AI의 비즈니스 활용 가능성',
  'AI 기반 고객 서비스 자동화 전략',
  'AI 윤리와 기업 브랜드 신뢰도',
  '소규모 기업의 AI 도입 최적 전략',
  'AI 인재 확보 경쟁과 기업 대응 전략',
  '구독 경제와 AI SaaS 비즈니스 모델',
  '데이터 주권과 AI 학습 데이터 확보 전략',
]

// ── Groq 호출 (429 자동 재시도) ──────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const MAX_RETRIES = 7

const groqChat = async (systemPrompt, userMessage, maxTokens = 400) => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_URL, {
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

    const data = await res.json()

    if (res.status === 429) {
      const msg = data?.error?.message || ''
      const match = msg.match(/try again in ([\d.]+)s/)
      const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1000 : 20000
      console.log(`    ⏳ Rate limit, ${Math.round(waitMs/1000)}초 대기 후 재시도... (${attempt + 1}/${MAX_RETRIES})`)
      await sleep(waitMs)
      continue
    }

    if (res.status === 413) throw new Error(`요청이 너무 큼 (413): 메시지를 줄이세요.`)
    if (!res.ok) throw new Error(`Groq ${res.status}: ${JSON.stringify(data)}`)
    return data.choices?.[0]?.message?.content || ''
  }
  throw new Error('최대 재시도 횟수 초과')
}

// ── Serper 검색 ───────────────────────────────────────────
const searchTopic = async (topic) => {
  if (!SERPER_KEY) return ''
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: topic, num: 3, hl: 'ko', gl: 'kr' }),
    })
    const data = await res.json()
    const snippets = (data.organic || []).slice(0, 3).map((r, i) => `${i+1}. ${r.title}: ${r.snippet}`)
    return snippets.length ? `[실시간 검색 결과]\n${snippets.join('\n')}\n` : ''
  } catch { return '' }
}

// ── 메모리 조회 ───────────────────────────────────────────
const getMemories = async (godId) => {
  const { data } = await supabase
    .from('god_memories')
    .select('topic, my_opinion, created_at')
    .eq('god_id', godId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!data || data.length === 0) return ''

  const lines = data.map(m => {
    const days = Math.floor((Date.now() - new Date(m.created_at)) / 86400000)
    return `[${days === 0 ? '오늘' : days + '일 전'}] "${m.topic}": ${m.my_opinion?.slice(0, 150)}`
  })
  return `[과거 기억]\n${lines.join('\n')}\n`
}

// ── 합의 체크 ─────────────────────────────────────────────
const checkConsensus = async (topic, messages) => {
  const summary = messages.map(m => `[${m.god}]: ${m.content.slice(0, 100)}`).join('\n')
  const answer = await groqChat(
    GODS.find(g => g.id === 'cdo').prompt,
    `토론 주제: ${topic}\n\n${summary}\n\n합의가 도출되었습니까? "예" 또는 "아니오"로만 답하세요.`,
    5
  )
  return answer.trim().startsWith('예')
}

// ── 메인 토론 실행 ────────────────────────────────────────
const runDebate = async (topic) => {
  console.log(`\n🚀 토론 시작: "${topic}"`)
  const messages = []

  // 검색 (공통)
  const searchCtx = await searchTopic(topic)

  // Round 1
  console.log('📢 Round 1 — 초기 의견')
  for (const god of GODS) {
    const memCtx = await getMemories(god.id)
    const userMsg = [memCtx, searchCtx, `주제: ${topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.`].filter(Boolean).join('\n')
    const content = await groqChat(god.prompt, userMsg)
    messages.push({ round: 1, godId: god.id, god: god.name, content, timestamp: new Date().toISOString() })
    console.log(`  ✅ ${god.name}`)
  }

  // Round 2~4 (동적 합의)
  let finalRound = 1
  for (let round = 2; round <= 4; round++) {
    console.log(`📢 Round ${round} — 토론`)
    for (const god of GODS) {
      const others = messages.filter(m => m.round === round - 1 && m.godId !== god.id)
      const opinionsText = others.map(o => `[${o.god}]: ${o.content.slice(0, 200)}`).join('\n\n')
      const userMsg = `주제: ${topic}\n\n다른 임원 의견:\n${opinionsText}\n\n동의/반박/보완하며 토론하세요.`
      const content = await groqChat(god.prompt, userMsg)
      messages.push({ round, godId: god.id, god: god.name, content, timestamp: new Date().toISOString() })
      console.log(`  ✅ ${god.name}`)
    }
    finalRound = round

    if (round >= 2) {
      const roundMsgs = messages.filter(m => m.round === round)
      const reached = await checkConsensus(topic, roundMsgs)
      if (reached) { console.log(`🤝 Round ${round}에서 합의 달성!`); break }
    }
  }

  // 최종 합의안 (마지막 라운드만 + 150자 제한 — 토큰 초과 방지)
  console.log('📊 최종 합의안 생성 중...')
  const oracleGod = GODS.find(g => g.id === 'cdo')
  const lastSummary = messages
    .filter(m => m.round === finalRound)
    .map(m => `[${m.god}]: ${m.content.slice(0, 150)}`)
    .join('\n')
  const consensus = await groqChat(
    oracleGod.prompt,
    `반드시 한국어로 작성하세요.\n주제: ${topic}\n\n최종 라운드 요약:\n${lastSummary}\n\n📊 핵심 합의점 3가지\n⚡ 주요 이견\n✅ 단기/중기/장기 권고사항`,
    500
  )

  // Supabase 저장
  console.log('🧠 Supabase 저장 중...')
  const { data: debate } = await supabase
    .from('debates')
    .insert({ topic, is_youtube: false, total_rounds: finalRound, consensus })
    .select('id').single()

  if (debate?.id) {
    await supabase.from('debate_messages').insert(
      messages.map(m => ({ debate_id: debate.id, god_id: m.godId, god_name: m.god, round: m.round, content: m.content }))
    )

    for (const god of GODS) {
      const myMsgs = messages.filter(m => m.godId === god.id)
      if (myMsgs.length === 0) continue
      const last = myMsgs[myMsgs.length - 1]
      await supabase.from('god_memories').insert({
        god_id: god.id, debate_id: debate.id, topic,
        my_opinion: last.content.slice(0, 600),
        consensus: consensus,
        relevance_score: 1.0,
      })
    }
    console.log(`✅ 저장 완료 (debate_id: ${debate.id})`)

    // 파일 저장 (GitHub Actions가 자동 커밋)
    console.log('📄 토론 파일 저장 중...')
    const date = new Date().toISOString().slice(0, 10)
    const slug = slugify(topic)

    // 토론 요약 파일
    const summaryContent = `---
debate_id: ${debate.id}
topic: "${topic.replace(/"/g, "'").slice(0, 100)}"
type: summary
created_at: ${new Date().toISOString()}
---

# 토론 요약: ${topic.slice(0, 80)}

## 최종 합의안
${consensus}
`
    writeDebateFile(`${date}-summary-${slug}.md`, summaryContent)

    // 각 신의 의견 파일
    for (const god of GODS) {
      const myMsgs = messages.filter(m => m.godId === god.id)
      if (myMsgs.length === 0) continue
      const last = myMsgs[myMsgs.length - 1]
      const noteContent = `---
god_id: ${god.id}
god_name: ${god.name}
topic: "${topic.replace(/"/g, "'").slice(0, 100)}"
debate_id: ${debate.id}
created_at: ${new Date().toISOString()}
---

# [${god.name}] ${topic.slice(0, 80)}

## 의견
${last.content}

## 최종 합의
${consensus}
`
      writeDebateFile(`${date}-${god.id}-${slug}.md`, noteContent)
    }
  }

  return { topic, rounds: finalRound, consensus }
}

// ── 실행 ──────────────────────────────────────────────────
const topic = TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)]
runDebate(topic)
  .then(r => {
    console.log(`\n🎉 완료! ${r.rounds}라운드 토론`)
    process.exit(0)
  })
  .catch(e => {
    console.error('❌ 오류:', e)
    process.exit(1)
  })
