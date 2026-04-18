import { DENSITY_OPTIONS, IMAGE_STYLE_OPTIONS, LANGUAGE_OPTIONS, VISUAL_THEME_OPTIONS, clampCardCount } from './studioConfig'
import { buildChipStyle, buildPrimaryButtonStyle, helperTextStyle, lightFieldLabelStyle, lightInputStyle, lightSectionStyle, secondaryButtonStyle } from './studioStyles'

const tileStyle = (active) => ({
  borderRadius: '14px',
  border: `1px solid ${active ? 'rgba(37, 99, 235, 0.5)' : 'rgba(148, 163, 184, 0.18)'}`,
  background: active ? 'rgba(239, 246, 255, 0.95)' : '#ffffff',
  padding: '10px',
  cursor: 'pointer',
  boxShadow: active ? '0 0 0 2px rgba(59, 130, 246, 0.12)' : 'none',
})

const themeFrame = (themeId = 'modern') => {
  const mapping = {
    modern: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
    minimal: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    corporate: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    creative: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
    education: 'linear-gradient(135deg, #0f766e 0%, #22c55e 100%)',
    dark: 'linear-gradient(135deg, #020617 0%, #111827 100%)',
    colorful: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #8b5cf6 100%)',
  }
  return mapping[themeId] || mapping.modern
}

export default function StudioCustomizeStep({ mode = 'docs', session, onBack, onUpdateBrief, onGenerate }) {
  const { brief, outline } = session
  const selectedCount = outline.items.filter((item) => item.selected).length

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
            {mode === 'docs' ? 'DOCUMENT CUSTOMIZE' : 'DECK CUSTOMIZE'}
          </div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
            최종 결과물 톤과 밀도를 정하세요
          </div>
          <div style={helperTextStyle}>
            outline가 정해졌으니 이제 텍스트 양, 시각 테마, 이미지 스타일, 추가 지침사항을 결정합니다.
          </div>
        </div>
        <button type="button" onClick={onBack} style={{ ...secondaryButtonStyle(false), width: 'auto' }}>
          이전 단계
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={lightSectionStyle}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em', marginBottom: '10px' }}>TEXT DENSITY</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {DENSITY_OPTIONS.map((item) => (
                <button key={item.id} type="button" onClick={() => onUpdateBrief({ density: item.id })} style={{ ...buildChipStyle(brief.density === item.id, 'rgba(37, 99, 235, 0.38)'), width: '100%', textAlign: 'left', fontSize: '11px', lineHeight: 1.3 }}>
                  {item.label} · {item.note}
                </button>
              ))}
            </div>
          </div>

          <div style={lightSectionStyle}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em', marginBottom: '10px' }}>ADDITIONAL SETTINGS</div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <label>
                <span style={lightFieldLabelStyle}>언어</span>
                <select value={brief.language} onChange={(event) => onUpdateBrief({ language: event.target.value })} style={lightInputStyle}>
                  {LANGUAGE_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span style={lightFieldLabelStyle}>카드 수</span>
                <input type="range" min={8} max={15} step={1} value={clampCardCount(brief.cardCount)} onChange={(event) => onUpdateBrief({ cardCount: clampCardCount(event.target.value) })} />
                <div style={{ ...helperTextStyle, color: '#334155' }}>{clampCardCount(brief.cardCount)} cards</div>
              </label>

              <label>
                <span style={lightFieldLabelStyle}>추가 지침사항</span>
                <textarea
                  value={brief.extraInstructions}
                  onChange={(event) => onUpdateBrief({ extraInstructions: event.target.value })}
                  rows={6}
                  placeholder="예: 유머러스하게, 초보자 대상으로, 데이터 시각화를 많이 넣어주세요"
                  style={{ ...lightInputStyle, resize: 'vertical' }}
                />
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={lightSectionStyle}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em', marginBottom: '10px' }}>VISUAL THEME</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              {VISUAL_THEME_OPTIONS.map((item) => (
                <button key={item.id} type="button" onClick={() => onUpdateBrief({ visualTheme: item.id })} style={tileStyle(brief.visualTheme === item.id)}>
                  <div style={{ height: '88px', borderRadius: '10px', background: themeFrame(item.id), marginBottom: '8px' }} />
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#334155', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ marginTop: '4px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#64748b', lineHeight: 1.35 }}>{item.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={lightSectionStyle}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em', marginBottom: '10px' }}>AI IMAGE</div>
            {mode === 'docs' ? (
              <div style={{ ...helperTextStyle, color: '#334155' }}>문서 제작에서는 AI 이미지 옵션이 비활성화됩니다. 필요한 시각 요소는 표나 도식 중심으로 반영됩니다.</div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => onUpdateBrief({ aiImagesEnabled: true })} style={buildChipStyle(brief.aiImagesEnabled, 'rgba(250, 204, 21, 0.38)')}>On</button>
                  <button type="button" onClick={() => onUpdateBrief({ aiImagesEnabled: false })} style={buildChipStyle(!brief.aiImagesEnabled, 'rgba(148, 163, 184, 0.38)')}>Off</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                  {IMAGE_STYLE_OPTIONS.map((item) => (
                    <button key={item.id} type="button" onClick={() => onUpdateBrief({ imageStyle: item.id })} disabled={!brief.aiImagesEnabled} style={{ ...tileStyle(brief.imageStyle === item.id), opacity: brief.aiImagesEnabled ? 1 : 0.45 }}>
                      <div style={{ height: '68px', borderRadius: '10px', background: item.swatch, marginBottom: '8px' }} />
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#334155', fontWeight: 700 }}>{item.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={lightSectionStyle}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#1d4ed8', letterSpacing: '0.12em', marginBottom: '10px' }}>READY CHECK</div>
            <div style={{ ...helperTextStyle, color: '#334155', marginBottom: '8px' }}>선택된 outline {selectedCount}개를 기준으로 생성합니다.</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {outline.items.filter((item) => item.selected).slice(0, 8).map((item) => (
                <div key={`${item.id}-ready`} style={{ padding: '8px 10px', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', fontWeight: 700 }}>
                  {item.title}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onGenerate} disabled={selectedCount === 0} style={{ ...buildPrimaryButtonStyle(selectedCount === 0, mode === 'docs' ? 'green' : 'cyan'), width: 'auto', minWidth: '180px' }}>
          생성하기
        </button>
      </div>
    </div>
  )
}