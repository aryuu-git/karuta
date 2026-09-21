import { useEffect, useRef, useCallback, useState } from 'react'
import type { WSEvent } from '../api/types'
import { openAuthenticatedWebSocket } from '../config'

const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

interface UseRoomSocketReturn {
  send: (data: object) => void
  connected: boolean
  /** 当前重连次数（0=未重连；ConnectionBanner 显示 n/10 用） */
  retries: number
}

export function useRoomSocket(
  roomId: number,
  onEvent: (e: WSEvent) => void
): UseRoomSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  // 连接代际：每次 effect 启动递增。在飞的 connect 完成后若代际不匹配
  // （StrictMode 双挂载 / 快速 remount），立即关闭新连接——修复旧连接
  // 泄漏导致的双 WS 并存（事件消费翻倍：双 toast/双 dispatch，D12-补7）
  const generationRef = useRef(0)
  // 重连次数：退避计算读 ref（异步闭包内不过期），UI 展示读 state 镜像
  const retriesRef = useRef(0)
  const [retries, setRetries] = useState(0)
  /** 推进重连计数：ref 供退避逻辑读取，state 供 ConnectionBanner 等消费方读取 */
  const bumpRetries = useCallback(() => {
    retriesRef.current += 1
    setRetries(retriesRef.current)
  }, [])
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onEventRef = useRef(onEvent)
  const [connected, setConnected] = useState(false)

  // Keep onEvent ref up to date so reconnects use latest handler
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const connect = useCallback(async (gen: number) => {
    if (gen !== generationRef.current) return

    let ws: WebSocket
    try {
      ws = await openAuthenticatedWebSocket(`/ws/rooms/${roomId}`)
    } catch {
      if (gen !== generationRef.current || retriesRef.current >= MAX_RETRIES) return
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retriesRef.current), MAX_DELAY_MS)
      bumpRetries()
      retryTimerRef.current = setTimeout(() => { void connect(gen) }, delay)
      return
    }
    // ticket 请求在飞期间发生过 unmount/remount：本连接所属代际已失效，立即关闭，
    // 防止旧连接泄漏与新连接并存（事件消费翻倍）
    if (gen !== generationRef.current) {
      ws.close()
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      if (gen !== generationRef.current) return
      retriesRef.current = 0
      setRetries(0)
      setConnected(true)
    }

    ws.onmessage = (event) => {
      if (gen !== generationRef.current) return
      try {
        const parsed = JSON.parse(event.data) as WSEvent
        onEventRef.current(parsed)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      if (gen !== generationRef.current) return
      setConnected(false)
      wsRef.current = null

      if (retriesRef.current >= MAX_RETRIES) return

      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(2, retriesRef.current),
        MAX_DELAY_MS
      )
      bumpRetries()
      retryTimerRef.current = setTimeout(() => {
        if (gen === generationRef.current) void connect(gen)
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [roomId, bumpRetries])

  useEffect(() => {
    const gen = ++generationRef.current
    void connect(gen)

    return () => {
      // 代际失效：使所有在飞 connect 与重连回调立即失效
      generationRef.current++
      clearTimeout(retryTimerRef.current ?? undefined)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const send = useCallback((data: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send, connected, retries }
}
