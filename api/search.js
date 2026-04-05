// DuckDuckGo HTML 스크래핑 (Serper 대체 - 무료/무제한)
export default async function handler(req, res) {
  const { q, num = '5' } = req.query

  if (!q) return res.status(400).json({ error: 'q 파라미터가 필요합니다.' })

  try {
    const query = encodeURIComponent(q)
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${query}&kl=kr-kr`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Accept': 'text/html',
        },
      }
    )

    if (!response.ok) throw new Error(`DuckDuckGo 응답 오류: ${response.status}`)

    const html = await response.text()

    // 제목 추출
    const titleMatches = [...html.matchAll(/class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g)]
    // 스니펫 추출
    const snippetMatches = [...html.matchAll(/class="result__snippet"[^>]*>([^<]+)<\/a>/g)]

    const count = Math.min(parseInt(num), titleMatches.length)
    const results = []

    for (let i = 0; i < count; i++) {
      const title   = titleMatches[i]?.[2]?.trim() || ''
      const link    = titleMatches[i]?.[1]?.trim() || ''
      const snippet = snippetMatches[i]?.[1]?.trim() || ''
      if (title) results.push({ title, snippet, link })
    }

    return res.status(200).json({ results, knowledgePanel: null, query: q })
  } catch (e) {
    // DuckDuckGo 실패 시 빈 결과 반환 (토론은 계속 진행)
    console.error('[Search] 크롤링 실패:', e.message)
    return res.status(200).json({ results: [], knowledgePanel: null, query: q })
  }
}
