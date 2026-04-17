import { useEffect, useMemo, useState } from 'react';
import { useDiscussionStore } from '../../store/discussionStore';
import { downloadBlobResult, exportWorkbenchArtifact, generateAutonomousTopics, generateWorkbenchArtifacts, getGoogleExportStatus, startGoogleOAuth, submitArtifactFeedback } from '../../services/workbenchService';
import { extractVideoId, fetchTranscript, isYoutubeUrl } from '../../services/youtubeService';

const TAB_BUTTONS = [
  { id: 'debate', label: '토론' },
  { id: 'docs', label: '보고서' },
  { id: 'ppt', label: 'PPT' },
]

const CITATION_MODE_OPTIONS = [
  { value: 'auto', label: '자동' },
  { value: 'none', label: '없음' },
  { value: 'light', label: '약하게' },
  { value: 'selective', label: '선택적' },
  { value: 'strict', label: '엄격' },
]

const CITATION_VISIBILITY_OPTIONS = [
  { value: 'auto', label: '자동' },
  { value: 'hidden', label: '숨김' },
  { value: 'bibliography-only', label: '참고문헌만' },
  { value: 'inline', label: '본문 표시' },
]

const CITATION_PRESETS = {
  docs: [
    { id: 'auto', label: '자동', mode: 'auto', visibility: 'auto', hint: '요청문을 보고 인용 강도와 노출 방식을 추론합니다.' },
    { id: 'research', label: '연구형', mode: 'strict', visibility: 'inline', hint: '문헌 검토나 연구 보고서처럼 본문 citation을 강하게 유지합니다.' },
    { id: 'analysis', label: '분석형', mode: 'selective', visibility: 'inline', hint: '핵심 분석 파트만 inline citation을 남기고 나머지는 간결하게 정리합니다.' },
    { id: 'brief', label: '브리프형', mode: 'light', visibility: 'bibliography-only', hint: '본문은 깔끔하게 두고 참고문헌만 끝에 모읍니다.' },
    { id: 'ideation', label: '아이데이션', mode: 'none', visibility: 'hidden', hint: '메시지와 구조가 우선인 초안에 맞춰 citation을 숨깁니다.' },
  ],
  ppt: [
    { id: 'auto', label: '자동', mode: 'auto', visibility: 'auto', hint: '슬라이드 요청문을 보고 인용 방식을 추론합니다.' },
    { id: 'investor', label: '투자자 deck', mode: 'light', visibility: 'bibliography-only', hint: '슬라이드 본문은 간결하게 유지하고 마지막 장에 참고자료를 모읍니다.' },
    { id: 'evidence', label: '근거형', mode: 'selective', visibility: 'inline', hint: '근거가 필요한 슬라이드에만 citation을 남깁니다.' },
    { id: 'research', label: '연구발표', mode: 'strict', visibility: 'inline', hint: '연구 발표처럼 슬라이드별 출처 표시를 적극적으로 유지합니다.' },
    { id: 'pitch', label: '피치형', mode: 'none', visibility: 'hidden', hint: '메시지 전달력을 우선해 citation을 숨깁니다.' },
  ],
}

const findCitationPreset = (presets = [], mode = 'auto', visibility = 'auto') => (
  presets.find((preset) => preset.mode === mode && preset.visibility === visibility) || null
)

const citationFieldLabelStyle = {
  display: 'block',
  marginBottom: '5px',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '8px',
  color: 'rgba(191, 248, 255, 0.78)',
  letterSpacing: '0.12em',
}

const citationSelectStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  color: 'white',
  fontSize: '12px',
  outline: 'none',
}

const citationHintStyle = {
  marginBottom: '10px',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '11px',
  color: 'rgba(191, 219, 254, 0.78)',
  lineHeight: 1.35,
}

const citationPresetRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginBottom: '8px',
}

const buildCitationPresetButtonStyle = (active) => ({
  padding: '7px 9px',
  borderRadius: '999px',
  border: `1px solid ${active ? 'rgba(125, 211, 252, 0.42)' : 'rgba(148, 163, 184, 0.2)'}`,
  background: active ? 'rgba(8, 145, 178, 0.22)' : 'rgba(15, 23, 42, 0.64)',
  color: active ? '#bff8ff' : 'rgba(226, 232, 240, 0.76)',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '9px',
  letterSpacing: '0.08em',
  cursor: 'pointer',
})

const buildTabStyle = (active) => ({
  flex: 1,
  padding: '8px 6px',
  borderRadius: '6px',
  border: `1px solid ${active ? 'rgba(122, 244, 255, 0.38)' : 'rgba(148, 163, 184, 0.18)'}`,
  background: active ? 'rgba(12, 74, 110, 0.42)' : 'rgba(15, 23, 42, 0.5)',
  color: active ? '#bff8ff' : 'rgba(226, 232, 240, 0.72)',
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '10px',
  letterSpacing: '0.12em',
  cursor: 'pointer',
})

const primaryButtonStyle = (disabled, palette = 'blue') => {
  const palettes = {
    blue: {
      background: 'linear-gradient(135deg, #0f5fcc 0%, #1d9bf0 100%)',
      border: '1px solid rgba(125, 211, 252, 0.25)',
      color: '#eff6ff',
    },
    green: {
      background: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
      border: '1px solid rgba(110, 231, 183, 0.25)',
      color: '#ecfdf5',
    },
    amber: {
      background: 'linear-gradient(135deg, #92400e 0%, #f59e0b 100%)',
      border: '1px solid rgba(253, 230, 138, 0.25)',
      color: '#fffbeb',
    },
  }

  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: palettes[palette].border,
    background: disabled ? 'rgba(51, 65, 85, 0.45)' : palettes[palette].background,
    color: disabled ? 'rgba(226, 232, 240, 0.45)' : palettes[palette].color,
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

const secondaryButtonStyle = (disabled = false) => ({
  width: '100%',
  padding: '9px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: disabled ? 'rgba(30, 41, 59, 0.5)' : 'rgba(15, 23, 42, 0.72)',
  color: disabled ? 'rgba(148, 163, 184, 0.5)' : '#dbeafe',
  fontSize: '11px',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

export default function QuestionPanel({ onOpenDashboard }) {
  const [activeTab, setActiveTab] = useState('debate');
  const [debateInput, setDebateInput] = useState('');
  const [focusInput, setFocusInput] = useState('');
  const [docsRequest, setDocsRequest] = useState('');
  const [docsAudience, setDocsAudience] = useState('경영진');
  const [docsCitationMode, setDocsCitationMode] = useState('auto');
  const [docsCitationVisibility, setDocsCitationVisibility] = useState('auto');
  const [pptRequest, setPptRequest] = useState('');
  const [pptAudience, setPptAudience] = useState('투자자/경영진');
  const [pptCitationMode, setPptCitationMode] = useState('auto');
  const [pptCitationVisibility, setPptCitationVisibility] = useState('auto');
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [artifactBusy, setArtifactBusy] = useState({ docs: false, ppt: false, export: '', feedback: '' });
  const [googleExportState, setGoogleExportState] = useState({ loading: true, connected: false, mode: 'service-account', requiresUserConnection: false });
  const [transcriptError, setTranscriptError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [topicSuggestions, setTopicSuggestions] = useState([]);

  const {
    isDiscussing,
    startDiscussion,
    currentRound,
    totalRounds,
    statusText,
    clearDiscussion,
    consensus,
    dossier,
    artifacts,
    topic,
    messages,
    debateId,
    applyGeneratedOutput,
    setStatusText,
  } = useDiscussionStore();

  const effectiveTopic = useMemo(() => debateInput.trim() || topic || dossier?.topic || '', [debateInput, dossier?.topic, topic]);
  const isYT = isYoutubeUrl(debateInput);
  const isLoading = isDiscussing || isFetchingTranscript;
  const hasGenerationContext = Boolean(dossier || consensus || messages.length > 0);
  const displayTotalRounds = Math.max(totalRounds || 0, 1);
  const progressWidth = Math.min(100, Math.max(0, (currentRound / displayTotalRounds) * 100));
  const activeDocsCitationPreset = useMemo(
    () => findCitationPreset(CITATION_PRESETS.docs, docsCitationMode, docsCitationVisibility),
    [docsCitationMode, docsCitationVisibility],
  );
  const activePptCitationPreset = useMemo(
    () => findCitationPreset(CITATION_PRESETS.ppt, pptCitationMode, pptCitationVisibility),
    [pptCitationMode, pptCitationVisibility],
  );

  useEffect(() => {
    let active = true;

    const syncGoogleExportState = async () => {
      try {
        const status = await getGoogleExportStatus();
        if (!active) return;
        setGoogleExportState({
          loading: false,
          connected: Boolean(status?.connected),
          mode: status?.mode || 'service-account',
          requiresUserConnection: Boolean(status?.requiresUserConnection),
        });
      } catch {
        if (!active) return;
        setGoogleExportState({ loading: false, connected: false, mode: 'service-account', requiresUserConnection: false });
      }
    };

    const currentUrl = new URL(window.location.href);
    const oauthState = currentUrl.searchParams.get('google_oauth');
    const oauthError = currentUrl.searchParams.get('google_oauth_error');

    if (oauthState === 'connected') {
      setPanelMessage('Google 계정 연결이 완료되었습니다. 이제 Google Docs/Slides export를 실행할 수 있습니다.');
      currentUrl.searchParams.delete('google_oauth');
      currentUrl.searchParams.delete('google_oauth_error');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    } else if (oauthState === 'error') {
      setPanelMessage(`Google 계정 연결에 실패했습니다${oauthError ? ` (${oauthError})` : ''}. 다시 시도하세요.`);
      currentUrl.searchParams.delete('google_oauth');
      currentUrl.searchParams.delete('google_oauth_error');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }

    syncGoogleExportState();

    return () => {
      active = false;
    };
  }, []);

  const handleDebateSubmit = async (event) => {
    event.preventDefault();
    if (!debateInput.trim() || isLoading) return;

    setTranscriptError('');
    setPanelMessage('');

    if (isYT) {
      const videoId = extractVideoId(debateInput);
      if (!videoId) {
        setTranscriptError('유효한 YouTube URL이 아닙니다.');
        return;
      }

      setIsFetchingTranscript(true);
      try {
        const transcript = await fetchTranscript(videoId);
        setIsFetchingTranscript(false);
        await startDiscussion(`YouTube 영상 분석: ${debateInput}`, transcript);
        setPanelMessage('YouTube 기반 토론을 시작했습니다.');
      } catch (error) {
        setIsFetchingTranscript(false);
        setTranscriptError(error.message || 'YouTube transcript를 불러오지 못했습니다.');
        return;
      }
    } else {
      await startDiscussion(debateInput);
      setPanelMessage('토론을 시작했습니다.');
    }
  };

  const handleGenerateTopics = async () => {
    if (topicsLoading) return;
    setTopicsLoading(true);
    setPanelMessage('');

    try {
      const data = await generateAutonomousTopics({ focus: focusInput, count: 5 });
      setTopicSuggestions(data?.candidates || []);
      setPanelMessage(`${data?.candidates?.length || 0}개의 자율 주제 후보를 만들었습니다.`);
    } catch (error) {
      setPanelMessage(error.message || '자율 주제 생성 실패');
    } finally {
      setTopicsLoading(false);
    }
  };

  const handleGenerateArtifact = async (mode) => {
    if (artifactBusy[mode]) return;
    if (!hasGenerationContext) {
      setPanelMessage('먼저 토론을 진행해 Dossier를 확보하세요.');
      return;
    }

    const instructions = mode === 'docs' ? docsRequest : pptRequest;
    const audience = mode === 'docs' ? docsAudience : pptAudience;
    const citationOverrides = mode === 'docs'
      ? {
        reportCitationMode: docsCitationMode,
        reportCitationVisibility: docsCitationVisibility,
        reportStylePreset: activeDocsCitationPreset?.id || '',
      }
      : {
        slideCitationMode: pptCitationMode,
        slideCitationVisibility: pptCitationVisibility,
        slideStylePreset: activePptCitationPreset?.id || '',
      };

    setArtifactBusy((state) => ({ ...state, [mode]: true }));
    setStatusText(mode === 'docs' ? '보고서 초안 생성 중...' : '발표자료 초안 생성 중...');
    setPanelMessage('');

    try {
      const data = await generateWorkbenchArtifacts({
        mode,
        topic: effectiveTopic,
        instructions,
        audience,
        dossier,
        consensus,
        messages,
        artifacts,
        ...citationOverrides,
      });

      applyGeneratedOutput({
        topic: data?.topic || effectiveTopic,
        dossier: data?.dossier || dossier,
        artifacts: data?.artifacts || artifacts,
        statusText: mode === 'docs' ? '보고서 생성 완료' : 'PPT 초안 생성 완료',
      });
      setPanelMessage(mode === 'docs' ? '보고서 초안을 갱신했습니다.' : 'PPT 초안을 갱신했습니다.');
    } catch (error) {
      setPanelMessage(error.message || '산출물 생성 실패');
    } finally {
      setArtifactBusy((state) => ({ ...state, [mode]: false }));
    }
  };

  const handleExport = async (target, artifactType) => {
    const artifact = artifactType === 'report' ? artifacts?.report : artifacts?.slides;
    if (!artifact || artifactBusy.export) {
      if (!artifact) setPanelMessage('먼저 해당 산출물을 생성하세요.');
      return;
    }

    if ((target === 'google-docs' || target === 'google-slides') && googleExportState.mode === 'oauth' && !googleExportState.connected) {
      setPanelMessage('Google 계정 연결 화면으로 이동합니다.');
      startGoogleOAuth();
      return;
    }

    setArtifactBusy((state) => ({ ...state, export: `${target}:${artifactType}` }));
    setPanelMessage('');

    try {
      const result = await exportWorkbenchArtifact({ target, topic: effectiveTopic, artifact });
      if (result?.blob) {
        downloadBlobResult(result);
        setPanelMessage(`${target.toUpperCase()} 파일을 내려받았습니다.`);
      } else if (result?.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        setPanelMessage(`${target} 문서를 새 탭에서 열었습니다.`);
      }
    } catch (error) {
      if (error?.code === 'oauth_required' || error?.code === 'oauth_reconnect_required') {
        setGoogleExportState((state) => ({ ...state, loading: false, connected: false }));
        setPanelMessage('Google 계정 연결이 필요해 연결 화면으로 이동합니다.');
        startGoogleOAuth();
        return;
      }

      setPanelMessage(error.message || 'export 실패');
    } finally {
      setArtifactBusy((state) => ({ ...state, export: '' }));
    }
  };

  const handleArtifactFeedback = async (artifactType, direction) => {
    const artifact = artifactType === 'report' ? artifacts?.report : artifacts?.slides;
    if (!artifact || artifactBusy.feedback) {
      if (!artifact) setPanelMessage('피드백을 줄 산출물이 없습니다.');
      return;
    }

    setArtifactBusy((state) => ({ ...state, feedback: `${artifactType}:${direction}` }));

    try {
      const result = await submitArtifactFeedback({
        debateId,
        topic: effectiveTopic,
        artifactType,
        direction,
        artifact,
        dossier,
      });
      setPanelMessage(
        result?.onlineLearning?.triggered
          ? '피드백이 저장되었고 artifact 품질 신호로 학습 루프를 트리거했습니다.'
          : direction === 'up'
            ? '좋은 산출물 피드백을 저장했습니다.'
            : '개선 필요 피드백을 저장했습니다.'
      );
    } catch (error) {
      setPanelMessage(error.message || '피드백 저장 실패');
    } finally {
      setArtifactBusy((state) => ({ ...state, feedback: '' }));
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '20px', left: '20px', zIndex: 100,
      background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.92) 0%, rgba(10, 18, 34, 0.88) 100%)',
      backdropFilter: 'blur(16px)',
      padding: '18px', borderRadius: '16px',
      border: '1px solid rgba(125, 211, 252, 0.16)',
      width: '360px',
      maxHeight: '92vh',
      overflowY: 'auto',
      transition: 'border-color 0.3s',
    }}>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ color: '#c4f1ff', fontSize: '16px', marginBottom: '6px', fontFamily: 'Orbitron, monospace', letterSpacing: '0.14em' }}>
          AI GODS WORKBENCH
        </div>
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.4 }}>
          자율 주제 발굴, 토론 실행, Dossier 정리, Report/PPT 생성, export, 품질 피드백까지 한 패널에서 직접 처리합니다.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {TAB_BUTTONS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={buildTabStyle(activeTab === tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'debate' && (
        <form onSubmit={handleDebateSubmit}>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#7dd3fc', letterSpacing: '0.14em', marginBottom: '6px' }}>
              AUTONOMOUS TOPIC DISCOVERY
            </div>
            <input
              value={focusInput}
              onChange={(event) => setFocusInput(event.target.value)}
              placeholder="예: 규제, AI agent, 제조, 헬스케어"
              className="input-space"
              style={{ width: '100%', marginBottom: '8px', borderRadius: '8px' }}
            />
            <button type="button" onClick={handleGenerateTopics} disabled={topicsLoading} style={secondaryButtonStyle(topicsLoading)}>
              {topicsLoading ? '주제 후보 생성 중...' : '자율 주제 후보 만들기'}
            </button>
          </div>

          {topicSuggestions.length > 0 && (
            <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topicSuggestions.map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  type="button"
                  onClick={() => setDebateInput(item.title)}
                  style={{
                    textAlign: 'left',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    background: 'rgba(15, 23, 42, 0.64)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontWeight: 700, color: '#ecfeff' }}>{item.title}</div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#7dd3fc' }}>N {item.noveltyScore} / U {item.urgencyScore}</div>
                  </div>
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.4 }}>{item.rationale}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    {item.focusArea && (
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#86efac', letterSpacing: '0.08em' }}>
                        FOCUS · {item.focusArea}
                      </div>
                    )}
                    {item.recommendedOutput && (
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: '#bfdbfe', lineHeight: 1.35 }}>
                        Flow · {item.recommendedOutput}
                      </div>
                    )}
                    {item.evidenceHint && (
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(226, 232, 240, 0.62)', lineHeight: 1.35 }}>
                        Evidence hint · {item.evidenceHint}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <textarea
              value={debateInput}
              onChange={(event) => { setDebateInput(event.target.value); setTranscriptError(''); }}
              placeholder={'토론 주제 또는 YouTube URL\n\n예: AI agent 팀이 스스로 주제를 발굴하는 운영 구조\n예: https://youtu.be/...'}
              disabled={isLoading}
              rows={5}
              style={{
                width: '100%', padding: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${isYT ? 'rgba(248, 113, 113, 0.42)' : 'rgba(148, 163, 184, 0.2)'}`,
                borderRadius: '10px', color: 'white',
                fontSize: '13px', fontFamily: 'inherit',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {isYT && (
              <div style={{
                position: 'absolute', top: '8px', right: '8px',
                background: 'rgba(239, 68, 68, 0.86)', color: 'white',
                fontFamily: 'Orbitron, sans-serif', fontSize: '8px',
                padding: '3px 7px', borderRadius: '999px', letterSpacing: '0.1em',
              }}>
                YOUTUBE
              </div>
            )}
          </div>

          {transcriptError && (
            <div style={{ color: '#fca5a5', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', marginBottom: '8px' }}>
              {transcriptError}
            </div>
          )}

          <button type="submit" disabled={isLoading || !debateInput.trim()} style={primaryButtonStyle(isLoading || !debateInput.trim(), isYT ? 'amber' : 'blue')}>
            {isFetchingTranscript ? '영상 맥락 로딩 중...' : isDiscussing ? '토론 진행 중...' : isYT ? 'YouTube 토론 시작' : '토론 시작'}
          </button>
        </form>
      )}

      {activeTab === 'docs' && (
        <div>
          <div style={{ marginBottom: '8px', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#86efac', letterSpacing: '0.14em' }}>
            REPORT FACTORY
          </div>
          <div style={{ marginBottom: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)' }}>
            현재 Debate -&gt; Dossier 결과를 기준으로 보고서 초안, DOCX, Google Docs를 만듭니다.
          </div>
          {googleExportState.mode === 'oauth' && (
            <div style={{ marginBottom: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: googleExportState.connected ? '#86efac' : '#fcd34d' }}>
              {googleExportState.loading
                ? 'Google export 연결 상태 확인 중...'
                : googleExportState.connected
                  ? 'Google 계정 연결됨: 개인 Drive로 직접 문서를 만듭니다.'
                  : 'Google 계정 연결 필요: 첫 1회 로그인 후 개인 Drive로 문서를 만듭니다.'}
            </div>
          )}
          <input
            value={docsAudience}
            onChange={(event) => setDocsAudience(event.target.value)}
            placeholder="독자 예: 경영진, 고객사, 투자자"
            className="input-space"
            style={{ width: '100%', marginBottom: '8px', borderRadius: '8px' }}
          />
          <textarea
            value={docsRequest}
            onChange={(event) => setDocsRequest(event.target.value)}
            placeholder="예: 실행계획 중심으로 재구성하고, citation 약한 부분은 별도 표시"
            rows={4}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', resize: 'vertical',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148, 163, 184, 0.2)', color: 'white', marginBottom: '10px',
            }}
          />
          <div style={citationPresetRowStyle}>
            {CITATION_PRESETS.docs.map((preset) => {
              const active = docsCitationMode === preset.mode && docsCitationVisibility === preset.visibility;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setDocsCitationMode(preset.mode);
                    setDocsCitationVisibility(preset.visibility);
                  }}
                  style={buildCitationPresetButtonStyle(active)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
            <label>
              <span style={citationFieldLabelStyle}>CITATION MODE</span>
              <select value={docsCitationMode} onChange={(event) => setDocsCitationMode(event.target.value)} style={citationSelectStyle}>
                {CITATION_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={citationFieldLabelStyle}>VISIBILITY</span>
              <select value={docsCitationVisibility} onChange={(event) => setDocsCitationVisibility(event.target.value)} style={citationSelectStyle}>
                {CITATION_VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={citationHintStyle}>
            {activeDocsCitationPreset ? `Preset · ${activeDocsCitationPreset.hint} ` : ''}
            자동이면 요청문을 보고 추론합니다. 보고서는 mode와 visibility를 직접 고르면 heuristic보다 우선 적용합니다.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <button type="button" onClick={() => handleGenerateArtifact('docs')} disabled={artifactBusy.docs} style={primaryButtonStyle(artifactBusy.docs, 'green')}>
              {artifactBusy.docs ? '생성 중...' : '보고서 생성'}
            </button>
            <button type="button" onClick={() => handleExport('docx', 'report')} disabled={!artifacts?.report || !!artifactBusy.export} style={secondaryButtonStyle(!artifacts?.report || !!artifactBusy.export)}>
              DOCX 다운로드
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button type="button" onClick={() => handleExport('google-docs', 'report')} disabled={!artifacts?.report || !!artifactBusy.export} style={secondaryButtonStyle(!artifacts?.report || !!artifactBusy.export)}>
              {googleExportState.mode === 'oauth' && !googleExportState.connected ? 'Google 연결 후 Docs' : 'Google Docs'}
            </button>
            <button type="button" onClick={() => handleArtifactFeedback('report', 'up')} disabled={!artifacts?.report || !!artifactBusy.feedback} style={secondaryButtonStyle(!artifacts?.report || !!artifactBusy.feedback)}>
              좋은 보고서
            </button>
          </div>
          <button type="button" onClick={() => handleArtifactFeedback('report', 'down')} disabled={!artifacts?.report || !!artifactBusy.feedback} style={{ ...secondaryButtonStyle(!artifacts?.report || !!artifactBusy.feedback), marginTop: '8px' }}>
            개선 필요 보고서
          </button>
        </div>
      )}

      {activeTab === 'ppt' && (
        <div>
          <div style={{ marginBottom: '8px', fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#93c5fd', letterSpacing: '0.14em' }}>
            PPT FACTORY
          </div>
          <div style={{ marginBottom: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(226, 232, 240, 0.72)' }}>
            현재 Debate -&gt; Dossier 결과를 기준으로 발표자료 초안, PPTX, Google Slides를 만듭니다.
          </div>
          {googleExportState.mode === 'oauth' && (
            <div style={{ marginBottom: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: googleExportState.connected ? '#86efac' : '#fcd34d' }}>
              {googleExportState.loading
                ? 'Google export 연결 상태 확인 중...'
                : googleExportState.connected
                  ? 'Google 계정 연결됨: 개인 Drive로 직접 슬라이드를 만듭니다.'
                  : 'Google 계정 연결 필요: 첫 1회 로그인 후 개인 Drive로 슬라이드를 만듭니다.'}
            </div>
          )}
          <input
            value={pptAudience}
            onChange={(event) => setPptAudience(event.target.value)}
            placeholder="청중 예: 투자자, 사내 임원, 고객 제안 발표"
            className="input-space"
            style={{ width: '100%', marginBottom: '8px', borderRadius: '8px' }}
          />
          <textarea
            value={pptRequest}
            onChange={(event) => setPptRequest(event.target.value)}
            placeholder="예: 5장 이내, 숫자와 근거 위주, 마지막 장에 next action 강조"
            rows={4}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', resize: 'vertical',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148, 163, 184, 0.2)', color: 'white', marginBottom: '10px',
            }}
          />
          <div style={citationPresetRowStyle}>
            {CITATION_PRESETS.ppt.map((preset) => {
              const active = pptCitationMode === preset.mode && pptCitationVisibility === preset.visibility;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setPptCitationMode(preset.mode);
                    setPptCitationVisibility(preset.visibility);
                  }}
                  style={buildCitationPresetButtonStyle(active)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
            <label>
              <span style={citationFieldLabelStyle}>CITATION MODE</span>
              <select value={pptCitationMode} onChange={(event) => setPptCitationMode(event.target.value)} style={citationSelectStyle}>
                {CITATION_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={citationFieldLabelStyle}>VISIBILITY</span>
              <select value={pptCitationVisibility} onChange={(event) => setPptCitationVisibility(event.target.value)} style={citationSelectStyle}>
                {CITATION_VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={citationHintStyle}>
            {activePptCitationPreset ? `Preset · ${activePptCitationPreset.hint} ` : ''}
            슬라이드는 자동일 때 보통 분산 인용보다 마지막 참고자료 쪽을 선호합니다. 필요하면 inline으로 직접 강제할 수 있습니다.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <button type="button" onClick={() => handleGenerateArtifact('ppt')} disabled={artifactBusy.ppt} style={primaryButtonStyle(artifactBusy.ppt, 'blue')}>
              {artifactBusy.ppt ? '생성 중...' : 'PPT 생성'}
            </button>
            <button type="button" onClick={() => handleExport('pptx', 'slides')} disabled={!artifacts?.slides || !!artifactBusy.export} style={secondaryButtonStyle(!artifacts?.slides || !!artifactBusy.export)}>
              PPTX 다운로드
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button type="button" onClick={() => handleExport('google-slides', 'slides')} disabled={!artifacts?.slides || !!artifactBusy.export} style={secondaryButtonStyle(!artifacts?.slides || !!artifactBusy.export)}>
              {googleExportState.mode === 'oauth' && !googleExportState.connected ? 'Google 연결 후 Slides' : 'Google Slides'}
            </button>
            <button type="button" onClick={() => handleArtifactFeedback('slides', 'up')} disabled={!artifacts?.slides || !!artifactBusy.feedback} style={secondaryButtonStyle(!artifacts?.slides || !!artifactBusy.feedback)}>
              좋은 PPT
            </button>
          </div>
          <button type="button" onClick={() => handleArtifactFeedback('slides', 'down')} disabled={!artifacts?.slides || !!artifactBusy.feedback} style={{ ...secondaryButtonStyle(!artifacts?.slides || !!artifactBusy.feedback), marginTop: '8px' }}>
            개선 필요 PPT
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenDashboard}
        style={{
          width: '100%', padding: '10px', marginTop: '12px',
          background: 'linear-gradient(135deg, rgba(8, 145, 178, 0.24) 0%, rgba(37, 99, 235, 0.22) 100%)',
          border: '1px solid rgba(125, 211, 252, 0.2)', borderRadius: '8px', color: '#bff8ff',
          fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
        }}
      >
        운영 대시보드 열기
      </button>

      {(isDiscussing || isFetchingTranscript) && (
        <div style={{ marginTop: '14px' }}>
          {isDiscussing && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.6)' }}>
                  ROUND {currentRound}
                </span>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: 'rgba(100,200,255,0.3)' }}>/ MAX {displayTotalRounds}</span>
              </div>
              <div style={{ height: '3px', background: 'rgba(100,200,255,0.1)', borderRadius: '999px', marginBottom: '8px' }}>
                <div style={{
                  height: '100%', width: `${progressWidth}%`,
                  background: 'linear-gradient(90deg, #0ea5e9, #34d399)',
                  borderRadius: '999px', transition: 'width 0.5s ease',
                }} />
              </div>
            </>
          )}
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(255,180,0,0.8)', lineHeight: 1.4 }}>
            {isFetchingTranscript ? 'YouTube transcript 수집 중...' : statusText}
          </div>
        </div>
      )}

      {panelMessage && (
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(12, 74, 110, 0.2)', border: '1px solid rgba(125, 211, 252, 0.16)', fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#e0f2fe', lineHeight: 1.4 }}>
          {panelMessage}
        </div>
      )}

      {dossier?.citationSummary && (
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(6, 78, 59, 0.16)', border: '1px solid rgba(52, 211, 153, 0.16)' }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#6ee7b7', letterSpacing: '0.14em', marginBottom: '6px' }}>
            CITATION HEALTH
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#ecfdf5' }}>평균 {dossier.citationSummary.averageCitationScore || 0}/100</div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#d1fae5' }}>검증 {dossier.citationSummary.verifiedCount || 0}</div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#fecaca' }}>재검토 {dossier.citationSummary.needsReviewCount || 0}</div>
          </div>
        </div>
      )}

      {consensus && !isDiscussing && (
        <button onClick={clearDiscussion} style={{
          width: '100%', marginTop: '12px', padding: '8px',
          background: 'transparent', border: '1px solid rgba(100,200,255,0.18)',
          color: 'rgba(191, 248, 255, 0.66)', fontFamily: 'Orbitron, sans-serif',
          fontSize: '9px', letterSpacing: '0.1em', cursor: 'pointer', borderRadius: '8px',
        }}>
          새 작업 시작
        </button>
      )}
    </div>
  );
}
