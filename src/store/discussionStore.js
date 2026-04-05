import { create } from 'zustand';
import { orchestrator } from '../services/orchestrator';

export const useDiscussionStore = create((set) => ({
  topic: '',
  messages: [],
  isDiscussing: false,
  activeGodId: null,
  consensus: null,
  currentRound: 0,
  totalRounds: 0,
  statusText: '',
  isYoutube: false,

  startDiscussion: async (topic, transcript = null) => {
    set({ topic, messages: [], isDiscussing: true, activeGodId: null, consensus: null, currentRound: 1, totalRounds: 0, statusText: '토론 준비 중...', isYoutube: !!transcript });

    orchestrator.onMessage((message) => {
      set(state => ({ messages: [...state.messages, message], activeGodId: message.godId, currentRound: message.round }));
    });

    orchestrator.onStatus((text) => {
      set({ statusText: text });
    });

    orchestrator.onComplete((result) => {
      set({ consensus: result.consensus, isDiscussing: false, activeGodId: null, totalRounds: result.totalRounds, statusText: `${result.totalRounds}라운드 토론 완료` });
    });

    try {
      await orchestrator.startDiscussion(topic, transcript);
    } catch (error) {
      console.error('토론 오류:', error);
      set({ isDiscussing: false, activeGodId: null, statusText: '오류 발생' });
    }
  },

  clearDiscussion: () => {
    set({ topic: '', messages: [], isDiscussing: false, activeGodId: null, consensus: null, currentRound: 0, totalRounds: 0, statusText: '', isYoutube: false });
  },
}));
