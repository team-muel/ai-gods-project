import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js'
import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import matter from 'gray-matter'
import { createClient } from '@supabase/supabase-js'

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
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY

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

      // ── Groq 프록시 미들웨어 (로컬 CORS 해결) ──
      {
        name: 'groq-proxy',
        configureServer(server) {
          server.middlewares.use('/api/chat', (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
            const groqKey = serperKey ? env.VITE_GROQ_API_KEY : ''
            let body = ''
            req.on('data', chunk => (body += chunk))
            req.on('end', async () => {
              try {
                const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${env.VITE_GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body,
                })
                const data = await upstream.json()
                res.setHeader('Content-Type', 'application/json')
                res.statusCode = upstream.status
                res.end(JSON.stringify(data))
              } catch (e) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: e.message }))
              }
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

          // POST /api/obsidian/write — 토론 완료 후 Obsidian에 메모 작성
          server.middlewares.use('/api/obsidian/write', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method Not Allowed')
              return
            }

            let body = ''
            req.on('data', chunk => (body += chunk))
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body)
                // payload: { godId, godName, topic, debateId, opinion, consensus, score, existingLinks }
                const { filePath, fileName } = writeGodMemoryNote(vaultPath, payload)

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true, file: fileName }))
                console.log(`[Obsidian] ✅ 노트 작성: ${filePath}`)
              } catch (e) {
                console.error('[Obsidian write 오류]', e.message)
                res.statusCode = 500
                res.end(JSON.stringify({ ok: false, error: e.message }))
              }
            })
          })

          // GET /api/obsidian/links?godId=cso&topic=... — 관련 노트 링크 조회
          server.middlewares.use('/api/obsidian/links', async (req, res) => {
            const urlObj = new URL(req.url, 'http://localhost')
            const godId = urlObj.searchParams.get('godId')

            if (!godId) {
              res.statusCode = 400
              res.end(JSON.stringify({ links: [] }))
              return
            }

            const godDir = path.join(vaultPath, 'AI-Gods', godId)
            if (!fs.existsSync(godDir)) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ links: [] }))
              return
            }

            const files = fs.readdirSync(godDir).filter(f => f.endsWith('.md'))
            const links = files.map(f => `${godId}/${f.replace('.md', '')}`)

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ links }))
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
