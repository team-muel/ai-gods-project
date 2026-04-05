/**
 * Supabase → JSONL 학습 데이터 내보내기
 * 실행: node scripts/export_training_data.js
 * 출력: training_data/{godId}.jsonl
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// 각 신의 시스템 프롬프트 (Modelfile과 동일)
const GOD_SYSTEM_PROMPTS = {
  cco: `당신은 AI 기업의 최고 창의 책임자(CCO)입니다. 이름은 Muse입니다. 창의성, 브랜드, 스토리텔링 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cso: `당신은 AI 기업의 최고 전략 책임자(CSO)입니다. 이름은 Atlas입니다. 장기 전략, 경쟁 우위, 시장 포지셔닝 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cpo: `당신은 AI 기업의 최고 제품 책임자(CPO)입니다. 이름은 Forge입니다. 제품 개발, 사용자 경험, 로드맵 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cmo: `당신은 AI 기업의 최고 마케팅 책임자(CMO)입니다. 이름은 Mercury입니다. 마케팅, 고객 획득, 브랜드 인지도 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cxo: `당신은 AI 기업의 최고 경험 책임자(CXO)입니다. 이름은 Empathy입니다. 고객 경험, 사용자 만족, 감성적 연결 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cfo: `당신은 AI 기업의 최고 재무 책임자(CFO)입니다. 이름은 Prudence입니다. 재무 건전성, ROI, 리스크 관리 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cdo: `당신은 AI 기업의 최고 데이터 책임자(CDO)입니다. 이름은 Oracle입니다. 데이터 분석, 인사이트 도출, 의사결정 지원 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cto: `당신은 AI 기업의 최고 기술 책임자(CTO)입니다. 이름은 Nexus입니다. 기술 아키텍처, 인프라, 기술적 실현 가능성 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
}

const outputDir = path.join(__dirname, '../training_data')
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)

const main = async () => {
  console.log('📦 Supabase에서 토론 데이터 불러오는 중...')

  // 전체 메시지 조회
  const { data: messages, error } = await supabase
    .from('debate_messages')
    .select(`
      god_id,
      god_name,
      round,
      content,
      debate_id,
      debates ( topic, consensus )
    `)
    .order('debate_id')
    .order('round')

  if (error) { console.error('조회 오류:', error); process.exit(1) }
  if (!messages || messages.length === 0) {
    console.warn('⚠️  저장된 토론 데이터가 없습니다. 먼저 토론을 몇 번 진행하세요.')
    process.exit(0)
  }

  console.log(`✅ 총 ${messages.length}개 메시지 로드됨`)

  // godId별로 그룹화
  const byGod = {}
  for (const msg of messages) {
    if (!byGod[msg.god_id]) byGod[msg.god_id] = []
    byGod[msg.god_id].push(msg)
  }

  let totalSamples = 0

  for (const [godId, msgs] of Object.entries(byGod)) {
    const systemPrompt = GOD_SYSTEM_PROMPTS[godId]
    if (!systemPrompt) continue

    const samples = []

    for (const msg of msgs) {
      const topic = msg.debates?.topic || '알 수 없는 주제'
      const consensus = msg.debates?.consensus || ''

      // Round 1: 초기 의견
      if (msg.round === 1) {
        samples.push({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `주제: ${topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요.` },
            { role: 'assistant', content: msg.content },
          ]
        })
      } else {
        // Round 2+: 토론 반응
        samples.push({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `주제: ${topic}\n\n다른 임원들의 의견에 대해 동의/반박/보완하며 토론하세요.` },
            { role: 'assistant', content: msg.content },
          ]
        })
      }

      // 최종 합의 있으면 합의 학습 샘플 추가
      if (consensus && msg.round >= 2) {
        samples.push({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `주제: ${topic}\n\n이 토론에서 도출된 최종 합의안을 참고하여 당신의 입장을 정리하세요:\n\n${consensus.slice(0, 300)}` },
            { role: 'assistant', content: msg.content },
          ]
        })
      }
    }

    const outPath = path.join(outputDir, `${godId}.jsonl`)
    fs.writeFileSync(outPath, samples.map(s => JSON.stringify(s)).join('\n'), 'utf-8')
    console.log(`  🗂️  ${godId}: ${samples.length}개 샘플 → ${outPath}`)
    totalSamples += samples.length
  }

  console.log(`\n🎉 완료! 총 ${totalSamples}개 학습 샘플 생성됨`)
  console.log(`📁 위치: ${outputDir}`)

  if (totalSamples < 20) {
    console.warn('\n⚠️  샘플이 적습니다. 20개 이상 권장 (현재: ' + totalSamples + '개)')
    console.warn('   파인튜닝은 가능하지만, 더 많은 토론 후 재실행을 권장합니다.')
  }
}

main().catch(console.error)
