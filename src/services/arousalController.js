// Arousal / Heartbeat controller
// Controls per-agent "heart rate" (HR) which modulates response length and pacing.
// Higher HR -> burst mode (shorter, faster replies). Lower HR -> deep analysis (longer replies).

import { supabase } from '../lib/supabase.js'
import { postJson } from './apiClient.js'

const IS_DEV = import.meta.env.DEV === true

const DEFAULT = {
  HR: 1.0, // baseline heart rate (1.0 = normal)
  alphaUrgency: 0.7, // increase per unit urgency
  betaDecay: 0.06, // passive decay factor
  minHR: 0.5,
  maxHR: 2.5,
  burstThreshold: 1.3,
}

const agents = {}

function clip(x, lo = 0.1, hi = 10) { return Math.max(lo, Math.min(hi, x)) }

// 마지막 업데이트 이후 경과 시간만큼 HR을 minHR 방향으로 지수 감쇠
function applyTimeDecay(agentId) {
  const s = agents[agentId]
  if (!s) return
  const cfg = s.config
  const elapsedSec = (Date.now() - s.lastUpdated) / 1000
  if (elapsedSec < 0.5) return
  // 연속 지수 감쇠: HR → minHR
  s.HR = clip(cfg.minHR + (s.HR - cfg.minHR) * Math.exp(-cfg.betaDecay * elapsedSec), cfg.minHR, cfg.maxHR)
  s.lastUpdated = Date.now()
}

export function initArousal(agentId, opts = {}) {
  if (!agents[agentId]) {
    agents[agentId] = {
      HR: opts.HR ?? DEFAULT.HR,
      lastUpdated: Date.now(),
      config: { ...DEFAULT, ...(opts.config || {}) },
    }
  }
  return agents[agentId]
}

export function getArousal(agentId) {
  if (!agents[agentId]) initArousal(agentId)
  applyTimeDecay(agentId)
  const s = agents[agentId]
  return { HR: s.HR, burst: s.HR > s.config.burstThreshold }
}

export function setArousal(agentId, { HR } = {}) {
  if (!agents[agentId]) initArousal(agentId)
  const s = agents[agentId]
  if (typeof HR === 'number') s.HR = clip(HR, s.config.minHR, s.config.maxHR)
  s.lastUpdated = Date.now()
  return getArousal(agentId)
}

export function updateFromUrgency(agentId, urgency = 0) {
  if (!agents[agentId]) initArousal(agentId)
  applyTimeDecay(agentId)
  const s = agents[agentId]
  const cfg = s.config

  // urgency expected in [0..2] (0=no urgency, 1=moderate, 2=very high)
  const u = Math.max(0, Math.min(2, typeof urgency === 'number' ? urgency : 0))
  const delta = cfg.alphaUrgency * u

  // small passive decay toward minHR, plus urgency-driven increase
  s.HR = clip(s.HR + delta - cfg.betaDecay * (s.HR - cfg.minHR), cfg.minHR, cfg.maxHR)
  s.lastUpdated = Date.now()

  const state = { HR: s.HR, burst: s.HR > cfg.burstThreshold }

  // best-effort async logging (non-blocking)
  ;(async () => {
    try {
      const payload = {
        agentId,
        heartRate: state.HR,
        burst: state.burst,
        tokenFactor: getArousalParams(agentId).tokenFactor,
        suggestedDelayMs: getArousalParams(agentId).suggestedDelayMs,
      }

      if (IS_DEV) {
        const res = await supabase.from('arousal_logs').insert({
          agent_id: agentId,
          heart_rate: state.HR,
          burst: state.burst,
          token_factor: payload.tokenFactor,
          suggested_delay_ms: payload.suggestedDelayMs,
          created_at: new Date().toISOString(),
        })
        if (res.error) console.info('arousalController: supabase insert error', res.error)
        return
      }

      await postJson('/api/logs/arousal', payload)
    } catch (err) {
      try { console.debug && console.debug('arousalController log fallback', { agentId, state }) } catch (e) {}
    }
  })()

  return state
}

export function pulse(agentId, amount = 0.5) {
  if (!agents[agentId]) initArousal(agentId)
  const s = agents[agentId]
  s.HR = clip(s.HR + Math.abs(amount), s.config.minHR, s.config.maxHR)
  s.lastUpdated = Date.now()
  return getArousal(agentId)
}

export function getArousalParams(agentId) {
  if (!agents[agentId]) initArousal(agentId)
  applyTimeDecay(agentId)
  const s = agents[agentId]
  const cfg = s.config
  const HR = s.HR
  const burst = HR > cfg.burstThreshold

  // token modifier: higher HR -> shorter responses (tokens divided by HR)
  const tokenFactor = 1 / HR
  // suggested minimum response delay in ms (higher HR -> faster)
  const suggestedDelayMs = Math.max(50, Math.round(1000 / HR))

  return { heartRate: HR, burst, tokenFactor, suggestedDelayMs }
}

export function getAllArousalStates() {
  return Object.fromEntries(Object.keys(agents).map(k => [k, { HR: agents[k].HR }]))
}
