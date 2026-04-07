/**
 * Supabase → Obsidian + Google Drive 동기화 스크립트
 *
 * 사용법: npm run sync-obsidian
 *
 * Supabase의 모든 god_memories를 로컬 Obsidian vault에 .md 파일로 쓰고
 * Google Drive에도 업로드합니다.
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 .env에 없습니다.')
  process.exit(1)
}
if (!VAULT_PATH) {
  console.error('❌ OBSIDIAN_VAULT_PATH가 .env에 없습니다.')
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

async function main() {
  console.log('🔄 Supabase → Obsidian + Google Drive 동기화 시작...')
  console.log(`📂 vault: ${VAULT_PATH}`)

  // god_memories 조회
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

  // debate_id별 전체 합의문 한번에 조회
  const debateIds = [...new Set(memories.map(m => m.debate_id).filter(Boolean))]
  const consensusMap = {}

  if (debateIds.length > 0) {
    const { data: debates } = await supabase
      .from('debates')
      .select('id, consensus, created_at')
      .in('id', debateIds)

    if (debates) {
      for (const d of debates) {
        consensusMap[d.id] = { consensus: d.consensus, createdAt: d.created_at }
      }
    }
  }

  console.log(`📋 총 ${memories.length}개 메모리, ${debateIds.length}개 토론 발견`)

  let written = 0
  let skipped = 0
  const processedDebates = new Set()

  for (const mem of memories) {
    const godName      = GOD_NAMES[mem.god_id] || mem.god_id
    const fullConsensus = (mem.debate_id && consensusMap[mem.debate_id]?.consensus)
      ? consensusMap[mem.debate_id].consensus
      : mem.consensus

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
      console.log(`  ✅ [${godName}] ${fileName}`)
      await uploadToDrive(fileName, content)
      written++
    } else {
      skipped++
    }

    // 토론 요약 파일 (debate당 1회)
    if (mem.debate_id && !processedDebates.has(mem.debate_id)) {
      processedDebates.add(mem.debate_id)
      const debateInfo = consensusMap[mem.debate_id]
      const summary = writeSummary({
        debateId:  mem.debate_id,
        topic:     mem.topic,
        consensus: fullConsensus,
        createdAt: debateInfo?.createdAt || mem.created_at,
      })
      if (summary.content) {
        console.log(`  📋 요약: ${summary.fileName}`)
        await uploadToDrive(summary.fileName, summary.content)
        written++
      }
    }
  }

  console.log(`\n🎉 완료! 새로 쓴 파일: ${written}개 / 이미 존재: ${skipped}개`)
}

main().catch(e => {
  console.error('❌ 오류:', e.message)
  process.exit(1)
})
