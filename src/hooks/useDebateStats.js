import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

  const fetchStats = async () => {
    // 전체 토론 수
    const { count: total } = await supabase
      .from('debates')
      .select('*', { count: 'exact', head: true })

    // 오늘 토론 수
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: today } = await supabase
      .from('debates')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())

    const n = total || 0

    let readiness, progressPct, nextMilestone
    if (n >= THRESHOLD_GREAT) {
      readiness     = 'excellent'
      progressPct   = 100
      nextMilestone = THRESHOLD_GREAT
    } else if (n >= THRESHOLD_GOOD) {
      readiness     = 'recommended'
      progressPct   = Math.round((n / THRESHOLD_GREAT) * 100)
      nextMilestone = THRESHOLD_GREAT
    } else if (n >= THRESHOLD_MINIMUM) {
      readiness     = 'possible'
      progressPct   = Math.round((n / THRESHOLD_GOOD) * 100)
      nextMilestone = THRESHOLD_GOOD
    } else {
      readiness     = 'collecting'
      progressPct   = Math.round((n / THRESHOLD_MINIMUM) * 100)
      nextMilestone = THRESHOLD_MINIMUM
    }

    setStats({ totalDebates: n, todayDebates: today || 0, readiness, progressPct, nextMilestone, loaded: true })

    // 콘솔에 상태 출력
    const statusMsg = {
      collecting:  `📊 데이터 수집 중 (${n}/${THRESHOLD_MINIMUM}) — 아직 파인튜닝하기엔 이름`,
      possible:    `🟡 파인튜닝 가능 (${n}/${THRESHOLD_GOOD}) — 최소치 달성, 더 쌓으면 좋아짐`,
      recommended: `🟠 파인튜닝 권장 (${n}/${THRESHOLD_GREAT}) — 지금 해도 충분한 수준`,
      excellent:   `🟢 파인튜닝 최적 (${n}+) — 고품질 학습 가능! 알려드릴게요.`,
    }
    console.log(`[AI GODS 학습 진행도] ${statusMsg[readiness]}`)

    if (readiness === 'excellent' && n === THRESHOLD_GREAT) {
      console.log('%c🎉 LoRA 파인튜닝 준비 완료! 이제 알려드릴게요.', 'color: #00ff88; font-size: 14px; font-weight: bold')
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  // 토론 완료 시 외부에서 갱신 가능
  return { ...stats, refresh: fetchStats }
}
