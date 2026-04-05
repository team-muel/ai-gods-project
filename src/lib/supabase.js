import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Supabase 환경변수가 설정되지 않았습니다.')
}

export const supabase = createClient(url, key)
