import { callAI, callAIDebate, checkConsensus, generateFinalConsensus, angelSummarize } from './aiService';
import { AI_GODS } from '../config/aiGods';
import { saveDebate, saveDebateMessages, saveDebateMemory } from './memoryService';
import { syncDebateToObsidian } from './obsidianService';

const IS_DEV = import.meta.env.DEV;

// 로컬(Ollama): 최대 4라운드 / 프로덕션(Groq): 비용 절감을 위해 2라운드
const MAX_ROUNDS = IS_DEV ? 4 : 2;
const MIN_ROUNDS = IS_DEV ? 2 : 1;
const CALL_DELAY = IS_DEV ? 0 : 3000; // Groq만 딜레이 적용

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class DiscussionOrchestrator {
  constructor() {
    this.messages = [];
    this.topic = '';
    this.onMessageCallback = null;
    this.onCompleteCallback = null;
    this.onStatusCallback = null;
  }

  onMessage(callback)  { this.onMessageCallback  = callback; }
  onComplete(callback) { this.onCompleteCallback = callback; }
  onStatus(callback)   { this.onStatusCallback   = callback; }

  _status(text) {
    if (this.onStatusCallback) this.onStatusCallback(text);
    console.log(text);
  }

  async startDiscussion(topic, transcript = null) {
    this.topic = topic;
    this.messages = [];

    // ── Round 1: 초기 의견 발표 ──────────────────────────
    this._status('🌌 Round 1 · 초기 의견 수집 중...');

    for (const god of AI_GODS) {
      this._status(`${god.symbol} ${god.name} 의견 작성 중...`);
      try {
        const result = await callAI(god.id, topic, transcript);
        const msg = { round: 1, godId: god.id, god: god.name, emoji: god.symbol, content: result.response, timestamp: result.timestamp };
        this.messages.push(msg);
        if (this.onMessageCallback) this.onMessageCallback(msg);
      } catch (err) {
        console.error(`❌ ${god.name} Round 1:`, err);
      }
      await sleep(CALL_DELAY);
    }

    // ── Round 2 ~ MAX_ROUNDS: 동적 토론 ──────────────────
    // 천사 요약본 저장: { godId: summaryText }
    let angelSummaries = {};

    for (let round = 2; round <= MAX_ROUNDS; round++) {
      // ── 천사 요약 단계 (이전 라운드 의견 → 핵심 논점 압축) ──
      this._status(`👼 천사들이 Round ${round - 1} 의견을 요약 중...`);
      const prevMsgs = this.messages.filter(m => m.round === round - 1 && !m.type);
      angelSummaries = {};

      if (IS_DEV) {
        // Ollama: 병렬 처리
        await Promise.all(prevMsgs.map(async (msg) => {
          try {
            const summary = await angelSummarize(msg.godId, msg.god, msg.content);
            angelSummaries[msg.godId] = summary;
            const angelMsg = { round: round - 1, godId: msg.godId, god: msg.god, emoji: '👼', type: 'angel', content: summary, timestamp: new Date().toISOString() };
            this.messages.push(angelMsg);
            if (this.onMessageCallback) this.onMessageCallback(angelMsg);
          } catch (e) {
            console.warn(`[Angel] ${msg.god} 요약 실패:`, e.message);
            angelSummaries[msg.godId] = msg.content.slice(0, 200);
          }
        }));
      } else {
        // Groq: 순차 처리 (rate limit 방지)
        for (const msg of prevMsgs) {
          this._status(`👼 ${msg.god}의 천사가 요약 중...`);
          try {
            const summary = await angelSummarize(msg.godId, msg.god, msg.content);
            angelSummaries[msg.godId] = summary;
            const angelMsg = { round: round - 1, godId: msg.godId, god: msg.god, emoji: '👼', type: 'angel', content: summary, timestamp: new Date().toISOString() };
            this.messages.push(angelMsg);
            if (this.onMessageCallback) this.onMessageCallback(angelMsg);
          } catch (e) {
            console.warn(`[Angel] ${msg.god} 요약 실패:`, e.message);
            angelSummaries[msg.godId] = msg.content.slice(0, 200);
          }
          await sleep(CALL_DELAY);
        }
      }

      this._status(`🔥 Round ${round} · 토론 진행 중...`);

      for (const god of AI_GODS) {
        this._status(`${god.symbol} ${god.name} 반론/동의 작성 중...`);
        // 천사 요약본으로 다른 신들의 의견 전달 (없으면 원본 사용)
        const otherOpinions = prevMsgs
          .filter(m => m.godId !== god.id)
          .map(m => ({ god: m.god, content: angelSummaries[m.godId] || m.content }));
        try {
          const result = await callAIDebate(god.id, topic, otherOpinions);
          const msg = { round, godId: god.id, god: god.name, emoji: god.symbol, content: result.response, timestamp: result.timestamp };
          this.messages.push(msg);
          if (this.onMessageCallback) this.onMessageCallback(msg);
        } catch (err) {
          console.error(`❌ ${god.name} Round ${round}:`, err);
        }
        await sleep(CALL_DELAY);
      }

      if (round >= MIN_ROUNDS) {
        this._status('🤝 합의 달성 여부 확인 중...');
        const roundMessages = this.messages.filter(m => m.round === round);
        try {
          const reached = await checkConsensus(topic, roundMessages);
          if (reached) {
            this._status(`✅ Round ${round}에서 합의 도달! 최종 결론 도출 중...`);
            break;
          } else if (round < MAX_ROUNDS) {
            this._status(`💬 합의 미달 · Round ${round + 1} 진행...`);
          }
        } catch (err) {
          console.error('합의 체크 오류:', err);
        }
      }
    }

    // ── 최종 합의안 생성 ─────────────────────────────────
    this._status('📊 최종 합의안 작성 중...');
    const consensus = await generateFinalConsensus(topic, this.messages);
    const totalRounds = Math.max(...this.messages.map(m => m.round));

    // ── Supabase에 전체 토론 저장 ─────────────────────────
    this._status('🧠 Supabase에 저장 중...');
    const debateId = await saveDebate({
      topic,
      isYoutube: !!transcript,
      totalRounds,
      consensus,
    });

    if (debateId) {
      // 모든 메시지 저장
      await saveDebateMessages(debateId, this.messages);

      // 각 신의 개별 메모리 저장 (메모리 진화 포함)
      for (const god of AI_GODS) {
        const myMessages = this.messages.filter(m => m.godId === god.id);
        if (myMessages.length > 0) {
          const lastMsg = myMessages[myMessages.length - 1];
          await saveDebateMemory(god.id, {
            topic,
            content: lastMsg.content,
            consensus,
            debateId,
          });
        }
      }
    }

    // ── Obsidian에 노트 동기화 ────────────────────────────────
    this._status('📓 Obsidian에 기억 동기화 중...');
    await syncDebateToObsidian({
      gods: AI_GODS,
      topic,
      debateId,
      messages: this.messages,
      consensus,
    }).catch(e => console.warn('Obsidian 동기화 스킵 (vault 미설정):', e.message));

    this._status('🎉 토론 완료!');
    if (this.onCompleteCallback) {
      this.onCompleteCallback({ topic, messages: this.messages, consensus, totalRounds });
    }

    return { topic, messages: this.messages, consensus, totalRounds };
  }
}

export const orchestrator = new DiscussionOrchestrator();
