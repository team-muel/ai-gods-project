import { postJson, requestJson } from './apiClient.js'

const parseFilename = (header = '', fallback = 'artifact') => {
  const encodedMatch = String(header).match(/filename\*=UTF-8''([^;]+)/i)
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1])
    } catch (error) {}
  }

  const match = String(header).match(/filename="?([^";]+)"?/i)
  return match?.[1] || fallback
}

export const generateAutonomousTopics = async ({ focus = '', count = 5 } = {}) => {
  return await postJson('/api/topics/autonomous', { focus, count })
}

export const generateWorkbenchArtifacts = async ({
  mode = 'both',
  topic,
  instructions,
  audience,
  brief,
  dossier,
  consensus,
  messages,
  artifacts,
  reportCitationMode,
  reportCitationVisibility,
  reportStylePreset,
  slideCitationMode,
  slideCitationVisibility,
  slideStylePreset,
} = {}) => {
  return await postJson('/api/artifacts/generate', {
    mode,
    topic,
    instructions,
    audience,
    brief,
    dossier,
    consensus,
    messages,
    artifacts,
    reportCitationMode,
    reportCitationVisibility,
    reportStylePreset,
    slideCitationMode,
    slideCitationVisibility,
    slideStylePreset,
  })
}

export const submitArtifactFeedback = async ({ debateId, topic, artifactType, direction, artifact, dossier, note = '' } = {}) => {
  return await postJson('/api/artifacts/feedback', {
    debateId,
    topic,
    artifactType,
    direction,
    artifact,
    dossier,
    note,
  })
}

export const exportWorkbenchArtifact = async ({ target, topic, artifact } = {}) => {
  const response = await fetch('/api/artifacts/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, topic, artifact }),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null
    const error = new Error(data?.error || `요청 실패: ${response.status}`)
    error.code = data?.code || ''
    throw error
  }

  if (contentType.includes('application/json')) {
    return await response.json()
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get('content-disposition'), `${topic || artifact?.title || 'artifact'}`),
  }
}

export const getGoogleExportStatus = async () => {
  return await requestJson('/api/google/oauth/status')
}

export const startGoogleOAuth = ({ returnTo } = {}) => {
  const next = returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`
  const url = new URL('/api/google/oauth/start', window.location.origin)
  url.searchParams.set('returnTo', next)
  window.location.assign(url.toString())
}

export const disconnectGoogleOAuth = async () => {
  return await requestJson('/api/google/oauth/disconnect', { method: 'POST' })
}

export const downloadBlobResult = ({ blob, filename } = {}) => {
  if (!blob) return

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename || 'artifact'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}