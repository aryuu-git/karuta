import { useState, useRef, useCallback } from 'react'
import { api } from '../../api/client'

/** Bangumi 条目结构（对应 api.bangumi.search 返回项） */
export interface BangumiResult {
  id: number
  name: string
  name_cn: string
  type: number
  images?: { large?: string; common?: string }
}

/**
 * Bangumi 作品搜索 hook：查询词/结果/加载态/面板开关 + 500ms 防抖
 * 选中结果的回填逻辑（onSelect）由调用方注入
 */
export function useBangumiSearch() {
  const [bangumiQuery, setBangumiQuery] = useState('')
  const [bangumiResults, setBangumiResults] = useState<BangumiResult[]>([])
  const [bangumiLoading, setBangumiLoading] = useState(false)
  const [showBangumi, setShowBangumi] = useState(false)
  const bangumiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** 立即按关键字搜索（Enter 触发；空关键字直接忽略） */
  const searchBangumi = useCallback(async (keyword: string) => {
    if (!keyword.trim()) return
    setBangumiLoading(true)
    try {
      const res = await api.bangumi.search(keyword.trim(), '2,4')
      setBangumiResults(res.data ?? [])
    } catch { setBangumiResults([]) }
    finally { setBangumiLoading(false) }
  }, [])

  /** 输入变更：同步查询词并 500ms 防抖后搜索 */
  const handleQueryChange = useCallback((value: string) => {
    setBangumiQuery(value)
    clearTimeout(bangumiTimerRef.current)
    bangumiTimerRef.current = setTimeout(() => { void searchBangumi(value) }, 500)
  }, [searchBangumi])

  /** 展开/收起搜索面板；传入 initialQuery 时用其预填查询词（如当前作品名） */
  const toggleBangumi = useCallback((initialQuery?: string) => {
    setShowBangumi(prev => !prev)
    if (initialQuery !== undefined) setBangumiQuery(initialQuery)
  }, [])

  /** 收起搜索面板（选中结果或点击关闭） */
  const closeBangumi = useCallback(() => setShowBangumi(false), [])

  return {
    bangumiQuery, handleQueryChange,
    bangumiResults, bangumiLoading,
    showBangumi, toggleBangumi, closeBangumi, searchBangumi,
  }
}
