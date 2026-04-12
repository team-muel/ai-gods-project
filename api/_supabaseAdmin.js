import { createClient } from '@supabase/supabase-js'

let cachedClient = null
let cachedSignature = ''

export const getSupabaseServerClient = ({ allowAnonFallback = false } = {}) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const fallbackKey = allowAnonFallback || process.env.NODE_ENV !== 'production' ? anonKey : ''
  const key = serviceRoleKey || fallbackKey

  if (!url || !key) {
    throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.')
  }

  const signature = `${url}:${key}`

  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    cachedSignature = signature
  }

  return cachedClient
}
