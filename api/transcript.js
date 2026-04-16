import { enforceRateLimit, ensureRequestAllowed, getRequestQuery, sendJson } from './_requestGuard.js'

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['GET'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'youtube-transcript', limit: 20, windowMs: 10 * 60 * 1000 })) return

  const query = getRequestQuery(req)
  const videoId = String(query.videoId || '').trim()

  if (!videoId) {
    return sendJson(res, 400, { error: 'videoId 파라미터가 필요합니다.' })
  }

  if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) {
    return sendJson(res, 400, { error: '유효한 YouTube videoId가 필요합니다.' })
  }

  try {
    const { YoutubeTranscript } = await import('youtube-transcript')

    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
      .catch(() => YoutubeTranscript.fetchTranscript(videoId))

    const text = transcript.map(t => t.text).join(' ')
    return sendJson(res, 200, { transcript: text, segments: transcript.length })
  } catch (e) {
    return sendJson(res, 500, { error: `트랜스크립트를 가져올 수 없습니다: ${e.message}` })
  }
}
