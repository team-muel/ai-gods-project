import { useState } from 'react'

export default function LeftPanel({ onStartDebate, isDebating }) {
  const [topic, setTopic] = useState('')
  const [rounds, setRounds] = useState(2)
  const [deepMode, setDeepMode] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    onStartDebate(topic)
    setTopic('')
  }

  return (
    <div
      className="panel rounded"
      style={{
        width: '220px',
        padding: '16px',
        borderColor: 'rgba(100, 200, 255, 0.15)',
      }}
    >
      {/* 패널 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isDebating ? '#00ff88' : '#334466',
            boxShadow: isDebating ? '0 0 8px #00ff88' : 'none',
            transition: 'all 0.3s',
          }}
        />
        <span
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '10px',
            color: 'rgba(100, 200, 255, 0.8)',
            letterSpacing: '0.15em',
          }}
        >
          COUNCIL INPUT
        </span>
      </div>

      {/* 질문 입력 폼 */}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '11px',
              color: 'rgba(100, 200, 255, 0.5)',
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '6px',
            }}
          >
            QUERY
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="신들에게 질문하세요..."
            disabled={isDebating}
            rows={4}
            style={{
              width: '100%',
              background: 'rgba(5, 5, 20, 0.8)',
              border: '1px solid rgba(100, 200, 255, 0.2)',
              color: '#ffffff',
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '13px',
              padding: '8px 10px',
              outline: 'none',
              resize: 'none',
              borderRadius: '2px',
              lineHeight: 1.5,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(100, 200, 255, 0.5)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(100, 200, 255, 0.2)'
            }}
          />
        </div>

        {/* 옵션 */}
        <div className="mb-4">
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '11px',
              color: 'rgba(100, 200, 255, 0.5)',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            OPTIONS
          </div>

          {/* 심화 분석 토글 */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            <div
              onClick={() => setDeepMode(!deepMode)}
              style={{
                width: '28px',
                height: '14px',
                borderRadius: '7px',
                background: deepMode ? 'rgba(0, 150, 255, 0.5)' : 'rgba(50, 50, 80, 0.8)',
                border: `1px solid ${deepMode ? 'rgba(0, 150, 255, 0.6)' : 'rgba(100, 200, 255, 0.2)'}`,
                position: 'relative',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: deepMode ? '#00aaff' : '#334466',
                  position: 'absolute',
                  top: '1px',
                  left: deepMode ? '15px' : '1px',
                  transition: 'all 0.2s',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '12px',
                color: deepMode ? 'rgba(100, 200, 255, 0.8)' : 'rgba(100, 200, 255, 0.4)',
              }}
            >
              심화 분석
            </span>
          </label>

          {/* 라운드 수 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '12px',
                color: 'rgba(100, 200, 255, 0.5)',
                flexShrink: 0,
              }}
            >
              라운드
            </span>
            <input
              type="number"
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
              min={1}
              max={5}
              style={{
                width: '50px',
                background: 'rgba(5, 5, 20, 0.8)',
                border: '1px solid rgba(100, 200, 255, 0.2)',
                color: '#ffffff',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '12px',
                padding: '3px 6px',
                outline: 'none',
                borderRadius: '2px',
                textAlign: 'center',
              }}
            />
            <span
              style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '12px',
                color: 'rgba(100, 200, 255, 0.3)',
              }}
            >
              회
            </span>
          </div>
        </div>

        {/* 시작 버튼 */}
        <button
          type="submit"
          disabled={isDebating || !topic.trim()}
          style={{
            width: '100%',
            padding: '10px',
            background: isDebating
              ? 'rgba(0, 50, 100, 0.3)'
              : topic.trim()
              ? 'rgba(0, 100, 200, 0.3)'
              : 'rgba(20, 20, 40, 0.5)',
            border: `1px solid ${
              isDebating
                ? 'rgba(0, 150, 255, 0.2)'
                : topic.trim()
                ? 'rgba(0, 150, 255, 0.5)'
                : 'rgba(100, 200, 255, 0.1)'
            }`,
            color: topic.trim() && !isDebating
              ? 'rgba(100, 200, 255, 0.9)'
              : 'rgba(100, 200, 255, 0.3)',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '11px',
            letterSpacing: '0.15em',
            cursor: isDebating || !topic.trim() ? 'not-allowed' : 'pointer',
            borderRadius: '2px',
            transition: 'all 0.2s',
            boxShadow: topic.trim() && !isDebating
              ? '0 0 15px rgba(0, 150, 255, 0.2)'
              : 'none',
          }}
        >
          {isDebating ? '⚡ DEBATING...' : '▶ INITIATE'}
        </button>
      </form>

      {/* 진행 중 표시 */}
      {isDebating && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px',
            background: 'rgba(0, 100, 50, 0.1)',
            border: '1px solid rgba(0, 200, 100, 0.2)',
            borderRadius: '2px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '11px',
              color: 'rgba(0, 200, 100, 0.7)',
              letterSpacing: '0.1em',
            }}
          >
            신들이 토론 중입니다...
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '4px',
              marginTop: '6px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: 'rgba(0, 200, 100, 0.6)',
                  animation: `pulse-glow 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
