import { create } from 'zustand'

const defaultPreview = {
  mode: 'home',
  title: '',
  subtitle: '',
  outline: [],
  theme: 'business',
}

export const useWorkbenchStore = create((set) => ({
  activeMode: 'home',
  preview: defaultPreview,
  dossier: null,
  artifacts: null,
  debateSeedDossier: null,
  debateSeedArtifacts: null,
  outputSource: null,

  setActiveMode: (activeMode = 'home') => {
    set({ activeMode: activeMode || 'home' })
  },

  setPreview: (preview = {}) => {
    set((state) => ({
      preview: {
        ...state.preview,
        ...(preview && typeof preview === 'object' ? preview : {}),
        outline: Array.isArray(preview?.outline) ? preview.outline.slice(0, 8) : state.preview.outline,
      },
    }))
  },

  applyGeneratedOutput: ({ topic = '', dossier, artifacts, source = 'brief', mode = '', preview = {} } = {}) => {
    set((state) => ({
      dossier: dossier === undefined ? state.dossier : dossier,
      artifacts: artifacts === undefined ? state.artifacts : artifacts,
      debateSeedDossier: source === 'debate'
        ? (dossier === undefined ? state.debateSeedDossier : dossier)
        : state.debateSeedDossier,
      debateSeedArtifacts: source === 'debate'
        ? (artifacts === undefined ? state.debateSeedArtifacts : artifacts)
        : state.debateSeedArtifacts,
      outputSource: source || state.outputSource,
      preview: {
        ...state.preview,
        ...(preview && typeof preview === 'object' ? preview : {}),
        mode: mode || preview?.mode || state.preview.mode,
        title: topic || preview?.title || state.preview.title,
        outline: Array.isArray(preview?.outline) ? preview.outline.slice(0, 8) : state.preview.outline,
      },
    }))
  },

  clearGeneratedOutput: () => {
    set({ dossier: null, artifacts: null, outputSource: null })
  },

  resetWorkbench: () => {
    set({
      activeMode: 'home',
      preview: defaultPreview,
      dossier: null,
      artifacts: null,
      debateSeedDossier: null,
      debateSeedArtifacts: null,
      outputSource: null,
    })
  },
}))