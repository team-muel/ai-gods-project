import {
  CREATION_METHOD_CARDS,
  LANGUAGE_OPTIONS,
  SIZE_PRESET_OPTIONS,
  TEMPLATE_LIBRARY,
  clampCardCount,
  cleanText,
} from './studioConfig'
import {
  basePanelStyle,
  bodyTextStyle,
  buildChipStyle,
  buildModeCardStyle,
  buildPrimaryButtonStyle,
  fieldLabelStyle,
  helperTextStyle,
  inputStyle,
  secondaryButtonStyle,
  sectionLabelStyle,
} from './studioStyles'

const segmentedGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '8px',
}

const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024

const formatFileSize = (value = 0) => {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`
  if (value >= 1024) return `${Math.round(value / 1024)}KB`
  return `${value}B`
}

const readSourceFile = (file) => new Promise((resolve) => {
  const name = cleanText(file?.name || '')
  const size = Number(file?.size || 0)
  const lowerName = name.toLowerCase()
  const readable = /\.(txt|md|markdown|json|csv)$/i.test(lowerName) || String(file?.type || '').startsWith('text/')

  if (size > MAX_UPLOAD_BYTES) {
    resolve({
      name,
      type: file?.type || '',
      size,
      error: `${name} 파일이 너무 큽니다. ${formatFileSize(MAX_UPLOAD_BYTES)} 이하만 업로드할 수 있습니다.`,
    })
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (readable) {
      const text = String(reader.result || '').slice(0, 4000)
      resolve({
        name,
        text,
        type: file?.type || '',
        size,
        preview: text.slice(0, 220),
      })
      return
    }

    resolve({
      name,
      type: file?.type || '',
      size,
      dataUrl: String(reader.result || ''),
      preview: `${name} · ${formatFileSize(size)} · 서버에서 본문 추출 예정`,
    })
  }
  reader.onerror = () => {
    resolve({
      name,
      type: file?.type || '',
      size,
      error: `${name} 파일 내용을 읽지 못했습니다.`,
    })
  }

  if (readable) {
    reader.readAsText(file)
    return
  }

  reader.readAsDataURL(file)
})

export default function StudioMethodStep({
  mode = 'docs',
  session,
  onBackHome,
  onSelectMethod,
  onUpdateBrief,
  onRefreshRecommendations,
  onApplyRecommendation,
  onNext,
}) {
  const { brief, method, recommendations } = session
  const templateLibrary = TEMPLATE_LIBRARY[mode] || []
  const hasUploadedSources = Array.isArray(brief.uploadedSources)
    && brief.uploadedSources.some((source) => Boolean(cleanText(source?.text || '') || (typeof source?.dataUrl === 'string' && source.dataUrl.length > 0)))
  const canProceed = method === 'oneLine'
    ? cleanText(brief.promptLine).length >= 4
    : method === 'text'
      ? cleanText(brief.sourceText).length >= 20
      : method === 'template'
        ? Boolean(brief.templateId || cleanText(brief.promptLine))
        : Boolean(cleanText(brief.sourceUrl) || hasUploadedSources)

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const uploadedSources = await Promise.all(files.slice(0, 3).map((file) => readSourceFile(file)))
    onUpdateBrief({ uploadedSources, sourceDigest: '' })
    event.target.value = ''
  }

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: mode === 'docs' ? '#67e8f9' : '#93c5fd', letterSpacing: '0.16em', marginBottom: '6px' }}>
            {mode === 'docs' ? 'DOCUMENT STUDIO' : 'DECK STUDIO'}
          </div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
            생성 방식을 먼저 선택하세요
          </div>
          <div style={bodyTextStyle}>
            모든 방식은 같은 outline, customization, generation pipeline으로 이어집니다. 입력 방식만 다릅니다.
          </div>
        </div>
        <button type="button" onClick={onBackHome} style={{ ...secondaryButtonStyle(false), width: 'auto' }}>
          시작 화면으로
        </button>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        {CREATION_METHOD_CARDS.map((card) => (
          <button key={card.id} type="button" onClick={() => onSelectMethod(card.id)} style={buildModeCardStyle(method === card.id, card.accent)}>
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

      {method && (
        <div style={{ ...basePanelStyle, display: 'grid', gap: '14px' }}>
          <div>
            <div style={sectionLabelStyle}>SETUP PANEL</div>
            <div style={helperTextStyle}>
              {method === 'oneLine'
                ? '한 줄 prompt와 카드 수, 비율, 언어를 먼저 정하고 추천 프롬프트 중 하나를 선택할 수 있습니다.'
                : method === 'text'
                  ? '초안 텍스트나 메모를 넣으면 AI가 outline seed로 정리합니다.'
                  : method === 'template'
                    ? '기본 템플릿에서 출발해 주제에 맞게 seed를 덮어씁니다.'
                    : 'URL, PDF, DOCX, 텍스트 파일을 참고 소스로 넣고 outline 초안을 생성합니다.'}
            </div>
          </div>

          {method === 'oneLine' && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <label>
                <span style={fieldLabelStyle}>한줄 프롬프트</span>
                <input
                  value={brief.promptLine}
                  onChange={(event) => onUpdateBrief({ promptLine: event.target.value })}
                  placeholder={mode === 'ppt' ? '예: 생성형 AI 시장을 투자자용 10장 deck으로 정리' : '예: 생성형 AI 시장을 경영진이 읽는 전략 문서로 정리'}
                  style={inputStyle}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: '12px', alignItems: 'center' }}>
                <label>
                  <span style={fieldLabelStyle}>카드 수</span>
                  <input
                    type="number"
                    min={8}
                    max={15}
                    value={clampCardCount(brief.cardCount)}
                    onChange={(event) => onUpdateBrief({ cardCount: clampCardCount(event.target.value) })}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Slides / Cards</span>
                  <input
                    type="range"
                    min={8}
                    max={15}
                    step={1}
                    value={clampCardCount(brief.cardCount)}
                    onChange={(event) => onUpdateBrief({ cardCount: clampCardCount(event.target.value) })}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>
            </div>
          )}

          {method === 'text' && (
            <label>
              <span style={fieldLabelStyle}>텍스트 입력</span>
              <textarea
                value={brief.sourceText}
                onChange={(event) => onUpdateBrief({ sourceText: event.target.value })}
                rows={10}
                placeholder={mode === 'ppt' ? '메모, 초안, bullet을 붙여 넣으세요.' : '문서 초안, 회의 메모, 구조화되지 않은 텍스트를 붙여 넣으세요.'}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
          )}

          {method === 'template' && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={fieldLabelStyle}>템플릿 선택</div>
                {templateLibrary.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onUpdateBrief({ templateId: template.id, promptLine: template.seed })}
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '12px',
                      border: `1px solid ${brief.templateId === template.id ? 'rgba(125, 211, 252, 0.4)' : 'rgba(148, 163, 184, 0.18)'}`,
                      background: 'rgba(15, 23, 42, 0.66)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>{template.title}</div>
                    <div style={helperTextStyle}>{template.seed}</div>
                  </button>
                ))}
              </div>

              <label>
                <span style={fieldLabelStyle}>템플릿 설명 수정</span>
                <textarea
                  value={brief.promptLine}
                  onChange={(event) => onUpdateBrief({ promptLine: event.target.value })}
                  rows={4}
                  placeholder="템플릿 seed를 그대로 쓰거나 네 주제에 맞게 수정하세요."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
            </div>
          )}

          {method === 'source' && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <label>
                <span style={fieldLabelStyle}>참조 URL</span>
                <input
                  value={brief.sourceUrl}
                  onChange={(event) => onUpdateBrief({ sourceUrl: event.target.value, sourceDigest: '' })}
                  placeholder="https://example.com/article"
                  style={inputStyle}
                />
              </label>

              <label>
                <span style={fieldLabelStyle}>보조 프롬프트</span>
                <input
                  value={brief.promptLine}
                  onChange={(event) => onUpdateBrief({ promptLine: event.target.value, sourceDigest: '' })}
                  placeholder="예: 위 URL을 바탕으로 핵심 메시지를 deck으로 정리"
                  style={inputStyle}
                />
              </label>

              <label>
                <span style={fieldLabelStyle}>파일 업로드</span>
                <input type="file" accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.html,.htm,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={handleFileUpload} style={inputStyle} />
              </label>

              <div style={helperTextStyle}>
                최대 3개, 파일당 2.5MB까지 업로드할 수 있습니다. PDF와 DOCX는 서버에서 본문을 추출합니다.
              </div>

              {Array.isArray(brief.uploadedSources) && brief.uploadedSources.length > 0 && (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {brief.uploadedSources.map((source, index) => (
                    <div key={`${source.name}-${index}`} style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.66)' }}>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>{source.name}</div>
                      <div style={helperTextStyle}>{source.error || source.preview || String(source.text || '').slice(0, 220)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div>
              <div style={fieldLabelStyle}>크기 조정</div>
              <div style={segmentedGridStyle}>
                {SIZE_PRESET_OPTIONS.map((item) => (
                  <button key={item.id} type="button" onClick={() => onUpdateBrief({ sizePreset: item.id })} style={buildChipStyle(brief.sizePreset === item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <label>
              <span style={fieldLabelStyle}>언어</span>
              <select value={brief.language} onChange={(event) => onUpdateBrief({ language: event.target.value })} style={inputStyle}>
                {LANGUAGE_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          {method === 'oneLine' && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div>
                  <div style={sectionLabelStyle}>추천 프롬프트</div>
                  <div style={helperTextStyle}>처음에는 바로 쓸 수 있는 기본 제안을 보여주고, 입력 후 새로고침하면 그 주제 기준으로 다시 제안합니다.</div>
                </div>
                <button type="button" onClick={onRefreshRecommendations} style={{ ...secondaryButtonStyle(false), width: 'auto' }}>
                  새로고침
                </button>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {recommendations.items.length > 0 ? recommendations.items.map((item) => (
                  <button key={item.id} type="button" onClick={() => onApplyRecommendation(item)} style={{ textAlign: 'left', padding: '12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.66)', cursor: 'pointer' }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>{item.title}</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#e2e8f0', lineHeight: 1.45, marginBottom: '6px' }}>{item.text}</div>
                    <div style={helperTextStyle}>{item.description}</div>
                  </button>
                )) : (
                  <div style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.5)', ...helperTextStyle }}>
                    추천 프롬프트를 불러오는 중입니다. 새로고침으로 다른 제안도 볼 수 있습니다.
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onSelectMethod(null)} style={{ ...secondaryButtonStyle(false), width: 'auto', minWidth: '120px' }}>
              방식 다시 선택
            </button>
            <button type="button" onClick={onNext} disabled={!canProceed} style={{ ...buildPrimaryButtonStyle(!canProceed, mode === 'docs' ? 'green' : 'cyan'), width: 'auto', minWidth: '180px' }}>
              다음: outline 만들기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}