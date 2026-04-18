import { helperTextStyle, secondaryButtonStyle } from './studioStyles'

export default function StudioGenerateStep({ mode = 'docs', session, onBack }) {
  const { generation } = session
  const progress = Math.max(0, Math.min(100, Number(generation.progress || 0)))

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div>
        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
          {mode === 'docs' ? 'DOCUMENT GENERATION' : 'DECK GENERATION'}
        </div>
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
          생성 중입니다
        </div>
        <div style={helperTextStyle}>
          outline와 커스터마이징 정보를 바탕으로 실제 {mode === 'docs' ? 'DOCX 문서' : 'PPTX deck'}를 만들고 있습니다.
        </div>
      </div>

      <div style={{ padding: '18px', borderRadius: '18px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(15, 23, 42, 0.64)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#bff8ff', letterSpacing: '0.14em' }}>
            {generation.phase || 'preparing'}
          </div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: 'rgba(191, 248, 255, 0.74)', letterSpacing: '0.14em' }}>
            {progress}%
          </div>
        </div>

        <div style={{ height: '10px', borderRadius: '999px', background: 'rgba(100,200,255,0.1)', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: mode === 'docs' ? 'linear-gradient(90deg, #0f766e, #22c55e)' : 'linear-gradient(90deg, #2563eb, #22d3ee)', transition: 'width 0.4s ease' }} />
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {[
            'outline를 기준으로 생성 계획 정리',
            '본문 또는 슬라이드 구조 생성',
            '시각 테마 및 export 형식 정리',
          ].map((line, index) => (
            <div key={`${line}-${index}`} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: progress >= (index + 1) * 25 ? '#34d399' : 'rgba(148, 163, 184, 0.5)' }} />
              <div style={helperTextStyle}>{line}</div>
            </div>
          ))}
        </div>
      </div>

      {generation.error && (
        <div style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.18)', background: 'rgba(69, 10, 10, 0.28)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#fecaca', lineHeight: 1.45 }}>
          {generation.error}
        </div>
      )}

      {generation.status === 'error' && (
        <button type="button" onClick={onBack} style={{ ...secondaryButtonStyle(false), width: 'auto', minWidth: '140px' }}>
          커스터마이징으로 돌아가기
        </button>
      )}
    </div>
  )
}