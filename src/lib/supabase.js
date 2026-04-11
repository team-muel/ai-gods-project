import { createClient } from '@supabase/supabase-js'

const IS_DEV = import.meta.env.DEV === true

// Vite: import.meta.env.VITE_* 는 옵셔널 체이닝 없이 직접 참조해야 정적 치환됨
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase

if (IS_DEV && url && key) {
  supabase = createClient(url, key)
} else {
  console.info('브라우저 Supabase 직접 접근은 비활성화되어 있습니다. 프로덕션에서는 서버 API를 사용합니다.')
  // minimal chainable stub — 모든 체인 메서드 포함 (no-op)
  const chain = {
    select:  () => chain,
    insert:  async () => ({ data: null, error: null }),
    update:  async () => ({ data: null, error: null }),
    upsert:  async () => ({ data: null, error: null }),
    delete:  async () => ({ data: null, error: null }),
    single:  async () => ({ data: null, error: null }),
    eq:      () => chain,
    neq:     () => chain,
    gt:      () => chain,
    gte:     () => chain,
    lt:      () => chain,
    lte:     () => chain,
    like:    () => chain,
    ilike:   () => chain,
    is:      () => chain,
    in:      () => chain,
    not:     () => chain,
    or:      () => chain,
    filter:  () => chain,
    limit:   () => chain,
    order:   () => chain,
    range:   () => chain,
    then:    (resolve) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
  }
  supabase = {
    from: () => chain,
    rpc:  async () => ({ data: null, error: null }),
  }
}

export { supabase }
