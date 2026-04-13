import { classifyRelationship, keywordSimilarity } from '../../src/lib/memoryScoring.js'
import { buildPhysioLogs } from '../../src/lib/physioMetrics.js'
import { buildRewardLearningArtifacts, isRewardLearningUnavailableError } from '../../src/lib/rewardLearning.js'
import { enforceRateLimit, ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'
import { isVirtualWarehouseUnavailableError, persistDebateArchive } from '../_virtualWarehouse.js'

const isMissingRelationError = (error) => {
  const message = String(error?.message || '')
  return message.includes('Could not find the table') || message.includes('does not exist')
}

const insertRowsBestEffort = async (supabase, table, rows, label) => {
  if (!rows.length) return

  const { error } = await supabase.from(table).insert(rows)
  if (!error) return

  if (isMissingRelationError(error)) {
    console.warn(`[debates/complete] ${table} 테이블이 없어 ${label} 저장을 건너뜁니다.`)
    return
  }

  console.warn(`[debates/complete] ${label} 저장 경고:`, error.message)
}

const saveDebateMemory = async (supabase, godId, { topic, content, consensus, debateId }) => {
  const { data: newMemory, error } = await supabase
    .from('god_memories')
    .insert({
      god_id: godId,
      debate_id: debateId || null,
      topic,
      my_opinion: content.slice(0, 600),
      consensus: consensus ? consensus.slice(0, 400) : null,
      relevance_score: 1.0,
    })
    .select('id')
    .single()

  if (error || !newMemory) {
    throw new Error(error?.message || '메모리 저장에 실패했습니다.')
  }

  const { data: existingMemories, error: existingError } = await supabase
    .from('god_memories')
    .select('id, topic, relevance_score')
    .eq('god_id', godId)
    .eq('status', 'active')
    .neq('id', newMemory.id)
    .limit(10)

  if (existingError || !existingMemories?.length) return

  const links = []
  const updates = []

  for (const existing of existingMemories) {
    const similarityScore = keywordSimilarity(topic, existing.topic)
    const relationship = classifyRelationship(topic, existing.topic, similarityScore)
    if (!relationship) continue

    links.push({
      memory_id_a: newMemory.id,
      memory_id_b: existing.id,
      relationship,
      strength: Math.round(similarityScore * 1000) / 1000,
    })

    if (relationship === 'related' || relationship === 'derived_from') {
      updates.push({ id: existing.id, score: Math.min(1.0, existing.relevance_score * 1.1), archive: false })
    } else if (relationship === 'supersedes') {
      updates.push({ id: existing.id, score: existing.relevance_score * 0.5, archive: true })
    }
  }

  if (links.length > 0) {
    const { error: linkError } = await supabase.from('memory_links').insert(links)
    if (linkError) {
      console.warn('[debates/complete] memory_links 저장 경고:', linkError.message)
    }
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('god_memories')
      .update({
        relevance_score: update.score,
        status: update.archive ? 'archived' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id)

    if (updateError) {
      console.warn('[debates/complete] memory 갱신 경고:', updateError.message)
    }
  }
}

export default async function handler(req, res) {
  if (!ensureRequestAllowed(req, res, { methods: ['POST'] })) return
  if (!enforceRateLimit(req, res, { bucket: 'debate-complete', limit: 12, windowMs: 10 * 60 * 1000 })) return

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const topic = String(body?.topic || '').trim().slice(0, 200)
  const consensus = String(body?.consensus || '').trim().slice(0, 4000)
  const isYoutube = Boolean(body?.isYoutube)
  const physioLogged = Boolean(body?.physioLogged)
  const totalRounds = Number.isFinite(Number(body?.totalRounds)) ? Math.max(1, Number(body.totalRounds)) : 1
  const spokenMessages = Array.isArray(body?.messages)
    ? body.messages
        .slice(-160)
        .filter((message) => message && !message.type && message.godId && typeof message.content === 'string' && String(message.content).trim())
        .map((message) => ({
          godId: String(message.godId).slice(0, 64),
          god: String(message.god || message.godId).slice(0, 80),
          round: Math.max(1, Number(message.round) || 1),
          content: String(message.content).slice(0, 4000),
          createdAt: typeof message.timestamp === 'string' && message.timestamp ? message.timestamp : new Date().toISOString(),
        }))
    : []

  if (!topic || spokenMessages.length === 0) {
    return sendJson(res, 400, { error: 'topic과 최소 1개의 발화 메시지가 필요합니다.' })
  }

  try {
    const supabase = getSupabaseServerClient()

    const { data: debateRow, error: debateError } = await supabase
      .from('debates')
      .insert({
        topic,
        is_youtube: isYoutube,
        total_rounds: totalRounds,
        consensus,
      })
      .select('id, topic, is_youtube, total_rounds, consensus, created_at')
      .single()

    if (debateError || !debateRow) {
      throw new Error(debateError?.message || '토론 저장에 실패했습니다.')
    }

    const debateId = debateRow.id
    const messageRows = spokenMessages.map((message) => ({
      debate_id: debateId,
      god_id: message.godId,
      god_name: message.god,
      round: message.round,
      content: message.content,
      created_at: message.createdAt,
    }))

    const { error: messageError } = await supabase.from('debate_messages').insert(messageRows)
    if (messageError) {
      throw new Error(messageError.message || '메시지 저장에 실패했습니다.')
    }

    if (!physioLogged) {
      const { neuroRows, arousalRows, immuneRows } = buildPhysioLogs({
        debateId,
        topic,
        messages: spokenMessages,
        source: 'api_debate_complete',
      })

      await insertRowsBestEffort(supabase, 'neuro_logs', neuroRows, 'neuro 로그')
      await insertRowsBestEffort(supabase, 'arousal_logs', arousalRows, 'arousal 로그')
      await insertRowsBestEffort(supabase, 'immune_logs', immuneRows, 'immune 로그')
    }

    const latestMessageByGod = new Map()
    for (const message of spokenMessages) {
      latestMessageByGod.set(message.godId, message)
    }

    for (const [godId, message] of latestMessageByGod.entries()) {
      await saveDebateMemory(supabase, godId, {
        topic,
        content: message.content,
        consensus,
        debateId,
      })
    }

    const { rewardEvents, preferencePairs } = buildRewardLearningArtifacts({
      debateId,
      topic,
      totalRounds,
      consensus,
      messages: spokenMessages,
      source: 'api_debate_complete',
    })

    if (rewardEvents.length > 0) {
      const { error: rewardError } = await supabase.from('reward_events').insert(rewardEvents)
      if (rewardError && !isRewardLearningUnavailableError(rewardError)) {
        console.warn('[debates/complete] reward_events 저장 경고:', rewardError.message)
      }
    }

    if (preferencePairs.length > 0) {
      const { error: pairError } = await supabase.from('preference_pairs').insert(preferencePairs)
      if (pairError && !isRewardLearningUnavailableError(pairError)) {
        console.warn('[debates/complete] preference_pairs 저장 경고:', pairError.message)
      }
    }

    const archiveResult = await persistDebateArchive({
      supabase,
      debateRow,
      messages: messageRows,
      rewardEvents,
      preferencePairs,
      source: 'api_debate_complete',
    })

    if (!archiveResult.ok && !isVirtualWarehouseUnavailableError(archiveResult.error)) {
      console.warn('[debates/complete] debate archive 저장 경고:', archiveResult.error?.message || archiveResult.error)
    }

    return sendJson(res, 200, { ok: true, debateId })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '토론 저장 중 오류가 발생했습니다.' })
  }
}
