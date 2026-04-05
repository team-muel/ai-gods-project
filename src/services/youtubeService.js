// YouTube URL에서 video ID 추출
export const extractVideoId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// YouTube URL 여부 판단
export const isYoutubeUrl = (text) => {
  return text.includes('youtube.com') || text.includes('youtu.be')
}

// 트랜스크립트 가져오기 (Vite 미들웨어 경유)
export const fetchTranscript = async (videoId) => {
  const res = await fetch(`/api/transcript?videoId=${videoId}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '트랜스크립트를 가져올 수 없습니다.')
  return data.transcript
}
