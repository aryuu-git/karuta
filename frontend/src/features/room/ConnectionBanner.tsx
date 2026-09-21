import { useEffect, useRef, useState } from 'react'

export interface ConnectionBannerProps {
  connected: boolean
  /** 当前重连次数（来自 useRoomSocket 的 retries） */
  retries: number
  /** 重连上限（与 useRoomSocket 的 MAX_RETRIES 对齐，仅用于展示） */
  maxRetries?: number
}

/**
 * 连接横幅（设计规格 §2.3）：挂战场视图顶部。
 * - 断线重连中：warning 底「连接中断，重连中… (n/10)」；
 * - 恢复成功：success 底「已恢复」，2 秒后自动消失；
 * - 首次建连尚未成功时不显示（retries=0 且从未连上属于正常冷启动）。
 */
export function ConnectionBanner({ connected, retries, maxRetries = 10 }: ConnectionBannerProps) {
  const [showRecovered, setShowRecovered] = useState(false)
  // 曾进入过断线态（只有经历过断线，恢复才值得提示）
  const everDisconnectedRef = useRef(false)
  const prevConnectedRef = useRef(connected)

  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected

    if (!connected) {
      if (retries > 0) everDisconnectedRef.current = true
      return
    }
    // 断线 → 恢复：展示「已恢复」2s
    if (!wasConnected && everDisconnectedRef.current) {
      everDisconnectedRef.current = false
      setShowRecovered(true)
      const timer = setTimeout(() => setShowRecovered(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [connected, retries])

  const reconnecting = !connected && retries > 0

  if (!reconnecting && !showRecovered) return null

  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-4 py-1.5 border-b text-tiny font-medium ${
        reconnecting
          ? 'bg-warning/15 border-warning/30 text-warning'
          : 'bg-success/15 border-success/30 text-success'
      }`}
    >
      {reconnecting ? (
        <>
          <span aria-hidden="true">⚡</span>
          <span>连接中断，重连中… ({Math.min(retries, maxRetries)}/{maxRetries})</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">✓</span>
          <span>已恢复</span>
        </>
      )}
    </div>
  )
}
