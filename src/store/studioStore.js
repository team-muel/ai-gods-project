import { create } from 'zustand'
import { buildInitialStudioSession } from '../components/ui/studio/studioConfig'

const updateSession = (state, mode, updater) => {
  const current = state.sessions[mode] || buildInitialStudioSession(mode)
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) }

  return {
    sessions: {
      ...state.sessions,
      [mode]: next,
    },
  }
}

export const useStudioStore = create((set) => ({
  sessions: {
    docs: buildInitialStudioSession('docs'),
    ppt: buildInitialStudioSession('ppt'),
  },

  resetSession: (mode = 'docs') => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [mode]: buildInitialStudioSession(mode),
      },
    }))
  },

  setMethod: (mode = 'docs', method = null) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      method,
      step: method ? 'setup' : 'method',
      outline: { items: [], source: '', loading: false, error: '' },
      generation: { status: 'idle', progress: 0, phase: '', error: '' },
      result: null,
    })))
  },

  setStep: (mode = 'docs', step = 'method') => {
    set((state) => updateSession(state, mode, { step }))
  },

  updateBrief: (mode = 'docs', patch = {}) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      brief: {
        ...current.brief,
        ...(patch || {}),
      },
    })))
  },

  setRecommendations: (mode = 'docs', items = []) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        items: Array.isArray(items) ? items : [],
        loading: false,
        error: '',
      },
    })))
  },

  setRecommendationLoading: (mode = 'docs', loading = false) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        loading: Boolean(loading),
      },
    })))
  },

  refreshRecommendations: (mode = 'docs') => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        refreshSeed: Number(current.recommendations.refreshSeed || 0) + 1,
      },
    })))
  },

  setOutlineState: (mode = 'docs', patch = {}) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      outline: {
        ...current.outline,
        ...(patch || {}),
      },
    })))
  },

  setOutlineItems: (mode = 'docs', items = [], source = 'ai') => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      outline: {
        ...current.outline,
        items: Array.isArray(items) ? items : [],
        source,
        loading: false,
        error: '',
      },
    })))
  },

  toggleOutlineItem: (mode = 'docs', itemId = '') => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      outline: {
        ...current.outline,
        items: current.outline.items.map((item) => (item.id === itemId ? { ...item, selected: !item.selected } : item)),
      },
    })))
  },

  updateOutlineItem: (mode = 'docs', itemId = '', patch = {}) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      outline: {
        ...current.outline,
        items: current.outline.items.map((item) => (item.id === itemId ? { ...item, ...(patch || {}) } : item)),
      },
    })))
  },

  moveOutlineItem: (mode = 'docs', itemId = '', direction = 'up') => {
    set((state) => updateSession(state, mode, (current) => {
      const items = [...current.outline.items]
      const index = items.findIndex((item) => item.id === itemId)
      if (index === -1) return current
      const swapIndex = direction === 'down' ? index + 1 : index - 1
      if (swapIndex < 0 || swapIndex >= items.length) return current
      ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]

      return {
        ...current,
        outline: {
          ...current.outline,
          items,
        },
      }
    }))
  },

  setGeneration: (mode = 'docs', patch = {}) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      generation: {
        ...current.generation,
        ...(patch || {}),
      },
    })))
  },

  setResult: (mode = 'docs', result = null) => {
    set((state) => updateSession(state, mode, (current) => ({
      ...current,
      result,
    })))
  },
}))