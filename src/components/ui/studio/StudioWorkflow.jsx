import { useEffect, useMemo } from 'react'
import { useDiscussionStore } from '../../../store/discussionStore'
import { useStudioStore } from '../../../store/studioStore'
import { useWorkbenchStore } from '../../../store/workbenchStore'
import {
  downloadBlobResult,
  exportWorkbenchArtifact,
  generateOutlineDraft,
  ingestWorkbenchSources,
  generateWorkbenchArtifacts,
} from '../../../services/workbenchService'
import StudioCustomizeStep from './StudioCustomizeStep'
import StudioGenerateStep from './StudioGenerateStep'
import StudioHome from './StudioHome'
import StudioMethodStep from './StudioMethodStep'
import StudioOutlineStep from './StudioOutlineStep'
import StudioResultStep from './StudioResultStep'
import {
  buildArtifactBrief,
  buildFallbackOutline,
  buildGenerationInstructions,
  buildMethodOverview,
  buildOutlineItemsFromDraft,
  buildPromptRecommendations,
  buildResultPreview,
  cleanText,
  extractOverviewHeadline,
} from './studioConfig'

const pickOutlinePreview = (session) => {
  const selectedItems = (Array.isArray(session?.outline?.items) ? session.outline.items : []).filter((item) => item.selected)
  if (selectedItems.length > 0) return selectedItems.map((item) => item.title).slice(0, 8)
  return (Array.isArray(session?.recommendations?.items) ? session.recommendations.items : []).map((item) => item.title).slice(0, 6)
}

export default function StudioWorkflow({ onSelectDebate }) {
  const { activeMode, setActiveMode, setPreview, applyGeneratedOutput, clearGeneratedOutput, artifacts, outputSource, debateSeedDossier } = useWorkbenchStore()
  const { consensus, messages } = useDiscussionStore()
  const docsSession = useStudioStore((state) => state.sessions.docs)
  const pptSession = useStudioStore((state) => state.sessions.ppt)
  const resetSession = useStudioStore((state) => state.resetSession)
  const setMethod = useStudioStore((state) => state.setMethod)
  const setStep = useStudioStore((state) => state.setStep)
  const updateBrief = useStudioStore((state) => state.updateBrief)
  const refreshRecommendations = useStudioStore((state) => state.refreshRecommendations)
  const setRecommendations = useStudioStore((state) => state.setRecommendations)
  const setOutlineState = useStudioStore((state) => state.setOutlineState)
  const setOutlineItems = useStudioStore((state) => state.setOutlineItems)
  const toggleOutlineItem = useStudioStore((state) => state.toggleOutlineItem)
  const updateOutlineItem = useStudioStore((state) => state.updateOutlineItem)
  const moveOutlineItem = useStudioStore((state) => state.moveOutlineItem)
  const setGeneration = useStudioStore((state) => state.setGeneration)
  const setResult = useStudioStore((state) => state.setResult)

  const session = activeMode === 'ppt' ? pptSession : docsSession
  const mode = activeMode === 'ppt' ? 'ppt' : 'docs'

  const currentOverview = useMemo(() => buildMethodOverview({ mode, method: session.method, brief: session.brief }), [mode, session.brief, session.method])
  const previewOutline = useMemo(() => pickOutlinePreview(session), [session])

  useEffect(() => {
    if (activeMode === 'home') {
      setPreview({
        mode: 'home',
        title: 'AI GODS STUDIO',
        subtitle: '문서, PPT, 토론 실험실을 목적에 맞게 분리합니다.',
        outline: ['토론', 'PPT 제작', '문서 제작'],
        theme: 'business',
      })
      return
    }

    if (!['docs', 'ppt'].includes(activeMode)) return

    setPreview({
      mode: activeMode,
      title: extractOverviewHeadline(currentOverview) || (activeMode === 'ppt' ? 'PPT 제작' : '문서 제작'),
      subtitle: session.step === 'method'
        ? '생성 방식을 먼저 선택하세요.'
        : session.step === 'setup'
          ? '입력과 추천 prompt를 정리하는 단계'
          : session.step === 'outline'
            ? 'AI outline 검토 및 선택 단계'
            : session.step === 'customize'
              ? '밀도, 테마, 이미지, 추가 지침 설정'
              : session.step === 'generate'
                ? '최종 결과물을 생성 중입니다.'
                : '결과물 preview 및 다운로드 단계',
      outline: previewOutline,
      theme: 'business',
    })
  }, [activeMode, currentOverview, previewOutline, session.step, setPreview])

  useEffect(() => {
    if (!['docs', 'ppt'].includes(activeMode)) return
    if (session.method !== 'oneLine') return
    if (cleanText(session.brief.promptLine).length < 4) {
      setRecommendations(activeMode, [])
      return
    }

    setRecommendations(activeMode, buildPromptRecommendations({
      mode: activeMode,
      promptLine: session.brief.promptLine,
      language: session.brief.language,
      seed: session.recommendations.refreshSeed,
    }))
  }, [activeMode, session.brief.language, session.brief.promptLine, session.method, session.recommendations.refreshSeed, setRecommendations])

  const handleSelectMode = (nextMode) => {
    if (!['docs', 'ppt'].includes(nextMode)) return
    resetSession(nextMode)
    clearGeneratedOutput()
    setActiveMode(nextMode)
  }

  const handleUpdateBrief = (patch = {}) => {
    const nextPatch = { ...(patch || {}) }
    if (mode === 'docs') nextPatch.aiImagesEnabled = false
    updateBrief(mode, nextPatch)
  }

  const resolveSourceOverview = async () => {
    if (session.method !== 'source') return currentOverview

    const uploadedSources = Array.isArray(session.brief.uploadedSources) ? session.brief.uploadedSources : []
    const hasPendingBinary = uploadedSources.some((item) => typeof item?.dataUrl === 'string' && item.dataUrl.length > 0)
    const savedDigest = cleanText(session.brief.sourceDigest)

    if (savedDigest && !hasPendingBinary) {
      return savedDigest
    }

    const data = await ingestWorkbenchSources({
      promptLine: session.brief.promptLine,
      sourceUrl: session.brief.sourceUrl,
      uploadedSources,
    })

    const nextSources = Array.isArray(data?.sources) ? data.sources : []
    const sourceDigest = cleanText(data?.overview || '')
    updateBrief(mode, {
      sourceDigest,
      uploadedSources: nextSources,
    })

    return sourceDigest
  }

  const createOutlineDraft = async () => {
    setOutlineState(mode, { loading: true, error: '', items: [] })
    setStep(mode, 'outline')

    let overview = currentOverview
    try {
      if (session.method === 'source') {
        overview = await resolveSourceOverview()
      }
    } catch (error) {
      setOutlineState(mode, { loading: false, error: error.message || '소스 본문 추출에 실패했습니다.', items: [] })
      return
    }

    if (!overview) {
      setOutlineState(mode, { loading: false, error: 'outline을 만들 소스 요약이 비어 있습니다.', items: [] })
      return
    }

    try {
      const outlineBrief = buildArtifactBrief({ mode, session: { ...session, brief: { ...session.brief, overview } } })
      const data = await generateOutlineDraft({
        mode,
        brief: {
          overview,
          userRole: outlineBrief.userRole,
          audience: outlineBrief.audience,
          domain: outlineBrief.domain,
          domainLabel: outlineBrief.domainLabel,
          theme: outlineBrief.visualTheme,
          textDensity: outlineBrief.textDensity,
          aiImageMode: outlineBrief.aiImageMode,
          language: outlineBrief.language,
          cardCount: outlineBrief.cardCount,
          writingNote: outlineBrief.writingNote,
          toneNote: outlineBrief.toneNote,
        },
      })

      const nextItems = buildOutlineItemsFromDraft({
        mode,
        items: data?.items || [],
        fallbackOutline: buildFallbackOutline({ mode, promptLine: overview, cardCount: session.brief.cardCount }),
      })

      setOutlineItems(mode, nextItems, data?.source || 'ai')
    } catch (error) {
      if (session.method === 'source') {
        setOutlineState(mode, { loading: false, error: error.message || 'AI outline 생성에 실패했습니다.', items: [] })
        return
      }

      const fallbackItems = buildOutlineItemsFromDraft({
        mode,
        items: [],
        fallbackOutline: buildFallbackOutline({ mode, promptLine: overview, cardCount: session.brief.cardCount }),
      })
      setOutlineItems(mode, fallbackItems, 'fallback')
      setOutlineState(mode, { error: error.message || 'AI outline 생성에 실패해 safe fallback을 불러왔습니다.' })
    }
  }

  const handleGenerate = async () => {
    const outlineItems = session.outline.items.filter((item) => item.selected)
    if (outlineItems.length === 0) return

    setStep(mode, 'generate')
    setGeneration(mode, { status: 'running', progress: 8, phase: 'outline', error: '' })

    let progressValue = 8
    const intervalId = window.setInterval(() => {
      progressValue = Math.min(progressValue + 7, 92)
      const phase = progressValue < 28 ? 'planning' : progressValue < 56 ? 'writing' : progressValue < 82 ? 'rendering' : 'exporting'
      setGeneration(mode, { progress: progressValue, phase })
    }, 500)

    try {
      const brief = buildArtifactBrief({ mode, session })
      const instructions = buildGenerationInstructions({ mode, session })
      const hasDebateContext = Boolean(debateSeedDossier || consensus || messages.length > 0)
      const useDebateContext = hasDebateContext && cleanText(brief.debateUsage || 'auto') !== 'off'
      const data = await generateWorkbenchArtifacts({
        mode,
        topic: extractOverviewHeadline(currentOverview),
        instructions,
        audience: cleanText(brief.audience),
        dossier: useDebateContext ? debateSeedDossier : null,
        consensus: useDebateContext ? consensus : '',
        messages: useDebateContext ? messages : [],
        artifacts,
        brief,
      })

      clearInterval(intervalId)
      setGeneration(mode, { status: 'done', progress: 100, phase: 'done', error: '' })
      applyGeneratedOutput({
        topic: data?.topic || extractOverviewHeadline(currentOverview),
        dossier: data?.dossier,
        artifacts: data?.artifacts,
        source: useDebateContext ? 'debate' : 'brief',
        mode,
        preview: {
          mode,
          title: extractOverviewHeadline(currentOverview),
          subtitle: `${outlineItems.length}개 outline로 생성된 ${mode === 'docs' ? '문서' : 'deck'}`,
          outline: outlineItems.map((item) => item.title).slice(0, 8),
          theme: brief.visualTheme,
        },
      })

      setResult(mode, {
        previewLines: buildResultPreview({ mode, artifacts: data?.artifacts }),
        readyAt: new Date().toISOString(),
      })
      setStep(mode, 'result')
    } catch (error) {
      clearInterval(intervalId)
      setGeneration(mode, { status: 'error', progress: progressValue, phase: 'error', error: error.message || '생성 실패' })
    }
  }

  const handleDownload = async () => {
    const artifact = mode === 'docs' ? artifacts?.report : artifacts?.slides
    if (!artifact) return

    const result = await exportWorkbenchArtifact({
      target: mode === 'docs' ? 'docx' : 'pptx',
      topic: extractOverviewHeadline(currentOverview),
      artifact,
    })

    if (result?.blob) downloadBlobResult(result)
  }

  const handleRestart = () => {
    resetSession(mode)
    clearGeneratedOutput()
    setActiveMode('home')
  }

  if (activeMode === 'home') {
    return <StudioHome onSelectMode={handleSelectMode} onSelectDebate={onSelectDebate} />
  }

  if (!['docs', 'ppt'].includes(activeMode)) return null

  if (session.step === 'method' || session.step === 'setup') {
    return (
      <StudioMethodStep
        mode={mode}
        session={session}
        onBackHome={() => setActiveMode('home')}
        onSelectMethod={(method) => setMethod(mode, method)}
        onUpdateBrief={handleUpdateBrief}
        onRefreshRecommendations={() => refreshRecommendations(mode)}
        onApplyRecommendation={(item) => handleUpdateBrief({ promptLine: item.text })}
        onNext={createOutlineDraft}
      />
    )
  }

  if (session.step === 'outline') {
    return (
      <StudioOutlineStep
        mode={mode}
        session={session}
        onBack={() => setStep(mode, 'setup')}
        onNext={() => setStep(mode, 'customize')}
        onRegenerate={createOutlineDraft}
        onToggleItem={(itemId) => toggleOutlineItem(mode, itemId)}
        onUpdateItem={(itemId, patch) => updateOutlineItem(mode, itemId, patch)}
        onMoveItem={(itemId, direction) => moveOutlineItem(mode, itemId, direction)}
      />
    )
  }

  if (session.step === 'customize') {
    return (
      <StudioCustomizeStep
        mode={mode}
        session={session}
        onBack={() => setStep(mode, 'outline')}
        onUpdateBrief={handleUpdateBrief}
        onGenerate={handleGenerate}
      />
    )
  }

  if (session.step === 'generate') {
    return <StudioGenerateStep mode={mode} session={session} onBack={() => setStep(mode, 'customize')} />
  }

  return (
    <StudioResultStep
      mode={mode}
      session={session}
      artifacts={artifacts}
      outputSource={outputSource}
      onDownload={handleDownload}
      onBack={() => setStep(mode, 'customize')}
      onRestart={handleRestart}
    />
  )
}