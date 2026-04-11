import crypto from 'crypto'
import { gzipSync, gunzipSync } from 'zlib'
import { buildRewardLearningArtifacts } from '../src/lib/rewardLearning.js'

const DEFAULT_ARCHIVES_BUCKET = 'debate-archives'
const DEFAULT_DATASETS_BUCKET = 'training-datasets'
const DEFAULT_BUCKET_FILE_SIZE_LIMIT = 1073741824
const ARCHIVE_STORAGE_ROOT = 'debates'

const ensuredBuckets = new Map()

const buildBucketSpecs = () => {
  const config = getVirtualWarehouseConfig()
  return new Map([
    [config.archivesBucket, {
      public: false,
      fileSizeLimit: config.archiveBucketFileSizeLimit,
      allowedMimeTypes: ['application/gzip', 'application/json'],
    }],
    [config.datasetsBucket, {
      public: false,
      fileSizeLimit: config.datasetBucketFileSizeLimit,
      allowedMimeTypes: ['application/json', 'application/x-ndjson', 'application/jsonl'],
    }],
  ])
}

const parseIntegerEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const textFromError = (error) => [error?.message, error?.details, error?.hint]
  .filter(Boolean)
  .join(' ')
  .toLowerCase()

const isStorageBucketMissingError = (error) => {
  const statusCode = String(error?.statusCode || '')
  const text = textFromError(error)
  return [
    statusCode === '404',
    text.includes('bucket not found'),
    text.includes('storage bucket') && text.includes('not found'),
    text.includes('the resource was not found'),
  ].some(Boolean)
}

const isStorageBucketAlreadyExistsError = (error) => {
  const statusCode = String(error?.statusCode || '')
  const text = textFromError(error)
  return [
    statusCode === '409',
    text.includes('already exists'),
    text.includes('duplicate key'),
    text.includes('duplicate'),
  ].some(Boolean)
}

const resolveBucketSpec = (bucketName) => buildBucketSpecs().get(bucketName) || null

const groupRowsByDebate = (rows, field = 'debate_id') => {
  const grouped = new Map()
  for (const row of rows || []) {
    const debateId = row?.[field]
    if (!debateId) continue
    if (!grouped.has(debateId)) grouped.set(debateId, [])
    grouped.get(debateId).push(row)
  }
  return grouped
}

const buildGodArchiveStats = (messages) => {
  const stats = {}
  for (const message of messages) {
    if (!message?.god_id) continue
    if (!stats[message.god_id]) {
      stats[message.god_id] = {
        god_name: message.god_name || message.god_id,
        message_count: 0,
        total_characters: 0,
        last_active: message.created_at || null,
      }
    }

    stats[message.god_id].message_count += 1
    stats[message.god_id].total_characters += String(message.content || '').length
    if (message.created_at && (!stats[message.god_id].last_active || message.created_at > stats[message.god_id].last_active)) {
      stats[message.god_id].last_active = message.created_at
    }
  }

  return stats
}

const normalizeDebateMessage = (message, fallbackCreatedAt = '') => ({
  god_id: String(message?.god_id || message?.godId || '').trim(),
  god_name: String(message?.god_name || message?.god || message?.godId || message?.god_id || '').trim(),
  round: Math.max(1, Number(message?.round) || 1),
  content: String(message?.content || ''),
  created_at: String(message?.created_at || message?.createdAt || fallbackCreatedAt || '').trim(),
})

const normalizeRewardEvent = (row) => ({
  debate_id: row?.debate_id || null,
  god_id: row?.god_id || null,
  event_type: String(row?.event_type || ''),
  reward_score: Number(row?.reward_score || 0),
  reward_label: row?.reward_label || null,
  source: String(row?.source || 'system'),
  metadata: row?.metadata || {},
  created_at: row?.created_at || null,
})

const normalizePreferencePair = (row) => ({
  debate_id: row?.debate_id || null,
  god_id: String(row?.god_id || ''),
  topic: String(row?.topic || ''),
  prompt: String(row?.prompt || ''),
  chosen: String(row?.chosen || ''),
  rejected: String(row?.rejected || ''),
  chosen_round: Number.isFinite(Number(row?.chosen_round)) ? Number(row.chosen_round) : null,
  rejected_round: Number.isFinite(Number(row?.rejected_round)) ? Number(row.rejected_round) : null,
  reward_score: Number(row?.reward_score || 0),
  status: String(row?.status || 'ready'),
  source: String(row?.source || 'auto_debate_reward'),
  metadata: row?.metadata || {},
  created_at: row?.created_at || null,
})

export const getVirtualWarehouseConfig = () => ({
  archivesBucket: process.env.SUPABASE_ARCHIVE_BUCKET || DEFAULT_ARCHIVES_BUCKET,
  datasetsBucket: process.env.SUPABASE_DATASET_BUCKET || DEFAULT_DATASETS_BUCKET,
  archiveBucketFileSizeLimit: parseIntegerEnv('SUPABASE_ARCHIVE_BUCKET_FILE_SIZE_LIMIT_BYTES', DEFAULT_BUCKET_FILE_SIZE_LIMIT),
  datasetBucketFileSizeLimit: parseIntegerEnv('SUPABASE_DATASET_BUCKET_FILE_SIZE_LIMIT_BYTES', DEFAULT_BUCKET_FILE_SIZE_LIMIT),
  archiveAfterDays: parseIntegerEnv('WAREHOUSE_ARCHIVE_AFTER_DAYS', 3),
  pruneAfterDays: parseIntegerEnv('WAREHOUSE_PRUNE_AFTER_DAYS', 30),
  includeLiveDays: parseIntegerEnv('WAREHOUSE_INCLUDE_LIVE_DAYS', 7),
})

export const isVirtualWarehouseUnavailableError = (error) => {
  const code = String(error?.code || '').toUpperCase()
  const text = textFromError(error)

  return [
    code === '42P01',
    code === 'PGRST205',
    text.includes('debate_archives'),
    text.includes('dataset_versions'),
    text.includes('training_runs'),
    text.includes('model_versions'),
    text.includes('bucket not found'),
    text.includes('storage bucket'),
    text.includes('row-level security policy'),
    text.includes('permission denied'),
  ].some(Boolean)
}

export const ensureStorageBucket = async ({ supabase, bucketName }) => {
  if (!supabase || !bucketName) {
    return {
      ok: false,
      bucketName,
      error: new Error('supabase 와 bucketName 이 필요합니다.'),
    }
  }

  const cached = ensuredBuckets.get(bucketName)
  if (cached?.ok) {
    return { ...cached, cached: true }
  }

  const bucketSpec = resolveBucketSpec(bucketName)
  if (typeof supabase.storage.getBucket === 'function') {
    const { data, error } = await supabase.storage.getBucket(bucketName)
    if (!error) {
      if (bucketSpec && typeof supabase.storage.updateBucket === 'function') {
        const currentFileSizeLimit = Number(data?.file_size_limit || 0)
        const currentPublic = Boolean(data?.public)
        const needsUpdate = currentFileSizeLimit !== Number(bucketSpec.fileSizeLimit || 0) || currentPublic !== Boolean(bucketSpec.public)

        if (needsUpdate) {
          const { data: updatedData, error: updateError } = await supabase.storage.updateBucket(bucketName, bucketSpec)
          if (updateError) {
            return { ok: false, bucketName, error: updateError }
          }

          const result = { ok: true, bucketName, created: false, updated: true, data: updatedData }
          ensuredBuckets.set(bucketName, result)
          return result
        }
      }

      const result = { ok: true, bucketName, created: false, data }
      ensuredBuckets.set(bucketName, result)
      return result
    }

    if (!isStorageBucketMissingError(error)) {
      return { ok: false, bucketName, error }
    }
  }

  if (typeof supabase.storage.createBucket !== 'function') {
    return {
      ok: false,
      bucketName,
      error: new Error('현재 Supabase 클라이언트는 createBucket 을 지원하지 않습니다.'),
    }
  }

  const { data, error } = await supabase.storage.createBucket(bucketName, bucketSpec || { public: false })
  if (error && !isStorageBucketAlreadyExistsError(error)) {
    return { ok: false, bucketName, error }
  }

  const result = {
    ok: true,
    bucketName,
    created: !error,
    data,
  }
  ensuredBuckets.set(bucketName, result)
  return result
}

export const ensureVirtualWarehouseStorage = async ({ supabase }) => {
  const config = getVirtualWarehouseConfig()
  const archives = await ensureStorageBucket({ supabase, bucketName: config.archivesBucket })
  const datasets = await ensureStorageBucket({ supabase, bucketName: config.datasetsBucket })

  return {
    ok: archives.ok && datasets.ok,
    archives,
    datasets,
  }
}

const uploadStorageObjectWithRecovery = async ({ supabase, bucketName, objectPath, body, options }) => {
  let uploadResult = await supabase
    .storage
    .from(bucketName)
    .upload(objectPath, body, options)

  if (!uploadResult.error) {
    return { ok: true, bucketName, objectPath, data: uploadResult.data, bucketCreated: false }
  }

  if (!isStorageBucketMissingError(uploadResult.error)) {
    return { ok: false, bucketName, objectPath, stage: 'upload', error: uploadResult.error }
  }

  const ensureResult = await ensureStorageBucket({ supabase, bucketName })
  if (!ensureResult.ok) {
    return { ok: false, bucketName, objectPath, stage: 'ensure_bucket', error: ensureResult.error }
  }

  uploadResult = await supabase
    .storage
    .from(bucketName)
    .upload(objectPath, body, options)

  if (uploadResult.error) {
    return { ok: false, bucketName, objectPath, stage: 'upload', error: uploadResult.error }
  }

  return {
    ok: true,
    bucketName,
    objectPath,
    data: uploadResult.data,
    bucketCreated: Boolean(ensureResult.created),
  }
}

export const buildArchiveObjectPath = (debateId, createdAt) => {
  const date = new Date(createdAt || Date.now())
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${ARCHIVE_STORAGE_ROOT}/${year}/${month}/${day}/${debateId}.json.gz`
}

export const listStorageObjectsRecursive = async ({
  supabase,
  bucketName,
  prefix = '',
  maxItems = 1000,
  maxDepth = 8,
}) => {
  const results = []

  const visit = async (currentPrefix, depth) => {
    if (results.length >= maxItems || depth > maxDepth) return

    const { data, error } = await supabase.storage.from(bucketName).list(currentPrefix, {
      limit: Math.min(100, maxItems - results.length),
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw error
    }

    for (const entry of data || []) {
      if (results.length >= maxItems) break

      const nextPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name
      const isFolder = entry.id === null

      if (isFolder) {
        await visit(nextPath, depth + 1)
        continue
      }

      results.push({
        name: entry.name,
        path: nextPath,
        metadata: entry.metadata || {},
        updated_at: entry.updated_at || null,
      })
    }
  }

  await visit(prefix, 0)
  return results
}

export const listArchiveStorageObjects = async ({ supabase, maxItems = 500 } = {}) => {
  const config = getVirtualWarehouseConfig()
  const entries = await listStorageObjectsRecursive({
    supabase,
    bucketName: config.archivesBucket,
    prefix: ARCHIVE_STORAGE_ROOT,
    maxItems,
  })

  return entries
    .filter((entry) => entry.path.endsWith('.json.gz') || entry.path.endsWith('.json'))
    .map((entry) => ({
      debate_id: entry.name.replace(/\.json(\.gz)?$/i, ''),
      bucket_name: config.archivesBucket,
      object_path: entry.path,
      archived_at: entry.updated_at || null,
      source: 'storage_listing_fallback',
      metadata: {},
    }))
}

export const buildDebateArchivePayload = ({
  debateRow,
  messages,
  rewardEvents = [],
  preferencePairs = [],
  source = 'system',
  archivedAt = new Date().toISOString(),
}) => {
  const fallbackCreatedAt = debateRow?.created_at || archivedAt
  const normalizedMessages = (Array.isArray(messages) ? messages : [])
    .map((message) => normalizeDebateMessage(message, fallbackCreatedAt))
    .filter((message) => message.god_id && message.content)

  const latestMessageByGod = new Map()
  for (const message of normalizedMessages) {
    latestMessageByGod.set(message.god_id, message)
  }

  return {
    schema_version: 1,
    archived_at: archivedAt,
    source,
    debate: {
      id: debateRow?.id || null,
      topic: String(debateRow?.topic || ''),
      is_youtube: Boolean(debateRow?.is_youtube),
      total_rounds: Math.max(1, Number(debateRow?.total_rounds) || 1),
      consensus: String(debateRow?.consensus || ''),
      created_at: fallbackCreatedAt,
    },
    messages: normalizedMessages,
    latest_messages_by_god: Array.from(latestMessageByGod.values()).map((message) => ({
      god_id: message.god_id,
      god_name: message.god_name,
      topic: String(debateRow?.topic || ''),
      my_opinion: message.content.slice(0, 600),
      consensus: String(debateRow?.consensus || '').slice(0, 400),
      created_at: fallbackCreatedAt,
    })),
    reward_events: (rewardEvents || []).map(normalizeRewardEvent),
    preference_pairs: (preferencePairs || []).map(normalizePreferencePair),
  }
}

export const normalizeArchivedDebate = (document) => {
  const debate = document?.debate || {}
  return {
    id: debate.id || document?.debate_id || null,
    topic: String(debate.topic || document?.topic || ''),
    is_youtube: Boolean(debate.is_youtube || document?.is_youtube),
    total_rounds: Math.max(1, Number(debate.total_rounds || document?.total_rounds) || 1),
    consensus: String(debate.consensus || document?.consensus || ''),
    created_at: String(debate.created_at || document?.created_at || document?.archived_at || '').trim(),
    messages: (document?.messages || []).map((message) => normalizeDebateMessage(message, debate.created_at || document?.created_at || '')),
    reward_events: (document?.reward_events || document?.rewardEvents || []).map(normalizeRewardEvent),
    preference_pairs: (document?.preference_pairs || document?.preferencePairs || []).map(normalizePreferencePair),
  }
}

export const persistDebateArchive = async ({
  supabase,
  debateRow,
  messages,
  rewardEvents = [],
  preferencePairs = [],
  source = 'system',
}) => {
  const config = getVirtualWarehouseConfig()
  const payload = buildDebateArchivePayload({
    debateRow,
    messages,
    rewardEvents,
    preferencePairs,
    source,
  })

  const serialized = JSON.stringify(payload, null, 2)
  const buffer = gzipSync(Buffer.from(serialized, 'utf-8'))
  const byteSize = buffer.byteLength
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const objectPath = buildArchiveObjectPath(debateRow?.id, debateRow?.created_at)

  const uploadResult = await uploadStorageObjectWithRecovery({
    supabase,
    bucketName: config.archivesBucket,
    objectPath,
    body: buffer,
    options: {
      contentType: 'application/gzip',
      cacheControl: '3600',
      upsert: true,
    },
  })

  if (!uploadResult.ok) {
    return { ok: false, stage: uploadResult.stage || 'upload', error: uploadResult.error, bucketName: config.archivesBucket, objectPath }
  }

  const { data, error: rowError } = await supabase
    .from('debate_archives')
    .upsert({
      debate_id: debateRow.id,
      bucket_name: config.archivesBucket,
      object_path: objectPath,
      format: 'json.gz',
      sha256,
      byte_size: byteSize,
      message_count: payload.messages.length,
      reward_event_count: payload.reward_events.length,
      preference_pair_count: payload.preference_pairs.length,
      archive_version: payload.schema_version,
      source,
      metadata: {
        topic: payload.debate.topic,
        created_at: payload.debate.created_at,
        total_rounds: payload.debate.total_rounds,
        is_youtube: payload.debate.is_youtube,
        god_stats: buildGodArchiveStats(payload.messages),
      },
    }, { onConflict: 'debate_id' })
    .select('id')
    .maybeSingle()

  if (rowError) {
    if (isVirtualWarehouseUnavailableError(rowError)) {
      return {
        ok: true,
        archiveId: null,
        bucketName: config.archivesBucket,
        objectPath,
        byteSize,
        sha256,
        payload,
        metadataStored: false,
        metadataError: rowError,
      }
    }

    return { ok: false, stage: 'metadata', error: rowError, bucketName: config.archivesBucket, objectPath }
  }

  return {
    ok: true,
    archiveId: data?.id || null,
    bucketName: config.archivesBucket,
    objectPath,
    byteSize,
    sha256,
    payload,
    metadataStored: true,
  }
}

export const downloadArchiveDocument = async ({ supabase, bucketName, objectPath }) => {
  const { data, error } = await supabase.storage.from(bucketName).download(objectPath)
  if (error) {
    throw error
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const json = objectPath.endsWith('.gz')
    ? gunzipSync(buffer).toString('utf-8')
    : buffer.toString('utf-8')

  return JSON.parse(json)
}

export const uploadDatasetArtifact = async ({
  supabase,
  snapshotId,
  datasetKind,
  godId = 'all',
  fileName,
  content,
  contentType = 'application/json',
}) => {
  const config = getVirtualWarehouseConfig()
  const objectPath = datasetKind === 'warehouse_snapshot'
    ? `snapshots/${snapshotId}/${fileName}`
    : `${datasetKind}/${snapshotId}/${fileName}`
  const body = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf-8')

  const uploadResult = await uploadStorageObjectWithRecovery({
    supabase,
    bucketName: config.datasetsBucket,
    objectPath,
    body,
    options: {
      contentType,
      cacheControl: '3600',
      upsert: true,
    },
  })

  if (!uploadResult.ok) {
    return { ok: false, error: uploadResult.error, bucketName: config.datasetsBucket, objectPath, godId, stage: uploadResult.stage || 'upload' }
  }

  return {
    ok: true,
    bucketName: config.datasetsBucket,
    objectPath,
    godId,
    bucketCreated: uploadResult.bucketCreated,
  }
}

export const upsertDatasetVersion = async ({
  supabase,
  snapshotId,
  datasetKind,
  godId = 'all',
  bucketName,
  objectPath,
  fileFormat,
  sampleCount = 0,
  sourceDebateCount = 0,
  sourceArchiveCount = 0,
  metadata = {},
}) => {
  const { data, error } = await supabase
    .from('dataset_versions')
    .upsert({
      snapshot_id: snapshotId,
      dataset_kind: datasetKind,
      god_id: godId,
      bucket_name: bucketName,
      object_path: objectPath,
      file_format: fileFormat,
      sample_count: sampleCount,
      source_debate_count: sourceDebateCount,
      source_archive_count: sourceArchiveCount,
      metadata,
    }, { onConflict: 'snapshot_id,dataset_kind,god_id,object_path' })
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, error }
  }

  return { ok: true, id: data?.id || null }
}

export const fetchLiveDebateBundles = async (supabase, { debateIds = [], createdSince = '', createdBefore = '', limit = 500 } = {}) => {
  let debateQuery = supabase
    .from('debates')
    .select('id, topic, is_youtube, total_rounds, consensus, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (debateIds.length > 0) {
    debateQuery = debateQuery.in('id', debateIds)
  }
  if (createdSince) {
    debateQuery = debateQuery.gte('created_at', createdSince)
  }
  if (createdBefore) {
    debateQuery = debateQuery.lte('created_at', createdBefore)
  }

  const { data: debates, error: debateError } = await debateQuery
  if (debateError) {
    return { data: [], error: debateError }
  }

  if (!debates?.length) {
    return { data: [], error: null }
  }

  const ids = debates.map((debate) => debate.id)
  const [messagesResult, rewardsResult, pairsResult] = await Promise.all([
    supabase.from('debate_messages').select('debate_id, god_id, god_name, round, content, created_at').in('debate_id', ids).order('round', { ascending: true }),
    supabase.from('reward_events').select('debate_id, god_id, event_type, reward_score, reward_label, source, metadata, created_at').in('debate_id', ids),
    supabase.from('preference_pairs').select('debate_id, god_id, topic, prompt, chosen, rejected, chosen_round, rejected_round, reward_score, status, source, metadata, created_at').in('debate_id', ids),
  ])

  if (messagesResult.error) {
    return { data: [], error: messagesResult.error }
  }

  const rewardsUnavailable = Boolean(rewardsResult.error && isVirtualWarehouseUnavailableError(rewardsResult.error))
  const pairsUnavailable = Boolean(pairsResult.error && isVirtualWarehouseUnavailableError(pairsResult.error))
  if (rewardsResult.error && !rewardsUnavailable) {
    return { data: [], error: rewardsResult.error }
  }
  if (pairsResult.error && !pairsUnavailable) {
    return { data: [], error: pairsResult.error }
  }

  const messagesByDebate = groupRowsByDebate(messagesResult.data)
  const rewardsByDebate = groupRowsByDebate(rewardsResult.data)
  const pairsByDebate = groupRowsByDebate(pairsResult.data)

  const data = debates.map((debate) => {
    const messages = (messagesByDebate.get(debate.id) || []).map((message) => normalizeDebateMessage(message, debate.created_at))
    const fallbackArtifacts = rewardsUnavailable || pairsUnavailable
      ? buildRewardLearningArtifacts({
          debateId: debate.id,
          topic: debate.topic,
          totalRounds: debate.total_rounds,
          consensus: debate.consensus,
          messages,
          source: 'warehouse_snapshot_fallback',
        })
      : null

    return {
      id: debate.id,
      topic: debate.topic,
      is_youtube: debate.is_youtube,
      total_rounds: debate.total_rounds,
      consensus: debate.consensus || '',
      created_at: debate.created_at,
      messages,
      reward_events: rewardsUnavailable
        ? fallbackArtifacts.rewardEvents.map(normalizeRewardEvent)
        : (rewardsByDebate.get(debate.id) || []).map(normalizeRewardEvent),
      preference_pairs: pairsUnavailable
        ? fallbackArtifacts.preferencePairs.map(normalizePreferencePair)
        : (pairsByDebate.get(debate.id) || []).map(normalizePreferencePair),
    }
  })

  return { data, error: null }
}