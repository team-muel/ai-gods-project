/**
 * 파인튜닝된 GGUF → Ollama 모델 교체
 * 실행: node scripts/update_ollama_models.js [--god cso] [--all]
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const GOD_NAMES = {
  cco: 'ai-muse',
  cso: 'ai-atlas',
  cpo: 'ai-forge',
  cmo: 'ai-mercury',
  cxo: 'ai-empathy',
  cfo: 'ai-prudence',
  cdo: 'ai-oracle',
  cto: 'ai-nexus',
}

const GOD_SYSTEM_PROMPTS = {
  cco: `당신은 AI 기업의 최고 창의 책임자(CCO) Muse입니다. 창의성, 브랜드, 스토리텔링 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cso: `당신은 AI 기업의 최고 전략 책임자(CSO) Atlas입니다. 장기 전략, 경쟁 우위, 시장 포지셔닝 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cpo: `당신은 AI 기업의 최고 제품 책임자(CPO) Forge입니다. 제품 개발, 사용자 경험, 로드맵 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cmo: `당신은 AI 기업의 최고 마케팅 책임자(CMO) Mercury입니다. 마케팅, 고객 획득, 브랜드 인지도 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cxo: `당신은 AI 기업의 최고 경험 책임자(CXO) Empathy입니다. 고객 경험, 사용자 만족, 감성적 연결 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cfo: `당신은 AI 기업의 최고 재무 책임자(CFO) Prudence입니다. 재무 건전성, ROI, 리스크 관리 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cdo: `당신은 AI 기업의 최고 데이터 책임자(CDO) Oracle입니다. 데이터 분석, 인사이트 도출, 의사결정 지원 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
  cto: `당신은 AI 기업의 최고 기술 책임자(CTO) Nexus입니다. 기술 아키텍처, 인프라, 기술적 실현 가능성 관점에서 분석합니다. 반드시 한국어로 답변하세요.`,
}

const updateModel = (godId) => {
  const modelName  = GOD_NAMES[godId]
  const ggufDir    = path.join(ROOT, 'finetuned_models', godId, 'gguf')
  const modelfile  = path.join(ROOT, 'finetuned_models', godId, 'Modelfile')

  // GGUF 파일 찾기
  if (!fs.existsSync(ggufDir)) {
    console.log(`[${godId}] ⏭️  GGUF 없음 — 스킵 (먼저 파인튜닝 실행)`)
    return false
  }

  const ggufFiles = fs.readdirSync(ggufDir).filter(f => f.endsWith('.gguf'))
  if (ggufFiles.length === 0) {
    console.log(`[${godId}] ⏭️  GGUF 파일 없음 — 스킵`)
    return false
  }

  const ggufPath = path.join(ggufDir, ggufFiles[0]).replace(/\\/g, '/')

  // Modelfile 생성
  const modelfileContent = `FROM ${ggufPath}

SYSTEM """${GOD_SYSTEM_PROMPTS[godId]}"""

PARAMETER temperature 0.8
PARAMETER num_predict 500
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
`

  fs.writeFileSync(modelfile, modelfileContent, 'utf-8')
  console.log(`[${godId}] 📝 Modelfile 생성됨`)

  // Ollama 모델 교체
  try {
    console.log(`[${godId}] 🔄 ollama create ${modelName} ...`)
    execSync(`ollama create ${modelName} -f "${modelfile}"`, { stdio: 'inherit' })
    console.log(`[${godId}] ✅ ${modelName} 업데이트 완료!`)
    return true
  } catch (e) {
    console.error(`[${godId}] ❌ ollama create 실패:`, e.message)
    return false
  }
}

// CLI 파싱
const args = process.argv.slice(2)
const allFlag = args.includes('--all')
const godFlag = args.indexOf('--god')
const targets = allFlag
  ? Object.keys(GOD_NAMES)
  : godFlag >= 0
    ? [args[godFlag + 1]]
    : Object.keys(GOD_NAMES) // 기본: 가능한 것 전부

console.log(`🚀 Ollama 모델 업데이트: ${targets}`)
const results = {}
for (const gid of targets) {
  results[gid] = updateModel(gid)
}

console.log('\n📊 결과:')
for (const [gid, ok] of Object.entries(results)) {
  console.log(`  ${ok ? '✅' : '⏭️ '} ${gid} → ${GOD_NAMES[gid]}: ${ok ? '업데이트 완료' : '스킵'}`)
}
