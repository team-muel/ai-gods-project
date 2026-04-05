/**
 * Obsidian 연동 서비스
 * - 토론 완료 → Obsidian vault에 .md 노트 작성
 * - 변경 감지는 vite.config.js의 chokidar 서버 플러그인이 담당
 * - Supabase는 source of truth, Obsidian은 시각화/큐레이션 레이어
 */

const BASE = 'http://localhost:3000'

// 토론 완료 후 모든 신의 기억을 Obsidian에 작성
export const syncDebateToObsidian = async ({ gods, topic, debateId, messages, consensus }) => {
  const results = []

  for (const god of gods) {
    const myMessages = messages.filter(m => m.godId === god.id)
    if (myMessages.length === 0) continue

    const lastMsg = myMessages[myMessages.length - 1]

    // 이 신의 기존 노트 링크 조회 (wikilinks 생성용)
    let existingLinks = []
    try {
      const res = await fetch(`${BASE}/api/obsidian/links?godId=${god.id}`)
      const data = await res.json()
      existingLinks = data.links || []
    } catch {
      // 링크 조회 실패는 치명적이지 않음
    }

    // Obsidian 노트 작성
    try {
      const res = await fetch(`${BASE}/api/obsidian/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          godId: god.id,
          godName: god.name,
          topic,
          debateId,
          opinion: lastMsg.content,
          consensus,
          score: 1.0,
          existingLinks: existingLinks.slice(-5), // 최근 5개만 링크
        }),
      })

      const data = await res.json()
      if (data.ok) {
        results.push({ godId: god.id, file: data.file, ok: true })
      } else {
        console.warn(`[Obsidian] ${god.name} 노트 작성 실패:`, data.error)
        results.push({ godId: god.id, ok: false })
      }
    } catch (e) {
      console.warn(`[Obsidian] ${god.name} 연결 실패 (vault 경로 확인):`, e.message)
      results.push({ godId: god.id, ok: false })
    }
  }

  const success = results.filter(r => r.ok).length
  console.log(`[Obsidian] 📝 ${success}/${gods.length}개 노트 동기화 완료`)
  return results
}
