import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const resolveEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || ''

const parseArgs = () => {
  const args = process.argv.slice(2)
  const parsed = {
    manifest: path.join(projectRoot, 'outputs', 'training-datasets-manifest.json'),
    readiness: path.join(projectRoot, 'outputs', 'training-readiness.json'),
    out: path.join(projectRoot, 'outputs', 'remote-training-request.json'),
    requireWebhook: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--manifest') {
      parsed.manifest = path.resolve(projectRoot, args[index + 1] || '')
      index += 1
    } else if (arg === '--readiness') {
      parsed.readiness = path.resolve(projectRoot, args[index + 1] || '')
      index += 1
    } else if (arg === '--out') {
      parsed.out = path.resolve(projectRoot, args[index + 1] || '')
      index += 1
    } else if (arg === '--require-webhook') {
      parsed.requireWebhook = true
    }
  }

  return parsed
}

const writeGithubOutputs = async (outputs) => {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) return
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`)
  await fs.appendFile(outputPath, `${lines.join('\n')}\n`, 'utf-8')
}

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf-8'))

const buildSupabaseClient = () => {
  const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const createSignedDownload = async ({ supabase, bucketName, objectPath, expiresIn }) => {
  const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(objectPath, expiresIn)
  if (error) {
    throw error
  }
  return data?.signedUrl || ''
}

const main = async () => {
  const args = parseArgs()
  const webhookUrl = resolveEnv('REMOTE_TRAINING_WEBHOOK_URL')
  const webhookToken = resolveEnv('REMOTE_TRAINING_BEARER_TOKEN')
  const provider = resolveEnv('REMOTE_TRAINING_PROVIDER') || 'generic-webhook'
  const paused = ['paused', 'disabled', 'off', 'none'].includes(provider.trim().toLowerCase())
  const artifactTarget = (resolveEnv('MODEL_ARTIFACT_TARGET') || 'huggingface').toLowerCase()
  const supabase = buildSupabaseClient()
  const signedUrlExpiresIn = Number.parseInt(resolveEnv('REMOTE_TRAINING_SIGNED_URL_EXPIRES_IN') || '86400', 10) || 86400

  const manifest = await readJson(args.manifest)
  let readiness = null
  try {
    readiness = await readJson(args.readiness)
  } catch {
    readiness = null
  }

  const datasetBucket = resolveEnv('SUPABASE_DATASET_BUCKET') || 'training-datasets'
  const snapshotObjectPath = `snapshots/${manifest.snapshotId}/snapshot.json`
  const publishedDatasets = Array.isArray(manifest.publishedDatasets) ? manifest.publishedDatasets : []

  const payload = {
    provider,
    requestedAt: new Date().toISOString(),
    trigger: {
      githubRunId: process.env.GITHUB_RUN_ID || '',
      githubRepository: process.env.GITHUB_REPOSITORY || '',
      githubWorkflow: process.env.GITHUB_WORKFLOW || '',
    },
    training: {
      snapshotId: manifest.snapshotId,
      stats: manifest.stats || {},
      readyForDpo: Boolean(readiness?.gates?.readyForDpo),
      recommendedForTraining: Boolean(readiness?.gates?.recommendedForTraining),
      baseModel: 'Qwen/Qwen2.5-3B-Instruct',
      artifactTarget: {
        type: artifactTarget === 'supabase' ? 'supabase-storage' : 'huggingface-hub',
        repo: artifactTarget === 'supabase' ? '' : resolveEnv('HF_LORA_REPO'),
        bucket: artifactTarget === 'supabase' ? (resolveEnv('SUPABASE_MODEL_BUCKET') || resolveEnv('SUPABASE_DATASET_BUCKET') || 'training-datasets') : '',
      },
    },
    snapshot: {
      bucket: datasetBucket,
      objectPath: snapshotObjectPath,
      signedUrl: supabase ? await createSignedDownload({ supabase, bucketName: datasetBucket, objectPath: snapshotObjectPath, expiresIn: signedUrlExpiresIn }) : '',
    },
    datasets: await Promise.all(
      publishedDatasets.map(async (entry) => ({
        ...entry,
        bucket: datasetBucket,
        signedUrl: supabase
          ? await createSignedDownload({ supabase, bucketName: datasetBucket, objectPath: entry.objectPath, expiresIn: signedUrlExpiresIn })
          : '',
      })),
    ),
  }

  let responseBody = { skipped: true, reason: 'webhook_not_configured' }
  if (paused) {
    responseBody = { skipped: true, reason: 'remote_training_paused', provider }
  } else if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
      },
      body: JSON.stringify(payload),
    })

    responseBody = await response.json().catch(() => ({ status: response.status, ok: response.ok }))
    if (!response.ok) {
      throw new Error(responseBody?.message || `${response.status} ${response.statusText}`)
    }
  } else if (args.requireWebhook) {
    throw new Error('REMOTE_TRAINING_WEBHOOK_URL 이 필요합니다.')
  }

  const result = {
    ...payload,
    response: responseBody,
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true })
  await fs.writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`, 'utf-8')

  await writeGithubOutputs({
    remote_training_provider: provider,
    remote_training_triggered: !paused && webhookUrl ? 'true' : 'false',
    remote_training_job_id: responseBody?.jobId || responseBody?.id || '',
    remote_training_request: path.relative(projectRoot, args.out),
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})