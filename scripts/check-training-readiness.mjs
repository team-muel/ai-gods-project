import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { isRewardLearningUnavailableError } from '../src/lib/rewardLearning.js'

const GOD_IDS = ['cco', 'cso', 'cpo', 'cmo', 'cxo', 'cfo', 'cdo', 'cto']

const parseArgs = () => {
  const args = process.argv.slice(2)
  const parsed = { out: '' }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--out') {
      parsed.out = args[index + 1] || ''
      index += 1
    }
  }

  return parsed
}

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const errorText = (error) => [error?.message, error?.details, error?.hint]
  .filter(Boolean)
  .join(' ')
  .toLowerCase()

const isTableUnavailableError = (error, tableName) => {
  const code = String(error?.code || '').toUpperCase()
  const text = errorText(error)

  return [
    code === '42P01',
    code === 'PGRST205',
    text.includes(`public.${tableName}`),
    text.includes(tableName) && text.includes('does not exist'),
    text.includes(tableName) && text.includes('schema cache'),
  ].some(Boolean)
}

const parseThreshold = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const writeGithubOutputs = (outputs) => {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) return

  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`)
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf-8')
}

const safeCount = async (queryPromise, { optionalTableName = '' } = {}) => {
  const result = await queryPromise
  if (result.error) {
    if (optionalTableName && isTableUnavailableError(result.error, optionalTableName)) {
      return 0
    }
    throw new Error(result.error.message)
  }

  return result.count || 0
}

const loadGodStats = async (supabase) => {
  const result = await supabase.from('god_stats').select('*')

  if (result.error) {
    if (isTableUnavailableError(result.error, 'god_stats')) {
      return []
    }

    throw new Error(result.error.message)
  }

  return Array.isArray(result.data) ? result.data : []
}

const describeRecommendation = ({ readyForSft, readyForDpo, recommendedForTraining, minMemoriesAcrossGods, recentPreferencePairs7d, thresholds, rewardLearningEnabled }) => {
  if (!rewardLearningEnabled) {
    if (recommendedForTraining) {
      return '데이터가 충분합니다. reward-learning 테이블이 아직 없어도 기존 합의 토론 기반 DPO 경로로 학습을 진행할 수 있습니다.'
    }

    if (readyForSft || readyForDpo) {
      return 'reward-learning 테이블이 아직 없어 preference pair 기준은 건너뛰고 있습니다. 지금은 기존 합의 토론 기반 export와 DPO 경로를 계속 사용할 수 있습니다.'
    }

    return `아직 데이터가 부족합니다. reward-learning 테이블이 없어도 최소 토론 ${thresholds.minTotalDebates}건, 신별 active memory ${thresholds.minActiveMemoriesPerGod}건 이상을 목표로 쌓으세요. 현재 최소 active memory는 ${minMemoriesAcrossGods}건입니다.`
  }

  if (recommendedForTraining) {
    return '데이터가 충분합니다. self-hosted GPU runner에서 SFT와 DPO를 수행할 수 있습니다.'
  }

  if (readyForSft || readyForDpo) {
    return `학습 데이터 export는 할 수 있지만, 자체 모델 cutover를 위해서는 토론과 메모리를 더 쌓고 최근 7일 preference pair를 ${thresholds.minPreferencePairsLast7d}개 이상 확보하는 편이 좋습니다. 현재 ${recentPreferencePairs7d}개입니다.`
  }

  return `아직 데이터가 부족합니다. 최소 토론 ${thresholds.minTotalDebates}건, 신별 active memory ${thresholds.minActiveMemoriesPerGod}건, 최근 7일 preference pair ${thresholds.minPreferencePairsLast7d}건 이상을 목표로 쌓으세요. 현재 최소 active memory는 ${minMemoriesAcrossGods}건이고, 최근 pair는 ${recentPreferencePairs7d}건입니다.`
}

const main = async () => {
  const args = parseArgs()
  const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY 가 필요합니다.')
  }

  const thresholds = {
    minTotalDebates: parseThreshold('TRAIN_MIN_TOTAL_DEBATES', 50),
    recommendedDebates: parseThreshold('TRAIN_RECOMMENDED_DEBATES', 100),
    minConsensusDebates: parseThreshold('TRAIN_MIN_CONSENSUS_DEBATES', 20),
    minActiveMemoriesPerGod: parseThreshold('TRAIN_MIN_ACTIVE_MEMORIES_PER_GOD', 8),
    minMessagesLast7d: parseThreshold('TRAIN_MIN_MESSAGES_LAST_7D', 80),
    minPreferencePairsLast7d: parseThreshold('TRAIN_MIN_PREFERENCE_PAIRS_LAST_7D', 24),
  }

  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const [godStatsRows, totalDebatesResult, consensusDebatesResult, recentDebatesResult, recentMessagesResult, recentPreferencePairsResult] = await Promise.all([
    loadGodStats(supabase),
    supabase.from('debates').select('*', { count: 'exact', head: true }),
    supabase.from('debates').select('*', { count: 'exact', head: true }).not('consensus', 'is', null).neq('consensus', ''),
    supabase.from('debates').select('*', { count: 'exact', head: true }).gte('created_at', since7d.toISOString()),
    supabase.from('debate_messages').select('*', { count: 'exact', head: true }).gte('created_at', since7d.toISOString()),
    supabase.from('preference_pairs').select('*', { count: 'exact', head: true }).eq('status', 'ready').gte('created_at', since7d.toISOString()),
  ])

  for (const result of [totalDebatesResult, consensusDebatesResult, recentDebatesResult, recentMessagesResult]) {
    if (result.error) {
      throw new Error(result.error.message)
    }
  }

  let rewardLearningEnabled = true
  let recentPreferencePairs7d = 0
  if (recentPreferencePairsResult.error) {
    if (isRewardLearningUnavailableError(recentPreferencePairsResult.error)) {
      rewardLearningEnabled = false
    } else {
      throw new Error(recentPreferencePairsResult.error.message)
    }
  } else {
    recentPreferencePairs7d = recentPreferencePairsResult.count || 0
  }

  const statsByGod = new Map((godStatsRows || []).map((row) => [row.god_id, row]))
  const byGod = await Promise.all(
    GOD_IDS.map(async (godId) => {
      const [activeMemories, recentMessagesByGod, recentImmune] = await Promise.all([
        safeCount(
          supabase.from('god_memories').select('*', { count: 'exact', head: true }).eq('god_id', godId).eq('status', 'active'),
        ),
        safeCount(
          supabase.from('debate_messages').select('*', { count: 'exact', head: true }).eq('god_id', godId).gte('created_at', since7d.toISOString()),
        ),
        safeCount(
          supabase.from('immune_logs').select('*', { count: 'exact', head: true }).eq('agent_id', godId).gte('created_at', since7d.toISOString()),
          { optionalTableName: 'immune_logs' },
        ),
      ])

      const stats = statsByGod.get(godId) || {}
      return {
        godId,
        totalDebates: Number(stats.total_debates || 0),
        totalMessages: Number(stats.total_messages || 0),
        avgResponseLength: Number(stats.avg_response_length || 0),
        lastActive: stats.last_active || null,
        activeMemories,
        recentMessages7d: recentMessagesByGod,
        immuneEvents7d: recentImmune,
      }
    })
  )

  const totalDebates = totalDebatesResult.count || 0
  const consensusDebates = consensusDebatesResult.count || 0
  const recentDebates7d = recentDebatesResult.count || 0
  const recentMessages7d = recentMessagesResult.count || 0
  const minMemoriesAcrossGods = Math.min(...byGod.map((entry) => entry.activeMemories))

  const readyForExport = totalDebates >= Math.min(10, thresholds.minTotalDebates)
  const readyForSft = totalDebates >= thresholds.minTotalDebates && byGod.every((entry) => entry.activeMemories >= thresholds.minActiveMemoriesPerGod)
  const readyForDpo = rewardLearningEnabled
    ? consensusDebates >= thresholds.minConsensusDebates && recentPreferencePairs7d >= thresholds.minPreferencePairsLast7d
    : consensusDebates >= thresholds.minConsensusDebates
  const recommendedForTraining = readyForSft && readyForDpo && totalDebates >= thresholds.recommendedDebates && recentMessages7d >= thresholds.minMessagesLast7d

  const summary = {
    generatedAt: now.toISOString(),
    thresholds,
    totals: {
      totalDebates,
      consensusDebates,
      recentDebates7d,
      recentMessages7d,
      recentPreferencePairs7d,
      rewardLearningEnabled,
      minMemoriesAcrossGods,
    },
    gates: {
      readyForExport,
      readyForSft,
      readyForDpo,
      recommendedForTraining,
    },
    recommendation: describeRecommendation({
      readyForSft,
      readyForDpo,
      recommendedForTraining,
      minMemoriesAcrossGods,
      recentPreferencePairs7d,
      thresholds,
      rewardLearningEnabled,
    }),
    byGod,
  }

  if (args.out) {
    const outPath = path.resolve(args.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
  }

  writeGithubOutputs({
    ready_for_export: readyForExport,
    ready_for_sft: readyForSft,
    ready_for_dpo: readyForDpo,
    recommended_for_training: recommendedForTraining,
  })

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})