const HALF_LIFE_DAYS = 21

export const calcDecayScore = (createdAt) => {
  if (!createdAt) return 0

  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return 0

  const days = (Date.now() - createdMs) / (1000 * 60 * 60 * 24)
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

export const keywordSimilarity = (textA = '', textB = '') => {
  const wordsA = String(textA)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1)

  const wordsB = new Set(
    String(textB)
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 1)
  )

  if (wordsA.length === 0 || wordsB.size === 0) return 0

  const overlap = wordsA.filter((word) => wordsB.has(word)).length
  return overlap / wordsA.length
}

export const classifyRelationship = (newTopic, existingTopic, similarityScore) => {
  void newTopic
  void existingTopic

  if (similarityScore > 0.7) return 'supersedes'
  if (similarityScore > 0.4) return 'derived_from'
  if (similarityScore > 0.2) return 'related'
  return null
}
