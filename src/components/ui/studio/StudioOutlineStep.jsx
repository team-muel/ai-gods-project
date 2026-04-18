import { buildPrimaryButtonStyle, fieldLabelStyle, helperTextStyle, inputStyle, secondaryButtonStyle, sectionLabelStyle } from './studioStyles'

export default function StudioOutlineStep({
  mode = 'docs',
  session,
  onBack,
  onNext,
  onRegenerate,
  onToggleItem,
  onUpdateItem,
  onMoveItem,
}) {
  const { outline } = session
  const selectedCount = outline.items.filter((item) => item.selected).length
  const modeLabel = mode === 'ppt' ? '슬라이드' : '섹션'

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
            {mode === 'docs' ? 'DOCUMENT OUTLINE' : 'DECK OUTLINE'}
          </div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
            AI가 만든 목차를 검토하세요
          </div>
          <div style={helperTextStyle}>
            체크를 끄면 제외되고, 제목과 bullet 메모를 바로 수정할 수 있습니다. 순서는 생성 결과에 그대로 반영됩니다.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBack} style={{ ...secondaryButtonStyle(false), width: 'auto' }}>
            이전 단계
          </button>
          <button type="button" onClick={onRegenerate} disabled={outline.loading} style={{ ...secondaryButtonStyle(outline.loading), width: 'auto' }}>
            {outline.loading ? 'AI 재생성 중...' : 'AI 목차 다시 만들기'}
          </button>
        </div>
      </div>

      {outline.error && (
        <div style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.18)', background: 'rgba(69, 10, 10, 0.28)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#fecaca', lineHeight: 1.45 }}>
          {outline.error}
        </div>
      )}

      {outline.loading && (
        <div style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(125, 211, 252, 0.16)', background: 'rgba(15, 23, 42, 0.72)', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#e2e8f0', lineHeight: 1.45 }}>
          AI가 {mode === 'ppt' ? '슬라이드' : '문서'} outline을 만드는 중입니다.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 420px)', gap: '14px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '10px' }}>
          {outline.items.map((item, index) => (
            <div key={item.id} style={{ padding: '14px', borderRadius: '14px', border: `1px solid ${item.selected ? 'rgba(125, 211, 252, 0.22)' : 'rgba(148, 163, 184, 0.12)'}`, background: item.selected ? 'rgba(15, 23, 42, 0.7)' : 'rgba(15, 23, 42, 0.44)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <label style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', minWidth: 0, flex: 1 }}>
                  <input type="checkbox" checked={item.selected} onChange={() => onToggleItem(item.id)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#7dd3fc', letterSpacing: '0.12em', marginBottom: '4px' }}>
                      {item.kind === 'image' ? 'IMAGE CARD' : `${modeLabel.toUpperCase()} ${index + 1}`}
                    </div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#f8fafc', fontWeight: 700, lineHeight: 1.35, wordBreak: 'break-word' }}>
                      {item.title}
                    </div>
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={() => onMoveItem(item.id, 'up')} style={{ ...secondaryButtonStyle(index === 0), width: 'auto', padding: '8px 10px' }} disabled={index === 0}>↑</button>
                  <button type="button" onClick={() => onMoveItem(item.id, 'down')} style={{ ...secondaryButtonStyle(index === outline.items.length - 1), width: 'auto', padding: '8px 10px' }} disabled={index === outline.items.length - 1}>↓</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <label>
                  <span style={fieldLabelStyle}>제목</span>
                  <input value={item.title} onChange={(event) => onUpdateItem(item.id, { title: event.target.value })} style={inputStyle} />
                </label>
                <label>
                  <span style={fieldLabelStyle}>설명 / bullet 메모</span>
                  <textarea
                    value={item.note}
                    onChange={(event) => onUpdateItem(item.id, { note: event.target.value, bullets: String(event.target.value || '').split(/\n/).map((line) => String(line || '').replace(/^[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 3) })}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ padding: '14px', borderRadius: '14px', border: '1px solid rgba(125, 211, 252, 0.14)', background: 'rgba(2, 6, 23, 0.46)' }}>
            <div style={sectionLabelStyle}>OUTLINE SUMMARY</div>
            <div style={{ ...helperTextStyle, marginBottom: '10px' }}>
              현재 선택된 {modeLabel}은 {selectedCount}개입니다. 체크를 끄면 최종 생성에서 제외됩니다.
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {outline.items.filter((item) => item.selected).map((item, index) => (
                <div key={`${item.id}-summary`} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.62)' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(125, 211, 252, 0.72)', letterSpacing: '0.12em', marginBottom: '4px' }}>
                    {item.kind === 'image' ? 'IMAGE SLOT' : `${modeLabel.toUpperCase()} ${index + 1}`}
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.35, marginBottom: '4px' }}>
                    {item.title}
                  </div>
                  {item.bullets.length > 0 && (
                    <div style={helperTextStyle}>{item.bullets.map((bullet) => `• ${bullet}`).join(' / ')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onNext} disabled={selectedCount === 0 || outline.loading} style={{ ...buildPrimaryButtonStyle(selectedCount === 0 || outline.loading, mode === 'docs' ? 'green' : 'cyan'), width: 'auto', minWidth: '180px' }}>
          다음: 커스터마이징
        </button>
      </div>
    </div>
  )
}