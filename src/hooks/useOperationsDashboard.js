import { useCallback, useEffect, useState } from 'react'
import { requestJson } from '../services/apiClient'

const DEFAULT_PAGE_SIZE = 12

export const useOperationsDashboard = ({ enabled = true, initialPage = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const [page, setPage] = useState(initialPage)
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: '',
  })

  useEffect(() => {
    if (!enabled) return undefined

    let active = true
    setState((prev) => ({ ...prev, loading: true, error: '' }))

    requestJson(`/api/ops/dashboard?page=${page}&pageSize=${pageSize}`)
      .then((data) => {
        if (!active) return
        setState({ data, loading: false, error: '' })
      })
      .catch((error) => {
        if (!active) return
        setState((prev) => ({ ...prev, loading: false, error: error.message || '운영 대시보드 데이터를 불러오지 못했습니다.' }))
      })

    return () => {
      active = false
    }
  }, [enabled, page, pageSize, reloadToken])

  const goToPage = useCallback((nextPage) => {
    setPage(Math.max(1, Number(nextPage) || 1))
  }, [])

  const refresh = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    page,
    pageSize,
    goToPage,
    refresh,
  }
}