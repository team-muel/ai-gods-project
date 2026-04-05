/**
 * Obsidian 자동 동기화 감시자
 *
 * 사용법: npm run watch-obsidian
 *
 * 로컬에서 이 프로세스를 켜두면, Vercel에서 토론이 끝나
 * Supabase에 새 메모리가 저장되는 순간 자동으로 Obsidian .md 파일을 생성합니다.
 */

const { createClient } = require('@supabase/supabase-js')
const fs   = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const VAULT_PATH   = process.env.OBSIDIAN_VAULT_PATH

if (!SUPABASE_URL || !SUPABASE_KEY || !VAULT_PATH) {
  console.error('❌ .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / OBSIDIAN_VAULT_PATH 필요')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GOD_NAMES = {
  cco: 'Muse', cso: 'Atlas', cpo: 'Forge', cmo: 'Mercury',
  cxo: 'Empathy', cfo: 'Prudence', cdo: 'Oracle', cto: 'Nexus',
}

const slugify = (text) =>
  text.toLowerCase().replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, '-').slice(0, 50)

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const writeNote = ({ godId, godName, topic, debateId, opinion, consensus, createdAt }) => {
  const godDir  = path.join(VAULT_PATH, 'AI-Gods', godId)
  ensureDir(godDir)

  const date     = new Date(createdAt).toISOString().slice(0, 10)
  const slug     = slugify(topic)
  const fileName = `${date}-${slug}.md`
  const filePath = path.join(godDir, fileName)

  if (fs.existsSync(filePath)) return null // 이미 있으면 스킵

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
  return fileName
}

// ── Realtime 구독 ────────────────────────────────────────────
function startRealtime() {
  console.log('📡 Supabase Realtime 연결 중...')

  supabase
    .channel('god-memories-watch')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'god_memories' },
      (payload) => {
        const mem     = payload.new
        const godName = GOD_NAMES[mem.god_id] || mem.god_id

        console.log(`\n🆕 새 메모리 감지: [${godName}] "${mem.topic?.slice(0, 40)}..."`)

        const fileName = writeNote({
          godId:     mem.god_id,
          godName,
          topic:     mem.topic,
          debateId:  mem.debate_id,
          opinion:   mem.my_opinion,
          consensus: mem.consensus,
          createdAt: mem.created_at,
        })

        if (fileName) {
          console.log(`  ✅ Obsidian 저장: ${fileName}`)
        } else {
          console.log(`  ⏭  이미 존재, 스킵`)
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ 연결 완료! Vercel 토론이 끝나면 자동으로 Obsidian에 저장됩니다.')
        console.log('   (종료하려면 Ctrl+C)\n')
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Realtime 연결 실패. 30초 후 재시도...')
        setTimeout(startRealtime, 30_000)
      }
    })
}

startRealtime()

// 프로세스 유지
process.on('SIGINT', () => {
  console.log('\n👋 감시 종료')
  process.exit(0)
})
