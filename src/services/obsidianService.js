/**
 * Obsidian CLI 연동 서비스 — 지속적 읽기/쓰기 루프
 *
 * 흐름:
 *   토론 전  → readFromObsidian(godId, topic) → 과거 노트 검색 → 프롬프트 주입
 *   토론 후  → syncDebateToObsidian(...)       → 새 노트 저장  → 다음 토론에서 참조
 *
 * 로컬 전용 (IS_DEV). Vercel에서는 자동 스킵.
 */

const BASE   = 'http://localhost:3000'
const IS_DEV = import.meta.env.DEV

// ── 읽기: 토론 전 관련 과거 노트 검색 ─────────────────────
export const readFromObsidian = async (godId, topic) => {
  if (!IS_DEV) return ''

  try {
    const res  = await fetch(`${BASE}/api/obsidian/search?godId=${godId}&q=${encodeURIComponent(topic)}`)
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
  if (!IS_DEV) return []

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
