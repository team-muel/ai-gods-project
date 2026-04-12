import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

const parseArgs = () => {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
  }
}

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const detectGitRemote = () => {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const match = remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i)
    if (!match) return { owner: '', repo: '' }
    return { owner: match[1], repo: match[2] }
  } catch {
    return { owner: '', repo: '' }
  }
}

const detectVercelLink = () => {
  const projectPath = '.vercel/project.json'
  if (!existsSync(projectPath)) {
    return { projectId: '', orgId: '', projectName: '' }
  }

  try {
    const payload = JSON.parse(readFileSync(projectPath, 'utf-8'))
    return {
      projectId: String(payload?.projectId || ''),
      orgId: String(payload?.orgId || ''),
      projectName: String(payload?.projectName || ''),
    }
  } catch {
    return { projectId: '', orgId: '', projectName: '' }
  }
}

const buildQuery = (params) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  return query.toString()
}

const args = parseArgs()
const gitRemote = detectGitRemote()
const vercelLink = detectVercelLink()
const vercelToken = resolveEnv('VERCEL_TOKEN')
const projectIdOrName = resolveEnv('VERCEL_PROJECT_ID', 'VERCEL_PROJECT_NAME') || vercelLink.projectId || vercelLink.projectName || gitRemote.repo || 'ai-gods-project'
const teamId = resolveEnv('VERCEL_TEAM_ID') || vercelLink.orgId
const githubOwner = resolveEnv('GITHUB_REPO_OWNER', 'VERCEL_GIT_REPO_OWNER') || gitRemote.owner || 'team-muel'
const githubRepo = resolveEnv('GITHUB_REPO_NAME', 'VERCEL_GIT_REPO_SLUG') || gitRemote.repo || 'ai-gods-project'

const runtimeVars = [
  { key: 'GITHUB_REPO_OWNER', value: githubOwner },
  { key: 'GITHUB_REPO_NAME', value: githubRepo },
  { key: 'VERCEL_PROJECT_NAME', value: resolveEnv('VERCEL_PROJECT_NAME') || vercelLink.projectName || projectIdOrName },
  { key: 'VERCEL_PROJECT_ID', value: resolveEnv('VERCEL_PROJECT_ID') || vercelLink.projectId },
  { key: 'VERCEL_TEAM_ID', value: teamId },
  { key: 'GITHUB_TOKEN', value: resolveEnv('GITHUB_TOKEN', 'GH_TOKEN') },
  { key: 'VERCEL_TOKEN', value: vercelToken },
].filter((entry) => entry.value)

if (!projectIdOrName) {
  console.error('VERCEL_PROJECT_ID 또는 VERCEL_PROJECT_NAME 을 찾을 수 없습니다.')
  process.exit(1)
}

const query = buildQuery({ upsert: 'true', teamId })
const endpoint = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/env?${query}`

console.log(`Vercel project: ${projectIdOrName}`)
console.log(`Variables to upsert: ${runtimeVars.map((entry) => entry.key).join(', ')}`)

if (args.dryRun) {
  console.log('Dry run enabled. No remote changes were made.')
  process.exit(0)
}

if (!vercelToken) {
  console.error('VERCEL_TOKEN 이 필요합니다. 이 토큰은 Vercel API 호출과 런타임 조회에 같이 사용됩니다.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${vercelToken}`,
  'Content-Type': 'application/json',
}

for (const entry of runtimeVars) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key: entry.key,
      value: entry.value,
      type: 'plain',
      target: ['production', 'preview', 'development'],
      comment: 'AI Gods operations dashboard runtime variable',
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.error || data?.message || `${response.status} ${response.statusText}`
    console.error(`Failed to upsert ${entry.key}: ${errorMessage}`)
    process.exit(1)
  }

  console.log(`Upserted ${entry.key}`)
}

console.log('Vercel operations dashboard variables are configured.')