import { useCallback, useEffect, useState } from 'react'
import { requestJson } from '../services/apiClient'

// 파인튜닝 기준
const THRESHOLD_MINIMUM = 50   // 학습 가능 (최소)
const THRESHOLD_GOOD    = 100  // 학습 권장
const THRESHOLD_GREAT   = 300  // 고품질 파인튜닝

export const useDebateStats = () => {
  const [stats, setStats] = useState({
    totalDebates: 0,
    todayDebates: 0,
    readiness: 'collecting', // 'collecting' | 'possible' | 'recommended' | 'excellent'
    progressPct: 0,
    nextMilestone: THRESHOLD_MINIMUM,
    loaded: false,
  })

  const fetchStats = useCallback(async () => {
    try {
      const data = await requestJson('/api/debates/stats')
      const total = data?.totalDebates || 0
      const today = data?.todayDebates || 0

      let readiness
      let progressPct
      let nextMilestone
      if (total >= THRESHOLD_GREAT) {
        readiness     = 'excellent'
        progressPct   = 100
        nextMilestone = THRESHOLD_GREAT
      } else if (total >= THRESHOLD_GOOD) {
        readiness     = 'recommended'
        progressPct   = Math.round((total / THRESHOLD_GREAT) * 100)
        nextMilestone = THRESHOLD_GREAT
      } else if (total >= THRESHOLD_MINIMUM) {
        readiness     = 'possible'
        progressPct   = Math.round((total / THRESHOLD_GOOD) * 100)
        nextMilestone = THRESHOLD_GOOD
      } else {
        readiness     = 'collecting'
        progressPct   = Math.round((total / THRESHOLD_MINIMUM) * 100)
        nextMilestone = THRESHOLD_MINIMUM
      }

      setStats({ totalDebates: total, todayDebates: today, readiness, progressPct, nextMilestone, loaded: true })

      const statusMsg = {
        collecting:  `📊 데이터 수집 중 (${total}/${THRESHOLD_MINIMUM}) — 아직 파인튜닝하기엔 이름`,
        possible:    `🟡 파인튜닝 가능 (${total}/${THRESHOLD_GOOD}) — 최소치 달성, 더 쌓으면 좋아짐`,
        recommended: `🟠 파인튜닝 권장 (${total}/${THRESHOLD_GREAT}) — 지금 해도 충분한 수준`,
        excellent:   `🟢 파인튜닝 최적 (${total}+) — 고품질 학습 가능! 알려드릴게요.`,
      }
      console.log(`[AI GODS 학습 진행도] ${statusMsg[readiness]}`)

      if (readiness === 'excellent' && total === THRESHOLD_GREAT) {
        console.log('%c🎉 LoRA 파인튜닝 준비 완료! 이제 알려드릴게요.', 'color: #00ff88; font-size: 14px; font-weight: bold')
      }
    } catch (error) {
      console.error('토론 통계 조회 오류:', error)
      setStats((prev) => ({ ...prev, loaded: true }))
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // 토론 완료 시 외부에서 갱신 가능
  return { ...stats, refresh: fetchStats }
}
