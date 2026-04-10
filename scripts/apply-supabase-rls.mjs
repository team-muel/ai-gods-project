import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const defaultSqlFile = path.join(projectRoot, 'db', 'supabase_apply_rls_policies.sql')

const getProjectRef = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co$/i)
  return match?.[1] || ''
}

const buildDbUrl = () => {
  if (process.env.SUPABASE_DB_URL) {
    return process.env.SUPABASE_DB_URL
  }

  const password = process.env.SUPABASE_DB_PASSWORD
  const projectRef = process.env.SUPABASE_PROJECT_REF || getProjectRef()
  const host = process.env.SUPABASE_DB_HOST || (projectRef ? `db.${projectRef}.supabase.co` : '')
  const user = process.env.SUPABASE_DB_USER || 'postgres'
  const database = process.env.SUPABASE_DB_NAME || 'postgres'
  const port = process.env.SUPABASE_DB_PORT || '5432'

  if (!password || !host) {
    return ''
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=require`
}

const main = async () => {
  const sqlFile = process.env.SUPABASE_SQL_FILE
    ? path.resolve(projectRoot, process.env.SUPABASE_SQL_FILE)
    : defaultSqlFile

  const dbUrl = buildDbUrl()
  if (!dbUrl) {
    throw new Error(
      'SUPABASE_DB_URL 또는 SUPABASE_DB_PASSWORD가 필요합니다. ' +
      'DB 비밀번호만 있으면 VITE_SUPABASE_URL에서 project ref를 추론해 연결합니다.'
    )
  }

  const sql = await fs.readFile(sqlFile, 'utf-8')
  const client = new Client({ connectionString: dbUrl })

  try {
    await client.connect()
    await client.query(sql)
    console.log(`Applied SQL successfully: ${path.relative(projectRoot, sqlFile)}`)
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})