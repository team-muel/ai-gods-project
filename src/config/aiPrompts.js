import { AI_GODS, buildCouncilSystemPrompt } from './aiGods'

// 레거시 호환용: 실제 정의는 aiGods.js가 단일 소스
export const AI_PROMPTS = Object.fromEntries(
  AI_GODS.map((god) => [
    god.id,
    {
      name: god.name,
      systemPrompt: buildCouncilSystemPrompt(god.id, 'initial'),
    },
  ])
)
