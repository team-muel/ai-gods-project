import { useState } from 'react'
import { AI_GODS } from '../../config/aiGods'
import { useDiscussionStore } from '../../store/discussionStore'

// 마크다운 기호 제거 (**, *, #, - 등)
const cleanMarkdown = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-•]\s+/gm, '• ')
    .trim()


export default function RightPanel({ selectedGod }) {
  const { messages, topic, isDiscussing, consensus, currentRound, rounds, statusText } = useDiscussionStore()
  const [activeTab, setActiveTab] = useState('log') // 'log' | 'consensus'

  // 합의안 완료되면 자동으로 탭 전환
  const showConsensusTab = !!consensus

  const tab = showConsensusTab && activeTab === 'consensus' ? 'consensus' : activeTab

  return (
    <div
      className="panel rounded"
      style={{
        width: '380px',
        padding: '16px',
        borderColor: 'rgba(100, 200, 255, 0.15)',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: isDiscussing ? '#ff6600' : consensus ? '#00ff88' : '#334466',
              boxShadow: isDiscussing ? '0 0 8px #ff6600' : consensus ? '0 0 8px #00ff88' : 'none',
              transition: 'all 0.3s',
            }}
          />
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: 'rgba(100, 200, 255, 0.8)', letterSpacing: '0.15em' }}>
            {selectedGod ? 'GOD INFO' : 'LIVE LOG'}
          </span>
        </div>

        {/* 라운드 표시 */}
        {(isDiscussing || consensus) && (
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.4)' }}>
            ROUND {currentRound}/{rounds}
          </span>
        )}
      </div>

      {/* 탭 (로그 / 최종결과) */}
      {!selectedGod && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
          {['log', 'consensus'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              disabled={t === 'consensus' && !consensus}
              style={{
                flex: 1,
                padding: '5px',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '9px',
                letterSpacing: '0.1em',
                border: `1px solid ${tab === t ? 'rgba(100,200,255,0.5)' : 'rgba(100,200,255,0.1)'}`,
                background: tab === t ? 'rgba(0,100,200,0.2)' : 'transparent',
                color: tab === t ? 'rgba(100,200,255,0.9)' : t === 'consensus' && !consensus ? 'rgba(100,200,255,0.2)' : 'rgba(100,200,255,0.4)',
                cursor: t === 'consensus' && !consensus ? 'not-allowed' : 'pointer',
                borderRadius: '2px',
                transition: 'all 0.2s',
              }}
            >
              {t === 'log' ? '💬 LIVE LOG' : `📊 최종결과${consensus ? '' : ' (대기)'}`}
            </button>
          ))}
        </div>
      )}

      {/* 선택된 신 상세 정보 */}
      {selectedGod ? (
        <div style={{ overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', padding: '12px 0', borderBottom: '1px solid rgba(100, 200, 255, 0.1)', marginBottom: '12px' }}>
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>{selectedGod.symbol}</div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 700, color: selectedGod.color, textShadow: `0 0 10px ${selectedGod.color}`, marginBottom: '2px' }}>
              {selectedGod.name}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>
              {selectedGod.role} · {selectedGod.title}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100, 200, 255, 0.4)', letterSpacing: '0.15em', marginBottom: '6px' }}>SPECIALTIES</div>
            {selectedGod.specialties.map((s, i) => (
              <div key={i} style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.7)', padding: '3px 0 3px 8px', borderLeft: `2px solid ${selectedGod.color}44`, marginBottom: '3px' }}>
                {s}
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(5,5,20,0.6)', border: '1px solid rgba(100,200,255,0.1)', borderRadius: '2px', padding: '10px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.4)', letterSpacing: '0.15em', marginBottom: '8px' }}>STATS</div>
            {[
              { label: 'LEVEL', value: `Lv. ${selectedGod.stats.level}` },
              { label: 'DEBATES', value: selectedGod.stats.debates },
              { label: 'TRUST', value: selectedGod.stats.trust },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.4)' }}>{label}</span>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: selectedGod.color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

      ) : tab === 'consensus' && consensus ? (
        /* 최종 합의안 탭 */
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ background: 'rgba(0, 50, 20, 0.2)', border: '1px solid rgba(0, 200, 100, 0.2)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(0, 200, 100, 0.7)', letterSpacing: '0.2em', marginBottom: '10px' }}>
              ✅ FINAL CONSENSUS
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {consensus}
            </div>
          </div>
        </div>

      ) : (
        /* 실시간 로그 탭 */
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* 토론 주제 */}
          {topic && (
            <div style={{ background: 'rgba(0,80,160,0.15)', border: '1px solid rgba(0,150,255,0.2)', borderRadius: '2px', padding: '8px', marginBottom: '10px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.5)', letterSpacing: '0.15em', marginBottom: '4px' }}>TOPIC</div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{topic}</div>
            </div>
          )}

          {/* 상태 텍스트 */}
          {isDiscussing && statusText && (
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(255,180,0,0.7)', marginBottom: '8px', letterSpacing: '0.05em' }}>
              ⚡ {statusText}
            </div>
          )}

          {/* 메시지 없을 때 */}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(100,200,255,0.2)' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.3 }}>⚡</div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', letterSpacing: '0.1em' }}>
                {isDiscussing ? '신들이 생각 중...' : '토론을 시작하세요'}
              </div>
            </div>
          )}

          {/* 메시지 목록 - 라운드별 구분 */}
          {(() => {
            const rounds = [...new Set(messages.map(m => m.round))]
            return rounds.map(round => (
              <div key={round}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: '8px',
                  color: 'rgba(100,200,255,0.3)', letterSpacing: '0.2em',
                  margin: '10px 0 6px', display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(100,200,255,0.1)' }} />
                  ROUND {round} {round === 1 ? '— 초기 의견' : '— 토론'}
                  <div style={{ flex: 1, height: '1px', background: 'rgba(100,200,255,0.1)' }} />
                </div>
                {messages.filter(m => m.round === round).map((msg, i) => {
                  const god = AI_GODS.find(g => g.id === msg.godId)
                  if (!god) return null

                  // 천사 메시지
                  if (msg.type === 'angel') {
                    return (
                      <div key={i} style={{ marginBottom: '8px', marginLeft: '18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                          <span style={{ fontSize: '10px' }}>👼</span>
                          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(255,220,80,0.6)', letterSpacing: '0.1em' }}>
                            {god.name}의 천사 · 전달
                          </span>
                        </div>
                        <div style={{
                          fontFamily: 'Rajdhani, sans-serif', fontSize: '11px',
                          color: 'rgba(255,220,80,0.75)', lineHeight: 1.5,
                          paddingLeft: '14px', borderLeft: '1px solid rgba(255,220,80,0.2)',
                          fontStyle: 'italic', whiteSpace: 'pre-wrap',
                        }}>
                          {cleanMarkdown(msg.content)}
                        </div>
                      </div>
                    )
                  }

                  // 신 메시지
                  return (
                    <div key={i} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px' }}>{god.symbol}</span>
                        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: god.color, letterSpacing: '0.1em' }}>
                          {god.name}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: 'Rajdhani, sans-serif', fontSize: '13px',
                        color: 'rgba(255,255,255,0.75)', lineHeight: 1.6,
                        paddingLeft: '18px', borderLeft: `2px solid ${god.color}33`,
                        wordBreak: 'keep-all', overflowWrap: 'break-word',
                      }}>
                        {cleanMarkdown(msg.content)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          })()}

          {/* 완료 후 결과 보기 버튼 */}
          {consensus && (
            <button
              onClick={() => setActiveTab('consensus')}
              style={{
                width: '100%', marginTop: '12px', padding: '10px',
                background: 'rgba(0, 150, 80, 0.2)', border: '1px solid rgba(0, 200, 100, 0.4)',
                color: 'rgba(0, 200, 100, 0.9)', fontFamily: 'Orbitron, sans-serif',
                fontSize: '10px', letterSpacing: '0.15em', cursor: 'pointer', borderRadius: '2px',
              }}
            >
              📊 최종 결과 보기 →
            </button>
          )}
        </div>
      )}

      {/* 신 목록 (대기 상태) */}
      {!selectedGod && !isDiscussing && !topic && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(100,200,255,0.08)' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.3)', letterSpacing: '0.15em', marginBottom: '8px' }}>
            COUNCIL MEMBERS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {AI_GODS.map((god) => (
              <div key={god.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 4px', borderRadius: '2px', background: 'rgba(5,5,20,0.4)' }}>
                <span style={{ fontSize: '10px' }}>{god.symbol}</span>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: god.color, opacity: 0.7 }}>{god.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
