import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  downloadArchiveDocument,
  fetchLiveDebateBundles,
  getVirtualWarehouseConfig,
  isVirtualWarehouseUnavailableError,
  listArchiveStorageObjects,
  normalizeArchivedDebate,
  uploadDatasetArtifact,
  upsertDatasetVersion,
} from '../api/_virtualWarehouse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const parseArgs = () => {
  const args = process.argv.slice(2)
  const parsed = {
    snapshotId: '',
    out: '',
    maxArchives: 500,
    includeLiveDays: null,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--snapshot-id') {
      parsed.snapshotId = args[index + 1] || ''
      index += 1
    } else if (arg === '--out') {
      parsed.out = args[index + 1] || ''
      index += 1
    } else if (arg === '--max-archives') {
      parsed.maxArchives = Number.parseInt(args[index + 1] || '', 10) || parsed.maxArchives
      index += 1
    } else if (arg === '--include-live-days') {
      const parsedDays = Number.parseInt(args[index + 1] || '', 10)
      parsed.includeLiveDays = Number.isNaN(parsedDays) ? null : parsedDays
      index += 1
    }
  }

  return parsed
}

const buildSupabaseClient = () => {
  const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY 가 필요합니다.')
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const buildSnapshotId = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

const writeGithubOutputs = (outputs) => {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) return

  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`)
  return fs.appendFile(outputPath, `${lines.join('\n')}\n`, 'utf-8')
}

export const buildTrainingSnapshot = async ({
  snapshotId = '',
  outFile = '',
  maxArchives = 500,
  includeLiveDays = null,
  supabase = null,
  writeOutputs = true,
} = {}) => {
  const client = supabase || buildSupabaseClient()
  const config = getVirtualWarehouseConfig()
  const effectiveSnapshotId = snapshotId || buildSnapshotId()
  const effectiveLiveDays = includeLiveDays ?? config.includeLiveDays
  const snapshotDir = path.join(projectRoot, 'warehouse', 'snapshots', effectiveSnapshotId)
  const snapshotFile = outFile
    ? path.resolve(projectRoot, outFile)
    : path.join(snapshotDir, 'snapshot.json')
  const latestSnapshotFile = path.join(projectRoot, 'warehouse', 'latest-snapshot.json')

  let archiveRows = []
  let archivedDebates = []

  const { data: storedArchiveRows, error: archiveRowsError } = await client
    .from('debate_archives')
    .select('debate_id, bucket_name, object_path, archived_at, source, metadata')
    .order('archived_at', { ascending: false })
    .limit(maxArchives)

  if (archiveRowsError) {
    if (!isVirtualWarehouseUnavailableError(archiveRowsError)) {
      throw new Error(archiveRowsError.message)
    }
  } else {
    archiveRows = storedArchiveRows || []
    for (const row of archiveRows) {
      try {
        const document = await downloadArchiveDocument({
          supabase: client,
          bucketName: row.bucket_name,
          objectPath: row.object_path,
        })
        archivedDebates.push(normalizeArchivedDebate(document))
      } catch (error) {
        console.warn('[warehouse snapshot] archive download 경고:', error.message || error)
      }
    }
  }

  if (archivedDebates.length === 0) {
    try {
      const storageArchiveRows = await listArchiveStorageObjects({
        supabase: client,
        maxItems: maxArchives,
      })

      archiveRows = storageArchiveRows
      for (const row of storageArchiveRows) {
        try {
          const document = await downloadArchiveDocument({
            supabase: client,
            bucketName: row.bucket_name,
            objectPath: row.object_path,
          })
          archivedDebates.push(normalizeArchivedDebate(document))
        } catch (error) {
          console.warn('[warehouse snapshot] storage fallback archive download 경고:', error.message || error)
        }
      }
    } catch (error) {
      if (!isVirtualWarehouseUnavailableError(error)) {
        console.warn('[warehouse snapshot] storage fallback 목록 경고:', error.message || error)
      }
    }
  }

  const archivedIds = new Set(archivedDebates.map((debate) => debate.id))
  const liveSince = new Date(Date.now() - effectiveLiveDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: liveBundles, error: liveError } = await fetchLiveDebateBundles(client, {
    createdSince: liveSince,
    limit: Math.max(maxArchives, 250),
  })

  if (liveError) {
    throw new Error(liveError.message)
  }

  const liveDebates = (liveBundles || []).filter((debate) => !archivedIds.has(debate.id))
  const debates = [...archivedDebates, ...liveDebates]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())

  const manifest = {
    snapshotId: effectiveSnapshotId,
    generatedAt: new Date().toISOString(),
    stats: {
      totalDebates: debates.length,
      archivedDebates: archivedDebates.length,
      liveDebates: liveDebates.length,
      sourceArchiveRows: archiveRows.length,
      includeLiveDays: effectiveLiveDays,
    },
    debates,
  }

  await fs.mkdir(path.dirname(snapshotFile), { recursive: true })
  await fs.mkdir(path.dirname(latestSnapshotFile), { recursive: true })
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`
  await fs.writeFile(snapshotFile, serialized, 'utf-8')
  await fs.writeFile(latestSnapshotFile, serialized, 'utf-8')

  const uploadResult = await uploadDatasetArtifact({
    supabase: client,
    snapshotId: effectiveSnapshotId,
    datasetKind: 'warehouse_snapshot',
    godId: 'all',
    fileName: 'snapshot.json',
    content: serialized,
    contentType: 'application/json',
  })

  if (uploadResult.ok) {
    const registerResult = await upsertDatasetVersion({
      supabase: client,
      snapshotId: effectiveSnapshotId,
      datasetKind: 'warehouse_snapshot',
      godId: 'all',
      bucketName: uploadResult.bucketName,
      objectPath: uploadResult.objectPath,
      fileFormat: 'json',
      sampleCount: debates.length,
      sourceDebateCount: debates.length,
      sourceArchiveCount: archivedDebates.length,
      metadata: {
        liveDebates: liveDebates.length,
        localSnapshotFile: path.relative(projectRoot, snapshotFile),
      },
    })

    if (!registerResult.ok && !isVirtualWarehouseUnavailableError(registerResult.error)) {
      console.warn('[warehouse snapshot] dataset_versions 등록 경고:', registerResult.error?.message || registerResult.error)
    }
  } else if (!isVirtualWarehouseUnavailableError(uploadResult.error)) {
    console.warn('[warehouse snapshot] snapshot upload 경고:', uploadResult.error?.message || uploadResult.error)
  }

  if (writeOutputs) {
    await writeGithubOutputs({
      snapshot_id: effectiveSnapshotId,
      snapshot_file: path.relative(projectRoot, snapshotFile),
    })
  }

  return {
    snapshotId: effectiveSnapshotId,
    snapshotFile,
    latestSnapshotFile,
    stats: manifest.stats,
  }
}

const main = async () => {
  const args = parseArgs()
  const result = await buildTrainingSnapshot({
    snapshotId: args.snapshotId,
    outFile: args.out,
    maxArchives: args.maxArchives,
    includeLiveDays: args.includeLiveDays,
  })

  console.log(JSON.stringify({
    snapshotId: result.snapshotId,
    snapshotFile: path.relative(projectRoot, result.snapshotFile),
    stats: result.stats,
  }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}