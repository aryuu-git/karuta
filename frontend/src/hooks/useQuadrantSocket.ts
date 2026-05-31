import { useEffect, useRef, useCallback, useState } from 'react'
import type { QWSEvent } from '../api/quadrant'
import { buildWsUrl } from '../config'

const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

interface UseQuadrantSocketReturn {
  send: (data: object) => void
  connected: boolean
}

export function useQuadrantSocket(
  roomId: number,
  onEvent: (e: QWSEvent) => void
): UseQuadrantSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const onEventRef = useRef(onEvent)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const token = localStorage.getItem('karuta_token') ?? ''
    const url = buildWsUrl(`/ws/quadrant/rooms/${roomId}`, token)

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      retriesRef.current = 0
      setConnected(true)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const parsed = JSON.parse(event.data) as QWSEvent
        onEventRef.current(parsed)
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      wsRef.current = null

      if (retriesRef.current >= MAX_RETRIES) return

      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(2, retriesRef.current),
        MAX_DELAY_MS
      )
      retriesRef.current += 1
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [roomId])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])

  const send = useCallback((data: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send, connected }
}
