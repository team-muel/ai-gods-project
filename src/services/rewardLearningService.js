import { postJson } from './apiClient.js'

export const submitDebateFeedback = async ({ debateId, direction, note = '' }) => {
  return await postJson('/api/debates/feedback', {
    debateId,
    direction,
    note,
  })
}