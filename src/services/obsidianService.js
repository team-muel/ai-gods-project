/**
 * Obsidian 연동 서비스 — 읽기/쓰기
 *
 * 로컬(dev):    http://localhost:3000/api/obsidian/... → vite.config.js 미들웨어 → 로컬 .md 파일 읽기/쓰기
 * Vercel(prod): /api/obsidian/...                     → 서버리스 함수    → Supabase god_memories 읽기/쓰기
 */

const BASE = import.meta.env.DEV ? 'http://localhost:3000' : ''

// ── 읽기: 토론 전 관련 과거 노트 검색 ─────────────────────
export const readFromObsidian = async (godId, topic) => {
  try {
    const res  = await fetch(`${BASE}/api/obsidian/search?godId=${godId}&q=${encodeURIComponent(topic)}`)
    if (!res.ok) return ''
    const data = await res.json()

    if (!data.notes || data.notes.length === 0) return ''

    const lines = data.notes.map(n =>
      `[과거 기록 "${n.title}"]\n${n.snippet}`
    )
    return `[Obsidian 과거 노트]\n${lines.join('\n\n')}\n\n위 과거 기록을 참고하되 새로운 시각으로 답하세요.`
  } catch {
    return ''
  }
}

// ── 쓰기: 토론 후 Obsidian에 노트 저장 ─────────────────────
export const syncDebateToObsidian = async ({ gods, topic, debateId, messages, consensus }) => {
  const results = []

  for (const god of gods) {
    const myMessages = messages.filter(m => m.godId === god.id)
    if (myMessages.length === 0) continue

    const lastMsg = myMessages[myMessages.length - 1]

    try {
      const res = await fetch(`${BASE}/api/obsidian/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          godId:    god.id,
          godName:  god.name,
          topic,
          debateId,
          opinion:  lastMsg.content,
          consensus,
          score:    1.0,
        }),
      })

      const data = await res.json()
      results.push({ godId: god.id, file: data.file, ok: !!data.ok })
      if (!data.ok) console.warn(`[Obsidian] ${god.name} 쓰기 실패:`, data.error)
    } catch (e) {
      console.warn(`[Obsidian] ${god.name} 연결 실패:`, e.message)
      results.push({ godId: god.id, ok: false })
    }
  }

  const success = results.filter(r => r.ok).length
  console.log(`[Obsidian] 📝 ${success}/${gods.length}개 노트 동기화 완료`)
  return results
}
