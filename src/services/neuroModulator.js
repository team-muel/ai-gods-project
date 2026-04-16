// Simple neuromodulator: dopamine (reward/creativity) and cortisol (stress/defensiveness)
// Provides per-agent state, event updates, and sampling parameter mapping.

import { postJson } from './apiClient.js'

const DEFAULTS = {
  D: 0.2, // dopamine baseline
  C: 0.1, // cortisol baseline
  alphaPos: 0.08,
  alphaNeg: 0.12,
  betaD: 0.02,
  betaC: 0.05,
  gammaDebate: 0.01,
  T0: 1.0,
  kD: 0.6,
  kC: 0.8,
}

const agents = {}

function clip(x, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x))
}

// 마지막 업데이트 이후 경과 시간만큼 D/C를 기저값 방향으로 지수 감쇠
function applyTimeDecay(agentId) {
  const s = agents[agentId]
  if (!s) return
  const cfg = s.config
  const elapsedSec = (Date.now() - s.lastUpdated) / 1000
  if (elapsedSec < 0.5) return
  s.D = clip(s.D * Math.exp(-cfg.betaD * elapsedSec))
  s.C = clip(s.C * Math.exp(-cfg.betaC * elapsedSec))
  s.lastUpdated = Date.now()
}

export function initAgentState(agentId, opts = {}) {
  if (!agents[agentId]) {
    agents[agentId] = {
      D: opts.D ?? DEFAULTS.D,
      C: opts.C ?? DEFAULTS.C,
      lastUpdated: Date.now(),
      config: { ...DEFAULTS, ...(opts.config || {}) },
    }
  }
  return agents[agentId]
}

export function getState(agentId) {
  if (!agents[agentId]) initAgentState(agentId)
  applyTimeDecay(agentId)
  const { D, C } = agents[agentId]
  return { D, C }
}

export function setState(agentId, { D, C }) {
  if (!agents[agentId]) initAgentState(agentId)
  if (typeof D === 'number') agents[agentId].D = clip(D)
  if (typeof C === 'number') agents[agentId].C = clip(C)
  agents[agentId].lastUpdated = Date.now()
  return getState(agentId)
}

export function updateStateFromEvent(agentId, { posFeedback = 0, negFeedback = 0, debateLen = 0 } = {}) {
  if (!agents[agentId]) initAgentState(agentId)
  const s = agents[agentId]
  const cfg = s.config

  // simple discrete update with small decay
  s.D = clip(s.D + cfg.alphaPos * posFeedback - cfg.betaD * s.D)
  s.C = clip(s.C + cfg.alphaNeg * negFeedback + cfg.gammaDebate * debateLen - cfg.betaC * s.C)
  s.lastUpdated = Date.now()
  const state = { D: s.D, C: s.C }

  // async log: try to persist state + sampling params to Supabase, but don't block or throw
  ;(async () => {
    try {
      const sampling = getSamplingParams(agentId)
      await postJson('/api/logs/neuro', {
        agentId,
        dopamine: state.D,
        cortisol: state.C,
        temperature: sampling.temperature,
        topP: sampling.top_p,
        maxTokens: sampling.max_tokens,
      })
    } catch (err) {
      // fallback: local console log for debugging
      try { console.debug && console.debug('neuroModulator log fallback', { agentId, state }) } catch (e) {}
    }
  })()

  return state
}

export function registerPositiveFeedback(agentId, amount = 1.0, trust = 1.0) {
  // trust can be used to downweight repeated self-upvotes or low-trust users
  return updateStateFromEvent(agentId, { posFeedback: amount * trust })
}

export function registerNegativeFeedback(agentId, amount = 1.0) {
  return updateStateFromEvent(agentId, { negFeedback: amount })
}

export function getSamplingParams(agentId) {
  if (!agents[agentId]) initAgentState(agentId)
  applyTimeDecay(agentId)
  const s = agents[agentId]
  const cfg = s.config
  const D = s.D
  const C = s.C

  // temperature influenced by dopamine (↑) and cortisol (↓)
  let temperature = cfg.T0 * (1 + cfg.kD * D - cfg.kC * C)
  temperature = clip(temperature, 0.1, 2.0)

  let top_p = 0.9 + 0.08 * D - 0.1 * C
  top_p = clip(top_p, 0.5, 0.98)

  const max_tokens = Math.round(600 * (1 + 0.5 * D - 0.3 * C))

  return { temperature, top_p, max_tokens }
}

// Debug helper
export function getAllAgentStates() {
  return Object.fromEntries(Object.keys(agents).map(k => [k, { D: agents[k].D, C: agents[k].C }]))
}
