import { classifyRelationship, keywordSimilarity } from '../../src/lib/memoryScoring.js'
import { ensureRequestAllowed, parseJsonBody, sendJson } from '../_requestGuard.js'
import { getSupabaseServerClient } from '../_supabaseAdmin.js'

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

  let body
  try {
    body = parseJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }

  const topic = String(body?.topic || '').trim()
  const consensus = String(body?.consensus || '').trim()
  const isYoutube = Boolean(body?.isYoutube)
  const totalRounds = Number.isFinite(Number(body?.totalRounds)) ? Math.max(1, Number(body.totalRounds)) : 1
  const spokenMessages = Array.isArray(body?.messages)
    ? body.messages
        .filter((message) => message && !message.type && message.godId && typeof message.content === 'string')
        .map((message) => ({
          godId: String(message.godId),
          god: String(message.god || message.godId),
          round: Math.max(1, Number(message.round) || 1),
          content: String(message.content),
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
      .select('id')
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
    }))

    const { error: messageError } = await supabase.from('debate_messages').insert(messageRows)
    if (messageError) {
      throw new Error(messageError.message || '메시지 저장에 실패했습니다.')
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

    return sendJson(res, 200, { ok: true, debateId })
  } catch (error) {
    return sendJson(res, 500, { error: error.message || '토론 저장 중 오류가 발생했습니다.' })
  }
}
