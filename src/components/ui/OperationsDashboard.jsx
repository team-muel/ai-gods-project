import { useOperationsDashboard } from '../../hooks/useOperationsDashboard'

const READINESS_META = {
  ready: { label: 'READY', color: '#00f59f', glow: 'rgba(0, 245, 159, 0.18)' },
  candidate: { label: 'CANDIDATE', color: '#7dd3fc', glow: 'rgba(125, 211, 252, 0.18)' },
  watch: { label: 'WATCH', color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.18)' },
  shadow: { label: 'SHADOW', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.18)' },
}

const OVERALL_READINESS_META = {
  cutover_ready: { label: 'FULL CUTOVER READY', color: '#00f59f' },
  pilot_ready: { label: 'PILOT READY', color: '#7dd3fc' },
  shadow_mode: { label: 'SHADOW MODE', color: '#fbbf24' },
  not_ready: { label: 'NOT READY', color: '#94a3b8' },
}

const panelStyle = {
  background: 'linear-gradient(180deg, rgba(6, 12, 28, 0.92) 0%, rgba(3, 6, 18, 0.94) 100%)',
  border: '1px solid rgba(110, 210, 255, 0.14)',
  borderRadius: '18px',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.03)',
  backdropFilter: 'blur(16px)',
}

const getStatusColor = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'success' || normalized === 'ready') return '#00f59f'
  if (normalized === 'in_progress' || normalized === 'queued' || normalized === 'building') return '#7dd3fc'
  if (normalized === 'cancelled' || normalized === 'canceled') return '#fbbf24'
  if (normalized === 'failure' || normalized === 'error' || normalized === 'timed_out' || normalized === 'startup_failure') return '#fb7185'
  return '#94a3b8'
}

const formatDateTime = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const formatRelative = (value) => {
  if (!value) return '-'
  const deltaMs = Date.now() - new Date(value).getTime()
  const deltaMinutes = Math.max(0, Math.round(deltaMs / 60000))
  if (deltaMinutes < 1) return '방금 전'
  if (deltaMinutes < 60) return `${deltaMinutes}분 전`
  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}시간 전`
  return `${Math.round(deltaHours / 24)}일 전`
}

const formatPercent = (value) => `${Math.round((Number(value) || 0) * 100)}%`

const truncate = (value, limit) => {
  const text = String(value || '').trim()
  if (!text) return '아직 저장된 합의안이 없습니다.'
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text
}

const SourceCard = ({ title, subtitle, source, accent }) => {
  const cardAccent = accent || '#67e8f9'

  return (
    <div style={{ ...panelStyle, padding: '18px', minHeight: '164px', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-20px',
          width: '160px',
          height: '160px',
          background: `radial-gradient(circle, ${cardAccent}22 0%, transparent 68%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '6px' }}>
            {title}
          </div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.8)' }}>
            {subtitle}
          </div>
        </div>
        <div
          style={{
            border: `1px solid ${source?.available ? `${cardAccent}55` : 'rgba(251, 113, 133, 0.35)'}`,
            color: source?.available ? cardAccent : '#fb7185',
            padding: '6px 10px',
            borderRadius: '999px',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '10px',
            letterSpacing: '0.12em',
          }}
        >
          {source?.available ? 'CONNECTED' : 'CHECK REQUIRED'}
        </div>
      </div>

      {source?.available ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.16em', color: 'rgba(125, 211, 252, 0.65)', marginBottom: '8px' }}>
                AUTO RUNS · 24H
              </div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: '#f8fafc' }}>
                {source.automaticRuns24h}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.16em', color: 'rgba(251, 113, 133, 0.72)', marginBottom: '8px' }}>
                ERRORS · 24H
              </div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: source.errorRuns24h > 0 ? '#fb7185' : '#00f59f' }}>
                {source.errorRuns24h}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(226, 232, 240, 0.72)' }}>
            <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px' }}>
              성공 {source.successRuns24h}건
            </span>
            <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px' }}>
              최근 {source.recent?.[0] ? formatRelative(source.recent[0].createdAt) : '기록 없음'}
            </span>
          </div>
        </>
      ) : (
        <div style={{ color: 'rgba(251, 191, 36, 0.92)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', lineHeight: 1.6 }}>
          {source?.message || '연결 상태를 확인할 수 없습니다.'}
        </div>
      )}
    </div>
  )
}

const AutomationList = ({ title, items, platform, emptyMessage }) => (
  <div style={{ ...panelStyle, padding: '18px', minHeight: '320px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <div>
        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '6px' }}>
          {title}
        </div>
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)' }}>
          최근 자동 실행과 상태를 빠르게 확인합니다.
        </div>
      </div>
    </div>

    {items?.length ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map((item) => {
          const status = platform === 'github' ? item.conclusion || item.status : item.state
          const statusColor = getStatusColor(status)
          return (
            <a
              key={item.id}
              href={item.url || '#'}
              target={item.url ? '_blank' : undefined}
              rel={item.url ? 'noreferrer' : undefined}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid rgba(110, 210, 255, 0.08)',
                background: 'rgba(9, 14, 30, 0.7)',
                borderRadius: '12px',
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#e2e8f0', fontWeight: 600 }}>
                  {item.name}
                </div>
                <div
                  style={{
                    border: `1px solid ${statusColor}55`,
                    color: statusColor,
                    padding: '4px 8px',
                    borderRadius: '999px',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  {status || 'unknown'}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.68)' }}>
                <span>{platform === 'github' ? `event: ${item.event}` : `target: ${item.target}`}</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            </a>
          )
        })}
      </div>
    ) : (
      <div style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', paddingTop: '12px' }}>
        {emptyMessage}
      </div>
    )}
  </div>
)

const AgentCutoverPanel = ({ agents }) => {
  const summary = agents?.summary
  const meta = OVERALL_READINESS_META[summary?.overallReadiness] || OVERALL_READINESS_META.not_ready

  if (!agents?.available) {
    return (
      <div style={{ ...panelStyle, padding: '18px', marginBottom: '18px' }}>
        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '8px' }}>
          AGENT CUTOVER READINESS
        </div>
        <div style={{ color: 'rgba(251, 191, 36, 0.92)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', lineHeight: 1.6 }}>
          {agents?.message || '에이전트 전환 지표를 표시할 수 없습니다.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ ...panelStyle, padding: '20px', marginBottom: '16px', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(90deg, ${meta.color}12 0%, transparent 55%)`,
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '8px' }}>
              AGENT CUTOVER READINESS
            </div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: meta.color, marginBottom: '10px' }}>
              {meta.label}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: 'rgba(226, 232, 240, 0.8)', lineHeight: 1.6, maxWidth: '720px' }}>
              {summary?.recommendation}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(96px, 1fr))', gap: '10px', minWidth: '280px' }}>
            {[
              { label: 'AVG SCORE', value: summary?.averageScore ?? 0, suffix: '' },
              { label: 'READY', value: summary?.readyCount ?? 0, suffix: '/8' },
              { label: 'CANDIDATE', value: summary?.candidateCount ?? 0, suffix: '/8' },
            ].map((item) => (
              <div key={item.label} style={{ border: '1px solid rgba(110, 210, 255, 0.1)', borderRadius: '12px', padding: '12px', background: 'rgba(8, 14, 28, 0.72)' }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.14em', color: 'rgba(148, 163, 184, 0.72)', marginBottom: '8px' }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '24px', color: '#f8fafc' }}>
                  {item.value}{item.suffix}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        {(agents.members || []).map((agent) => {
          const readiness = READINESS_META[agent.cutoverReadiness] || READINESS_META.shadow
          return (
            <div key={agent.id} style={{ ...panelStyle, padding: '16px', position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(180deg, ${readiness.glow} 0%, transparent 42%)`,
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{agent.symbol}</div>
                    <div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: agent.color, letterSpacing: '0.08em' }}>
                        {agent.name}
                      </div>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.62)' }}>
                        {agent.role} · {agent.localModel || 'fallback'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${readiness.color}55`,
                      color: readiness.color,
                      padding: '5px 9px',
                      borderRadius: '999px',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: '10px',
                      letterSpacing: '0.12em',
                    }}
                  >
                    {readiness.label}
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.14em', color: 'rgba(148, 163, 184, 0.72)' }}>
                      CUTOVER SCORE
                    </div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '22px', color: readiness.color }}>
                      {agent.cutoverScore}
                    </div>
                  </div>
                  <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${agent.cutoverScore}%`, background: readiness.color, boxShadow: `0 0 14px ${readiness.color}` }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { label: '총 토론', value: agent.totalDebates },
                    { label: '24H 메시지', value: agent.recentMessages24h },
                    { label: '활성 메모리', value: agent.activeMemories },
                    { label: '검역 수', value: agent.quarantineCount24h },
                  ].map((item) => (
                    <div key={item.label} style={{ border: '1px solid rgba(110, 210, 255, 0.08)', borderRadius: '10px', padding: '10px', background: 'rgba(8, 14, 28, 0.72)' }}>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(148, 163, 184, 0.7)', marginBottom: '6px' }}>
                        {item.label}
                      </div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#f8fafc' }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)' }}>
                    코르티솔 {agent.avgCortisol24h}
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)' }}>
                    도파민 {agent.avgDopamine24h}
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)' }}>
                    버스트율 {formatPercent(agent.burstRate24h)}
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)' }}>
                    검역률 {formatPercent(agent.quarantineRate24h)}
                  </div>
                </div>

                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.55, color: 'rgba(226, 232, 240, 0.78)' }}>
                  {agent.cutoverRecommendation}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OperationsDashboard({ onClose }) {
  const { data, loading, error, page, goToPage, refresh } = useOperationsDashboard({ enabled: true })
  const github = data?.github
  const vercel = data?.vercel
  const debates = data?.debates
  const agents = data?.agents
  const warnings = data?.warnings || []

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 140,
        pointerEvents: 'auto',
        background: 'radial-gradient(circle at top, rgba(12, 25, 56, 0.82) 0%, rgba(1, 4, 12, 0.94) 58%, rgba(1, 2, 8, 0.98) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ position: 'absolute', inset: '84px 20px 24px 20px', overflowY: 'auto', paddingRight: '6px' }}>
        <div style={{ maxWidth: '1360px', margin: '0 auto' }}>
          <div style={{ ...panelStyle, padding: '22px 24px', marginBottom: '18px', overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, rgba(103, 232, 249, 0.08) 0%, rgba(16, 185, 129, 0.06) 48%, rgba(251, 191, 36, 0.08) 100%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.28em', color: 'rgba(125, 211, 252, 0.86)', marginBottom: '10px' }}>
                  OPERATIONS DASHBOARD
                </div>
                <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '34px', color: '#f8fafc', marginBottom: '10px' }}>
                  GitHub · Vercel 운영 현황
                </h2>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: 'rgba(226, 232, 240, 0.78)', lineHeight: 1.55 }}>
                  최근 {data?.windowHours || 24}시간 자동 실행 수, 오류 수, 최신 토론 결과, 전체 토론 모음집, 그리고 8개 AI cutover 준비도를 한 화면에서 봅니다.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={refresh}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(103, 232, 249, 0.28)',
                    background: 'rgba(7, 17, 34, 0.84)',
                    color: '#67e8f9',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '11px',
                    letterSpacing: '0.14em',
                    cursor: 'pointer',
                  }}
                >
                  새로고침
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(248, 250, 252, 0.14)',
                    background: 'rgba(15, 23, 42, 0.92)',
                    color: '#f8fafc',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '11px',
                    letterSpacing: '0.14em',
                    cursor: 'pointer',
                  }}
                >
                  회의 화면으로
                </button>
              </div>
            </div>

            <div style={{ position: 'relative', display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '18px' }}>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: 'rgba(226, 232, 240, 0.68)' }}>
                마지막 갱신 {data?.generatedAt ? formatDateTime(data.generatedAt) : '-'}
              </div>
              {github?.repo && (
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: 'rgba(226, 232, 240, 0.68)' }}>
                  GitHub {github.repo}
                </div>
              )}
              {vercel?.project && (
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: 'rgba(226, 232, 240, 0.68)' }}>
                  Vercel {vercel.project}
                </div>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div style={{ ...panelStyle, padding: '14px 18px', marginBottom: '18px', borderColor: 'rgba(251, 191, 36, 0.22)' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '11px', letterSpacing: '0.16em', color: '#fbbf24', marginBottom: '8px' }}>
                CONNECTION WARNINGS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'rgba(253, 230, 138, 0.92)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px' }}>
                {warnings.map((warning, index) => (
                  <div key={`${warning.source}-${index}`}>
                    {warning.source.toUpperCase()} · {warning.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ ...panelStyle, padding: '14px 18px', marginBottom: '18px', borderColor: 'rgba(251, 113, 133, 0.22)', color: '#fecdd3', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <SourceCard title="GITHUB ACTIONS" subtitle="워크플로 자동 실행과 실패 추이를 집계합니다." source={github} accent="#67e8f9" />
            <SourceCard title="VERCEL DEPLOYMENTS" subtitle="최근 배포 횟수와 에러 상태를 추적합니다." source={vercel} accent="#34d399" />
            <div style={{ ...panelStyle, padding: '18px', minHeight: '164px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '8px' }}>
                DEBATE STORAGE
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.8)', marginBottom: '18px' }}>
                Supabase에 저장된 토론 수와 최근 24시간 누적치입니다.
              </div>
              {debates?.available ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.16em', color: 'rgba(125, 211, 252, 0.65)', marginBottom: '8px' }}>
                        TOTAL
                      </div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: '#f8fafc' }}>
                        {debates.totalCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.16em', color: 'rgba(74, 222, 128, 0.75)', marginBottom: '8px' }}>
                        LAST 24H
                      </div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: '#4ade80' }}>
                        {debates.last24hCount}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.68)' }}>
                    최신 토론 {debates.latest ? formatRelative(debates.latest.createdAt) : '없음'}
                  </div>
                </>
              ) : (
                <div style={{ color: 'rgba(251, 191, 36, 0.92)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', lineHeight: 1.6 }}>
                  {debates?.message || '토론 저장소를 조회할 수 없습니다.'}
                </div>
              )}
            </div>
          </div>

          <AgentCutoverPanel agents={agents} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <div style={{ ...panelStyle, padding: '20px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '8px' }}>
                최근 토론 결과
              </div>
              {debates?.latest ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '24px', color: '#f8fafc', lineHeight: 1.35 }}>
                      {debates.latest.topic}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', color: '#67e8f9', borderRadius: '999px', padding: '5px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.12em' }}>
                        ROUND {debates.latest.totalRounds}
                      </div>
                      {debates.latest.isYoutube && (
                        <div style={{ border: '1px solid rgba(251, 113, 133, 0.3)', color: '#fb7185', borderRadius: '999px', padding: '5px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.12em' }}>
                          YOUTUBE
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: 'rgba(226, 232, 240, 0.76)', marginBottom: '14px' }}>
                    생성 {formatDateTime(debates.latest.createdAt)} · {formatRelative(debates.latest.createdAt)}
                  </div>
                  <div style={{ background: 'rgba(8, 14, 28, 0.72)', border: '1px solid rgba(110, 210, 255, 0.1)', borderRadius: '14px', padding: '16px', fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', lineHeight: 1.65, color: 'rgba(241, 245, 249, 0.88)', whiteSpace: 'pre-wrap' }}>
                    {truncate(debates.latest.consensus, 520)}
                  </div>
                </>
              ) : (
                <div style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px' }}>
                  표시할 최근 토론이 없습니다.
                </div>
              )}
            </div>

            <AutomationList
              title="최근 GitHub 자동 실행"
              items={github?.recent}
              platform="github"
              emptyMessage="최근 24시간 안에 확인된 GitHub 자동 실행이 없습니다."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <AutomationList
              title="최근 Vercel 배포"
              items={vercel?.recent}
              platform="vercel"
              emptyMessage="최근 24시간 안에 확인된 Vercel 배포가 없습니다."
            />

            <div style={{ ...panelStyle, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', letterSpacing: '0.18em', color: 'rgba(148, 163, 184, 0.78)', marginBottom: '6px' }}>
                    토론 전체 모음집
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.72)' }}>
                    저장된 토론들을 최신순으로 탐색합니다.
                  </div>
                </div>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.68)' }}>
                  페이지 {debates?.page || page} / {debates?.totalPages || 1}
                </div>
              </div>

              {loading && !debates?.collection?.length ? (
                <div style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px' }}>
                  대시보드 데이터를 불러오는 중입니다...
                </div>
              ) : debates?.collection?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  {debates.collection.map((debate) => (
                    <div key={debate.id} style={{ border: '1px solid rgba(110, 210, 255, 0.08)', background: 'rgba(9, 14, 30, 0.7)', borderRadius: '12px', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.45 }}>
                          {debate.topic}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ border: '1px solid rgba(103, 232, 249, 0.24)', color: '#67e8f9', borderRadius: '999px', padding: '4px 8px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.12em' }}>
                            {formatDateTime(debate.createdAt)}
                          </div>
                          <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', color: 'rgba(226, 232, 240, 0.72)', borderRadius: '999px', padding: '4px 8px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.12em' }}>
                            R{debate.totalRounds}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', lineHeight: 1.6, color: 'rgba(226, 232, 240, 0.74)' }}>
                        {truncate(debate.consensus, 180)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', marginBottom: '16px' }}>
                  저장된 토론 기록이 없습니다.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(226, 232, 240, 0.68)' }}>
                  전체 {debates?.totalCount || 0}건
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => goToPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    style={{
                      padding: '9px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(110, 210, 255, 0.14)',
                      background: page <= 1 ? 'rgba(15, 23, 42, 0.38)' : 'rgba(15, 23, 42, 0.9)',
                      color: page <= 1 ? 'rgba(148, 163, 184, 0.45)' : '#e2e8f0',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: '10px',
                      letterSpacing: '0.14em',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    이전
                  </button>
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= (debates?.totalPages || 1)}
                    style={{
                      padding: '9px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(110, 210, 255, 0.14)',
                      background: page >= (debates?.totalPages || 1) ? 'rgba(15, 23, 42, 0.38)' : 'rgba(15, 23, 42, 0.9)',
                      color: page >= (debates?.totalPages || 1) ? 'rgba(148, 163, 184, 0.45)' : '#e2e8f0',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: '10px',
                      letterSpacing: '0.14em',
                      cursor: page >= (debates?.totalPages || 1) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}