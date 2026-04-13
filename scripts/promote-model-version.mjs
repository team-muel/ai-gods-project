import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_LOCAL_REGISTRY_PATH = 'outputs/model-registry.json'
const LOCAL_REGISTRY_BACKENDS = new Set(['file', 'local'])

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    agent: '',
    runId: '',
    modelName: '',
    rolloutState: 'active',
    deactivateOthers: true,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--agent' || arg === '--god') {
      options.agent = String(next || '').trim().toLowerCase()
      index += 1
      continue
    }

    if (arg === '--run-id') {
      options.runId = String(next || '').trim()
      index += 1
      continue
    }

    if (arg === '--model-name') {
      options.modelName = String(next || '').trim()
      index += 1
      continue
    }

    if (arg === '--rollout-state') {
      options.rolloutState = String(next || '').trim().toLowerCase() || 'active'
      index += 1
      continue
    }

    if (arg === '--keep-others-active') {
      options.deactivateOthers = false
    }

    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage:',
        '  npm run promote:model -- --agent cco --run-id manual-20260412120000',
        '  npm run promote:model -- --agent cco --run-id manual-20260412120000 --model-name Muse --rollout-state canary',
      ].join('\n'))
      process.exit(0)
    }
  }

  return options
}

const getRegistryBackend = () => String(process.env.MODEL_REGISTRY_BACKEND || 'auto').trim().toLowerCase()

const getLocalRegistryPath = () => {
  const configured = String(process.env.MODEL_REGISTRY_PATH || DEFAULT_LOCAL_REGISTRY_PATH).trim()
  return path.resolve(process.cwd(), configured || DEFAULT_LOCAL_REGISTRY_PATH)
}

const createLocalRegistry = () => ({
  updatedAt: new Date().toISOString(),
  trainingRuns: [],
  modelVersions: [],
})

const loadLocalRegistry = async () => {
  try {
    const payload = await readFile(getLocalRegistryPath(), 'utf8')
    return JSON.parse(payload)
  } catch (error) {
    if (error?.code === 'ENOENT') return createLocalRegistry()
    throw new Error(`local registry 읽기 실패: ${error.message || error}`)
  }
}

const saveLocalRegistry = async (registry) => {
  const targetPath = getLocalRegistryPath()
  await mkdir(path.dirname(targetPath), { recursive: true })
  registry.updatedAt = new Date().toISOString()
  await writeFile(targetPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
}

const createSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const assertRequired = (options) => {
  if (!options.agent) {
    throw new Error('--agent 또는 --god 가 필요합니다.')
  }

  if (!options.runId) {
    throw new Error('--run-id 가 필요합니다.')
  }
}

const isMissingModelVersionsError = (message) => {
  return message.includes('Could not find the table') || message.includes('does not exist')
}

const promoteLocalModelVersion = async (options) => {
  const registry = await loadLocalRegistry()
  const rows = Array.isArray(registry.modelVersions) ? [...registry.modelVersions] : []
  const matched = rows.filter((row) => {
    return String(row?.agent_id || '').trim().toLowerCase() === options.agent
      && String(row?.run_id || '').trim() === options.runId
      && (!options.modelName || String(row?.model_name || '').trim() === options.modelName)
  })

  if (matched.length === 0) {
    throw new Error('승격할 local modelVersions 레코드를 찾지 못했습니다.')
  }

  if (matched.length > 1 && !options.modelName) {
    throw new Error('같은 run_id에 여러 local model_name이 있습니다. --model-name 을 함께 지정하세요.')
  }

  const target = matched[0]
  const targetIndex = rows.findIndex((row) => {
    return row?.agent_id === target.agent_id && row?.run_id === target.run_id && row?.model_name === target.model_name
  })

  if (targetIndex < 0) {
    throw new Error('local registry 대상 레코드를 찾지 못했습니다.')
  }

  if (options.deactivateOthers) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (String(row?.agent_id || '').trim().toLowerCase() !== options.agent) continue
      if (index === targetIndex) continue
      rows[index] = {
        ...row,
        is_active: false,
        rollout_state: 'registered',
      }
    }
  }

  const metadata = {
    ...(target.metadata || {}),
    promotedAt: new Date().toISOString(),
    promotedBy: 'scripts/promote-model-version.mjs',
    registrySource: 'local-file',
  }

  const promoted = {
    ...target,
    is_active: true,
    rollout_state: options.rolloutState,
    metadata,
  }

  rows[targetIndex] = promoted
  registry.modelVersions = rows
  await saveLocalRegistry(registry)

  return {
    backend: 'local',
    promoted: {
      agent_id: promoted.agent_id,
      run_id: promoted.run_id,
      model_name: promoted.model_name,
      rollout_state: promoted.rollout_state,
      is_active: promoted.is_active,
    },
    deactivateOthers: options.deactivateOthers,
  }
}

const promoteSupabaseModelVersion = async (supabase, options) => {
  if (!supabase) {
    throw new Error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  }

  let query = supabase
    .from('model_versions')
    .select('id, agent_id, run_id, model_name, rollout_state, is_active, metadata')
    .eq('agent_id', options.agent)
    .eq('run_id', options.runId)

  if (options.modelName) {
    query = query.eq('model_name', options.modelName)
  }

  const lookup = await query.order('created_at', { ascending: false })
  if (lookup.error) {
    throw new Error(`model_versions 조회 실패: ${lookup.error.message}`)
  }

  const rows = lookup.data || []
  if (rows.length === 0) {
    throw new Error('승격할 model_versions 레코드를 찾지 못했습니다.')
  }

  if (rows.length > 1 && !options.modelName) {
    throw new Error('같은 run_id에 여러 model_name이 있습니다. --model-name 을 함께 지정하세요.')
  }

  const target = rows[0]

  if (options.deactivateOthers) {
    const deactivate = await supabase
      .from('model_versions')
      .update({
        is_active: false,
        rollout_state: 'registered',
      })
      .eq('agent_id', options.agent)
      .eq('is_active', true)
      .neq('id', target.id)

    if (deactivate.error) {
      throw new Error(`기존 active 모델 비활성화 실패: ${deactivate.error.message}`)
    }
  }

  const metadata = {
    ...(target.metadata || {}),
    promotedAt: new Date().toISOString(),
    promotedBy: 'scripts/promote-model-version.mjs',
  }

  const promote = await supabase
    .from('model_versions')
    .update({
      is_active: true,
      rollout_state: options.rolloutState,
      metadata,
    })
    .eq('id', target.id)
    .select('id, agent_id, run_id, model_name, rollout_state, is_active')
    .single()

  if (promote.error) {
    throw new Error(`모델 승격 실패: ${promote.error.message}`)
  }

  return {
    backend: 'supabase',
    promoted: promote.data,
    deactivateOthers: options.deactivateOthers,
  }
}

const main = async () => {
  const options = parseArgs()
  assertRequired(options)
  const backend = getRegistryBackend()

  if (LOCAL_REGISTRY_BACKENDS.has(backend)) {
    const result = await promoteLocalModelVersion(options)
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  const supabase = createSupabase()
  if (!supabase) {
    const result = await promoteLocalModelVersion(options)
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  try {
    const result = await promoteSupabaseModelVersion(supabase, options)
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
  } catch (error) {
    if (backend !== 'auto' || !isMissingModelVersionsError(String(error?.message || error))) {
      throw error
    }

    const result = await promoteLocalModelVersion(options)
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
  }
}

await main()