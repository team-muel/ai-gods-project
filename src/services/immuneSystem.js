// Immune system: detects and quarantines 'antigen' messages (potential hallucinations)
// Heuristic-based initial implementation: compares new messages to existing memories/notes
// and marks low-similarity or contradictory messages as antigens.

import { supabase } from '../lib/supabase.js'
import { getRelevantMemories, memoriesToContext } from './memoryService.js'
import { postJson } from './apiClient.js'
import { readFromObsidian } from './obsidianService.js'

const IS_DEV = import.meta.env.DEV === true

const DEFAULT = {
  similarityThreshold: 0.18, // jaccard similarity below this => suspect
  minTokenOverlap: 3,
  minBaselineTokens: 10,
}

const agents = {}

function tokenize(text) {
  if (!text) return []
  return Array.from(new Set(text
    .toLowerCase()
    .replace(/[\p{P}$+<=>^`|~]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)))
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens)
  const b = new Set(bTokens)
  const inter = [...a].filter(x => b.has(x)).length
  const uni = new Set([...a, ...b]).size
  return uni === 0 ? 0 : inter / uni
}

export function initImmuneAgent(agentId, opts = {}) {
  if (!agents[agentId]) {
    agents[agentId] = {
      quarantine: [],
      lastUpdated: Date.now(),
      config: { ...DEFAULT, ...(opts.config || {}) },
    }
  }
  return agents[agentId]
}

export function getImmuneState(agentId) {
  if (!agents[agentId]) initImmuneAgent(agentId)
  return { quarantine: agents[agentId].quarantine }
}

export function releaseQuarantine(agentId, entryId) {
  if (!agents[agentId]) initImmuneAgent(agentId)
  const s = agents[agentId]
  const idx = s.quarantine.findIndex(e => e.id === entryId)
  if (idx >= 0) {
    s.quarantine[idx].status = 'released'
    s.quarantine[idx].released_at = new Date().toISOString()
  }
  s.lastUpdated = Date.now()
  return getImmuneState(agentId)
}

async function fetchBaselineContext(topic) {
  // Gather memories and Obsidian notes as baseline
  try {
    const mems = await getRelevantMemories('cdo', topic)
    const memText = memoriesToContext(mems)
    const obs = await readFromObsidian('cdo', topic)
    return [memText || '', obs || ''].filter(Boolean).join('\n\n')
  } catch (e) {
    return ''
  }
}

export async function scanAndQuarantine(agentId, messages = [], opts = {}) {
  if (!agents[agentId]) initImmuneAgent(agentId)
  const s = agents[agentId]
  const cfg = s.config

  const topic = opts.topic || null
  const baseline = await fetchBaselineContext(topic)
  const baseTokens = tokenize(baseline)

  if (baseTokens.length < cfg.minBaselineTokens) {
    return []
  }

  const quarantined = []

  for (const m of messages) {
    const content = (typeof m === 'string') ? m : (m?.content || '')
    const source = (typeof m === 'string') ? 'unknown' : (m?.god || m?.source || 'unknown')

    const tokens = tokenize(content)
    const sim = jaccard(tokens, baseTokens)

    // Simple heuristic: low similarity and some tokens -> antigen
    if ((sim < cfg.similarityThreshold && tokens.length >= cfg.minTokenOverlap) || tokens.length === 0) {
      const entry = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
        agent_id: agentId,
        source,
        content: content.slice(0, 4000),
        reason: 'low_similarity',
        similarity: sim,
        created_at: new Date().toISOString(),
        status: 'quarantined'
      }
      s.quarantine.push(entry)
      quarantined.push(entry)

      // try to persist to Supabase (best-effort, non-blocking)
      ;(async () => {
        try {
          if (IS_DEV) {
            const res = await supabase.from('immune_logs').insert({
              agent_id: entry.agent_id,
              source: entry.source,
              content: entry.content,
              reason: entry.reason,
              similarity: entry.similarity,
              status: entry.status,
              created_at: entry.created_at,
            })
            if (res.error) console.info('immuneSystem: supabase insert error', res.error)
            return
          }

          await postJson('/api/logs/immune', {
            agentId: entry.agent_id,
            source: entry.source,
            content: entry.content,
            reason: entry.reason,
            similarity: entry.similarity,
            status: entry.status,
          })
        } catch (err) {
          try { console.debug && console.debug('immuneSystem log fallback', { agentId, entry }) } catch (e) {}
        }
      })()
    }
  }

  s.lastUpdated = Date.now()
  return quarantined
}

export function getAllImmuneStates() {
  return Object.fromEntries(Object.keys(agents).map(k => [k, { quarantine: agents[k].quarantine }]))
}
