/**
 * AI Gods 메모리 서비스 - Supabase 영구 저장
 * Muel 아키텍처 참고:
 *   - memoryEvolutionService  (관계 분류: related/contradicts/supersedes)
 *   - memoryEmbeddingService  (벡터 검색 - 추후 활성화)
 *   - 21일 반감기 relevance_score
 */

import { supabase } from '../lib/supabase'

const HALF_LIFE_DAYS = 21

// ── 유틸 ──────────────────────────────────────────────────

// 반감기 기반 점수 계산
const calcDecayScore = (createdAt) => {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

// 키워드 유사도 (벡터 임베딩 전까지 사용)
const keywordSimilarity = (textA, textB) => {
  const wordsA = textA.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  const wordsB = textB.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  const overlap = wordsA.filter(w => wordsB.includes(w)).length
  return overlap / Math.max(wordsA.length, 1)
}

// Muel memoryEvolutionService: 관계 타입 판단
const classifyRelationship = (newTopic, existingTopic, similarityScore) => {
  if (similarityScore > 0.7) return 'supersedes'
  if (similarityScore > 0.4) return 'derived_from'
  if (similarityScore > 0.2) return 'related'
  return null
}

// ── 토론 저장 ─────────────────────────────────────────────

export const saveDebate = async ({ topic, isYoutube, totalRounds, consensus }) => {
  const { data, error } = await supabase
    .from('debates')
    .insert({ topic, is_youtube: isYoutube, total_rounds: totalRounds, consensus })
    .select('id')
    .single()

  if (error) { console.error('debate 저장 오류:', error); return null }
  return data.id
}

export const saveDebateMessages = async (debateId, messages) => {
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

// ── 메모리 저장 (신별) ────────────────────────────────────

export const saveDebateMemory = async (godId, { topic, content, consensus, debateId }) => {
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

// ── 관련 메모리 조회 ──────────────────────────────────────

export const getRelevantMemories = async (godId, topic, count = 3) => {
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
  const { data } = await supabase
    .from('god_stats')
    .select('*')
    .eq('god_id', godId)
    .single()
  return data
}

export const getAllGodsStats = async () => {
  const { data } = await supabase
    .from('god_stats')
    .select('*')
    .order('total_debates', { ascending: false })
  return data || []
}

// ── 반감기 갱신 (앱 시작 시 호출) ───────────────────────
export const refreshRelevanceScores = async () => {
  await supabase.rpc('update_memory_relevance')
}
