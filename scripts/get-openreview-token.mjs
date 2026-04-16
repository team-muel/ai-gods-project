import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_BASE_URL = cleanText(process.env.OPENREVIEW_API_BASE_URL || 'https://api2.openreview.net').replace(/\/+$/, '')
const DEFAULT_ENV_FILE = path.resolve(process.cwd(), '.env')

function cleanText(value = '') {
  return String(value).trim()
}

function parseArgs(argv = []) {
  const options = {
    printEnv: false,
    writeEnv: false,
    envFile: DEFAULT_ENV_FILE,
    baseUrl: DEFAULT_BASE_URL,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--print-env') {
      options.printEnv = true
      continue
    }
    if (arg === '--write-env') {
      options.writeEnv = true
      continue
    }
    if (arg === '--env-file') {
      options.envFile = path.resolve(process.cwd(), argv[index + 1] || '.env')
      index += 1
      continue
    }
    if (arg === '--base-url') {
      options.baseUrl = cleanText(argv[index + 1] || DEFAULT_BASE_URL).replace(/\/+$/, '') || DEFAULT_BASE_URL
      index += 1
    }
  }

  return options
}

function printHelp() {
  console.log('OpenReview token utility')
  console.log('')
  console.log('Usage:')
  console.log('  npm run openreview:token')
  console.log('  npm run openreview:token -- --print-env')
  console.log('  npm run openreview:token -- --write-env')
  console.log('')
  console.log('Required env:')
  console.log('  OPENREVIEW_ID  # usually your OpenReview login email')
  console.log('  OPENREVIEW_PASSWORD')
  console.log('')
  console.log('Optional env:')
  console.log('  OPENREVIEW_API_BASE_URL (default: https://api2.openreview.net)')
}

function splitCookieLikeHeader(value = '') {
  return String(value)
    .split(/,(?=[^;,]+=)/g)
    .map((part) => part.trim())
    .filter(Boolean)
}

function extractCookiePair(value = '') {
  const pair = cleanText(String(value || '').split(';')[0] || '')
  return pair.includes('=') ? pair : ''
}

function getCookiePairs(response) {
  if (typeof response?.headers?.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((entry) => extractCookiePair(entry)).filter(Boolean)
  }

  return splitCookieLikeHeader(response?.headers?.get('set-cookie') || '')
    .map((entry) => extractCookiePair(entry))
    .filter(Boolean)
}

function getCookieValue(cookiePairs = [], cookieName = '') {
  for (const pair of cookiePairs) {
    const separatorIndex = pair.indexOf('=')
    if (separatorIndex <= 0) continue
    const name = pair.slice(0, separatorIndex).trim()
    if (name === cookieName) return pair.slice(separatorIndex + 1).trim()
  }
  return ''
}

function decodeJwtPayload(token = '') {
  const segments = String(token || '').split('.')
  if (segments.length < 2) return null

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function formatTokenExpiry(token = '') {
  const payload = decodeJwtPayload(token)
  const expSeconds = Number(payload?.exp || 0)
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) return 'unknown'
  return new Date(expSeconds * 1000).toISOString()
}

function maskSecret(value = '') {
  const text = cleanText(value)
  if (!text) return '(missing)'
  if (text.length <= 12) return `${text.slice(0, 3)}...${text.slice(-2)}`
  return `${text.slice(0, 6)}...${text.slice(-6)}`
}

async function updateEnvFile(envFile, updates) {
  let content = ''
  try {
    content = await fs.readFile(envFile, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const lines = content ? content.replace(/\r/g, '').split('\n') : []
  const seen = new Set()
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)=.*$/)
    if (!match) return line
    const key = match[1]
    if (!(key in updates)) return line
    seen.add(key)
    return `${key}=${updates[key]}`
  })

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue
    nextLines.push(`${key}=${value}`)
  }

  await fs.writeFile(envFile, `${nextLines.filter((line, index, array) => !(index === array.length - 1 && line === '')).join('\n')}\n`, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const id = cleanText(process.env.OPENREVIEW_ID || process.env.OPENREVIEW_EMAIL || process.env.OPENREVIEW_USERNAME || '')
  const password = cleanText(process.env.OPENREVIEW_PASSWORD || '')
  if (!id || !password) {
    throw new Error('OPENREVIEW_ID 와 OPENREVIEW_PASSWORD 를 먼저 .env 또는 현재 셸에 넣어야 합니다.')
  }

  if (!id.includes('@')) {
    throw new Error('OPENREVIEW_ID 에 @ 가 없습니다. OpenReview ID/password 로그인은 실제 로그인 이메일을 사용하세요. 다른 식별자를 써야 한다면 OPENREVIEW_ACCESS_TOKEN 또는 OPENREVIEW_REFRESH_TOKEN 을 사용하세요.')
  }

  const response = await fetch(`${options.baseUrl}/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, password }),
  })

  const payload = await response.json().catch(() => ({}))
  const cookiePairs = getCookiePairs(response)
  const accessToken = cleanText(payload?.token || payload?.accessToken || payload?.access_token || getCookieValue(cookiePairs, 'openreview.accessToken'))
  const refreshToken = cleanText(payload?.refreshToken || payload?.refresh_token || getCookieValue(cookiePairs, 'openreview.refreshToken'))

  if (!response.ok) {
    const message = cleanText(payload?.message || payload?.error || payload?.details || `OpenReview login failed: ${response.status}`)
    throw new Error(message)
  }

  if (!accessToken) {
    throw new Error('로그인은 성공했지만 access token 을 응답/쿠키에서 찾지 못했습니다.')
  }

  const envLines = [
    'OPENREVIEW_ENABLED=1',
    `OPENREVIEW_API_BASE_URL=${options.baseUrl}`,
    `OPENREVIEW_ACCESS_TOKEN=${accessToken}`,
    refreshToken ? `OPENREVIEW_REFRESH_TOKEN=${refreshToken}` : '',
  ].filter(Boolean)

  console.log(`baseUrl: ${options.baseUrl}`)
  console.log(`accessToken: ${maskSecret(accessToken)}`)
  console.log(`accessToken exp: ${formatTokenExpiry(accessToken)}`)
  console.log(`refreshToken: ${maskSecret(refreshToken)}`)
  console.log(`refreshToken exp: ${formatTokenExpiry(refreshToken)}`)

  if (options.printEnv) {
    console.log('')
    console.log('# copy into .env')
    console.log(envLines.join('\n'))
  }

  if (options.writeEnv) {
    await updateEnvFile(options.envFile, {
      OPENREVIEW_ENABLED: '1',
      OPENREVIEW_API_BASE_URL: options.baseUrl,
      OPENREVIEW_ACCESS_TOKEN: accessToken,
      ...(refreshToken ? { OPENREVIEW_REFRESH_TOKEN: refreshToken } : {}),
    })
    console.log(`saved tokens to ${options.envFile}`)
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})