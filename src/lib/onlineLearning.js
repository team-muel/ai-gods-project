const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const truthy = (value, fallback = false) => {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

const parsePositiveInt = (value, fallback, minimum = 1) => {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(minimum, parsed)
}

const buildHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'ai-gods-online-learning',
  'X-GitHub-Api-Version': '2022-11-28',
})

const fetchGithubJson = async (url, { method = 'GET', token, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers: buildHeaders(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (response.status === 204) return null

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || `${response.status} ${response.statusText}`)
  }

  return data
}

const minutesSince = (value) => {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY
  return (Date.now() - parsed) / (60 * 1000)
}

const listWorkflowRuns = async ({ owner, repo, workflowFile, token }) => {
  const params = new URLSearchParams({
    per_page: '10',
  })
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params.toString()}`
  const data = await fetchGithubJson(url, { token })
  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : []
}

const dispatchWorkflow = async ({ owner, repo, workflowFile, ref, token, inputs }) => {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`
  await fetchGithubJson(url, {
    method: 'POST',
    token,
    body: {
      ref,
      inputs,
    },
  })
}

export const maybeTriggerOnlineLearning = async ({ debateId, topic, totalRounds, consensus, messages, rewardEvents, preferencePairs, artifactFeedbackEvents } = {}) => {
  const enabled = truthy(resolveEnv('ONLINE_LEARNING_ENABLED'), false)
  if (!enabled) {
    return { triggered: false, reason: 'disabled' }
  }

  const triggerMode = (resolveEnv('ONLINE_LEARNING_TRIGGER_MODE') || 'github-workflow-dispatch').trim().toLowerCase()
  if (triggerMode !== 'github-workflow-dispatch') {
    return { triggered: false, reason: 'unsupported_trigger_mode', triggerMode }
  }

  const minRewardEvents = parsePositiveInt(resolveEnv('ONLINE_LEARNING_MIN_REWARD_EVENTS'), 4)
  const minPreferencePairs = parsePositiveInt(resolveEnv('ONLINE_LEARNING_MIN_PREFERENCE_PAIRS'), 4)
  const minArtifactFeedbackEvents = parsePositiveInt(resolveEnv('ONLINE_LEARNING_MIN_ARTIFACT_FEEDBACK_EVENTS'), 3)
  const minConsensusChars = parsePositiveInt(resolveEnv('ONLINE_LEARNING_MIN_CONSENSUS_CHARS'), 80)
  const cooldownMinutes = parsePositiveInt(resolveEnv('ONLINE_LEARNING_COOLDOWN_MINUTES'), 60)
  const requireConsensus = truthy(resolveEnv('ONLINE_LEARNING_REQUIRE_CONSENSUS'), true)
  const rewardEventCount = Array.isArray(rewardEvents) ? rewardEvents.length : 0
  const preferencePairCount = Array.isArray(preferencePairs) ? preferencePairs.length : 0
  const artifactFeedbackCount = Array.isArray(artifactFeedbackEvents) ? artifactFeedbackEvents.length : 0
  const consensusChars = String(consensus || '').trim().length
  const debateReady = rewardEventCount >= minRewardEvents
    && preferencePairCount >= minPreferencePairs
    && (!requireConsensus || consensusChars >= minConsensusChars)
  const artifactReady = artifactFeedbackCount >= minArtifactFeedbackEvents

  if (!debateReady && !artifactReady && rewardEventCount < minRewardEvents) {
    return { triggered: false, reason: 'insufficient_reward_events', rewardEventCount, minRewardEvents }
  }

  if (!debateReady && !artifactReady && preferencePairCount < minPreferencePairs) {
    return { triggered: false, reason: 'insufficient_preference_pairs', preferencePairCount, minPreferencePairs }
  }

  if (!debateReady && !artifactReady && requireConsensus && consensusChars < minConsensusChars) {
    return { triggered: false, reason: 'consensus_too_short', consensusChars, minConsensusChars }
  }

  if (!debateReady && !artifactReady) {
    return { triggered: false, reason: 'insufficient_artifact_feedback', artifactFeedbackCount, minArtifactFeedbackEvents }
  }

  const token = resolveEnv('GITHUB_TOKEN', 'GH_TOKEN')
  const owner = resolveEnv('GITHUB_REPO_OWNER', 'VERCEL_GIT_REPO_OWNER')
  const repo = resolveEnv('GITHUB_REPO_NAME', 'VERCEL_GIT_REPO_SLUG')
  const workflowFile = resolveEnv('ONLINE_LEARNING_WORKFLOW_FILE') || 'retraining-pipeline.yml'
  const ref = resolveEnv('ONLINE_LEARNING_GITHUB_REF', 'VERCEL_GIT_COMMIT_REF') || 'main'

  if (!token || !owner || !repo) {
    return {
      triggered: false,
      reason: 'missing_github_credentials',
      missing: {
        token: !token,
        owner: !owner,
        repo: !repo,
      },
    }
  }

  try {
    const runs = await listWorkflowRuns({ owner, repo, workflowFile, token })
    const activeRun = runs.find((run) => String(run.status || '').toLowerCase() !== 'completed')
    if (activeRun) {
      return {
        triggered: false,
        reason: 'workflow_busy',
        workflowRunId: activeRun.id,
        workflowStatus: activeRun.status,
      }
    }

    const latestRun = runs[0] || null
    if (latestRun) {
      const elapsedMinutes = minutesSince(latestRun.created_at)
      if (elapsedMinutes < cooldownMinutes) {
        return {
          triggered: false,
          reason: 'cooldown_active',
          elapsedMinutes: Number(elapsedMinutes.toFixed(2)),
          cooldownMinutes,
          workflowRunId: latestRun.id,
        }
      }
    }

    const inputs = {
      force_prepare: truthy(resolveEnv('ONLINE_LEARNING_FORCE_PREPARE'), true),
      run_training: truthy(resolveEnv('ONLINE_LEARNING_RUN_SELF_HOSTED_TRAINING'), false),
      run_remote_training: truthy(resolveEnv('ONLINE_LEARNING_RUN_REMOTE_TRAINING'), true),
    }

    await dispatchWorkflow({ owner, repo, workflowFile, ref, token, inputs })

    return {
      triggered: true,
      reason: 'workflow_dispatched',
      triggerSource: artifactReady && !debateReady ? 'artifact_feedback' : 'debate_outcome',
      workflowFile,
      ref,
      debateId,
      topic,
      totalRounds,
      rewardEventCount,
      preferencePairCount,
      artifactFeedbackCount,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      inputs,
    }
  } catch (error) {
    return {
      triggered: false,
      reason: 'dispatch_error',
      error: error.message || String(error),
    }
  }
}