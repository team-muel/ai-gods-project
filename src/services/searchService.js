/**
 * Serper 검색 서비스
 * - 토론 주제에 대한 실시간 Google 검색 결과를 가져옴
 * - AI들의 Round 1 프롬프트에 주입 → 최신 정보 기반 토론
 */

export const searchWeb = async (query, num = 5) => {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&num=${num}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// 검색 결과 → 프롬프트 컨텍스트 변환
export const searchResultsToContext = (searchData) => {
  if (!searchData || !searchData.results || searchData.results.length === 0) return ''

  const lines = searchData.results.map((r, i) =>
    `${i + 1}. ${r.title}\n   ${r.snippet}`
  )

  let context = `[실시간 웹 검색 결과: "${searchData.query}"]\n${lines.join('\n\n')}`

  if (searchData.knowledgePanel) {
    const kp = searchData.knowledgePanel
    context += `\n\n[핵심 정보] ${kp.title || ''}: ${kp.description || ''}`
  }

  return context + '\n\n위 최신 정보를 참고하여 답변하세요.'
}
