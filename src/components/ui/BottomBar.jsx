const READINESS_CONFIG = {
  collecting:  { color: 'rgba(100, 200, 255, 0.4)', label: '데이터 수집 중',    glow: 'none' },
  possible:    { color: '#ffd700',                  label: '파인튜닝 가능',      glow: '0 0 6px #ffd700' },
  recommended: { color: '#ff8800',                  label: '파인튜닝 권장',      glow: '0 0 6px #ff8800' },
  excellent:   { color: '#00ff88',                  label: '파인튜닝 최적  ★',  glow: '0 0 10px #00ff88' },
}

export default function BottomBar({ isDebating, messageCount, stats }) {
  const {
    totalDebates = 0,
    todayDebates = 0,
    readiness = 'collecting',
    progressPct = 0,
    nextMilestone = 50,
    loaded = false,
  } = stats || {}

  const cfg = READINESS_CONFIG[readiness] || READINESS_CONFIG.collecting

  return (
    <div
      style={{
        background: 'rgba(5, 5, 20, 0.85)',
        borderTop: '1px solid rgba(100, 200, 255, 0.1)',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* 좌측 - 시스템 상태 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: isDebating ? '#00ff88' : '#334466',
              boxShadow: isDebating ? '0 0 6px #00ff88' : 'none',
              transition: 'all 0.3s',
            }}
          />
          <span
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '9px',
              color: isDebating ? 'rgba(0, 255, 136, 0.7)' : 'rgba(100, 200, 255, 0.3)',
              letterSpacing: '0.15em',
            }}
          >
            {isDebating ? 'DEBATE ACTIVE' : 'STANDBY'}
          </span>
        </div>

        <div style={{ width: '1px', height: '12px', background: 'rgba(100, 200, 255, 0.1)' }} />

        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(100, 200, 255, 0.3)' }}>
          8 GODS ONLINE
        </span>
      </div>

      {/* 중앙 - 학습 진행도 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.25)', letterSpacing: '0.3em' }}>
          AI GODS · COSMIC COUNCIL
        </span>

        <div style={{ width: '1px', height: '12px', background: 'rgba(100, 200, 255, 0.1)' }} />

        {/* 파인튜닝 진행 바 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: cfg.color, textShadow: cfg.glow }}>
            {cfg.label}
          </span>

          {/* 프로그레스 바 */}
          <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${loaded ? progressPct : 0}%`,
                background: cfg.color,
                boxShadow: cfg.glow,
                borderRadius: '2px',
                transition: 'width 0.8s ease',
              }}
            />
          </div>

          <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: 'rgba(100,200,255,0.5)' }}>
            {loaded ? `${totalDebates}/${nextMilestone}` : '...'}
          </span>
        </div>
      </div>

      {/* 우측 - 통계 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(100, 200, 255, 0.3)' }}>
          오늘 {loaded ? todayDebates : '-'}건
        </span>

        <div style={{ width: '1px', height: '12px', background: 'rgba(100, 200, 255, 0.1)' }} />

        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(100, 200, 255, 0.3)' }}>
          메시지: {messageCount}
        </span>

        <div style={{ width: '1px', height: '12px', background: 'rgba(100, 200, 255, 0.1)' }} />

        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(100, 200, 255, 0.3)' }}>
          드래그로 회전 · 스크롤로 줌
        </span>
      </div>
    </div>
  )
}
