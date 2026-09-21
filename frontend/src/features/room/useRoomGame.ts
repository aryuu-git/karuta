import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, HttpError } from '../../api/client'
import type { User, WSEvent } from '../../api/types'
import { useRoomSocket } from '../../hooks/useRoomSocket'
import { useToast } from '../../components/ui'
import { paths } from '../../routes/paths'
import { useSound } from './useSound'
import { useAudioPreload } from './useAudioPreload'
import { useChat } from './useChat'
import { useDuelState } from './useDuelState'
import { roomReducer, createInitialRoomState } from './roomReducer'
import type { GameResult } from './types'
import { publishUnlocks } from '../achievements/unlockBus'

/**
 * 房间对局会话 hook（重构 R3）：
 * - 状态迁移全部走 roomReducer（纯函数，可单测）；
 * - 本 hook 只负责副作用编排：WS 接线、toast、音效、定时器、音频预取、API 动作；
 * - 聊天/丢蛋（useChat）、音效（useSound）、预取（useAudioPreload）、
 *   对阵域状态（useDuelState）各自封装，本 hook 汇总为房间页单一出口。
 */

/** 对阵域会话出口：useDuelState 全量 + 编排指令发送器 */
export type UseRoomGameDuel = ReturnType<typeof useDuelState> & {
  onArrangeSwap: (posA: number, posB: number) => void
  onArrangeCrossSwap: (myIdx: number, oppIdx: number) => void
  onArrangeReady: () => void
}
export function useRoomGame(roomId: number, user: User | null) {
  const navigate = useNavigate()
  const toast = useToast()
  const playSound = useSound()

  const [state, dispatch] = useReducer(roomReducer, undefined, createInitialRoomState)

  // —— 副作用用 ref 镜像读取最新值，避免 handleEvent 依赖链膨胀 ——
  const stateRef = useRef(state)
  stateRef.current = state

  // B1：服务端权威回合时钟
  const serverOffsetRef = useRef(0)   // 服务端时间 - 本地时间（毫秒）
  const roundEndsAtRef = useRef(0)    // 当前回合截止（服务端 UnixMilli）
  const currentRoundIdRef = useRef(0)
  // B1：抢牌命令幂等 ID（单调递增），防网络重试导致重复判分
  const grabCmdRef = useRef(0)

  // 音频预取：等待大厅全量封面 + 前三首音频，对局中由 next_audio_urls 滚动预取
  const { preloadProgress, prefetchAudioUrls } = useAudioPreload(state.cards, state.status)
  const prefetchRef = useRef(prefetchAudioUrls)
  prefetchRef.current = prefetchAudioUrls

  // 聊天消息与丢蛋动画
  const { chatMessages, eggEvent, onChatMessage, onEggThrow } = useChat()

  // 对阵模式全部状态（席位/编排/回合倒计时等）
  const duel = useDuelState()
  const {
    setDuelState, setDuelCurrentCardId, setDuelGiveCards, setDuelRound,
    setDuelRoundTimer, setDuelEndData, duelTimerRef, setDuelSeats,
    onSeatUpdate, onArrangeStart, onArrangeState, onArrangeDone,
  } = duel
  const duelStateRef = useRef(duel.duelState)
  duelStateRef.current = duel.duelState

  // —— 间隔倒计时：读牌结束且对局进行中时启动；暂停/末首时冻结或取消 ——
  const intervalTimerRef = useRef<number | null>(null)
  const intervalRemainingRef = useRef(0)
  intervalRemainingRef.current = state.intervalRemaining

  useEffect(() => {
    if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null }
    if (state.currentReading !== null || state.status !== 'reading' || !state.roomState) return
    if (state.isLastCard) return
    if (state.isPaused) return

    if (intervalRemainingRef.current <= 0) {
      dispatch({ type: 'interval_start', seconds: state.roomState.room.interval_sec })
    }
    // window.setInterval 显式走 DOM 重载（返回 number）：@types/node 进场后
    // 全局 setInterval 解析为 NodeJS.Timeout，与 number 类型的 ref 冲突
    intervalTimerRef.current = window.setInterval(() => {
      dispatch({ type: 'interval_tick' })
      if (intervalRemainingRef.current <= 1) {
        if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null }
      }
    }, 1000)
    return () => { if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null } }
  }, [state.currentReading, state.status, state.roomState, state.isPaused, state.isLastCard])

  // —— 牌面剩余数逼近洗牌阈值：预告下一首要打乱 ——
  const shuffleThreshold = state.roomState?.room?.shuffle_remaining ?? 0
  const prevBoardCountRef = useRef(-1)
  useEffect(() => {
    if (shuffleThreshold <= 0 || state.cards.length === 0) return
    const boardCount = state.cards.filter(c => (state.cardRemaining.get(c.id) ?? c.audio_count ?? 1) > 0).length
    if (boardCount <= shuffleThreshold && prevBoardCountRef.current !== boardCount && prevBoardCountRef.current >= 0) {
      dispatch({ type: 'mark_shuffle_pending' })
      toast.show('下一首将打乱牌面', 'info', 2000)
    }
    prevBoardCountRef.current = boardCount
  }, [state.cardRemaining, shuffleThreshold, state.cards, toast.show])

  // —— 初始化：拉取房间快照 ——
  useEffect(() => {
    if (!roomId) return
    api.rooms.get(roomId)
      .then((roomState) => {
        dispatch({ type: 'init', state: roomState, userId: user?.id ?? 0 })
        // 重连后回合状态以权威快照为准，不做本地残留推断
        dispatch({ type: 'set_my_round_status', value: 'idle' })
        // 对阵模式：从玩家角色回填席位
        if (roomState.room.mode === 'duel') {
          const players = roomState.players ?? []
          const p1 = players.find(p => p.role === 'duel_p1')
          const p2 = players.find(p => p.role === 'duel_p2')
          setDuelSeats({
            seat1: p1 ? { user_id: p1.user_id, username: p1.username } : null,
            seat2: p2 ? { user_id: p2.user_id, username: p2.username } : null,
          })
        }
      })
      .catch((e) => dispatch({
        type: 'load_error',
        message: e instanceof Error ? e.message : '加载失败',
        // 403 = 已登录但不在房间（如直接访问他人分享的房间 URL）——与"房间不存在"语义不同
        code: e instanceof HttpError && e.status === 403 ? 'NOT_IN_ROOM' : undefined,
      }))
    // 初始化仅按 roomId 触发；user 已通过 init action 参数快照进 reducer
  }, [roomId])

  // —— WS 事件编排：状态迁移 dispatch，副作用（toast/音效/预取）就地执行 ——
  const handleEvent = useCallback((event: WSEvent) => {
    const s = stateRef.current
    switch (event.type) {
      case 'room_state':
        dispatch({ type: 'room_state', state: event.data })
        // 重连快照：回合状态以服务端为准，重置不做本地残留推断
        dispatch({ type: 'set_my_round_status', value: 'idle' })
        break

      case 'countdown':
        dispatch({ type: 'set_countdown', count: event.count })
        if (event.count > 0) playSound('card_start')
        if (event.count === 0) setTimeout(() => dispatch({ type: 'clear_countdown' }), 800)
        break

      case 'card_start': {
        currentRoundIdRef.current = event.round_id ?? event.index ?? 0
        void prefetchRef.current(event.next_audio_urls ?? [])
        // B1：记录服务端权威回合截止时刻与时钟偏移（当前 UI 倒计时仍由本地音频事件驱动）
        if (typeof event.server_now === 'number' && typeof event.ends_at === 'number') {
          serverOffsetRef.current = event.server_now - Date.now()
          roundEndsAtRef.current = event.ends_at
        }
        if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null }
        const willShuffle = s.shufflePending
        dispatch({
          type: 'card_start',
          cardId: event.card_id,
          cardAudioId: event.card_audio_id ?? 0,
          audioUrl: event.audio_url,
          hintText: event.hint_text,
          startRatio: event.start_ratio,
          isLast: event.is_last ?? false,
        })
        if (willShuffle) setTimeout(() => dispatch({ type: 'shuffle_unblock' }), 600)
        playSound('card_start')
        // 新的一首：回合状态回到可抢
        dispatch({ type: 'set_my_round_status', value: 'idle' })
        break
      }

      case 'card_claimed': {
        const isMe = !!user && event.winner_id === user.id
        dispatch({
          type: 'card_claimed',
          cardId: event.card_id,
          remaining: event.remaining ?? 0,
          winnerName: event.winner_name,
          hintText: event.hint_text ?? '',
        })
        if (isMe) {
          dispatch({ type: 'set_my_round_status', value: 'claimed' })
          toast.show('✓ 抢到 +1', 'success')
          playSound('grab_ok')
        } else {
          toast.show(`${event.winner_name} 抢先一步`, 'info')
        }
        break
      }

      case 'card_missed':
        dispatch({ type: 'card_missed', cardId: event.card_id, remaining: event.remaining ?? 0 })
        toast.show('无人抢到，本首流局', 'info', 1500)
        break

      case 'card_exhausted':
        dispatch({ type: 'card_exhausted', cardId: event.card_id })
        break

      case 'grab_failed':
        // 有 reason 时由 grab_wrong 广播统一处理 toast，这里只处理窗口关闭等其他原因
        if (event.reason !== 'not_current' && event.reason !== 'already_grabbed') {
          toast.show('抢牌未成功，等下一首', 'fail', 1200)
          playSound('grab_fail')
        }
        break

      case 'grab_wrong': {
        const isMe = !!user && event.user_id === user.id
        const isNotCurrent = event.reason === 'not_current'
        const hasPenalty = event.penalty !== false
        if (isMe) {
          dispatch({ type: 'set_my_round_status', value: 'banned' })
          toast.show(
            isNotCurrent
              ? (hasPenalty ? '抢错牌 −1 · 本首出局' : '抢错牌 · 本首出局')
              : (hasPenalty ? '慢了一步 −1 · 本首出局' : '慢了一步 · 本首出局'),
            'fail', 3000)
        } else {
          toast.show(`${event.username} 出局`, 'info', 2500)
        }
        playSound('grab_fail')
        break
      }

      case 'grab_banned':
        dispatch({ type: 'set_my_round_status', value: 'banned' })
        toast.show('你已出局，等下一首', 'fail', 2000)
        playSound('grab_fail')
        break

      case 'all_banned':
        toast.show('全员出局，本首结束', 'info', 2500)
        break

      case 'score_update':
        dispatch({ type: 'score_update', scores: event.scores })
        break

      case 'achievement_unlocked':
        // 成就解锁推送 → 右下角仪式层弹层（AppLayout 消费，unlockBus 中转）
        publishUnlocks(event.achievements)
        break

      case 'game_over':
        dispatch({ type: 'game_over', results: event.results, lastCardWinnerId: event.last_card_winner_id })
        playSound('game_over')
        break

      case 'paused':
        dispatch({ type: 'set_paused', paused: true })
        toast.show('已暂停', 'info')
        break

      case 'resumed':
        dispatch({ type: 'set_paused', paused: false })
        toast.show('继续对局', 'info', 1200)
        break

      case 'player_joined': {
        const existed = s.players.some(p => p.user_id === event.user_id)
        dispatch({ type: 'player_joined', roomId, userId: event.user_id, username: event.username, avatarUrl: event.avatar_url, role: event.role })
        if (!existed) toast.show(`${event.username} 加入`, 'info')
        break
      }

      case 'player_offline': {
        const leaving = s.players.find(p => p.user_id === event.user_id)
        dispatch({ type: 'player_offline', userId: event.user_id })
        if (leaving) toast.show(`${leaving.username} 离开`, 'info', 1500)
        break
      }

      case 'chat_message':
        onChatMessage(event)
        break

      case 'egg_throw':
        onEggThrow(event, user?.id === event.target_id)
        break

      case 'room_closed':
        toast.show('战场解散，即将返回', 'info', 3000)
        setTimeout(() => navigate(paths.home()), 2000)
        break

      case 'kicked':
        toast.show('你被移出战场', 'fail', 3000)
        setTimeout(() => navigate(paths.home()), 2000)
        break

      case 'seat_update':
        onSeatUpdate(event)
        break

      case 'seat_kicked':
        toast.show('你已被移出席位', 'info', 2000)
        break

      case 'duel_arrange_start':
        onArrangeStart(event)
        break

      case 'duel_arrange_state':
        onArrangeState(event)
        break

      case 'duel_arrange_done':
        onArrangeDone(event)
        break

      case 'judge_waiting':
        dispatch({ type: 'set_judge_waiting' })
        break

      case 'judge_offline':
        toast.show(`裁判断线，等待重连（最多 ${event.timeout}s）`, 'info', event.timeout * 1000)
        break

      case 'judge_timeout':
        toast.show('裁判未归，对局结束', 'info', 3000)
        break

      // === 对阵（duel）模式 ===
      case 'duel_state':
        setDuelState(event.data)
        // 对阵模式直接进入读牌态（无 waiting→reading 广播）
        if (s.status !== 'reading') dispatch({ type: 'set_paused', paused: false })
        break

      case 'duel_card_start': {
        setDuelCurrentCardId(event.card_id)
        setDuelRound(event.round)
        dispatch({
          type: 'set_reading',
          reading: { cardId: event.card_id, cardAudioId: 0, audioUrl: event.audio_url, hintText: event.hint_text, startRatio: event.start_ratio },
        })
        // 回合倒计时
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        const roundTime = s.roomState?.room?.duel_round_time ?? 30
        setDuelRoundTimer(roundTime)
        duelTimerRef.current = setInterval(() => {
          setDuelRoundTimer(prev => {
            if (prev === null || prev <= 1) {
              if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
              return null
            }
            return prev - 1
          })
        }, 1000)
        playSound('card_start')
        // 新的一首：回合状态回到可抢
        dispatch({ type: 'set_my_round_status', value: 'idle' })
        break
      }

      case 'duel_grab_wrong': {
        const isMe = !!user && event.user_id === user.id
        toast.show(isMe ? '拍错 −1 机会' : `${event.username} 拍错 −1 机会`, isMe ? 'fail' : 'info', isMe ? 2000 : 1500)
        playSound('grab_fail')
        break
      }

      case 'duel_grab_invalid':
        toast.show('现在不能拍牌', 'info', 1200)
        break

      case 'duel_grab_blocked':
        dispatch({ type: 'set_my_round_status', value: 'banned' })
        toast.show('本轮机会已用完', 'fail', 2000)
        playSound('grab_fail')
        break

      case 'duel_card_claimed': {
        const isMe = !!user && event.user_id === user.id
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        dispatch({ type: 'set_reading', reading: null })
        // 标记牌为已抢（保留在原位，变小变灰）
        setDuelState(prev => {
          if (!prev) return null
          const markClaimed = (cards: typeof prev.player1.cards) =>
            cards.map(c => c.id === event.card_id ? { ...c, claimed: true, claimed_by: event.user_id } : c)
          return {
            ...prev,
            player1: { ...prev.player1, cards: markClaimed(prev.player1.cards) },
            player2: { ...prev.player2, cards: markClaimed(prev.player2.cards) },
            p1_count: event.p1_count,
            p2_count: event.p2_count,
          }
        })
        if (isMe) {
          dispatch({ type: 'set_my_round_status', value: 'claimed' })
          toast.show(`✓ 已从${event.area === 'own' ? '己方区' : '对方区'}抢到`, 'success')
          playSound('grab_ok')
        } else {
          toast.show(`${event.username} 抢到`, 'info')
        }
        break
      }

      case 'duel_timeout':
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        dispatch({ type: 'set_reading', reading: null })
        toast.show(event.requeued ? '超时，歌曲重新入队' : '超时，歌曲跳过', 'info', 2000)
        break

      case 'duel_give_request':
        setDuelGiveCards(event.cards)
        break

      case 'duel_give_done': {
        setDuelGiveCards(null)
        setDuelState(prev => {
          if (!prev) return null
          const fromIsP1 = event.from_id === prev.player1.id
          const fromCards = fromIsP1 ? prev.player1.cards : prev.player2.cards
          const toCards = fromIsP1 ? prev.player2.cards : prev.player1.cards
          const givenCard = fromCards.find(c => c.id === event.card_id)
          const newFromCards = fromCards.filter(c => c.id !== event.card_id)
          const newToCards = givenCard ? [...toCards, givenCard] : toCards
          return {
            ...prev,
            player1: { ...prev.player1, cards: fromIsP1 ? newFromCards : newToCards },
            player2: { ...prev.player2, cards: fromIsP1 ? newToCards : newFromCards },
            p1_count: event.p1_count,
            p2_count: event.p2_count,
          }
        })
        const isMe = !!user && event.from_id === user.id
        toast.show(isMe ? '牌已送出' : '收到对方一张牌', 'info', 1500)
        break
      }

      case 'duel_game_over': {
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        dispatch({ type: 'set_reading', reading: null })
        const isWinner = !!user && event.winner_id === user.id
        const isTie = event.winner_id === 0
        const p1 = duelStateRef.current?.player1
        const p2 = duelStateRef.current?.player2
        const toGrabbedCards = (cards?: Array<{ id: number; display_text: string; cover_url: string }>) =>
          (cards ?? []).map(c => ({ id: c.id, display_text: c.display_text, cover_url: c.cover_url, hint_text: '' }))
        const p1Cards = toGrabbedCards(event.p1_grabbed_cards)
        const p2Cards = toGrabbedCards(event.p2_grabbed_cards)
        let results: GameResult[]
        if (isTie) {
          results = [
            { user_id: p1?.id ?? 0, username: p1?.username ?? '', score: p1Cards.length, rank: 1, grabbed_cards: p1Cards },
            { user_id: p2?.id ?? 0, username: p2?.username ?? '', score: p2Cards.length, rank: 1, grabbed_cards: p2Cards },
          ]
          toast.show('平局', 'info', 5000)
        } else {
          const winnerId = event.winner_id
          const p1Id = p1?.id ?? 0
          const winnerIsP1 = winnerId === p1Id
          results = [
            { user_id: winnerId, username: event.winner, score: (winnerIsP1 ? p1Cards : p2Cards).length, rank: 1, grabbed_cards: winnerIsP1 ? p1Cards : p2Cards },
            { user_id: winnerIsP1 ? (p2?.id ?? 0) : p1Id, username: winnerIsP1 ? (p2?.username ?? '') : (p1?.username ?? ''), score: (winnerIsP1 ? p2Cards : p1Cards).length, rank: 2, grabbed_cards: winnerIsP1 ? p2Cards : p1Cards },
          ]
          toast.show(isWinner ? '你获胜了' : `${event.winner} 获胜`, isWinner ? 'success' : 'info', 5000)
        }
        dispatch({ type: 'game_over', results })
        const toCards = (cards?: Array<{ id: number; display_text: string; cover_url: string }>) => cards ?? []
        setDuelEndData({
          winner: event.winner, winnerId: event.winner_id, isTie, rounds: event.rounds,
          p1: { id: p1?.id ?? 0, username: p1?.username ?? '', grabbed: toCards(event.p1_grabbed_cards), remaining: toCards(event.p1_remaining) },
          p2: { id: p2?.id ?? 0, username: p2?.username ?? '', grabbed: toCards(event.p2_grabbed_cards), remaining: toCards(event.p2_remaining) },
        })
        playSound('game_over')
        break
      }
    }
  }, [user, roomId, playSound, toast.show, navigate, onChatMessage, onEggThrow,
      onSeatUpdate, onArrangeStart, onArrangeState, onArrangeDone,
      setDuelState, setDuelCurrentCardId, setDuelGiveCards, setDuelRound, setDuelRoundTimer, setDuelEndData])

  const { send, connected, retries } = useRoomSocket(roomId, handleEvent)

  // WS 连接成功后，确保自己在 players 列表中是 online
  useEffect(() => {
    if (connected && user) dispatch({ type: 'set_online', userId: user.id, online: true })
  }, [connected, user])

  // —— 用户动作 ——

  const handleGrab = useCallback((cardId: number) => {
    if (stateRef.current.isSpectator) {
      toast.show('旁观者不能抢牌', 'info', 1000)
      return
    }
    if (!stateRef.current.currentReading) {
      toast.show('等待下一张牌', 'info', 1000)
      return
    }
    send({ type: 'grab', card_id: cardId, cmd_id: ++grabCmdRef.current })
  }, [send, toast.show])

  const handleDuelGrab = useCallback((cardId: number) => {
    if (stateRef.current.isSpectator) {
      toast.show('旁观者不能抢牌', 'info', 1000)
      return
    }
    if (!duel.duelCurrentCardId) {
      toast.show('等待下一轮', 'info', 1000)
      return
    }
    send({ type: 'grab', card_id: cardId, cmd_id: ++grabCmdRef.current })
  }, [send, toast.show, duel.duelCurrentCardId])

  const handleDuelGive = useCallback((cardId: number) => {
    send({ type: 'give_card', card_id: cardId })
    setDuelGiveCards(null)
  }, [send, setDuelGiveCards])

  const handleChatSend = useCallback((text: string) => {
    send({ type: 'chat', text })
  }, [send])

  // —— 对阵编排动作 ——

  const handleArrangeSwap = useCallback((posA: number, posB: number) => {
    send({ type: 'duel_arrange_swap', data: { pos_a: posA, pos_b: posB, cross: false } })
  }, [send])

  const handleArrangeCrossSwap = useCallback((myIdx: number, oppIdx: number) => {
    send({ type: 'duel_arrange_swap', data: { pos_a: myIdx, pos_b: oppIdx, cross: true } })
  }, [send])

  const handleArrangeReady = useCallback(() => {
    send({ type: 'duel_arrange_ready' })
  }, [send])

  const handleEgg = useCallback((targetId: number) => {
    send({ type: 'egg_throw', target_id: targetId })
  }, [send])

  /** 加入战斗（旁观者转玩家，Owner 裁定 2026-09-21：对局中切换合法，下一首起生效） */
  const joinBattle = useCallback(async () => {
    try {
      await api.rooms.spectate(roomId, false)
      dispatch({ type: 'set_spectator', value: false })
      if (user) dispatch({ type: 'set_player_role', userId: user.id, role: 'player' })
      toast.show('已加入对局，下一首可抢', 'success')
    } catch (err) {
      toast.show((err as Error).message || '加入失败，请重试', 'fail')
    }
  }, [roomId, user, toast.show])

  const kickPlayer = useCallback(async (userId: number) => {
    try {
      await api.rooms.kick(roomId, userId)
      dispatch({ type: 'remove_player', userId })
    } catch { /* ignore */ }
  }, [roomId])

  // —— 对阵席位动作 ——

  const claimSeat = useCallback(async (seat: 1 | 2) => {
    try { await api.rooms.claimSeat(roomId, seat) }
    catch (e) { toast.show(e instanceof Error ? e.message : '入座失败', 'fail') }
  }, [roomId, toast.show])

  const leaveSeat = useCallback(async () => {
    try { await api.rooms.leaveSeat(roomId) } catch { /* ignore */ }
  }, [roomId])

  const kickSeat = useCallback(async (userId: number) => {
    try { await api.rooms.kickFromSeat(roomId, userId) } catch { /* ignore */ }
  }, [roomId])

  // B1：客户端不再上报 audio_ended（服务端权威回合时钟负责切首）。
  // 本地 ended 事件仅用于 ReadingPanel 内部状态，无需通知服务端。
  const handleAudioEnded = useCallback(() => {}, [])

  // B1：缓冲失败上报——服务端收到后可提前切首，避免全场卡死等待。
  const handleBufferError = useCallback(() => {
    send({ type: 'media_event', round_id: currentRoundIdRef.current, text: 'buffer_fail' })
  }, [send])

  const pauseResume = useCallback(() => {
    if (!stateRef.current.roomState) return
    if (stateRef.current.isPaused) api.rooms.resume(roomId).catch(() => null)
    else api.rooms.pause(roomId).catch(() => null)
  }, [roomId])

  const closeRoom = useCallback(async () => {
    await api.rooms.close(roomId).catch(() => null)
    navigate(paths.home())
  }, [roomId, navigate])

  const leaveRoom = useCallback(() => navigate(paths.home()), [navigate])

  /** 旁观者身份本地同步（WaitingLobby 已完成 API 调用后回调） */
  const setSpectator = useCallback((value: boolean) => dispatch({ type: 'set_spectator', value }), [])

  const debugEnd = useCallback((results: GameResult[]) => dispatch({ type: 'debug_end', results }), [])

  return {
    state,
    connected,
    retries,
    send,
    preloadProgress,
    chatMessages,
    eggEvent,
    duel: { ...duel, onArrangeSwap: handleArrangeSwap, onArrangeCrossSwap: handleArrangeCrossSwap, onArrangeReady: handleArrangeReady } satisfies UseRoomGameDuel,
    // 动作
    handleGrab,
    handleDuelGrab,
    handleDuelGive,
    handleChatSend,
    handleEgg,
    handleAudioEnded,
    handleBufferError,
    joinBattle,
    kickPlayer,
    claimSeat,
    leaveSeat,
    kickSeat,
    pauseResume,
    closeRoom,
    leaveRoom,
    setSpectator,
    debugEnd,
  }
}
