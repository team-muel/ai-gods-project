import { createClient } from '@supabase/supabase-js'

let cachedClient = null
let cachedKey = ''

export const getSupabaseServerClient = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fallbackKey = process.env.NODE_ENV === 'production' ? '' : process.env.VITE_SUPABASE_ANON_KEY
  const key = serviceRoleKey || fallbackKey

  if (!url || !key) {
    throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.')
  }

  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    cachedKey = key
  }

  return cachedClient
}
