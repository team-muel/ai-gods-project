import { STUDIO_HOME_CARDS } from './studioConfig'
import { buildModeCardStyle, bodyTextStyle } from './studioStyles'

export default function StudioHome({ onSelectMode, onSelectDebate }) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={bodyTextStyle}>
        토론은 학습용 실험실로 유지하고, PPT와 문서는 Gamma 스타일의 생성 wizard로 분리합니다. 먼저 무엇을 만들지 선택하세요.
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {STUDIO_HOME_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              if (card.id === 'debate') {
                onSelectDebate()
                return
              }
              onSelectMode(card.id)
            }}
            style={buildModeCardStyle(false, card.accent)}
          >
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: card.accent, letterSpacing: '0.18em', marginBottom: '8px' }}>
              {card.eyebrow}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              {card.label}
            </div>
            <div style={bodyTextStyle}>{card.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}