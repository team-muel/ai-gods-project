import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { fetchLiveDebateBundles, getVirtualWarehouseConfig, isVirtualWarehouseUnavailableError, persistDebateArchive } from '../api/_virtualWarehouse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const parseArgs = () => {
  const config = getVirtualWarehouseConfig()
  const args = process.argv.slice(2)
  const parsed = {
    archiveOlderThanDays: config.archiveAfterDays,
    pruneOlderThanDays: config.pruneAfterDays,
    limit: 200,
    out: '',
    dryRun: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--archive-older-than-days') {
      parsed.archiveOlderThanDays = Number.parseInt(args[index + 1] || '', 10) || parsed.archiveOlderThanDays
      index += 1
    } else if (arg === '--prune-older-than-days') {
      parsed.pruneOlderThanDays = Number.parseInt(args[index + 1] || '', 10) || parsed.pruneOlderThanDays
      index += 1
    } else if (arg === '--limit') {
      parsed.limit = Number.parseInt(args[index + 1] || '', 10) || parsed.limit
      index += 1
    } else if (arg === '--out') {
      parsed.out = args[index + 1] || ''
      index += 1
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

const main = async () => {
  const args = parseArgs()
  const supabase = buildSupabaseClient()
  const now = Date.now()
  const archiveBefore = new Date(now - args.archiveOlderThanDays * 24 * 60 * 60 * 1000).toISOString()
  const pruneBefore = new Date(now - args.pruneOlderThanDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: archiveCandidates, error: archiveCandidatesError } = await supabase
    .from('debates')
    .select('id, topic, is_youtube, total_rounds, consensus, created_at')
    .lt('created_at', archiveBefore)
    .order('created_at', { ascending: true })
    .limit(args.limit)

  if (archiveCandidatesError) {
    throw new Error(archiveCandidatesError.message)
  }

  const archiveCandidateIds = (archiveCandidates || []).map((debate) => debate.id)
  let archivedIds = new Set()
  if (archiveCandidateIds.length > 0) {
    const { data: archiveRows, error: archiveRowsError } = await supabase
      .from('debate_archives')
      .select('debate_id')
      .in('debate_id', archiveCandidateIds)

    if (archiveRowsError && !isVirtualWarehouseUnavailableError(archiveRowsError)) {
      throw new Error(archiveRowsError.message)
    }

    archivedIds = new Set((archiveRows || []).map((row) => row.debate_id))
  }

  const missingArchiveIds = archiveCandidateIds.filter((debateId) => !archivedIds.has(debateId))
  let archivedCount = 0
  if (missingArchiveIds.length > 0) {
    const { data: bundles, error: bundlesError } = await fetchLiveDebateBundles(supabase, {
      debateIds: missingArchiveIds,
      limit: missingArchiveIds.length,
    })

    if (bundlesError) {
      throw new Error(bundlesError.message)
    }

    for (const bundle of bundles || []) {
      if (args.dryRun) {
        archivedCount += 1
        continue
      }

      const archiveResult = await persistDebateArchive({
        supabase,
        debateRow: bundle,
        messages: bundle.messages,
        rewardEvents: bundle.reward_events,
        preferencePairs: bundle.preference_pairs,
        source: 'warehouse_maintenance',
      })

      if (archiveResult.ok) {
        archivedCount += 1
      } else if (!isVirtualWarehouseUnavailableError(archiveResult.error)) {
        console.warn('[archive-prune-debates] archive 경고:', archiveResult.error?.message || archiveResult.error)
      }
    }
  }

  const { data: pruneCandidates, error: pruneCandidatesError } = await supabase
    .from('debates')
    .select('id, created_at')
    .lt('created_at', pruneBefore)
    .order('created_at', { ascending: true })
    .limit(args.limit)

  if (pruneCandidatesError) {
    throw new Error(pruneCandidatesError.message)
  }

  const pruneCandidateIds = (pruneCandidates || []).map((debate) => debate.id)
  let prunableArchiveRows = []
  if (pruneCandidateIds.length > 0) {
    const { data, error } = await supabase
      .from('debate_archives')
      .select('debate_id, metadata')
      .in('debate_id', pruneCandidateIds)

    if (error && !isVirtualWarehouseUnavailableError(error)) {
      throw new Error(error.message)
    }
    prunableArchiveRows = data || []
  }

  let prunedMessages = 0
  for (const row of prunableArchiveRows) {
    if (args.dryRun) {
      prunedMessages += 1
      continue
    }

    const { error: deleteError, count } = await supabase
      .from('debate_messages')
      .delete({ count: 'exact' })
      .eq('debate_id', row.debate_id)

    if (deleteError) {
      if (!isVirtualWarehouseUnavailableError(deleteError)) {
        console.warn('[archive-prune-debates] debate_messages 정리 경고:', deleteError.message)
      }
      continue
    }

    prunedMessages += count || 0

    const { error: updateError } = await supabase
      .from('debate_archives')
      .update({
        metadata: {
          ...(row.metadata || {}),
          message_pruned_at: new Date().toISOString(),
          pruned_message_count: count || 0,
        },
      })
      .eq('debate_id', row.debate_id)

    if (updateError && !isVirtualWarehouseUnavailableError(updateError)) {
      console.warn('[archive-prune-debates] archive metadata 갱신 경고:', updateError.message)
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    archiveOlderThanDays: args.archiveOlderThanDays,
    pruneOlderThanDays: args.pruneOlderThanDays,
    dryRun: args.dryRun,
    archiveCandidates: archiveCandidateIds.length,
    archivedCount,
    pruneCandidates: prunableArchiveRows.length,
    prunedMessages,
  }

  if (args.out) {
    const outPath = path.resolve(projectRoot, args.out)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})