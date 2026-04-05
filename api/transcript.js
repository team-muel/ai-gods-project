import { YoutubeTranscript } from 'youtube-transcript'

export default async function handler(req, res) {
  const { videoId } = req.query

  if (!videoId) {
    return res.status(400).json({ error: 'videoId 파라미터가 필요합니다.' })
  }

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
      .catch(() => YoutubeTranscript.fetchTranscript(videoId))

    const text = transcript.map(t => t.text).join(' ')
    return res.status(200).json({ transcript: text, segments: transcript.length })
  } catch (e) {
    return res.status(500).json({ error: `트랜스크립트를 가져올 수 없습니다: ${e.message}` })
  }
}
