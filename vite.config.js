import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js'
import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import matter from 'gray-matter'
import { createClient } from '@supabase/supabase-js'
import { buildOperationsDashboard, DEFAULT_DASHBOARD_PAGE_SIZE } from './api/ops/_operationsDashboard.js'

// ── Obsidian 유틸 ───────────────────────────────────────────
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

// Obsidian .md 파일 생성
const writeGodMemoryNote = (vaultPath, { godId, godName, topic, debateId, opinion, consensus, score, links }) => {
  const godDir = path.join(vaultPath, 'AI-Gods', godId)
  ensureDir(godDir)

  const date = new Date().toISOString().slice(0, 10)
  const slug = slugify(topic)
  const fileName = `${date}-${slug}.md`
  const filePath = path.join(godDir, fileName)

  const linkLines = links && links.length > 0
    ? links.map(l => `  - "[[${l}]]"`).join('\n')
    : ''

  const content = `---
god_id: ${godId}
god_name: ${godName}
topic: "${topic.replace(/"/g, "'")}"
debate_id: ${debateId || 'null'}
relevance_score: ${score || 1.0}
status: active
created_at: ${new Date().toISOString()}
${linkLines ? `links:\n${linkLines}` : 'links: []'}
---

# [${godName}] ${topic}

## 의견
${opinion || ''}

## 최종 합의
${consensus || ''}
`

  fs.writeFileSync(filePath, content, 'utf-8')
  return { filePath, fileName, godDir }
}

// Obsidian CLI 실행 헬퍼
import { execSync } from 'child_process'

const obsidianCli = (cmd) => {
  try {
    return execSync(`obsidian ${cmd}`, { encoding: 'utf-8', timeout: 8000 }).trim()
  } catch (e) {
    throw new Error(`obsidian CLI 오류: ${e.message}`)
  }
}

// Obsidian CLI로 노트 쓰기 (eval로 vault API 직접 호출)
const writeNoteViaCli = (notePath, content) => {
  const escaped = content.replace(/`/g, '\\`').replace(/\$/g, '\\$')
  obsidianCli(`eval "app.vault.adapter.write('${notePath}', \`${escaped}\`)"`)
}

// Obsidian CLI로 검색
const searchViaCli = (query, limit = 3) => {
  try {
    const raw = obsidianCli(`search query="${query}" format=json`)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, limit) : []
  } catch {
    return []
  }
}

// Obsidian 변경 감지 → Supabase 업데이트
const startObsidianWatcher = (vaultPath, supabaseClient) => {
  const watchGlob = path.join(vaultPath, 'AI-Gods', '**', '*.md')

  const watcher = chokidar.watch(watchGlob, {
    ignoreInitial: true,     // 시작 시 기존 파일은 무시
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  })

  watcher.on('change', async (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data: fm } = matter(raw)

      if (!fm.debate_id || fm.debate_id === 'null') return
      if (!fm.relevance_score && fm.status === undefined) return

      console.log(`[Obsidian→Supabase] 변경 감지: ${path.basename(filePath)}`)

      const updates = {}
      if (fm.relevance_score !== undefined) updates.relevance_score = Number(fm.relevance_score)
      if (fm.status !== undefined) updates.status = fm.status
      updates.updated_at = new Date().toISOString()

      const { error } = await supabaseClient
        .from('god_memories')
        .update(updates)
        .eq('debate_id', fm.debate_id)
        .eq('god_id', fm.god_id)

      if (error) console.error('[Obsidian→Supabase] 업데이트 오류:', error)
      else console.log(`[Obsidian→Supabase] ✅ ${fm.god_name} / "${fm.topic}" 업데이트 완료`)
    } catch (e) {
      console.error('[Obsidian watcher 오류]', e.message)
    }
  })

  console.log(`[Obsidian] 📂 vault 감시 중: ${vaultPath}/AI-Gods/`)
  return watcher
}

// ── Vite Config ─────────────────────────────────────────────
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const vaultPath   = env.OBSIDIAN_VAULT_PATH || ''
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const groqApiKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || ''
  const groqModel = 'llama-3.1-8b-instant'
  const ollamaBaseUrl = (env.VITE_OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

  if (!env.GROQ_API_KEY && env.VITE_GROQ_API_KEY) {
    console.warn('[Security] VITE_GROQ_API_KEY는 deprecated 되었습니다. 브라우저 노출 방지를 위해 GROQ_API_KEY로 옮기세요.')
  }

  return {
    plugins: [
      react(),

      // ── YouTube 트랜스크립트 미들웨어 ──
      {
        name: 'youtube-transcript-api',
        configureServer(server) {
          server.middlewares.use('/api/transcript', async (req, res) => {
            const urlObj = new URL(req.url, 'http://localhost')
            const videoId = urlObj.searchParams.get('videoId')

            if (!videoId) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'videoId 파라미터가 필요합니다.' }))
              return
            }

            try {
              const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
                .catch(() => YoutubeTranscript.fetchTranscript(videoId))

              const text = transcript.map(t => t.text).join(' ')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ transcript: text, segments: transcript.length }))
            } catch (e) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: `트랜스크립트를 가져올 수 없습니다: ${e.message}` }))
            }
          })
        },
      },

      // ── 운영 대시보드 API (로컬 개발용) ───────────────────────
      {
        name: 'operations-dashboard-api',
        configureServer(server) {
          server.middlewares.use('/api/ops/dashboard', async (req, res) => {
            if (req.method !== 'GET') {
              res.statusCode = 405
              res.setHeader('Allow', 'GET')
              res.end()
              return
            }

            try {
              const urlObj = new URL(req.url || '/', 'http://localhost')
              const page = Math.max(1, Number.parseInt(urlObj.searchParams.get('page') || '1', 10) || 1)
              const pageSize = Math.max(6, Math.min(24, Number.parseInt(urlObj.searchParams.get('pageSize') || String(DEFAULT_DASHBOARD_PAGE_SIZE), 10) || DEFAULT_DASHBOARD_PAGE_SIZE))
              const payload = await buildOperationsDashboard({ page, pageSize, env })
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(payload))
            } catch (error) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ error: error.message || '운영 대시보드 조회에 실패했습니다.' }))
            }
          })
        },
      },

      // ── Chat 프록시 미들웨어 (Groq + 로컬 Ollama direct) ──
      {
        name: 'groq-proxy',
        configureServer(server) {
          server.middlewares.use('/api/chat', (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
            let body = ''
            req.on('data', chunk => (body += chunk))
            req.on('end', async () => {
              let payload
              try {
                payload = body ? JSON.parse(body) : {}
              } catch (e) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'JSON 본문 파싱 실패' }))
                return
              }

              const provider = payload?.provider === 'ollama' ? 'ollama' : 'groq'
              delete payload.provider

              if (provider === 'ollama') {
                try {
                  const upstream = await fetch(`${ollamaBaseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...payload,
                      model: payload.model || 'llama3.1:8b',
                      stream: payload.stream ?? false,
                    }),
                  })
                  const data = await upstream.json().catch(() => ({}))
                  res.setHeader('Content-Type', 'application/json')
                  res.statusCode = upstream.status
                  res.end(JSON.stringify(data))
                } catch (e) {
                  res.statusCode = 500
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: `로컬 Ollama 연결 실패: ${e.message}` }))
                }
                return
              }

              payload.model = groqModel
              if (!groqApiKey) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'GROQ_API_KEY 미설정' }))
                return
              }

              const MAX_RETRIES = 6
              const sleep = (ms) => new Promise(r => setTimeout(r, ms))
              const serializedBody = JSON.stringify(payload)
              for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${groqApiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: serializedBody,
                  })
                  const data = await upstream.json()

                  if (upstream.status === 429) {
                    const msg = data?.error?.message || ''
                    const match = msg.match(/try again in ([\d.]+)s/)
                    const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 15000
                    console.log(`[Groq 429] ${Math.round(waitMs/1000)}초 대기 후 재시도... (${attempt + 1}/${MAX_RETRIES})`)
                    await sleep(waitMs)
                    continue
                  }

                  res.setHeader('Content-Type', 'application/json')
                  res.statusCode = upstream.status
                  res.end(JSON.stringify(data))
                  return
                } catch (e) {
                  if (attempt === MAX_RETRIES - 1) {
                    res.statusCode = 500
                    res.end(JSON.stringify({ error: e.message }))
                    return
                  }
                  await sleep(3000)
                }
              }
              res.statusCode = 429
              res.end(JSON.stringify({ error: '최대 재시도 횟수 초과. 잠시 후 다시 시도하세요.' }))
            })
          })
        },
      },

      // ── DuckDuckGo 크롤링 미들웨어 (Serper 대체) ──
      {
        name: 'search-crawl',
        configureServer(server) {
          server.middlewares.use('/api/search', async (req, res) => {
            const urlObj = new URL(req.url, 'http://localhost')
            const query  = urlObj.searchParams.get('q')
            const num    = parseInt(urlObj.searchParams.get('num') || '5')

            if (!query) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'q 파라미터가 필요합니다.' }))
              return
            }

            try {
              const response = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`,
                {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Accept': 'text/html',
                  },
                }
              )

              const html = await response.text()
              const titleMatches   = [...html.matchAll(/class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g)]
              const snippetMatches = [...html.matchAll(/class="result__snippet"[^>]*>([^<]+)<\/a>/g)]

              const count = Math.min(num, titleMatches.length)
              const results = []
              for (let i = 0; i < count; i++) {
                const title   = titleMatches[i]?.[2]?.trim() || ''
                const link    = titleMatches[i]?.[1]?.trim() || ''
                const snippet = snippetMatches[i]?.[1]?.trim() || ''
                if (title) results.push({ title, snippet, link })
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ results, knowledgePanel: null, query }))
            } catch (e) {
              console.error('[Search] 크롤링 실패:', e.message)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ results: [], knowledgePanel: null, query }))
            }
          })
        },
      },

      // ── Obsidian 연동 플러그인 ──
      {
        name: 'obsidian-sync',
        configureServer(server) {
          if (!vaultPath) {
            console.warn('[Obsidian] OBSIDIAN_VAULT_PATH가 설정되지 않았습니다. .env를 확인하세요.')
            return
          }

          const supabase = createClient(supabaseUrl, supabaseKey)

          // 파일 감시 시작 (Obsidian → Supabase)
          startObsidianWatcher(vaultPath, supabase)

          // POST /api/obsidian/write — CLI로 노트 작성 후 Obsidian이 즉시 인덱싱
          server.middlewares.use('/api/obsidian/write', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }

            let body = ''
            req.on('data', chunk => (body += chunk))
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body)
                const { filePath, fileName } = writeGodMemoryNote(vaultPath, payload)

                // CLI로 Obsidian에 알림 → 즉시 인덱싱
                try {
                  writeNoteViaCli(
                    `AI-Gods/${payload.godId}/${fileName}`,
                    fs.readFileSync(filePath, 'utf-8')
                  )
                  console.log(`[Obsidian CLI] ✅ ${payload.godName} 노트 인덱싱 완료`)
                } catch {
                  // CLI 실패해도 파일은 이미 저장됨 — 앱이 꺼져있을 때
                  console.log(`[Obsidian] ✅ 파일 저장됨 (앱 미실행, 다음 시작 시 인덱싱)`)
                }

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true, file: fileName }))
              } catch (e) {
                res.statusCode = 500
                res.end(JSON.stringify({ ok: false, error: e.message }))
              }
            })
          })

          // GET /api/obsidian/search?godId=cso&q=주제 — CLI로 관련 과거 노트 검색
          server.middlewares.use('/api/obsidian/search', (req, res) => {
            const urlObj = new URL(req.url, 'http://localhost')
            const godId  = urlObj.searchParams.get('godId')
            const query  = urlObj.searchParams.get('q') || ''

            res.setHeader('Content-Type', 'application/json')

            try {
              // Obsidian CLI search (앱 실행 중일 때)
              const cliResults = searchViaCli(`${godId} ${query}`, 3)

              if (cliResults.length > 0) {
                const notes = cliResults.map(r => ({
                  title:   r.title || r.path || '',
                  snippet: r.snippet || r.content?.slice(0, 200) || '',
                }))
                console.log(`[Obsidian CLI] 🔍 ${godId} "${query}" → ${notes.length}개`)
                res.end(JSON.stringify({ notes }))
                return
              }
            } catch {
              // CLI 실패 시 파일 직접 읽기로 폴백
            }

            // 폴백: 파일 시스템에서 직접 읽기
            const godDir = path.join(vaultPath, 'AI-Gods', godId || '')
            if (!godDir || !fs.existsSync(godDir)) {
              res.end(JSON.stringify({ notes: [] }))
              return
            }

            const files = fs.readdirSync(godDir)
              .filter(f => f.endsWith('.md'))
              .slice(-5) // 최근 5개

            const notes = files.map(f => {
              const raw     = fs.readFileSync(path.join(godDir, f), 'utf-8')
              const { data: fm, content } = matter(raw)
              return {
                title:   fm.topic || f.replace('.md', ''),
                snippet: content.slice(0, 200),
              }
            }).filter(n => n.title)

            console.log(`[Obsidian FS] 🔍 ${godId} → ${notes.length}개 (폴백)`)
            res.end(JSON.stringify({ notes }))
          })
        },
      },
    ],

    server: {
      port: 3000,
      strictPort: true,
      open: false,
    },
    resolve: {
      alias: { '@': '/src' },
    },
  }
})
