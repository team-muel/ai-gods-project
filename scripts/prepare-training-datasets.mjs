import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { buildTrainingSnapshot } from './build-training-snapshots.mjs'
import { isVirtualWarehouseUnavailableError, uploadDatasetArtifact, upsertDatasetVersion } from '../api/_virtualWarehouse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const writeGithubOutputs = async (outputs) => {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) return

  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`)
  await fs.appendFile(outputPath, `${lines.join('\n')}\n`, 'utf-8')
}

const buildSupabaseClient = () => {
  const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseKey) return null

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const countNonEmptyLines = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf-8')
  return content.split(/\r?\n/).filter((line) => line.trim()).length
}

const runPythonScript = (scriptPath, extraEnv) => {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const result = spawnSync(pythonBin, [scriptPath], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  })

  if (result.status !== 0) {
    throw new Error(`${path.basename(scriptPath)} 실행 실패`)
  }
}

const publishDatasetDirectory = async ({ supabase, snapshotId, datasetKind, directoryName, stats }) => {
  const directoryPath = path.join(projectRoot, directoryName)
  let files = []

  try {
    files = await fs.readdir(directoryPath)
  } catch {
    return []
  }

  const published = []
  for (const fileName of files.filter((name) => name.endsWith('.jsonl'))) {
    const godId = path.basename(fileName, '.jsonl')
    const filePath = path.join(directoryPath, fileName)
    const content = await fs.readFile(filePath)
    const sampleCount = await countNonEmptyLines(filePath)

    const uploadResult = await uploadDatasetArtifact({
      supabase,
      snapshotId,
      datasetKind,
      godId,
      fileName,
      content,
      contentType: 'application/x-ndjson',
    })

    if (!uploadResult.ok) {
      if (!isVirtualWarehouseUnavailableError(uploadResult.error)) {
        console.warn(`[prepare-training-datasets] ${datasetKind}/${godId} upload 경고:`, uploadResult.error?.message || uploadResult.error)
      }
      continue
    }

    const registerResult = await upsertDatasetVersion({
      supabase,
      snapshotId,
      datasetKind,
      godId,
      bucketName: uploadResult.bucketName,
      objectPath: uploadResult.objectPath,
      fileFormat: 'jsonl',
      sampleCount,
      sourceDebateCount: stats.totalDebates,
      sourceArchiveCount: stats.archivedDebates,
      metadata: {
        localPath: path.relative(projectRoot, filePath),
      },
    })

    if (!registerResult.ok && !isVirtualWarehouseUnavailableError(registerResult.error)) {
      console.warn(`[prepare-training-datasets] dataset_versions 등록 경고:`, registerResult.error?.message || registerResult.error)
    }

    published.push({ godId, datasetKind, sampleCount, objectPath: uploadResult.objectPath })
  }

  return published
}

const main = async () => {
  const supabase = buildSupabaseClient()
  const snapshot = await buildTrainingSnapshot({ supabase, writeOutputs: false })

  runPythonScript('scripts/export-training-data.py', {
    WAREHOUSE_SNAPSHOT_FILE: snapshot.snapshotFile,
  })
  runPythonScript('scripts/generate_dpo_data.py', {
    WAREHOUSE_SNAPSHOT_FILE: snapshot.snapshotFile,
  })

  let publishedDatasets = []
  if (supabase) {
    const sftPublished = await publishDatasetDirectory({
      supabase,
      snapshotId: snapshot.snapshotId,
      datasetKind: 'sft',
      directoryName: 'training-data',
      stats: snapshot.stats,
    })
    const dpoPublished = await publishDatasetDirectory({
      supabase,
      snapshotId: snapshot.snapshotId,
      datasetKind: 'dpo',
      directoryName: 'dpo-data',
      stats: snapshot.stats,
    })
    publishedDatasets = [...sftPublished, ...dpoPublished]
  }

  const manifest = {
    snapshotId: snapshot.snapshotId,
    snapshotFile: path.relative(projectRoot, snapshot.snapshotFile),
    stats: snapshot.stats,
    publishedDatasets,
  }

  const outPath = path.join(projectRoot, 'outputs', 'training-datasets-manifest.json')
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

  await writeGithubOutputs({
    snapshot_id: snapshot.snapshotId,
    snapshot_file: path.relative(projectRoot, snapshot.snapshotFile),
    dataset_manifest: path.relative(projectRoot, outPath),
  })

  console.log(JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})