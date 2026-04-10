export const requestJson = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, { ...options, headers })
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null

  if (!response.ok) {
    throw new Error(data?.error || `요청 실패: ${response.status}`)
  }

  return data
}

export const postJson = (url, payload) => (
  requestJson(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
)
