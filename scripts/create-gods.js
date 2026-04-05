/**
 * 8명의 AI 신 Ollama 모델 생성 스크립트
 * 실행: node scripts/create-gods.js
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelsDir = path.join(__dirname, '../models')

const GODS = [
  { name: 'ai-muse',     file: 'Muse.Modelfile',     role: 'CCO' },
  { name: 'ai-atlas',    file: 'Atlas.Modelfile',     role: 'CSO' },
  { name: 'ai-forge',    file: 'Forge.Modelfile',     role: 'CPO' },
  { name: 'ai-mercury',  file: 'Mercury.Modelfile',   role: 'CMO' },
  { name: 'ai-empathy',  file: 'Empathy.Modelfile',   role: 'CXO' },
  { name: 'ai-prudence', file: 'Prudence.Modelfile',  role: 'CFO' },
  { name: 'ai-oracle',   file: 'Oracle.Modelfile',    role: 'CDO' },
  { name: 'ai-nexus',    file: 'Nexus.Modelfile',     role: 'CTO' },
]

console.log('🌌 AI Gods 모델 생성 시작...\n')

// 현재 설치된 모델 목록 확인
let existingModels = []
try {
  const output = execSync('ollama list', { encoding: 'utf8' })
  existingModels = output.split('\n').map(l => l.split(' ')[0])
} catch {}

for (const god of GODS) {
  const modelfilePath = path.join(modelsDir, god.file)

  if (!existsSync(modelfilePath)) {
    console.log(`❌ ${god.file} 파일이 없습니다. 건너뜁니다.`)
    continue
  }

  if (existingModels.some(m => m.startsWith(god.name))) {
    console.log(`⏭  ${god.name} (${god.role}) - 이미 존재함, 재생성 중...`)
  } else {
    console.log(`🔨 ${god.name} (${god.role}) 생성 중...`)
  }

  try {
    execSync(`ollama create ${god.name} -f "${modelfilePath}"`, {
      encoding: 'utf8',
      stdio: 'inherit',
    })
    console.log(`✅ ${god.name} 완료\n`)
  } catch (err) {
    console.error(`❌ ${god.name} 생성 실패:`, err.message)
  }
}

console.log('\n🎉 모든 AI 신 생성 완료!')
console.log('\n설치된 모델 목록:')
try {
  console.log(execSync('ollama list', { encoding: 'utf8' }))
} catch {}
