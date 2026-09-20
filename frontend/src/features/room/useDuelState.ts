import { useCallback, useRef, useState } from 'react'
import type { DuelState } from '../../api/types'

/** 席位（结构与 WaitingLobby 组件内部 DuelSeats 保持一致） */
interface DuelSeats {
  seat1: { user_id: number; username: string } | null
  seat2: { user_id: number; username: string } | null
}

/** 对局结束数据（结构与 DuelGameOver 组件内部 DuelEndData 保持一致） */
interface DuelEndData {
  winner: string
  winnerId: number
  isTie: boolean
  rounds: number
  p1: { id: number; username: string; grabbed: Array<{ id: number; display_text: string; cover_url: string }>; remaining: Array<{ id: number; display_text: string; cover_url: string }> }
  p2: { id: number; username: string; grabbed: Array<{ id: number; display_text: string; cover_url: string }>; remaining: Array<{ id: number; display_text: string; cover_url: string }> }
}

/** seat_update 事件负载 */
interface SeatUpdateEvent {
  seat1: DuelSeats['seat1']
  seat2: DuelSeats['seat2']
}

/** duel_arrange_start 事件负载 */
interface ArrangeStartEvent {
  timeout: number
}

/** duel_arrange_state 事件负载 */
interface ArrangeStateEvent {
  player1_cards: Array<{ id: number; display_text: string; cover_url: string }>
  player2_cards: Array<{ id: number; display_text: string; cover_url: string }>
  p1_ready: boolean
  p2_ready: boolean
}

/** duel_arrange_done 事件负载 */
interface ArrangeDoneEvent {
  player1_cards: Array<{ id: number; display_text: string; cover_url: string }>
  player2_cards: Array<{ id: number; display_text: string; cover_url: string }>
}

/**
 * 对阵（duel）模式全部状态：对局面板、席位、编排阶段与回合倒计时。
 * 仅触碰 duel 自身状态的事件处理（seat_update / duel_arrange_*）收敛在此处；
 * 跨域引用页面级状态（currentReading/gameStatus/gameResults/toast/user/roomState）
 * 的 case 仍留在 RoomPage 的 handleEvent 主 switch，避免向 hook 注入依赖。
 */
export function useDuelState() {
  const [duelState, setDuelState] = useState<DuelState | null>(null)
  const [duelCurrentCardId, setDuelCurrentCardId] = useState<number | null>(null)
  const [duelGiveCards, setDuelGiveCards] = useState<Array<{ id: number; display_text: string; cover_url: string }> | null>(null)
  const [duelRound, setDuelRound] = useState(0)
  const [duelRoundTimer, setDuelRoundTimer] = useState<number | null>(null)
  const [duelEndData, setDuelEndData] = useState<DuelEndData | null>(null)
  const duelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Duel seat state
  const [duelSeats, setDuelSeats] = useState<DuelSeats>({ seat1: null, seat2: null })

  // Duel arranging state
  const [duelArranging, setDuelArranging] = useState(false)
  const [arrangeTimeout, setArrangeTimeout] = useState<number | null>(null)
  const [arrangeP1Ready, setArrangeP1Ready] = useState(false)
  const [arrangeP2Ready, setArrangeP2Ready] = useState(false)
  const arrangeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // seat_update：房主调整席位
  const onSeatUpdate = useCallback((event: SeatUpdateEvent) => {
    setDuelSeats({ seat1: event.seat1, seat2: event.seat2 })
  }, [])

  // duel_arrange_start：进入编排阶段，启动超时倒计时
  const onArrangeStart = useCallback((event: ArrangeStartEvent) => {
    setDuelArranging(true)
    setArrangeTimeout(event.timeout)
    setArrangeP1Ready(false)
    clearInterval(arrangeTimerRef.current ?? undefined)
    arrangeTimerRef.current = setInterval(() => {
      setArrangeTimeout(prev => {
        if (prev === null || prev <= 1) {
          if (arrangeTimerRef.current) { clearInterval(arrangeTimerRef.current); arrangeTimerRef.current = null }
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // duel_arrange_state：编排进行中的双方牌面/就绪状态同步
  const onArrangeState = useCallback((event: ArrangeStateEvent) => {
    if (!duelArranging) setDuelArranging(true)
    setDuelState(prev => prev ? {
      ...prev,
      player1: { ...prev.player1, cards: event.player1_cards },
      player2: { ...prev.player2, cards: event.player2_cards },
    } : null)
    setArrangeP1Ready(event.p1_ready)
    setArrangeP2Ready(event.p2_ready)
  }, [duelArranging])

  // duel_arrange_done：编排结束，落定双方牌面并清理倒计时
  const onArrangeDone = useCallback((event: ArrangeDoneEvent) => {
    setDuelArranging(false)
    if (arrangeTimerRef.current) { clearInterval(arrangeTimerRef.current); arrangeTimerRef.current = null }
    setArrangeTimeout(null)
    setDuelState(prev => prev ? {
      ...prev,
      player1: { ...prev.player1, cards: event.player1_cards },
      player2: { ...prev.player2, cards: event.player2_cards },
    } : null)
  }, [])

  return {
    duelState, setDuelState,
    duelCurrentCardId, setDuelCurrentCardId,
    duelGiveCards, setDuelGiveCards,
    duelRound, setDuelRound,
    duelRoundTimer, setDuelRoundTimer,
    duelEndData, setDuelEndData,
    duelTimerRef,
    duelSeats, setDuelSeats,
    duelArranging, setDuelArranging,
    arrangeTimeout, setArrangeTimeout,
    arrangeP1Ready, setArrangeP1Ready,
    arrangeP2Ready, setArrangeP2Ready,
    arrangeTimerRef,
    onSeatUpdate, onArrangeStart, onArrangeState, onArrangeDone,
  }
}
