import { useEffect, useState } from 'react'
import { AI_GODS } from '../../config/aiGods'
import { useDiscussionStore } from '../../store/discussionStore'
import { submitDebateFeedback } from '../../services/rewardLearningService'

// 마크다운 기호 제거 (**, *, #, - 등)
const cleanMarkdown = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-•]\s+/gm, '• ')
    .trim()

const DOSSIER_STATUS_LABELS = {
  needs_evidence: '근거 수집 필요',
  draft_ready: '초안 준비 완료',
  report_ready: '보고서 생성 가능',
}

const DOSSIER_STATUS_COLORS = {
  needs_evidence: '#fbbf24',
  draft_ready: '#67e8f9',
  report_ready: '#34d399',
}

const getScholarScore = (item) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const directScore = Number(metadata.scholarlyScore)
  if (Number.isFinite(directScore)) return Math.round(directScore)

  const rankingScore = Number(metadata?.rankingSignals?.total)
  return Number.isFinite(rankingScore) ? Math.round(rankingScore) : 0
}

const getEvidenceSignalText = (item) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  const benchmarkTerms = Array.isArray(metadata?.benchmarkSignals?.matchedTerms)
    ? metadata.benchmarkSignals.matchedTerms.filter(Boolean).slice(0, 2)
    : []
  const communitySignals = metadata.communitySignals && typeof metadata.communitySignals === 'object' ? metadata.communitySignals : {}
  const providers = Array.isArray(metadata.sourceProviders) ? metadata.sourceProviders.filter(Boolean).slice(0, 3) : []
  const bits = []

  if (benchmarkTerms.length > 0) bits.push(`signals ${benchmarkTerms.join(', ')}`)
  if (providers.length > 1) bits.push(`indexed ${providers.join('+')}`)
  if (Number(communitySignals.upvotes || 0) > 0) bits.push(`HF upvotes ${communitySignals.upvotes}`)
  else if (Number(communitySignals.collectionsCount || 0) > 0) bits.push(`HF collections ${communitySignals.collectionsCount}`)

  return bits.join(' · ')
}

const getLocalCitationTag = (citation = {}, index = 0) => cleanMarkdown(citation.localTag || citation.evidenceId || `E${index + 1}`)

const getLedgerEntries = (entries = []) => (Array.isArray(entries) ? entries.filter(Boolean) : [])

const getDossierDebateLedger = (dossier = {}) => getLedgerEntries(dossier?.citationLedger?.debate)

const getArtifactCitationLedger = (artifact = {}) => getLedgerEntries(artifact?.structuredContent?.citationLedger)

const formatCitationStrength = (citation = {}) => {
  const bits = []

  if (Number(citation.citationScore || 0) > 0) bits.push(`cite ${citation.citationScore}`)
  if (Number(citation.scholarlyScore || 0) > 0) bits.push(`scholar ${citation.scholarlyScore}`)

  return bits.join(' · ')
}

const formatCitationLocationPreview = (locations = []) => getLedgerEntries(locations)
  .map((location) => location.locationLabel)
  .filter(Boolean)
  .slice(0, 3)
  .join(' · ')

function CitationLedgerList({
  entries = [],
  emptyText = '기록된 citation 사용처가 없습니다.',
  accentColor = '#7dd3fc',
  borderColor = 'rgba(125, 211, 252, 0.18)',
  background = 'rgba(2, 6, 23, 0.38)',
}) {
  const ledgerEntries = getLedgerEntries(entries)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {ledgerEntries.length > 0 ? ledgerEntries.map((entry, entryIndex) => (
        <div
          key={entry.locationId || `ledger-${entryIndex + 1}`}
          style={{ border: `1px solid ${borderColor}`, borderRadius: '4px', padding: '10px', background }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: accentColor, letterSpacing: '0.12em' }}>
              {entry.locationLabel || entry.locationId || `location ${entryIndex + 1}`}
            </div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '0.08em' }}>
              {getLedgerEntries(entry.citations).length} refs
            </div>
          </div>
          {entry.excerpt && (
            <div style={{ marginBottom: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', lineHeight: 1.45, color: 'rgba(226, 232, 240, 0.78)' }}>
              {cleanMarkdown(entry.excerpt)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {getLedgerEntries(entry.citations).slice(0, 4).map((citation, citationIndex) => (
              <div
                key={`${entry.locationId || entryIndex}-${citation.evidenceId || citationIndex}`}
                style={{ border: '1px solid rgba(148, 163, 184, 0.12)', borderRadius: '4px', padding: '8px', background: 'rgba(15, 23, 42, 0.38)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: accentColor, letterSpacing: '0.1em' }}>
                    {getLocalCitationTag(citation, citationIndex)}
                  </div>
                  {formatCitationStrength(citation) && (
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '0.08em' }}>
                      {formatCitationStrength(citation)}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', lineHeight: 1.45, color: 'rgba(226, 232, 240, 0.82)', wordBreak: 'break-word' }}>
                  {citation.url ? (
                    <a href={citation.url} target="_blank" rel="noreferrer" style={{ color: accentColor, textDecoration: 'none' }}>
                      {citation.label || citation.url}
                    </a>
                  ) : (
                    citation.label
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )) : (
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(148, 163, 184, 0.72)' }}>
          {emptyText}
        </div>
      )}
    </div>
  )
}


export default function RightPanel({ selectedGod }) {
  const { messages, topic, isDiscussing, debateId, consensus, dossier, artifacts, currentRound, totalRounds, statusText } = useDiscussionStore()
  const [activeTab, setActiveTab] = useState('log') // 'log' | 'consensus' | 'dossier' | 'artifacts'
  const [feedbackState, setFeedbackState] = useState({ direction: '', saving: false, message: '' })
  const displayTotalRounds = Math.max(totalRounds || 0, currentRound || 0, 1)

  // 합의안 완료되면 자동으로 탭 전환
  const showConsensusTab = !!consensus
  const showDossierTab = !!dossier
  const showArtifactsTab = !!artifacts

  const tab = showArtifactsTab && activeTab === 'artifacts'
    ? 'artifacts'
    : showDossierTab && activeTab === 'dossier'
      ? 'dossier'
      : showConsensusTab && activeTab === 'consensus'
        ? 'consensus'
        : 'log'
  const debateCitationLedger = getDossierDebateLedger(dossier)
  const dossierCitationSummary = dossier?.citationLedger?.summary && typeof dossier.citationLedger.summary === 'object' ? dossier.citationLedger.summary : {}
  const reportCitationLedger = getArtifactCitationLedger(artifacts?.report)
  const slideCitationLedger = getArtifactCitationLedger(artifacts?.slides)

  useEffect(() => {
    setFeedbackState({ direction: '', saving: false, message: '' })
  }, [debateId, consensus])

  const handleFeedback = async (direction) => {
    if (!debateId || feedbackState.saving || feedbackState.direction) return

    try {
      setFeedbackState({ direction: '', saving: true, message: '' })
      const result = await submitDebateFeedback({ debateId, direction })
      if (result?.rewardLearningReady === false || result?.skipped) {
        setFeedbackState({
          direction: 'skipped',
          saving: false,
          message: result.message || '보상학습 테이블이 아직 없어 피드백 저장은 건너뜁니다. 운영에는 영향이 없습니다.',
        })
        return
      }

      setFeedbackState({
        direction,
        saving: false,
        message: direction === 'up'
          ? `강화학습용 긍정 피드백 저장 완료 · ${result.updatedPairs || 0}개 pair 보정`
          : `강화학습용 부정 피드백 저장 완료 · ${result.updatedPairs || 0}개 pair 보정`,
      })
    } catch (error) {
      setFeedbackState({ direction: '', saving: false, message: error.message || '피드백 저장 실패' })
    }
  }

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
            ROUND {currentRound}/{displayTotalRounds}
          </span>
        )}
      </div>

      {/* 탭 (로그 / 최종결과) */}
      {!selectedGod && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
          {[
            { id: 'log', label: '💬 LIVE LOG', disabled: false },
            { id: 'consensus', label: `📊 최종결과${consensus ? '' : ' (대기)'}`, disabled: !consensus },
            { id: 'dossier', label: `🗂 DOSSIER${dossier ? '' : ' (대기)'}`, disabled: !dossier },
            { id: 'artifacts', label: `📝 OUTPUT${artifacts ? '' : ' (대기)'}`, disabled: !artifacts },
          ].map(({ id, label, disabled }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              disabled={disabled}
              style={{
                flex: 1,
                padding: '5px',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '9px',
                letterSpacing: '0.1em',
                border: `1px solid ${tab === id ? 'rgba(100,200,255,0.5)' : 'rgba(100,200,255,0.1)'}`,
                background: tab === id ? 'rgba(0,100,200,0.2)' : 'transparent',
                color: tab === id ? 'rgba(100,200,255,0.9)' : disabled ? 'rgba(100,200,255,0.2)' : 'rgba(100,200,255,0.4)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                borderRadius: '2px',
                transition: 'all 0.2s',
              }}
            >
              {label}
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
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(0, 200, 100, 0.15)' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100, 200, 255, 0.55)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                RL FEEDBACK
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleFeedback('up')}
                  disabled={!debateId || feedbackState.saving || !!feedbackState.direction}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '3px',
                    border: '1px solid rgba(0, 255, 136, 0.35)',
                    background: feedbackState.direction === 'up' ? 'rgba(0, 255, 136, 0.18)' : 'rgba(0, 80, 50, 0.18)',
                    color: '#9bffd2',
                    cursor: !debateId || feedbackState.saving || !!feedbackState.direction ? 'not-allowed' : 'pointer',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    opacity: !debateId || feedbackState.saving || !!feedbackState.direction ? 0.55 : 1,
                  }}
                >
                  👍 좋은 결론
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('down')}
                  disabled={!debateId || feedbackState.saving || !!feedbackState.direction}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '3px',
                    border: '1px solid rgba(255, 120, 120, 0.35)',
                    background: feedbackState.direction === 'down' ? 'rgba(255, 80, 80, 0.18)' : 'rgba(80, 10, 10, 0.18)',
                    color: '#ffc2c2',
                    cursor: !debateId || feedbackState.saving || !!feedbackState.direction ? 'not-allowed' : 'pointer',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    opacity: !debateId || feedbackState.saving || !!feedbackState.direction ? 0.55 : 1,
                  }}
                >
                  👎 별로인 결론
                </button>
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: feedbackState.message.includes('실패') ? '#ffb4b4' : 'rgba(200, 255, 230, 0.72)' }}>
                {feedbackState.saving ? '피드백 저장 중...' : feedbackState.message || '최종 합의안에 대한 사람 피드백을 reward event와 preference pair 점수에 반영합니다.'}
              </div>
            </div>
            {dossier && (
              <button
                type="button"
                onClick={() => setActiveTab('dossier')}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  padding: '9px 10px',
                  borderRadius: '3px',
                  border: '1px solid rgba(103, 232, 249, 0.35)',
                  background: 'rgba(8, 47, 73, 0.35)',
                  color: '#a5f3fc',
                  cursor: 'pointer',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: '9px',
                  letterSpacing: '0.12em',
                }}
              >
                🗂 Dossier 보기 →
              </button>
            )}
          </div>
        </div>

      ) : tab === 'dossier' && dossier ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ background: 'rgba(6, 26, 48, 0.65)', border: '1px solid rgba(103, 232, 249, 0.18)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.76)', letterSpacing: '0.2em', marginBottom: '6px' }}>
                  DOSSIER READY STATE
                </div>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#f8fafc', fontWeight: 700 }}>
                  {dossier.statusLabel || DOSSIER_STATUS_LABELS[dossier.status] || dossier.status}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ border: `1px solid ${(DOSSIER_STATUS_COLORS[dossier.status] || '#67e8f9')}55`, color: DOSSIER_STATUS_COLORS[dossier.status] || '#67e8f9', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                  SCORE {dossier.readinessScore || 0}
                </div>
                <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', color: 'rgba(226, 232, 240, 0.78)', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                  CLAIM {dossier.metrics?.claimCount || 0}
                </div>
                <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', color: 'rgba(226, 232, 240, 0.78)', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                  EVIDENCE {dossier.metrics?.evidenceCount || 0}
                </div>
                <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', color: 'rgba(226, 232, 240, 0.78)', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                  ACTION {dossier.metrics?.actionItemCount || 0}
                </div>
                <div style={{ border: '1px solid rgba(74, 222, 128, 0.18)', color: '#86efac', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                  CITATION {dossier.metrics?.averageCitationScore || 0}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.65)', letterSpacing: '0.16em', marginBottom: '6px' }}>
                EXECUTIVE SUMMARY
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', lineHeight: 1.65, color: 'rgba(241, 245, 249, 0.88)', whiteSpace: 'pre-wrap' }}>
                {cleanMarkdown(dossier.executiveSummary || dossier.consensusSnapshot || '요약이 아직 없습니다.')}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.65)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                KEY CLAIMS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(dossier.claims || []).length > 0 ? dossier.claims.map((claim) => (
                  <div key={claim.id} style={{ borderLeft: '2px solid rgba(103, 232, 249, 0.35)', paddingLeft: '10px' }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: claim.evidenceStatus === 'linked' ? '#34d399' : '#fbbf24', letterSpacing: '0.12em', marginBottom: '4px' }}>
                      {claim.ownerGodName} · {claim.evidenceStatus === 'linked' ? 'SOURCE LINKED' : 'SOURCE MISSING'}
                    </div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.55, color: 'rgba(226, 232, 240, 0.82)' }}>
                      {cleanMarkdown(claim.statement)}
                    </div>
                  </div>
                )) : (
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(148, 163, 184, 0.72)' }}>
                    추출된 핵심 주장이 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(74, 222, 128, 0.68)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                CITATION QUALITY
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div style={{ border: '1px solid rgba(74, 222, 128, 0.18)', borderRadius: '4px', padding: '8px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(134, 239, 172, 0.82)', letterSpacing: '0.12em', marginBottom: '4px' }}>AVERAGE</div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#ecfdf5', fontWeight: 700 }}>{dossier.citationSummary?.averageCitationScore || 0}</div>
                </div>
                <div style={{ border: '1px solid rgba(125, 211, 252, 0.18)', borderRadius: '4px', padding: '8px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(125, 211, 252, 0.82)', letterSpacing: '0.12em', marginBottom: '4px' }}>VERIFIED</div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#e0f2fe', fontWeight: 700 }}>{dossier.citationSummary?.verifiedCount || 0}</div>
                </div>
                <div style={{ border: '1px solid rgba(196, 181, 253, 0.18)', borderRadius: '4px', padding: '8px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(221, 214, 254, 0.82)', letterSpacing: '0.12em', marginBottom: '4px' }}>SCHOLAR</div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#ede9fe', fontWeight: 700 }}>{dossier.scholarlySummary?.averageScholarlyScore || 0}</div>
                </div>
                <div style={{ border: '1px solid rgba(251, 191, 36, 0.18)', borderRadius: '4px', padding: '8px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: 'rgba(253, 224, 71, 0.82)', letterSpacing: '0.12em', marginBottom: '4px' }}>BENCHMARK</div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#fef08a', fontWeight: 700 }}>{dossier.scholarlySummary?.benchmarkBackedCount || 0}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.55, color: 'rgba(209, 250, 229, 0.8)' }}>
                {cleanMarkdown(dossier.citationSummary?.recommendedAction || 'citation 품질 평가가 아직 없습니다.')}
              </div>
              {dossier.scholarlySummary?.recommendedAction && (
                <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.55, color: 'rgba(221, 214, 254, 0.84)' }}>
                  {cleanMarkdown(dossier.scholarlySummary.recommendedAction)}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.65)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                EVIDENCE INVENTORY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(dossier.evidence || []).length > 0 ? dossier.evidence.map((item) => (
                  <div key={item.id} style={{ border: '1px solid rgba(148, 163, 184, 0.14)', borderRadius: '4px', padding: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#a5f3fc', letterSpacing: '0.12em' }}>
                        {String(item.type || 'web').toUpperCase()} · {String(item.verificationStatus || 'unverified').toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#86efac', letterSpacing: '0.1em' }}>
                          CITE {item.citationScore || 0}
                        </div>
                        {getScholarScore(item) > 0 && (
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#ddd6fe', letterSpacing: '0.1em' }}>
                            SCHOLAR {getScholarScore(item)}
                          </div>
                        )}
                        {Number(item.artifactPriorityScore || 0) > 0 && (
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#fcd34d', letterSpacing: '0.1em' }}>
                            PRIORITY {item.artifactPriorityScore}
                          </div>
                        )}
                        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(148, 163, 184, 0.8)', letterSpacing: '0.1em' }}>
                          MENTION {item.mentionCount || 0}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.5, color: 'rgba(226, 232, 240, 0.82)', wordBreak: 'break-word' }}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'none' }}>
                          {item.label || item.url}
                        </a>
                      ) : (
                        item.label
                      )}
                    </div>
                    {item.excerpt && (
                      <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', lineHeight: 1.5, color: 'rgba(148, 163, 184, 0.88)' }}>
                        {cleanMarkdown(item.excerpt)}
                      </div>
                    )}
                    {getEvidenceSignalText(item) && (
                      <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', lineHeight: 1.45, color: '#c4b5fd' }}>
                        {getEvidenceSignalText(item)}
                      </div>
                    )}
                    {Array.isArray(item.artifactPriorityReasons) && item.artifactPriorityReasons.length > 0 && (
                      <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', lineHeight: 1.45, color: '#fde68a' }}>
                        {item.artifactPriorityReasons.join(' · ')}
                      </div>
                    )}
                    {Number(item.citationUsageCount || 0) > 0 && (
                      <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', lineHeight: 1.45, color: '#7dd3fc' }}>
                        USED {item.citationUsageCount} · {formatCitationLocationPreview(item.citationLocations || [])}
                      </div>
                    )}
                    {(item.citationIssues || []).length > 0 && (
                      <div style={{ marginTop: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', lineHeight: 1.45, color: '#fcd34d' }}>
                        {item.citationIssues.slice(0, 2).join(' · ')}
                      </div>
                    )}
                  </div>
                )) : (
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(251, 191, 36, 0.82)' }}>
                    연결된 외부 근거가 아직 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(125, 211, 252, 0.76)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                DEBATE CITATION LEDGER
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div style={{ border: '1px solid rgba(125, 211, 252, 0.18)', color: '#bae6fd', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', letterSpacing: '0.1em' }}>
                  CITED MSG {dossierCitationSummary.citedDebateMessageCount || 0}
                </div>
                <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', color: 'rgba(226, 232, 240, 0.78)', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', letterSpacing: '0.1em' }}>
                  UNCITED {dossierCitationSummary.uncitedDebateMessageCount || 0}
                </div>
                <div style={{ border: '1px solid rgba(52, 211, 153, 0.18)', color: '#a7f3d0', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', letterSpacing: '0.1em' }}>
                  EVIDENCE USED {dossierCitationSummary.citedEvidenceCount || 0}
                </div>
                <div style={{ border: '1px solid rgba(196, 181, 253, 0.18)', color: '#ddd6fe', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', letterSpacing: '0.1em' }}>
                  CONSENSUS {dossierCitationSummary.citedConsensus ? 'LINKED' : 'NONE'}
                </div>
              </div>
              <CitationLedgerList
                entries={debateCitationLedger}
                emptyText="토론 발언에서 기록된 citation 사용처가 아직 없습니다."
                accentColor="#7dd3fc"
                borderColor="rgba(125, 211, 252, 0.18)"
                background="rgba(2, 6, 23, 0.32)"
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.65)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                ACTION ITEMS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(dossier.actionItems || []).length > 0 ? dossier.actionItems.map((item, index) => (
                  <div key={`${item.horizon}-${index}`} style={{ borderLeft: '2px solid rgba(52, 211, 153, 0.35)', paddingLeft: '10px' }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#34d399', letterSpacing: '0.12em', marginBottom: '4px' }}>
                      {item.horizon}
                    </div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.55, color: 'rgba(226, 232, 240, 0.82)' }}>
                      {cleanMarkdown(item.text)}
                    </div>
                  </div>
                )) : (
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(148, 163, 184, 0.72)' }}>
                    구조화된 실행 항목이 아직 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.65)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                EVIDENCE GAPS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(dossier.evidenceGaps || []).length > 0 ? dossier.evidenceGaps.map((gap, index) => (
                  <div key={`${gap}-${index}`} style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.5, color: '#fcd34d' }}>
                    • {cleanMarkdown(gap)}
                  </div>
                )) : (
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(148, 163, 184, 0.72)' }}>
                    현재 감지된 치명적 공백은 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(103, 232, 249, 0.12)' }}>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(103, 232, 249, 0.65)', letterSpacing: '0.16em', marginBottom: '6px' }}>
                NEXT STEP
              </div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.6, color: 'rgba(241, 245, 249, 0.84)' }}>
                {cleanMarkdown(dossier.nextStep || '다음 단계가 아직 계산되지 않았습니다.')}
              </div>
              {artifacts && (
                <button
                  type="button"
                  onClick={() => setActiveTab('artifacts')}
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '9px 10px',
                    borderRadius: '3px',
                    border: '1px solid rgba(52, 211, 153, 0.35)',
                    background: 'rgba(6, 78, 59, 0.28)',
                    color: '#a7f3d0',
                    cursor: 'pointer',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '9px',
                    letterSpacing: '0.12em',
                  }}
                >
                  📝 Report / Slides 보기 →
                </button>
              )}
            </div>
          </div>
        </div>

      ) : tab === 'artifacts' && artifacts ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ background: 'rgba(7, 25, 18, 0.58)', border: '1px solid rgba(52, 211, 153, 0.18)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(52, 211, 153, 0.76)', letterSpacing: '0.2em', marginBottom: '10px' }}>
              GENERATED OUTPUTS
            </div>

            {artifacts.report && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', fontWeight: 700, color: '#ecfdf5' }}>
                    {artifacts.report.title}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ border: '1px solid rgba(52, 211, 153, 0.28)', color: '#6ee7b7', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                      REPORT
                    </div>
                    <div style={{ border: '1px solid rgba(125, 211, 252, 0.28)', color: '#bae6fd', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                      QUALITY {artifacts.report.metadata?.qualityScore || 0}
                    </div>
                    {Number(artifacts.report.metadata?.scholarlyScore || 0) > 0 && (
                      <div style={{ border: '1px solid rgba(196, 181, 253, 0.28)', color: '#ddd6fe', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                        SCHOLAR {artifacts.report.metadata?.scholarlyScore || 0}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ background: 'rgba(2, 6, 23, 0.48)', border: '1px solid rgba(148, 163, 184, 0.12)', borderRadius: '4px', padding: '12px', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.65, color: 'rgba(226, 232, 240, 0.84)', whiteSpace: 'pre-wrap' }}>
                  {artifacts.report.markdown}
                </div>
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(110, 231, 183, 0.76)', letterSpacing: '0.16em', marginBottom: '8px' }}>
                    REPORT CITATION LEDGER
                  </div>
                  <CitationLedgerList
                    entries={reportCitationLedger}
                    emptyText="report citation 사용처가 아직 없습니다."
                    accentColor="#6ee7b7"
                    borderColor="rgba(52, 211, 153, 0.18)"
                    background="rgba(6, 78, 59, 0.18)"
                  />
                </div>
              </div>
            )}

            {artifacts.slides && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', fontWeight: 700, color: '#ecfdf5' }}>
                    {artifacts.slides.title}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ border: '1px solid rgba(96, 165, 250, 0.28)', color: '#93c5fd', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                      SLIDES
                    </div>
                    <div style={{ border: '1px solid rgba(196, 181, 253, 0.28)', color: '#ddd6fe', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                      QUALITY {artifacts.slides.metadata?.qualityScore || 0}
                    </div>
                    {Number(artifacts.slides.metadata?.scholarlyScore || 0) > 0 && (
                      <div style={{ border: '1px solid rgba(251, 191, 36, 0.28)', color: '#fde68a', borderRadius: '999px', padding: '4px 10px', fontFamily: 'Orbitron, sans-serif', fontSize: '10px', letterSpacing: '0.1em' }}>
                        SCHOLAR {artifacts.slides.metadata?.scholarlyScore || 0}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(artifacts.slides.structuredContent?.slides || []).map((slide, index) => (
                    <div key={`${slide.title}-${index}`} style={{ border: '1px solid rgba(148, 163, 184, 0.12)', borderRadius: '4px', padding: '10px', background: 'rgba(2, 6, 23, 0.38)' }}>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#93c5fd', letterSpacing: '0.12em', marginBottom: '6px' }}>
                        SLIDE {index + 1}
                      </div>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                        {slide.title}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {(slide.bullets || []).map((bullet, bulletIndex) => (
                          <div key={`${slide.title}-${bulletIndex}`} style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', lineHeight: 1.55, color: 'rgba(226, 232, 240, 0.82)' }}>
                            • {cleanMarkdown(bullet)}
                          </div>
                        ))}
                      </div>
                      {Array.isArray(slide.citationRefs) && slide.citationRefs.length > 0 && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(96, 165, 250, 0.12)' }}>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#93c5fd', letterSpacing: '0.1em', marginBottom: '6px' }}>
                            CITATIONS
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {slide.citationRefs.slice(0, 4).map((citation, citationIndex) => (
                              <div key={`${slide.title}-citation-${citation.evidenceId || citationIndex}`} style={{ border: '1px solid rgba(148, 163, 184, 0.12)', borderRadius: '4px', padding: '8px', background: 'rgba(15, 23, 42, 0.32)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#93c5fd', letterSpacing: '0.1em' }}>
                                    {getLocalCitationTag(citation, citationIndex)}
                                  </div>
                                  {formatCitationStrength(citation) && (
                                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '0.08em' }}>
                                      {formatCitationStrength(citation)}
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', lineHeight: 1.45, color: 'rgba(226, 232, 240, 0.82)', wordBreak: 'break-word' }}>
                                  {citation.url ? (
                                    <a href={citation.url} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', textDecoration: 'none' }}>
                                      {citation.label || citation.url}
                                    </a>
                                  ) : (
                                    citation.label
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#93c5fd', letterSpacing: '0.16em', marginBottom: '8px' }}>
                    SLIDE CITATION LEDGER
                  </div>
                  <CitationLedgerList
                    entries={slideCitationLedger}
                    emptyText="slide citation 사용처가 아직 없습니다."
                    accentColor="#93c5fd"
                    borderColor="rgba(96, 165, 250, 0.18)"
                    background="rgba(30, 41, 59, 0.32)"
                  />
                </div>
              </div>
            )}
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
