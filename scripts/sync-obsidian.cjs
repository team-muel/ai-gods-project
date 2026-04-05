/**
 * Supabase → Obsidian 동기화 스크립트
 *
 * 사용법: node scripts/sync-obsidian.cjs
 * npm 스크립트:  npm run sync-obsidian
 *
 * Vercel에서 진행된 토론을 포함해, Supabase의 모든 god_memories를
 * 로컬 Obsidian vault에 .md 파일로 씁니다.
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY
const VAULT_PATH    = process.env.OBSIDIAN_VAULT_PATH

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 .env에 없습니다.')
  process.exit(1)
}
if (!VAULT_PATH) {
  console.error('❌ OBSIDIAN_VAULT_PATH가 .env에 없습니다.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const slugify = (text) =>
  text.toLowerCase().replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, '-').slice(0, 50)

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const writeNote = ({ godId, godName, topic, debateId, opinion, consensus, createdAt }) => {
  const godDir = path.join(VAULT_PATH, 'AI-Gods', godId)
  ensureDir(godDir)

  const date = new Date(createdAt).toISOString().slice(0, 10)
  const slug = slugify(topic)
  const fileName = `${date}-${slug}.md`
  const filePath = path.join(godDir, fileName)

  if (fs.existsSync(filePath)) return { fileName, skipped: true }

  const content = `---
god_id: ${godId}
god_name: ${godName}
topic: "${topic.replace(/"/g, "'").slice(0, 100)}"
debate_id: ${debateId || 'null'}
relevance_score: 1.0
status: active
created_at: ${createdAt}
---

# [${godName}] ${topic.slice(0, 80)}

## 의견
${opinion || ''}

## 최종 합의
${consensus || ''}
`
  fs.writeFileSync(filePath, content, 'utf-8')
  return { fileName, skipped: false }
}

const GOD_NAMES = {
  cco: 'Muse', cso: 'Atlas', cpo: 'Forge', cmo: 'Mercury',
  cxo: 'Empathy', cfo: 'Prudence', cdo: 'Oracle', cto: 'Nexus',
}

async function main() {
  console.log('🔄 Supabase → Obsidian 동기화 시작...')
  console.log(`📂 vault: ${VAULT_PATH}`)

  const { data: memories, error } = await supabase
    .from('god_memories')
    .select('id, god_id, debate_id, topic, my_opinion, consensus, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('❌ Supabase 조회 실패:', error.message)
    process.exit(1)
  }

  console.log(`📋 총 ${memories.length}개 메모리 발견`)

  let written = 0
  let skipped = 0

  for (const mem of memories) {
    const godName = GOD_NAMES[mem.god_id] || mem.god_id
    const result = writeNote({
      godId:     mem.god_id,
      godName,
      topic:     mem.topic,
      debateId:  mem.debate_id,
      opinion:   mem.my_opinion,
      consensus: mem.consensus,
      createdAt: mem.created_at,
    })

    if (result.skipped) {
      skipped++
    } else {
      console.log(`  ✅ [${godName}] ${result.fileName}`)
      written++
    }
  }

  console.log(`\n🎉 완료! 새로 쓴 파일: ${written}개 / 이미 존재: ${skipped}개`)
}

main().catch(e => {
  console.error('❌ 오류:', e.message)
  process.exit(1)
})
