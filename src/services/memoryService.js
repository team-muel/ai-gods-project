/**
 * AI Gods 메모리 서비스 - Supabase 영구 저장
 * Muel 아키텍처 참고:
 *   - memoryEvolutionService  (관계 분류: related/contradicts/supersedes)
 *   - memoryEmbeddingService  (벡터 검색 - 추후 활성화)
 *   - 21일 반감기 relevance_score
 */

import { supabase } from '../lib/supabase.js'
import { calcDecayScore, classifyRelationship, keywordSimilarity } from '../lib/memoryScoring.js'
import { buildRewardLearningArtifacts, isRewardLearningUnavailableError } from '../lib/rewardLearning.js'
import { postJson, requestJson } from './apiClient.js'

const IS_DEV = import.meta.env.DEV === true

// ── 토론 저장 (로컬 개발용 직접 저장) ─────────────────────

const saveDebateDirect = async ({ topic, isYoutube, totalRounds, consensus }) => {
  const { data, error } = await supabase
    .from('debates')
    .insert({ topic, is_youtube: isYoutube, total_rounds: totalRounds, consensus })
    .select('id')
    .single()

  if (error) { console.error('debate 저장 오류:', error); return null }
  return data.id
}

const saveDebateMessagesDirect = async (debateId, messages) => {
  const rows = messages.map(m => ({
    debate_id: debateId,
    god_id:    m.godId,
    god_name:  m.god,
    round:     m.round,
    content:   m.content,
  }))

  const { error } = await supabase.from('debate_messages').insert(rows)
  if (error) console.error('메시지 저장 오류:', error)
}

const saveDebateMemoryDirect = async (godId, { topic, content, consensus, debateId }) => {
  // 1. 새 메모리 저장
  const { data: newMem, error } = await supabase
    .from('god_memories')
    .insert({
      god_id:     godId,
      debate_id:  debateId || null,
      topic,
      my_opinion: content.slice(0, 600),
      consensus:  consensus ? consensus.slice(0, 400) : null,
      relevance_score: 1.0,
    })
    .select('id')
    .single()

  if (error) { console.error('메모리 저장 오류:', error); return }

  // 2. 기존 메모리와 관계 분석 (Muel: memoryEvolutionService)
  const { data: existingMems } = await supabase
    .from('god_memories')
    .select('id, topic, relevance_score')
    .eq('god_id', godId)
    .eq('status', 'active')
    .neq('id', newMem.id)
    .limit(10)

  if (existingMems && existingMems.length > 0) {
    const links = []
    const updates = []

    for (const existing of existingMems) {
      const sim = keywordSimilarity(topic, existing.topic)
      const rel = classifyRelationship(topic, existing.topic, sim)
      if (!rel) continue

      links.push({
        memory_id_a:  newMem.id,
        memory_id_b:  existing.id,
        relationship: rel,
        strength:     Math.round(sim * 1000) / 1000,
      })

      // 관계 타입에 따라 기존 메모리 신뢰도 조정
      if (rel === 'related' || rel === 'derived_from') {
        // 신뢰도 부스트 (+10%)
        updates.push({ id: existing.id, score: Math.min(1.0, existing.relevance_score * 1.1) })
      } else if (rel === 'supersedes') {
        // 대체됨 → 아카이빙
        updates.push({ id: existing.id, score: existing.relevance_score * 0.5, archive: true })
      }
    }

    // 링크 저장
    if (links.length > 0) {
      await supabase.from('memory_links').insert(links)
    }

    // 기존 메모리 업데이트
    for (const u of updates) {
      await supabase
        .from('god_memories')
        .update({
          relevance_score: u.score,
          status: u.archive ? 'archived' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', u.id)
    }
  }

}

const saveRewardArtifactsDirect = async ({ debateId, topic, totalRounds, consensus, messages }) => {
  const { rewardEvents, preferencePairs } = buildRewardLearningArtifacts({
    debateId,
    topic,
    totalRounds,
    consensus,
    messages,
    source: 'browser_debate_complete',
  })

  if (rewardEvents.length > 0) {
    const { error } = await supabase.from('reward_events').insert(rewardEvents)
    if (error && !isRewardLearningUnavailableError(error)) console.error('reward_events 저장 오류:', error)
  }

  if (preferencePairs.length > 0) {
    const { error } = await supabase.from('preference_pairs').insert(preferencePairs)
    if (error && !isRewardLearningUnavailableError(error)) console.error('preference_pairs 저장 오류:', error)
  }
}

export const saveCompletedDebate = async ({ topic, isYoutube, totalRounds, consensus, messages }) => {
  if (!Array.isArray(messages) || messages.length === 0) return null

  try {
    const data = await postJson('/api/debates/complete', {
      topic,
      isYoutube,
      totalRounds,
      consensus,
      messages,
    })
    return data?.debateId || null
  } catch (error) {
    if (!IS_DEV) {
      console.error('토론 저장 오류:', error)
      return null
    }

    console.warn('서버 저장 경로를 사용할 수 없어 로컬 direct 저장으로 폴백합니다:', error.message || error)
  }

  const debateId = await saveDebateDirect({ topic, isYoutube, totalRounds, consensus })
  if (!debateId) return null

  await saveDebateMessagesDirect(debateId, messages)

  const latestMessageByGod = new Map()
  for (const message of messages) {
    latestMessageByGod.set(message.godId, message)
  }

  for (const [godId, message] of latestMessageByGod.entries()) {
    await saveDebateMemoryDirect(godId, {
      topic,
      content: message.content,
      consensus,
      debateId,
    })
  }

  await saveRewardArtifactsDirect({
    debateId,
    topic,
    totalRounds,
    consensus,
    messages,
  })

  return debateId
}

// ── 관련 메모리 조회 ──────────────────────────────────────

export const getRelevantMemories = async (godId, topic, count = 3) => {
  if (!IS_DEV) {
    try {
      const params = new URLSearchParams({ godId, topic, count: String(count) })
      const data = await requestJson(`/api/memories/relevant?${params.toString()}`)
      return data?.memories || []
    } catch {
      return []
    }
  }

  const { data, error } = await supabase
    .from('god_memories')
    .select('id, topic, my_opinion, relevance_score, created_at')
    .eq('god_id', godId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error || !data) return []

  // 반감기 + 키워드 유사도로 최종 점수 계산
  const scored = data.map(m => ({
    ...m,
    score: calcDecayScore(m.created_at) * (0.3 + keywordSimilarity(m.topic, topic) * 0.7),
  }))

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
}

// 메모리를 프롬프트 컨텍스트로 변환
export const memoriesToContext = (memories) => {
  if (!memories || memories.length === 0) return ''

  const lines = memories.map(m => {
    const days = Math.floor((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24))
    const timeStr = days === 0 ? '오늘' : `${days}일 전`
    return `[${timeStr}] 주제: "${m.topic}"\n내 의견: ${m.my_opinion}`
  })

  return `[과거 관련 토론 기억]\n${lines.join('\n\n')}\n\n위 경험을 참고하되, 새로운 관점으로 답변하세요.`
}

// ── 통계 조회 ─────────────────────────────────────────────

export const getGodStats = async (godId) => {
  if (!IS_DEV) return null

  const { data } = await supabase
    .from('god_stats')
    .select('*')
    .eq('god_id', godId)
    .single()
  return data
}

export const getAllGodsStats = async () => {
  if (!IS_DEV) return []

  const { data } = await supabase
    .from('god_stats')
    .select('*')
    .order('total_debates', { ascending: false })
  return data || []
}

// ── 반감기 갱신 (앱 시작 시 호출) ───────────────────────
export const refreshRelevanceScores = async () => {
  if (!IS_DEV) return
  await supabase.rpc('update_memory_relevance')
}
