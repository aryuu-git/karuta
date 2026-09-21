import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../../api/client'
import type { Achievement, AchievementUnlock } from '../../api/types'
import { subscribeUnlocks } from './unlockBus'

/**
 * 成就解锁中心：维护右下角弹层队列。
 * - WS 推送直入队列（结算型解锁）；
 * - 路程切换时拉取全量成就，diff 出内容型新解锁入队；
 * - 首次拉取仅建立基线——登录时绝不弹历史成就（Owner 决策：历史数据丢弃）。
 *
 * 数据路径刻意走裸 api.client 而非 react-query：AppLayout 在首屏同步链上，
 * 引入 queries.ts 会把 react-query core 提升进主包（实测 +11.6KB）。
 * 个人页网格（路由 chunk）仍用 useMyAchievements（react-query）。
 */
export function useAchievementCenter() {
  const location = useLocation()
  const seenRef = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<AchievementUnlock[]>([])

  // WS 推送直入（记入基线防 diff 重复弹；已在基线中的直接丢弃——
  // 路由切换 diff 可能先于 WS 投递弹出同一解锁，此处查重否则双弹）
  useEffect(() => subscribeUnlocks(u => {
    if (seenRef.current) {
      if (seenRef.current.has(u.key)) return
      seenRef.current.add(u.key)
    }
    setQueue(q => [...q, u])
  }), [])

  // 内容型解锁：每次路由切换拉一次全量（32 行小响应），diff 新解锁
  useEffect(() => {
    let cancelled = false
    api.auth.myAchievements()
      .then(({ achievements }) => {
        if (cancelled) return
        diffUnlocks(achievements, seenRef, setQueue)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  const dismiss = useCallback(() => setQueue(q => q.slice(1)), [])

  return { queue, dismiss }
}

function diffUnlocks(
  achievements: Achievement[],
  seenRef: { current: Set<string> | null },
  setQueue: Dispatch<SetStateAction<AchievementUnlock[]>>,
) {
  const unlocked = achievements.filter(a => a.unlocked_at !== null)
  if (seenRef.current === null) {
    seenRef.current = new Set(unlocked.map(a => a.key))
    return
  }
  const fresh = unlocked.filter(a => !seenRef.current!.has(a.key))
  if (fresh.length === 0) return
  fresh.forEach(a => seenRef.current!.add(a.key))
  setQueue(q => [...q, ...fresh.map(a => ({ key: a.key, title: a.title, icon: a.icon }))])
}
