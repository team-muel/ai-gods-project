import { buildPrimaryButtonStyle, helperTextStyle, lightSectionStyle, secondaryButtonStyle } from './studioStyles'

export default function StudioResultStep({
  mode = 'docs',
  session,
  artifacts,
  outputSource = 'brief',
  onDownload,
  onBack,
  onRestart,
}) {
  const previewLines = Array.isArray(session.result?.previewLines) ? session.result.previewLines : []
  const artifact = mode === 'docs' ? artifacts?.report : artifacts?.slides

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
            {mode === 'docs' ? 'DOCUMENT READY' : 'DECK READY'}
          </div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
            결과물이 준비되었습니다
          </div>
          <div style={helperTextStyle}>
            미리보기를 확인한 뒤 {mode === 'docs' ? 'DOCX' : 'PPTX'}로 다운로드할 수 있습니다.
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderRadius: '999px', background: 'rgba(15, 23, 42, 0.72)', color: '#bff8ff', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', letterSpacing: '0.12em' }}>
          SOURCE · {outputSource === 'debate' ? 'DEBATE + BRIEF' : 'BRIEF ONLY'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 340px)', gap: '16px', alignItems: 'start' }}>
        <div style={{ ...lightSectionStyle, display: 'grid', gap: '10px' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em' }}>PREVIEW</div>
          {previewLines.length > 0 ? previewLines.map((line, index) => (
            <div key={`${line}-${index}`} style={{ padding: '10px 12px', borderRadius: '12px', background: '#f8fafc', border: '1px solid rgba(226, 232, 240, 0.9)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#0f172a', lineHeight: 1.45 }}>
              {mode === 'ppt' ? `${index + 1}. ${line}` : line}
            </div>
          )) : (
            <div style={{ ...helperTextStyle, color: '#334155' }}>표시할 preview 요약이 없습니다.</div>
          )}

          {mode === 'docs' && artifact?.markdown && (
            <pre style={{ margin: 0, padding: '12px', borderRadius: '12px', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', lineHeight: 1.45, whiteSpace: 'pre-wrap', maxHeight: '260px', overflowY: 'auto' }}>
              {String(artifact.markdown || '').split('\n').slice(0, 18).join('\n')}
            </pre>
          )}
        </div>

        <div style={{ ...lightSectionStyle, display: 'grid', gap: '10px' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em' }}>ACTIONS</div>
          <button type="button" onClick={onDownload} disabled={!artifact} style={buildPrimaryButtonStyle(!artifact, mode === 'docs' ? 'green' : 'cyan')}>
            {mode === 'docs' ? 'DOCX 다운로드' : 'PPTX 다운로드'}
          </button>
          <button type="button" onClick={onBack} style={secondaryButtonStyle(false)}>
            커스터마이징 수정
          </button>
          <button type="button" onClick={onRestart} style={secondaryButtonStyle(false)}>
            새로 시작하기
          </button>
        </div>
      </div>
    </div>
  )
}