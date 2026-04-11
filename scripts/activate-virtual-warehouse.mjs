import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { ensureVirtualWarehouseStorage, fetchLiveDebateBundles, isVirtualWarehouseUnavailableError, persistDebateArchive } from '../api/_virtualWarehouse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const parseArgs = () => {
  const args = process.argv.slice(2)
  const parsed = {
    batchSize: 100,
    maxBatches: 20,
    skipPrepare: false,
    dryRun: false,
    out: path.join(projectRoot, 'outputs', 'warehouse-activation.json'),
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--batch-size') {
      parsed.batchSize = Number.parseInt(args[index + 1] || '', 10) || parsed.batchSize
      index += 1
    } else if (arg === '--max-batches') {
      parsed.maxBatches = Number.parseInt(args[index + 1] || '', 10) || parsed.maxBatches
      index += 1
    } else if (arg === '--out') {
      const nextValue = args[index + 1] || ''
      parsed.out = nextValue ? path.resolve(projectRoot, nextValue) : parsed.out
      index += 1
    } else if (arg === '--skip-prepare') {
      parsed.skipPrepare = true
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
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

const runPrepareDatasets = () => {
  const nodeBin = process.execPath
  const result = spawnSync(nodeBin, ['--env-file=.env', 'scripts/prepare-training-datasets.mjs'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error('prepare-training-datasets.mjs 실행 실패')
  }
}

const main = async () => {
  const args = parseArgs()
  const supabase = buildSupabaseClient()
  const storage = await ensureVirtualWarehouseStorage({ supabase })

  if (!storage.ok && !args.dryRun) {
    const archiveError = storage.archives?.error?.message || storage.archives?.error || ''
    const datasetError = storage.datasets?.error?.message || storage.datasets?.error || ''
    throw new Error(`가상창고 storage 준비 실패: archives=${archiveError || 'ok'}, datasets=${datasetError || 'ok'}`)
  }

  let offset = 0
  let processedBatches = 0
  let totalDebates = 0
  let alreadyArchived = 0
  let archivedCount = 0
  let failedCount = 0
  const failures = []

  while (processedBatches < args.maxBatches) {
    const { data: debates, error: debateError } = await supabase
      .from('debates')
      .select('id, topic, is_youtube, total_rounds, consensus, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + args.batchSize - 1)

    if (debateError) {
      throw new Error(debateError.message)
    }

    if (!debates?.length) {
      break
    }

    processedBatches += 1
    totalDebates += debates.length
    offset += debates.length

    const debateIds = debates.map((debate) => debate.id)
    let archivedIds = new Set()
    const { data: archiveRows, error: archiveError } = await supabase
      .from('debate_archives')
      .select('debate_id')
      .in('debate_id', debateIds)

    if (archiveError && !isVirtualWarehouseUnavailableError(archiveError)) {
      throw new Error(archiveError.message)
    }
    archivedIds = new Set((archiveRows || []).map((row) => row.debate_id))
    alreadyArchived += archivedIds.size

    const missingIds = debateIds.filter((debateId) => !archivedIds.has(debateId))
    if (missingIds.length === 0) {
      continue
    }

    const { data: bundles, error: bundleError } = await fetchLiveDebateBundles(supabase, {
      debateIds: missingIds,
      limit: missingIds.length,
    })

    if (bundleError) {
      throw new Error(bundleError.message)
    }

    for (const bundle of bundles || []) {
      if (args.dryRun) {
        archivedCount += 1
        continue
      }

      const result = await persistDebateArchive({
        supabase,
        debateRow: bundle,
        messages: bundle.messages,
        rewardEvents: bundle.reward_events,
        preferencePairs: bundle.preference_pairs,
        source: 'warehouse_activation_backfill',
      })

      if (result.ok) {
        archivedCount += 1
        continue
      }

      failedCount += 1
      if (failures.length < 10) {
        failures.push({
          debateId: bundle.id,
          stage: result.stage || 'archive',
          message: result.error?.message || String(result.error || 'archive failed'),
        })
      }
    }
  }

  let prepareStatus = 'skipped'
  if (!args.dryRun && !args.skipPrepare) {
    runPrepareDatasets()
    prepareStatus = 'completed'
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    batchSize: args.batchSize,
    maxBatches: args.maxBatches,
    storage: {
      ok: storage.ok,
      archives: {
        ok: Boolean(storage.archives?.ok),
        created: Boolean(storage.archives?.created),
        message: storage.archives?.error?.message || '',
      },
      datasets: {
        ok: Boolean(storage.datasets?.ok),
        created: Boolean(storage.datasets?.created),
        message: storage.datasets?.error?.message || '',
      },
    },
    totals: {
      processedBatches,
      totalDebates,
      alreadyArchived,
      archivedCount,
      failedCount,
    },
    prepareStatus,
    failures,
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true })
  await fs.writeFile(args.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})