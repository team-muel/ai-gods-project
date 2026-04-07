/**
 * Obsidian 자동 동기화 + Google Drive 업로드 감시자
 * 사용법: npm run watch-obsidian
 */

const { createClient } = require('@supabase/supabase-js')
const { google }       = require('googleapis')
const fs   = require('fs')
const path = require('path')

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY     = process.env.VITE_SUPABASE_ANON_KEY
const VAULT_PATH       = process.env.OBSIDIAN_VAULT_PATH
const GDRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID
const GDRIVE_SA_JSON   = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

if (!SUPABASE_URL || !SUPABASE_KEY || !VAULT_PATH) {
  console.error('❌ .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / OBSIDIAN_VAULT_PATH 필요')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Google Drive 설정 (없으면 스킵) ───────────────────────────
let driveClient = null
if (GDRIVE_SA_JSON && GDRIVE_FOLDER_ID) {
  try {
    const sa = JSON.parse(GDRIVE_SA_JSON)
    const auth = new google.auth.GoogleAuth({
      credentials: sa,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
    driveClient = google.drive({ version: 'v3', auth })
    console.log('☁️  Google Drive 연결됨')
  } catch (e) {
    console.warn('⚠️  Google Drive 설정 실패 (스킵):', e.message)
  }
} else {
  console.log('ℹ️  GOOGLE_SERVICE_ACCOUNT_JSON 미설정 → Google Drive 스킵')
}

const GOD_NAMES = {
  cco: 'Muse', cso: 'Atlas', cpo: 'Forge', cmo: 'Mercury',
  cxo: 'Empathy', cfo: 'Prudence', cdo: 'Oracle', cto: 'Nexus',
}

const slugify = (text) =>
  text.toLowerCase().replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, '-').slice(0, 50)

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── 노트 파일 생성 ────────────────────────────────────────────
const writeNote = ({ godId, godName, topic, debateId, opinion, consensus, createdAt }) => {
  const godDir  = path.join(VAULT_PATH, 'AI-Gods', godId)
  ensureDir(godDir)

  const date     = new Date(createdAt).toISOString().slice(0, 10)
  const slug     = slugify(topic)
  const fileName = `${date}-${slug}.md`
  const filePath = path.join(godDir, fileName)

  if (fs.existsSync(filePath)) return { fileName, content: null }

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
${consensus || '(합의문 없음)'}
`
  fs.writeFileSync(filePath, content, 'utf-8')
  return { fileName, content }
}

// ── 토론 요약 파일 생성 (토론 1개당 1파일) ────────────────────
const writeSummary = ({ debateId, topic, consensus, createdAt }) => {
  const summaryDir = path.join(VAULT_PATH, 'AI-Gods', '_Summaries')
  ensureDir(summaryDir)

  const date     = new Date(createdAt).toISOString().slice(0, 10)
  const slug     = slugify(topic)
  const fileName = `${date}-summary-${slug}.md`
  const filePath = path.join(summaryDir, fileName)

  if (fs.existsSync(filePath)) return { fileName, content: null }

  const content = `---
debate_id: ${debateId || 'null'}
topic: "${topic.replace(/"/g, "'").slice(0, 100)}"
type: summary
created_at: ${createdAt}
---

# 토론 요약: ${topic.slice(0, 80)}

## 최종 합의안
${consensus || '(합의문 없음)'}
`
  fs.writeFileSync(filePath, content, 'utf-8')
  return { fileName, content }
}

// ── Google Drive 업로드 ───────────────────────────────────────
const uploadToDrive = async (fileName, content) => {
  if (!driveClient || !content) return

  try {
    const { Readable } = require('stream')
    await driveClient.files.create({
      requestBody: {
        name: fileName,
        parents: [GDRIVE_FOLDER_ID],
        mimeType: 'text/markdown',
      },
      media: {
        mimeType: 'text/markdown',
        body: Readable.from([content]),
      },
    })
    console.log(`  ☁️  Drive 업로드: ${fileName}`)
  } catch (e) {
    console.warn(`  ⚠️  Drive 업로드 실패: ${e.message}`)
  }
}

// ── Realtime 구독 ────────────────────────────────────────────
function startRealtime() {
  console.log('📡 Supabase Realtime 연결 중...')

  // debate당 한 번만 요약 업로드하기 위한 추적
  const processedDebates = new Set()

  supabase
    .channel('god-memories-watch')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'god_memories' },
      async (payload) => {
        const mem     = payload.new
        const godName = GOD_NAMES[mem.god_id] || mem.god_id

        console.log(`\n🆕 새 메모리 감지: [${godName}] "${mem.topic?.slice(0, 40)}..."`)

        // debates 테이블에서 전체 합의문 가져오기
        let fullConsensus = mem.consensus
        if (mem.debate_id) {
          const { data } = await supabase
            .from('debates')
            .select('consensus')
            .eq('id', mem.debate_id)
            .single()
          if (data?.consensus) fullConsensus = data.consensus
        }

        // 개인 노트 저장
        const { fileName, content } = writeNote({
          godId:     mem.god_id,
          godName,
          topic:     mem.topic,
          debateId:  mem.debate_id,
          opinion:   mem.my_opinion,
          consensus: fullConsensus,
          createdAt: mem.created_at,
        })

        if (content) {
          console.log(`  ✅ Obsidian 저장: ${fileName}`)
          await uploadToDrive(fileName, content)
        } else {
          console.log(`  ⏭  이미 존재, 스킵`)
        }

        // 토론 요약 파일 (debate당 1회만)
        if (mem.debate_id && !processedDebates.has(mem.debate_id)) {
          processedDebates.add(mem.debate_id)
          const summary = writeSummary({
            debateId:  mem.debate_id,
            topic:     mem.topic,
            consensus: fullConsensus,
            createdAt: mem.created_at,
          })
          if (summary.content) {
            console.log(`  📋 요약 저장: ${summary.fileName}`)
            await uploadToDrive(summary.fileName, summary.content)
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ 연결 완료! Vercel 토론이 끝나면 자동으로 Obsidian + Drive에 저장됩니다.')
        console.log('   (종료하려면 Ctrl+C)\n')
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Realtime 연결 실패. 30초 후 재시도...')
        setTimeout(startRealtime, 30_000)
      }
    })
}

startRealtime()

process.on('SIGINT', () => {
  console.log('\n👋 감시 종료')
  process.exit(0)
})
