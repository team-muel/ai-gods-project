import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { listArchiveStorageObjects } from '../api/_virtualWarehouse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const TABLES = ['debate_archives', 'dataset_versions', 'training_runs', 'model_versions']
const DEFAULT_OUTPUT = path.join(projectRoot, 'outputs', 'warehouse-status.json')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const parseArgs = () => {
  const args = process.argv.slice(2)
  const parsed = {
    out: DEFAULT_OUTPUT,
  }

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

const textFromError = (error) => [error?.message, error?.details, error?.hint]
  .filter(Boolean)
  .join(' ')
  .toLowerCase()

const classifyError = (error, { kind = 'resource', name = '' } = {}) => {
  const code = String(error?.code || '').toUpperCase()
  const text = textFromError(error)
  const base = {
    message: error?.message || error?.details || error?.hint || `${kind} 확인 실패`,
  }

  const permissionRelated = [
    code === '42501',
    text.includes('permission denied'),
    text.includes('not authorized'),
    text.includes('unauthorized'),
    text.includes('row-level security'),
    text.includes('jwt'),
    text.includes('access denied'),
  ].some(Boolean)

  if (kind === 'table') {
    const missingTable = [
      code === '42P01',
      code === 'PGRST205',
      text.includes('does not exist'),
      text.includes('could not find the table'),
      text.includes('schema cache'),
      name && text.includes(name),
    ].some(Boolean)

    if (missingTable && !permissionRelated) {
      return {
        status: 'missing',
        reason: 'table_missing',
        ...base,
      }
    }
  }

  if (kind === 'bucket') {
    const missingBucket = [
      text.includes('bucket not found'),
      text.includes('the resource was not found'),
      text.includes('not found'),
    ].some(Boolean)

    if (missingBucket && !permissionRelated) {
      return {
        status: 'missing',
        reason: 'bucket_missing',
        ...base,
      }
    }
  }

  if (permissionRelated) {
    return {
      status: 'blocked',
      reason: 'permission_denied',
      ...base,
    }
  }

  return {
    status: 'error',
    reason: 'unknown_error',
    ...base,
  }
}

const rollupStatuses = (entries) => {
  const statuses = entries.map((entry) => entry?.status || 'unknown')

  if (statuses.length === 0) return 'unknown'
  if (statuses.every((status) => status === 'ok')) return 'ready'
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('missing')) return 'missing'
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('skipped')) return 'skipped'
  return 'partial'
}

const buildSupabaseClient = () => {
  const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = resolveEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const supabaseKey = serviceRoleKey || anonKey

  if (!supabaseUrl || !supabaseKey) return null

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const checkTable = async (supabase, tableName) => {
  if (!supabase) {
    return {
      status: 'skipped',
      reason: 'client_unavailable',
      message: 'Supabase 클라이언트를 만들 수 없습니다.',
    }
  }

  const { count, error } = await supabase
    .from(tableName)
    .select('id', { head: true, count: 'exact' })

  if (error) {
    return classifyError(error, { kind: 'table', name: tableName })
  }

  return {
    status: 'ok',
    count: count ?? 0,
  }
}

const checkBucket = async (supabase, bucketName) => {
  if (!supabase) {
    return {
      status: 'skipped',
      reason: 'client_unavailable',
      message: 'Supabase 클라이언트를 만들 수 없습니다.',
    }
  }

  if (typeof supabase.storage.getBucket === 'function') {
    const { data, error } = await supabase.storage.getBucket(bucketName)
    if (error) {
      return classifyError(error, { kind: 'bucket', name: bucketName })
    }

    return {
      status: 'ok',
      public: Boolean(data?.public),
      fileSizeLimit: data?.file_size_limit ?? null,
    }
  }

  const { data, error } = await supabase.storage.from(bucketName).list('', { limit: 1 })
  if (error) {
    return classifyError(error, { kind: 'bucket', name: bucketName })
  }

  return {
    status: 'ok',
    sampleObjects: Array.isArray(data) ? data.length : 0,
  }
}

const countArchiveObjects = async (supabase, bucketName) => {
  if (!supabase) return null

  try {
    const rows = await listArchiveStorageObjects({ supabase, maxItems: 2000 })
    return rows.filter((row) => row.bucket_name === bucketName).length
  } catch {
    return null
  }
}

const readJsonIfExists = async (relativePath) => {
  const filePath = path.join(projectRoot, relativePath)

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return {
      exists: true,
      path: relativePath,
      data: JSON.parse(content),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        path: relativePath,
        data: null,
      }
    }

    throw error
  }
}

const main = async () => {
  const args = parseArgs()
  const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = resolveEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const dbUrl = resolveEnv('SUPABASE_DB_URL')
  const dbPassword = resolveEnv('SUPABASE_DB_PASSWORD')
  const archiveBucket = resolveEnv('SUPABASE_ARCHIVE_BUCKET') || 'debate-archives'
  const datasetBucket = resolveEnv('SUPABASE_DATASET_BUCKET') || 'training-datasets'
  const supabase = buildSupabaseClient()

  const [tableEntries, archiveBucketStatus, datasetBucketStatus, latestSnapshot, datasetManifest, archiveObjectCount] = await Promise.all([
    Promise.all(TABLES.map(async (tableName) => [tableName, await checkTable(supabase, tableName)])),
    checkBucket(supabase, archiveBucket),
    checkBucket(supabase, datasetBucket),
    readJsonIfExists(path.join('warehouse', 'latest-snapshot.json')),
    readJsonIfExists(path.join('outputs', 'training-datasets-manifest.json')),
    countArchiveObjects(supabase, archiveBucket),
  ])

  const tables = Object.fromEntries(tableEntries)
  const buckets = {
    [archiveBucket]: archiveBucketStatus,
    [datasetBucket]: datasetBucketStatus,
  }

  const schemaStatus = rollupStatuses(Object.values(tables))
  const storageStatus = rollupStatuses(Object.values(buckets))
  const credentialMode = serviceRoleKey ? 'service_role' : anonKey ? 'anon' : 'none'
  const canApplyMigrationNow = Boolean(dbUrl || dbPassword)

  const recommendations = []
  if (!canApplyMigrationNow) {
    recommendations.push('SUPABASE_DB_URL 또는 SUPABASE_DB_PASSWORD를 .env에 넣어야 npm run apply-rls 로 가상창고 SQL을 실제 DB에 적용할 수 있습니다.')
  }
  if (!serviceRoleKey) {
    recommendations.push('SUPABASE_SERVICE_ROLE_KEY가 없어서 archive/dataset registry 쓰기 권한을 완전하게 검증할 수 없습니다.')
  }
  if (schemaStatus === 'ready' && storageStatus === 'missing') {
    recommendations.push('원격 테이블은 이미 존재하지만 debate-archives 와 training-datasets storage bucket 이 아직 없어 archive upload 와 dataset publish 가 막혀 있습니다.')
  } else if (schemaStatus === 'missing' || storageStatus === 'missing') {
    recommendations.push('db/supabase_add_virtual_warehouse.sql 이 아직 실제 Supabase 프로젝트에 적용되지 않았을 가능성이 높습니다.')
  }
  if (storageStatus === 'missing' && credentialMode === 'anon') {
    recommendations.push('현재 anon 키로는 bucket 생성이 403으로 막히므로, SUPABASE_SERVICE_ROLE_KEY 또는 DB 접속 정보가 있어야 storage bucket 을 만들 수 있습니다.')
  }
  if (schemaStatus === 'ready' && storageStatus === 'ready' && !serviceRoleKey) {
    recommendations.push('버킷이 준비돼도 private storage 에 원문을 쓰려면 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. anon 키만으로는 원격 archive upload 가 계속 실패할 수 있습니다.')
  }
  if (serviceRoleKey) {
    recommendations.push('service role 이 준비되면 npm run warehouse:activate 로 bucket 보정, 기존 debate backfill, snapshot/dataset 재생성까지 한 번에 수행할 수 있습니다.')
  }
  if (latestSnapshot.exists && datasetManifest.exists) {
    recommendations.push('로컬 snapshot 및 dataset 준비는 이미 동작 중이므로, 원격 스키마만 적용되면 archive row와 dataset registry까지 이어서 검증할 수 있습니다.')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    env: {
      credentialMode,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasDbUrl: Boolean(dbUrl),
      hasDbPassword: Boolean(dbPassword),
      canApplyMigrationNow,
      hasPythonBin: Boolean(resolveEnv('PYTHON_BIN')),
      archiveBucket,
      datasetBucket,
    },
    remote: {
      schemaStatus,
      storageStatus,
      tables,
      buckets,
      archiveObjectCount,
    },
    local: {
      latestSnapshot: latestSnapshot.exists
        ? {
            exists: true,
            path: latestSnapshot.path,
            snapshotId: latestSnapshot.data?.snapshotId || '',
            totalDebates: latestSnapshot.data?.stats?.totalDebates ?? 0,
            archivedDebates: latestSnapshot.data?.stats?.archivedDebates ?? 0,
            liveDebates: latestSnapshot.data?.stats?.liveDebates ?? 0,
          }
        : {
            exists: false,
            path: latestSnapshot.path,
          },
      datasetManifest: datasetManifest.exists
        ? {
            exists: true,
            path: datasetManifest.path,
            snapshotId: datasetManifest.data?.snapshotId || '',
            publishedDatasetCount: Array.isArray(datasetManifest.data?.publishedDatasets)
              ? datasetManifest.data.publishedDatasets.length
              : 0,
          }
        : {
            exists: false,
            path: datasetManifest.path,
          },
    },
    recommendations,
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true })
  await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})