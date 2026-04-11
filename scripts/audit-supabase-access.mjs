import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const TABLES = [
  'debates',
  'debate_messages',
  'god_memories',
  'memory_links',
  'neuro_logs',
  'arousal_logs',
  'immune_logs',
  'reward_events',
  'preference_pairs',
  'debate_archives',
  'dataset_versions',
  'training_runs',
  'model_versions',
]

const DEFAULT_OUTPUT = path.join(projectRoot, 'outputs', 'supabase-access-audit.json')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const parseArgs = () => {
  const args = process.argv.slice(2)
  const parsed = { out: DEFAULT_OUTPUT }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--out') {
      const nextValue = args[index + 1] || ''
      parsed.out = nextValue ? path.resolve(projectRoot, nextValue) : parsed.out
      index += 1
    }
  }

  return parsed
}

const buildClient = (key) => createClient(resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL'), key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const safeError = (error) => ({
  code: error?.code || error?.statusCode || null,
  message: error?.message || error?.details || 'unknown error',
})

const checkTable = async (client, tableName) => {
  const { data, count, error } = await client
    .from(tableName)
    .select('id', { count: 'exact' })
    .limit(1)

  if (error) {
    return {
      status: 'blocked',
      ...safeError(error),
    }
  }

  return {
    status: 'readable',
    count: count ?? 0,
    sampleRows: Array.isArray(data) ? data.length : 0,
  }
}

const readDatasetProbe = async () => {
  try {
    const filePath = path.join(projectRoot, 'outputs', 'training-datasets-manifest.json')
    const content = await fs.readFile(filePath, 'utf-8')
    const manifest = JSON.parse(content)
    const sample = Array.isArray(manifest?.publishedDatasets) ? manifest.publishedDatasets[0] : null

    if (!sample?.objectPath) return null

    return {
      bucket: resolveEnv('SUPABASE_DATASET_BUCKET') || 'training-datasets',
      objectPath: sample.objectPath,
    }
  } catch {
    return null
  }
}

const checkDatasetDownload = async (client, probe) => {
  if (!probe) {
    return {
      status: 'skipped',
      reason: 'dataset_probe_missing',
    }
  }

  const { data, error } = await client.storage.from(probe.bucket).download(probe.objectPath)
  if (error) {
    return {
      status: 'blocked',
      bucket: probe.bucket,
      objectPath: probe.objectPath,
      ...safeError(error),
    }
  }

  return {
    status: 'readable',
    bucket: probe.bucket,
    objectPath: probe.objectPath,
    byteSize: data?.size ?? null,
  }
}

const runRoleAudit = async (roleName, key, probe) => {
  const client = buildClient(key)
  const tableEntries = await Promise.all(TABLES.map(async (tableName) => [tableName, await checkTable(client, tableName)]))
  const datasetDownload = await checkDatasetDownload(client, probe)

  const readableTables = tableEntries
    .filter(([, result]) => result.status === 'readable' && (result.count ?? 0) > 0)
    .map(([tableName]) => tableName)

  return {
    role: roleName,
    readableTables,
    tables: Object.fromEntries(tableEntries),
    datasetDownload,
  }
}

const main = async () => {
  const args = parseArgs()
  const anonKey = resolveEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const serviceRoleKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY')
  const datasetProbe = await readDatasetProbe()

  if (!resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL') || !anonKey) {
    throw new Error('SUPABASE_URL 과 SUPABASE_ANON_KEY 가 필요합니다.')
  }

  const anonAudit = await runRoleAudit('anon', anonKey, datasetProbe)
  const serviceAudit = serviceRoleKey
    ? await runRoleAudit('service_role', serviceRoleKey, datasetProbe)
    : {
        role: 'service_role',
        skipped: true,
        reason: 'service_role_key_missing',
      }

  const report = {
    generatedAt: new Date().toISOString(),
    datasetProbe,
    verdict: {
      anonTableReadSafe: anonAudit.readableTables.length === 0,
      anonDatasetDownloadSafe: anonAudit.datasetDownload.status !== 'readable',
    },
    anon: anonAudit,
    serviceRole: serviceAudit,
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true })
  await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})