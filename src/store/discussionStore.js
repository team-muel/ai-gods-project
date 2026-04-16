import { create } from 'zustand';
import { MAX_ROUNDS, orchestrator } from '../services/orchestrator';

export const useDiscussionStore = create((set) => ({
  topic: '',
  messages: [],
  isDiscussing: false,
  activeGodId: null,
  debateId: null,
  consensus: null,
  dossier: null,
  artifacts: null,
  currentRound: 0,
  totalRounds: 0,
  statusText: '',
  isYoutube: false,

  applyGeneratedOutput: ({ topic = '', dossier = null, artifacts = null, consensus, statusText = '' } = {}) => {
    set((state) => ({
      topic: topic || state.topic,
      dossier: dossier || state.dossier,
      artifacts: artifacts || state.artifacts,
      consensus: consensus === undefined ? state.consensus : consensus,
      isDiscussing: false,
      statusText: statusText || state.statusText,
    }));
  },

  setStatusText: (text) => {
    set({ statusText: text || '' });
  },

  startDiscussion: async (topic, transcript = null) => {
    set({ topic, messages: [], isDiscussing: true, activeGodId: null, debateId: null, consensus: null, dossier: null, artifacts: null, currentRound: 1, totalRounds: MAX_ROUNDS, statusText: '토론 준비 중...', isYoutube: !!transcript });

    orchestrator.onMessage((message) => {
      set(state => ({ messages: [...state.messages, message], activeGodId: message.godId, currentRound: message.round }));
    });

    orchestrator.onStatus((text) => {
      set({ statusText: text });
    });

    orchestrator.onComplete((result) => {
      set({ debateId: result.debateId || null, consensus: result.consensus, dossier: result.dossier || null, artifacts: result.artifacts || null, isDiscussing: false, activeGodId: null, currentRound: result.totalRounds, totalRounds: result.totalRounds, statusText: `${result.totalRounds}라운드 토론 완료` });
    });

    try {
      await orchestrator.startDiscussion(topic, transcript);
    } catch (error) {
      console.error('토론 오류:', error);
      set({ isDiscussing: false, activeGodId: null, statusText: error.message || '오류 발생', totalRounds: 0 });
    }
  },

  clearDiscussion: () => {
    set({ topic: '', messages: [], isDiscussing: false, activeGodId: null, debateId: null, consensus: null, dossier: null, artifacts: null, currentRound: 0, totalRounds: 0, statusText: '', isYoutube: false });
  },
}));
