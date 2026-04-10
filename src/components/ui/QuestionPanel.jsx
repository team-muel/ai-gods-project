import { useState } from 'react';
import { useDiscussionStore } from '../../store/discussionStore';
import { isYoutubeUrl, extractVideoId, fetchTranscript } from '../../services/youtubeService';

export default function QuestionPanel() {
  const [input, setInput] = useState('');
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState('');

  const { isDiscussing, startDiscussion, currentRound, totalRounds, statusText, clearDiscussion, consensus } = useDiscussionStore();

  const isYT = isYoutubeUrl(input)
  const isLoading = isDiscussing || isFetchingTranscript
  const displayTotalRounds = Math.max(totalRounds || 0, 1)
  const progressWidth = Math.min(100, Math.max(0, (currentRound / displayTotalRounds) * 100))

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setTranscriptError('');

    if (isYT) {
      // YouTube 모드
      const videoId = extractVideoId(input)
      if (!videoId) { setTranscriptError('유효한 YouTube URL이 아닙니다.'); return; }

      setIsFetchingTranscript(true)
      try {
        const transcript = await fetchTranscript(videoId)
        setIsFetchingTranscript(false)
        await startDiscussion(`YouTube 영상 분석: ${input}`, transcript)
      } catch (err) {
        setIsFetchingTranscript(false)
        setTranscriptError(err.message)
        return
      }
    } else {
      // 일반 질문 모드
      await startDiscussion(input)
    }
    setInput('')
  };

  return (
    <div style={{
      position: 'absolute', top: '20px', left: '20px', zIndex: 100,
      background: 'rgba(0, 0, 0, 0.82)',
      backdropFilter: 'blur(12px)',
      padding: '18px', borderRadius: '12px',
      border: `1px solid ${isYT ? 'rgba(255,0,0,0.25)' : 'rgba(255,255,255,0.08)'}`,
      width: '300px',
      transition: 'border-color 0.3s',
    }}>
      <h2 style={{ color: '#00f2fe', fontSize: '16px', marginBottom: '12px', fontFamily: 'Orbitron, monospace', letterSpacing: '0.1em' }}>
        💬 AI 신들에게 질문
      </h2>

      <form onSubmit={handleSubmit}>
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setTranscriptError('') }}
            placeholder={`질문 또는 YouTube URL 붙여넣기\n\n예: AI 투자 전망은?\n예: https://youtu.be/...`}
            disabled={isLoading}
            rows={4}
            style={{
              width: '100%', padding: '10px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${isYT ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '6px', color: 'white',
              fontSize: '13px', fontFamily: 'inherit',
              resize: 'none', outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.3s',
            }}
          />
          {/* YouTube 뱃지 */}
          {isYT && (
            <div style={{
              position: 'absolute', top: '6px', right: '6px',
              background: 'rgba(255,0,0,0.8)', color: 'white',
              fontFamily: 'Orbitron, sans-serif', fontSize: '8px',
              padding: '2px 6px', borderRadius: '3px', letterSpacing: '0.1em',
            }}>
              ▶ YouTube
            </div>
          )}
        </div>

        {/* 에러 메시지 */}
        {transcriptError && (
          <div style={{ color: '#ff6666', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', marginBottom: '8px' }}>
            ⚠ {transcriptError}
          </div>
        )}

        {/* 모드 표시 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '10px', padding: '6px 8px',
          background: isYT ? 'rgba(255,50,50,0.06)' : 'rgba(0,200,100,0.06)',
          border: `1px solid ${isYT ? 'rgba(255,80,80,0.2)' : 'rgba(0,200,100,0.15)'}`,
          borderRadius: '4px',
        }}>
          <div style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: isYT ? '#ff4444' : '#00ff88',
            boxShadow: isYT ? '0 0 6px #ff4444' : '0 0 6px #00ff88',
          }} />
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: isYT ? 'rgba(255,100,100,0.8)' : 'rgba(0,200,100,0.8)', letterSpacing: '0.1em' }}>
            {isYT ? 'YOUTUBE ANALYSIS MODE' : 'AUTO CONSENSUS MODE'}
          </span>
        </div>

        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            width: '100%', padding: '10px',
            background: isLoading ? 'rgba(80,80,80,0.4)'
              : isYT ? 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)'
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none', borderRadius: '6px', color: 'white',
            fontSize: '13px', fontWeight: 'bold',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
          }}
        >
          {isFetchingTranscript ? '📥 영상 분석 중...'
            : isDiscussing ? '🌌 토론 진행 중...'
            : isYT ? '▶ YouTube 영상 토론 시작'
            : '🚀 토론 시작'}
        </button>
      </form>

      {/* 진행 상태 */}
      {(isDiscussing || isFetchingTranscript) && (
        <div style={{ marginTop: '12px' }}>
          {isDiscussing && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.6)' }}>
                  ROUND {currentRound}
                </span>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.3)' }}>/ MAX {displayTotalRounds}</span>
              </div>
              <div style={{ height: '2px', background: 'rgba(100,200,255,0.1)', borderRadius: '1px', marginBottom: '8px' }}>
                <div style={{
                  height: '100%', width: `${progressWidth}%`,
                  background: 'linear-gradient(90deg, #00aaff, #00ff88)',
                  borderRadius: '1px', transition: 'width 0.5s ease',
                }} />
              </div>
            </>
          )}
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(255,180,0,0.7)', lineHeight: 1.4 }}>
            ⚡ {isFetchingTranscript ? '유튜브 영상 내용 추출 중...' : statusText}
          </div>
        </div>
      )}

      {/* 완료 후 초기화 */}
      {consensus && !isDiscussing && (
        <button onClick={clearDiscussion} style={{
          width: '100%', marginTop: '10px', padding: '7px',
          background: 'transparent', border: '1px solid rgba(100,200,255,0.2)',
          color: 'rgba(100,200,255,0.5)', fontFamily: 'Orbitron, sans-serif',
          fontSize: '9px', letterSpacing: '0.1em', cursor: 'pointer', borderRadius: '4px',
        }}>
          ↺ 새 토론 시작
        </button>
      )}
    </div>
  );
}
