import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { SearchX, Swords } from 'lucide-react'
import { Layout } from '../components/Layout'
import { WaitingLobby } from '../components/WaitingLobby'
import { ReadingPanel } from '../components/ReadingPanel'
import { CardGrid } from '../components/CardGrid'
import { ScoreBoard } from '../components/ScoreBoard'
import { GameOver } from '../components/GameOver'
import { JudgePanel } from '../components/JudgePanel'
import { ChatRoom } from '../components/ChatRoom'
import { EggAnimation } from '../components/EggAnimation'
import { DuelBoard } from '../components/DuelBoard'
import { DuelGameOver } from '../components/DuelGameOver'
import { DuelGiveModal } from '../components/DuelGiveModal'
import { Button, useToast } from '../components/ui'
import { useRoomSocket } from '../hooks/useRoomSocket'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { RoomState, Card, RoomPlayer, WSEvent } from '../api/types'
import { useSound } from '../features/room/useSound'
import { useAudioPreload } from '../features/room/useAudioPreload'
import { useChat } from '../features/room/useChat'
import { useDuelState } from '../features/room/useDuelState'
import { RoomControlBar } from '../features/room/RoomControlBar'
import { MobileScoreBar } from '../features/room/MobileScoreBar'
import { DuelStatusBar } from '../features/room/DuelStatusBar'
import { ShuffleOverlay } from '../features/room/ShuffleOverlay'
import type { GameResult } from '../features/room/types'

interface CurrentReading { cardId: number; cardAudioId: number; audioUrl: string; hintText: string; startRatio?: number }

// 前端打乱牌的显示顺序，只打乱一次，之后保持固定
function shuffleCards(cards: Card[], orderRef: React.MutableRefObject<number[]>): Card[] {
  if (orderRef.current.length === cards.length) {
    // 已有顺序，按存储顺序排
    const idxMap = new Map(cards.map(c => [c.id, c]))
    return orderRef.current.map(id => idxMap.get(id)!).filter(Boolean)
  }
  // 第一次：Fisher-Yates 打乱
  const arr = [...cards]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  orderRef.current = arr.map(c => c.id)
  return arr
}

/**
 * 对战房间页（组装层）。
 * 职责边界：
 * - WS 事件路由：handleEvent 主 switch 保留在此处——事件处理与下方 15+ 房间级状态
 *   （currentReading/gameStatus/players/打乱标记等）强耦合，整体下放需要向 hook
 *   注入大量页面级依赖，得不偿失；仅自包含的聊天/丢蛋/编排处理收敛进对应 hook。
 * - 房间级状态与布局组装留在页面；音效/预取/聊天/对阵状态由 features/room 的
 *   hook 提供，展示性 JSX 抽到 features/room 展示组件。
 * - B1 接线：grabCmdRef（幂等 cmd_id）、serverOffsetRef/roundEndsAtRef（服务端
 *   回合时钟）、handleBufferError、handleAudioEnded（no-op）全部保留。
 */
export function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const playSound = useSound()

  // 反馈 toast：抢牌结果（全局 ToastProvider）
  const toast = useToast()

  const roomId = parseInt(id ?? '0', 10)

  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [justJoined, setJustJoined] = useState(false) // 刚加入进行中的游戏

  // 牌的显示顺序（初始化时打乱，之后固定，不跟随服务端顺序）
  const [cards, setCards] = useState<Card[]>([])
  const displayOrderRef = useRef<number[]>([]) // 存打乱后的 id 顺序
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [cardRemaining, setCardRemaining] = useState<Map<number, number>>(new Map())
  const [discardPile, setDiscardPile] = useState<Array<{ cardId: number; winner: string; hintText: string }>>([])
  const [currentReading, setCurrentReading] = useState<CurrentReading | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [gameResults, setGameResults] = useState<GameResult[] | null>(null)
  const [lastCardWinnerId, setLastCardWinnerId] = useState<number | null>(null)
  const [gameStatus, setGameStatus] = useState<string>('waiting')
  const [totalCardCount, setTotalCardCount] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isLastCard, setIsLastCard] = useState(false)
  const [intervalCountdown, setIntervalCountdown] = useState<number | null>(null)
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isJudgeWaiting, setIsJudgeWaiting] = useState(false)
  const [isSpectator, setIsSpectator] = useState(false)
  const currentRoundIdRef = useRef(0)

  // B1：服务端权威回合时钟
  const serverOffsetRef = useRef(0)          // 服务端时间 - 本地时间（毫秒）
  const roundEndsAtRef = useRef(0)           // 当前回合截止（服务端 UnixMilli）

  // 音频预取：等待大厅全量封面 + 前三首音频，对局中由 next_audio_urls 滚动预取
  const { preloadProgress, prefetchAudioUrls } = useAudioPreload(cards, gameStatus)

  // 聊天消息与丢蛋动画
  const { chatMessages, eggEvent, onChatMessage, onEggThrow } = useChat()

  // 对阵模式全部状态（席位/编排/回合倒计时等）
  const {
    duelState, setDuelState,
    duelCurrentCardId, setDuelCurrentCardId,
    duelGiveCards, setDuelGiveCards,
    duelRound, setDuelRound,
    duelRoundTimer, setDuelRoundTimer,
    duelEndData, setDuelEndData,
    duelTimerRef,
    duelSeats, setDuelSeats,
    duelArranging,
    arrangeTimeout,
    arrangeP1Ready,
    arrangeP2Ready,
    onSeatUpdate, onArrangeStart, onArrangeState, onArrangeDone,
  } = useDuelState()

  // 间隔倒计时：currentReading 变为 null 且游戏进行中时启动；暂停时冻结
  const intervalRemainingRef = useRef(0)
  useEffect(() => {
    // 清除旧 timer
    if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null }

    if (currentReading !== null || gameStatus !== 'reading' || !roomState) return

    // 最后一张牌不显示倒计时，直接等 game_over
    if (isLastCard) return

    // 暂停时只冻结显示，不重启 timer
    if (isPaused) return

    const intervalSec = roomState.room.interval_sec
    // 如果是刚开始倒计时（remaining 没记录），用完整 intervalSec
    if (intervalRemainingRef.current <= 0) {
      intervalRemainingRef.current = intervalSec
      setIntervalCountdown(intervalSec)
    }

    intervalTimerRef.current = setInterval(() => {
      intervalRemainingRef.current -= 1
      if (intervalRemainingRef.current <= 0) {
        if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null }
        intervalRemainingRef.current = 0
        setIntervalCountdown(null)
      } else {
        setIntervalCountdown(intervalRemainingRef.current)
      }
    }, 1000)
    return () => { if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null } }
  }, [currentReading, gameStatus, roomState, isPaused, isLastCard])

  // 初始化
  useEffect(() => {
    if (!roomId) return
    api.rooms.get(roomId)
      .then((state) => {
        setRoomState(state)
        setPlayers(state.players ?? [])
        setGameStatus(state.room.status)
        if (state.room.status === 'paused') setIsPaused(true)
        if (state.room.status === 'reading' || state.room.status === 'paused') setJustJoined(true)
        // 检查自己是否是旁观者
        const me = (state.players ?? []).find(p => p.user_id === user?.id)
        if (me && me.role === 'spectator') setIsSpectator(true)
        // 初始化 duel 席位
        if (state.room.mode === 'duel') {
          let s1: { user_id: number; username: string } | null = null
          let s2: { user_id: number; username: string } | null = null
          for (const p of state.players ?? []) {
            if (p.role === 'duel_p1') s1 = { user_id: p.user_id, username: p.username }
            if (p.role === 'duel_p2') s2 = { user_id: p.user_id, username: p.username }
          }
          setDuelSeats({ seat1: s1, seat2: s2 })
        }
        if (state.cards?.length) {
          const shuffled = shuffleCards(state.cards, displayOrderRef)
          setCards(shuffled)
          setTotalCardCount(state.cards.length)
        }
        // 初始化 cardRemaining（从 room_state cards 中获取）
        if (state.cards?.length) {
          const rm = new Map<number, number>()
          state.cards.forEach(c => rm.set(c.id, c.remaining ?? c.audio_count ?? 1))
          setCardRemaining(rm)
        }
        // 恢复废牌堆（从 grabbed_cards 重建）
        if (state.grabbed_cards?.length) {
          setDiscardPile(state.grabbed_cards.map(g => ({
            cardId: g.card_id,
            winner: g.winner_name || '无人',
            hintText: g.hint_text || '',
          })))
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [roomId])

  // 牌面打乱：改为 card_start 时执行
  const shuffleThreshold = roomState?.room?.shuffle_remaining ?? 0
  const [shufflePending, setShufflePending] = useState(false)
  const [shuffleBlocking, setShuffleBlocking] = useState(false)
  const prevBoardCountRef = useRef<number>(-1)

  // 检测 boardCount 变化，标记下一首需要打乱
  useEffect(() => {
    if (shuffleThreshold <= 0 || cards.length === 0) return
    const boardCount = cards.filter(c => (cardRemaining.get(c.id) ?? c.audio_count ?? 1) > 0).length
    if (boardCount <= shuffleThreshold && prevBoardCountRef.current !== boardCount && prevBoardCountRef.current >= 0) {
      setShufflePending(true)
      toast.show('🌀 下一首开始前要打乱牌面了！', 'info', 2000)
    }
    prevBoardCountRef.current = boardCount
  }, [cardRemaining, shuffleThreshold, cards.length, toast.show])

  const handleEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case 'room_state': {
        const s = event.data
        setRoomState(s)
        // 合并 online 状态：room_state 里如果 online=true 则采用，false 时保留本地状态
        // 避免时序问题导致刚重连的玩家显示离线
        setPlayers(prev => {
          const newPlayers = s.players ?? []
          return newPlayers.map(np => {
            const existing = prev.find(p => p.user_id === np.user_id)
            return {
              ...np,
              online: np.online ? true : (existing?.online ?? false),
            }
          })
        })
        setGameStatus(s.room.status)
        if (s.cards?.length) {
          const shuffled = shuffleCards(s.cards, displayOrderRef)
          setCards(shuffled)
          setTotalCardCount(s.cards.length)
        }
        // 恢复 cardRemaining 状态
        if (s.cards?.length) {
          const rm = new Map<number, number>()
          s.cards.forEach(c => rm.set(c.id, c.remaining ?? c.audio_count ?? 1))
          setCardRemaining(rm)
        }
        if (s.grabbed_cards?.length) {
          setDiscardPile(s.grabbed_cards.map(g => ({
            cardId: g.card_id,
            winner: g.winner_name || '无人',
            hintText: g.hint_text || '',
          })))
        }
        if (s.judge_waiting) setIsJudgeWaiting(true)
        break
      }

      case 'countdown': {
        setCountdown(event.count)
        if (event.count > 0) {
          playSound('card_start')
        }
        if (event.count === 0) {
          setTimeout(() => setCountdown(null), 800)
        }
        break
      }

      case 'card_start': {
        currentRoundIdRef.current = event.round_id ?? event.index ?? 0
        void prefetchAudioUrls(event.next_audio_urls ?? [])
        // B1：记录服务端权威回合截止时刻与时钟偏移（服务端时间 - 本地时间）。
        // 当前 UI 倒计时仍由本地音频事件驱动，此偏移供后续精确倒计时使用。
        if (typeof event.server_now === 'number' && typeof event.ends_at === 'number') {
          serverOffsetRef.current = event.server_now - Date.now()
          roundEndsAtRef.current = event.ends_at
        }
        // 清除间隔倒计时，重置 remaining
        if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null }
        setIntervalCountdown(null)
        intervalRemainingRef.current = 0
        setJustJoined(false)
        setIsLastCard(event.is_last ?? false)
        setIsJudgeWaiting(false)
        setIsPaused(false)

        // 如果有待执行的打乱，先打乱再开始（打乱完立即可抢）
        if (shufflePending) {
          setShufflePending(false)
          setShuffleBlocking(true)
          setCards(prev => {
            const shuffled = [...prev]
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
            }
            return shuffled
          })
          // 打乱完成后立即可抢，弹窗仅作短暂提示
          setCurrentReading({ cardId: event.card_id, cardAudioId: event.card_audio_id ?? 0, audioUrl: event.audio_url, hintText: event.hint_text, startRatio: event.start_ratio })
          setTimeout(() => setShuffleBlocking(false), 600)
        } else {
          setCurrentReading({ cardId: event.card_id, cardAudioId: event.card_audio_id ?? 0, audioUrl: event.audio_url, hintText: event.hint_text, startRatio: event.start_ratio })
        }
        playSound('card_start')
        break
      }

      case 'card_claimed': {
        const remaining = event.remaining ?? 0
        setCardRemaining(prev => new Map(prev).set(event.card_id, remaining))
        setDiscardPile(prev => [...prev, { cardId: event.card_id, winner: event.winner_name, hintText: event.hint_text ?? '' }])
        setCurrentReading(null)
        const isMe = user && event.winner_id === user.id
        if (isMe) {
          toast.show('🎉 你抢到了！太厉害了！+1分 (ﾉ◕ヮ◕)ﾉ', 'success')
          playSound('grab_ok')
        } else {
          toast.show(`✨ ${event.winner_name} 手速真快！+1分`, 'info')
        }
        // 牌面打乱
        break
      }

      case 'card_missed': {
        const remaining = event.remaining ?? 0
        setCardRemaining(prev => new Map(prev).set(event.card_id, remaining))
        setDiscardPile(prev => [...prev, { cardId: event.card_id, winner: '无人', hintText: '' }])
        setCurrentReading(null)
        toast.show('这张牌成功逃跑了… (°ω°)', 'info', 1500)
        break
      }

      case 'card_exhausted': {
        setCardRemaining(prev => new Map(prev).set(event.card_id, 0))
        break
      }

      case 'grab_failed': {
        // 有 reason 时由 grab_wrong 广播统一处理 toast，这里跳过
        if (event.reason === 'not_current' || event.reason === 'already_grabbed') {
          // grab_wrong 会处理
        } else {
          // 窗口已关闭等其他原因
          toast.show('晚了一步——下次要更快！', 'fail', 1200)
          playSound('grab_fail')
        }
        break
      }

      case 'grab_wrong': {
        const isMe = user && event.user_id === user.id
        const isNotCurrent = event.reason === 'not_current'
        const hasPenalty = event.penalty !== false
        if (isMe) {
          if (isNotCurrent) {
            toast.show(hasPenalty ? '🎯 抢错牌了！-1分，本首禁止抢牌 (╥_╥)' : '🎯 抢错牌了！本首禁止抢牌 (°ω°)', 'fail', 3000)
          } else {
            toast.show(hasPenalty ? '😭 被人抢先了！-1分，本首禁止抢牌 (╥_╥)' : '😭 被人抢先了！本首禁止抢牌 (°ω°)', 'fail', 3000)
          }
        } else {
          if (isNotCurrent) {
            toast.show(hasPenalty ? `❌ ${event.username} 抢了错误的牌，扣1分！本首出局` : `❌ ${event.username} 抢错了！本首出局`, 'info', 2500)
          } else {
            toast.show(hasPenalty ? `💨 ${event.username} 抢慢了一步，扣1分！本首出局` : `💨 ${event.username} 抢慢了！本首出局`, 'info', 2500)
          }
        }
        playSound('grab_fail')
        break
      }

      case 'grab_banned': {
        toast.show('🚫 你已出局，只能看别人抢了… (´-ω-`)', 'fail', 2000)
        playSound('grab_fail')
        break
      }

      case 'all_banned': {
        toast.show('💀 全员出局！本首自动结束… (°ω°)', 'info', 2500)
        break
      }

      case 'score_update': {
        setPlayers(prev =>
          prev.map(p => {
            const u = event.scores.find(s => s.user_id === p.user_id)
            return u ? { ...p, score: u.score } : p
          })
        )
        break
      }

      case 'game_over': {
        setGameStatus('end')
        setGameResults(event.results)
        if (event.last_card_winner_id) setLastCardWinnerId(event.last_card_winner_id)
        playSound('game_over')
        break
      }

      case 'paused': {
        setIsPaused(true)
        setGameStatus('paused')
        setRoomState(prev => prev ? { ...prev, room: { ...prev.room, status: 'paused' } } : null)
        toast.show('⏸ 暂停了，喘口气 (´-ω-`)', 'info')
        break
      }

      case 'resumed': {
        setIsPaused(false)
        setGameStatus('reading')
        setRoomState(prev => prev ? { ...prev, room: { ...prev.room, status: 'reading' } } : null)
        toast.show('战斗继续。', 'info', 1200)
        break
      }

      case 'player_joined': {
        setPlayers(prev => {
          const existing = prev.find(p => p.user_id === event.user_id)
          if (existing) {
            return prev.map(p => p.user_id === event.user_id ? { ...p, online: true, role: event.role || p.role } : p)
          }
          toast.show(`${event.username} 加入了战场。`, 'info')
          return [...prev, { room_id: roomId, user_id: event.user_id, username: event.username, avatar_url: event.avatar_url, role: event.role || 'player', score: 0, online: true }]
        })
        break
      }

      case 'player_offline': {
        // 标记为离线而非删除，保留分数展示
        setPlayers(prev => {
          const leaving = prev.find(p => p.user_id === event.user_id)
          if (leaving) toast.show(`💨 ${leaving.username} 离开了战场`, 'info', 1500)
          return prev.map(p => p.user_id === event.user_id ? { ...p, online: false } : p)
        })
        break
      }

      // 聊天与丢蛋：状态收敛在 useChat
      case 'chat_message':
        onChatMessage(event)
        break

      case 'egg_throw':
        onEggThrow(event, user?.id === event.target_id)
        break

      case 'room_closed': {
        toast.show('战场已解散，撤退中…', 'info', 3000)
        setTimeout(() => navigate('/'), 2000)
        break
      }

      case 'kicked': {
        toast.show('😢 你被房主移出了房间…', 'fail', 3000)
        setTimeout(() => navigate('/'), 2000)
        break
      }

      case 'seat_update':
        onSeatUpdate(event)
        break

      case 'seat_kicked': {
        toast.show('😯 你被房主从席位上移除了', 'info', 2000)
        break
      }

      // 编排阶段：状态与计时收敛在 useDuelState
      case 'duel_arrange_start':
        onArrangeStart(event)
        break

      case 'duel_arrange_state':
        onArrangeState(event)
        break

      case 'duel_arrange_done':
        onArrangeDone(event)
        break

      case 'judge_waiting': {
        setIsJudgeWaiting(true)
        setCurrentReading(null)
        break
      }

      case 'judge_offline': {
        toast.show(`裁判断线了，等待重连中…（最多 ${event.timeout}s）`, 'info', event.timeout * 1000)
        break
      }

      case 'judge_timeout': {
        toast.show('裁判长时间未归，对局自动结束。', 'info', 3000)
        break
      }

      // === Duel mode events ===
      case 'duel_state': {
        setDuelState(event.data)
        setGameStatus('reading')
        break
      }

      case 'duel_card_start': {
        setDuelCurrentCardId(event.card_id)
        setDuelRound(event.round)
        setCurrentReading({ cardId: event.card_id, cardAudioId: 0, audioUrl: event.audio_url, hintText: event.hint_text, startRatio: event.start_ratio })
        // 启动倒计时
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        const roundTime = roomState?.room?.duel_round_time ?? 30
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
        break
      }

      case 'duel_grab_wrong': {
        const isMe = user && event.user_id === user.id
        if (isMe) {
          toast.show('❌ 拍错了！本轮机会-1 (╥_╥)', 'fail', 2000)
        } else {
          toast.show(`❌ ${event.username} 拍错了，机会-1！`, 'info', 1500)
        }
        playSound('grab_fail')
        break
      }

      case 'duel_grab_invalid': {
        toast.show('⚠️ 无效操作，现在不能拍牌 (°_°)', 'info', 1200)
        break
      }

      case 'duel_grab_blocked': {
        toast.show('🚫 本轮机会用完了！等下一轮吧… (´-ω-`)', 'fail', 2000)
        playSound('grab_fail')
        break
      }

      case 'duel_card_claimed': {
        const isMe = user && event.user_id === user.id
        // 停止倒计时
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        setCurrentReading(null)
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
          const areaText = event.area === 'own' ? '己方区' : '对方区'
          toast.show(`🎉 你从${areaText}抢到了！(ﾉ◕ヮ◕)ﾉ`, 'success')
          playSound('grab_ok')
        } else {
          toast.show(`✨ ${event.username} 抢到了！`, 'info')
        }
        break
      }

      case 'duel_timeout': {
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        setCurrentReading(null)
        if (event.requeued) {
          toast.show('⏰ 超时了！歌曲已重新入队 (´-ω-`)', 'info', 2000)
        } else {
          toast.show('⏰ 超时了！这首歌飞走了… (°ω°)', 'info', 2000)
        }
        break
      }

      case 'duel_give_request': {
        setDuelGiveCards(event.cards)
        break
      }

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
        const isMe = user && event.from_id === user.id
        if (isMe) {
          toast.show('📤 牌已送出！ (ﾉ´∀`*)ﾉ', 'info', 1500)
        } else {
          toast.show('📥 对方送了一张牌过来！', 'info', 1500)
        }
        break
      }

      case 'duel_game_over': {
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        setCurrentReading(null)
        setGameStatus('end')
        const isWinner = user && event.winner_id === user.id
        const isTie = event.winner_id === 0
        const p1 = duelState?.player1
        const p2 = duelState?.player2
        const toGrabbedCards = (cards?: Array<{ id: number; display_text: string; cover_url: string }>) =>
          (cards ?? []).map(c => ({ id: c.id, display_text: c.display_text, cover_url: c.cover_url, hint_text: '' }))
        const p1Cards = toGrabbedCards(event.p1_grabbed_cards)
        const p2Cards = toGrabbedCards(event.p2_grabbed_cards)
        if (isTie) {
          setGameResults([
            { user_id: p1?.id ?? 0, username: p1?.username ?? '', score: p1Cards.length, rank: 1, grabbed_cards: p1Cards },
            { user_id: p2?.id ?? 0, username: p2?.username ?? '', score: p2Cards.length, rank: 1, grabbed_cards: p2Cards },
          ])
          toast.show('🤝 平局！旗鼓相当！(´・ω・`)', 'info', 5000)
        } else {
          const winnerId = event.winner_id
          const loserId = winnerId === (p1?.id ?? 0) ? (p2?.id ?? 0) : (p1?.id ?? 0)
          const loserName = winnerId === (p1?.id ?? 0) ? (p2?.username ?? '') : (p1?.username ?? '')
          const winnerCards = winnerId === (p1?.id ?? 0) ? p1Cards : p2Cards
          const loserCards = winnerId === (p1?.id ?? 0) ? p2Cards : p1Cards
          setGameResults([
            { user_id: winnerId, username: event.winner, score: winnerCards.length, rank: 1, grabbed_cards: winnerCards },
            { user_id: loserId, username: loserName, score: loserCards.length, rank: 2, grabbed_cards: loserCards },
          ])
          if (isWinner) {
            toast.show('你赢了——对决胜利！', 'success', 5000)
          } else {
            toast.show(`${event.winner} 获胜了…下次再战。`, 'info', 5000)
          }
        }
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
    // duelArranging 的闭包新鲜度由 onArrangeState（依赖 duelArranging）等价保证
  }, [user, roomId, playSound, toast.show, navigate, roomState, duelState, shufflePending, prefetchAudioUrls, onChatMessage, onEggThrow, onSeatUpdate, onArrangeStart, onArrangeState, onArrangeDone])

  const { send, connected } = useRoomSocket(roomId, handleEvent)

  // WS 连接成功后，确保自己在 players 列表中是 online
  useEffect(() => {
    if (connected && user) {
      setPlayers(prev => prev.map(p => p.user_id === user.id ? { ...p, online: true } : p))
    }
  }, [connected, user])

  // B1：抢牌命令幂等 ID（单调递增），防网络重试导致重复判分
  const grabCmdRef = useRef(0)
  const handleGrab = useCallback((cardId: number) => {
    if (isSpectator) {
      toast.show('👁 旁观者不能抢牌哦！(´-ω-`)', 'info', 1000)
      return
    }
    if (!currentReading) {
      toast.show('🎵 等待下一张牌吧… (´。• ω •。`)', 'info', 1000)
      return
    }
    send({ type: 'grab', card_id: cardId, cmd_id: ++grabCmdRef.current })
  }, [send, currentReading, toast.show, isSpectator])

  const handleDuelGrab = useCallback((cardId: number) => {
    if (isSpectator) {
      toast.show('👁 旁观者不能抢牌哦！(´-ω-`)', 'info', 1000)
      return
    }
    if (!duelCurrentCardId) {
      toast.show('🎵 等待下一轮吧… (´。• ω •。`)', 'info', 1000)
      return
    }
    send({ type: 'grab', card_id: cardId, cmd_id: ++grabCmdRef.current })
  }, [send, duelCurrentCardId, toast.show, isSpectator])

  const handleDuelGive = useCallback((cardId: number) => {
    send({ type: 'give_card', card_id: cardId })
    setDuelGiveCards(null)
  }, [send])

  const handleArrangeSwap = useCallback((posA: number, posB: number) => {
    send({ type: 'duel_arrange_swap', data: { pos_a: posA, pos_b: posB, cross: false } })
  }, [send])

  const handleArrangeCrossSwap = useCallback((myIdx: number, oppIdx: number) => {
    send({ type: 'duel_arrange_swap', data: { pos_a: myIdx, pos_b: oppIdx, cross: true } })
  }, [send])

  const handleArrangeReady = useCallback(() => {
    send({ type: 'duel_arrange_ready' })
  }, [send])

  const handleChatSend = useCallback((text: string) => {
    send({ type: 'chat', text })
  }, [send])

  const handleEgg = useCallback((targetId: number) => {
    send({ type: 'egg_throw', target_id: targetId })
  }, [send])

  const handlePauseResume = () => {
    if (!roomState) return
    if (isPaused) api.rooms.resume(roomId).catch(() => null)
    else api.rooms.pause(roomId).catch(() => null)
  }

  const handleCloseRoom = async () => {
    if (!confirm('确定解散战场吗？所有战友都将被请离。')) return
    await api.rooms.close(roomId).catch(() => null)
    navigate('/')
  }

  // B1：客户端不再上报 audio_ended（服务端权威回合时钟负责切首）。
  // 本地 ended 事件仅用于 ReadingPanel 内部状态，无需通知服务端。
  const handleAudioEnded = useCallback(() => {}, [])

  // B1：缓冲失败上报——服务端收到后可提前切首，避免全场卡死等待。
  const handleBufferError = useCallback(() => {
    send({ type: 'media_event', round_id: currentRoundIdRef.current, text: 'buffer_fail' })
  }, [send])

  const handleLeaveRoom = () => {
    if (confirm('确定要撤退吗？')) navigate('/')
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-32">
        <span className="text-gold animate-pulse font-serif text-xl">战场加载中…请稍候</span>
      </div>
    </Layout>
  )

  if (error || !roomState) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-32 text-crimson gap-4">
        <SearchX size={44} strokeWidth={1.5} className="opacity-70" aria-hidden="true" />
        <p>{error ?? '找不到这个战场'}</p>
        <Button variant="outline" onClick={() => navigate('/')}>回到大本营</Button>
      </div>
    </Layout>
  )

  if (gameStatus === 'end' && roomState?.room.mode === 'duel' && duelEndData) return (
    <DuelGameOver data={duelEndData} currentUserId={user?.id ?? 0} />
  )

  if (gameStatus === 'end' && gameResults) return (
    <GameOver results={gameResults} currentUserId={user?.id ?? 0} lastCardWinnerId={lastCardWinnerId} />
  )

  if (gameStatus === 'waiting') return (
    <Layout>
      <div className="relative">
        {/* 房间操作栏 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">房间</span>
            <span className="text-gold font-serif text-sm font-bold tracking-widest">{roomState.room.code}</span>
          </div>
          <div className="flex items-center gap-2">
            {roomState.room.host_id === user?.id ? (
              <button onClick={handleCloseRoom}
                className="text-xs text-muted hover:text-crimson transition-all duration-200 border border-border hover:border-crimson/50 px-3 py-1 rounded hover:scale-105">
                解散战场
              </button>
            ) : (
              <button onClick={handleLeaveRoom}
                className="text-xs text-muted hover:text-gold transition-all duration-200 border border-border hover:border-gold/40 px-3 py-1 rounded hover:scale-105">
                溜了溜了 (｀・ω・´)
              </button>
            )}
          </div>
        </div>
        <WaitingLobby
          room={roomState.room}
          players={players}
          currentUserId={user?.id ?? 0}
          onRoleChange={setIsSpectator}
          onKick={async (userId) => {
            try {
              await api.rooms.kick(roomId, userId)
              setPlayers(prev => prev.filter(p => p.user_id !== userId))
            } catch { /* ignore */ }
          }}
          preloadProgress={preloadProgress}
          duelSeats={duelSeats}
          onClaimSeat={async (seat) => {
            try { await api.rooms.claimSeat(roomId, seat) } catch (e) { toast.show(e instanceof Error ? e.message : '入座失败', 'fail') }
          }}
          onLeaveSeat={async () => {
            try { await api.rooms.leaveSeat(roomId) } catch { /* ignore */ }
          }}
          onKickSeat={async (userId) => {
            try { await api.rooms.kickFromSeat(roomId, userId) } catch { /* ignore */ }
          }}
        />
        <ChatRoom messages={chatMessages} players={players} currentUserId={user?.id ?? 0}
          isSpectator={isSpectator} onSend={handleChatSend} onEgg={handleEgg} />
        <EggAnimation event={eggEvent} />
      </div>
    </Layout>
  )

  const isHost = roomState.room.host_id === user?.id
  const isJudgeMode = roomState.room.mode === 'judge'
  const isDuelMode = roomState.room.mode === 'duel'
  const remainingCount = Array.from(cardRemaining.values()).filter(r => r > 0).length

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]" style={{ background: 'linear-gradient(160deg, rgb(var(--color-ink-deep)) 0%, rgb(var(--color-ink-deep)) 50%, rgb(var(--color-ink-deep)) 100%)' }}>

        {/* 读牌区 */}
        <ReadingPanel
          hintText={currentReading?.hintText ?? null}
          audioUrl={currentReading?.audioUrl ?? null}
          startRatio={currentReading?.startRatio}
          intervalSec={roomState.room.interval_sec}
          isActive={!!currentReading}
          isPaused={isPaused}
          countdown={countdown}
          intervalCountdown={intervalCountdown}
          onAudioEnded={handleAudioEnded}
          onBufferError={handleBufferError}
          isLastCard={isLastCard}
        />


        {/* 刚加入进行中游戏的提示 */}
        {justJoined && !isSpectator && (
          <div className="flex items-center justify-between px-4 py-2 text-xs"
            style={{ background: 'rgba(128,90,213,0.12)', borderBottom: '1px solid rgba(128,90,213,0.2)' }}>
            <span style={{ color: 'rgb(var(--accent-primary)/ 0.9)' }}>
              你刚加入——正在进行中的这首结束后即可参与抢牌。
            </span>
            <button onClick={() => setJustJoined(false)}
              className="text-muted hover:text-white ml-2 shrink-0">✕</button>
          </div>
        )}

        {/* 旁观者切换提示（duel 模式不显示加入战斗按钮） */}
        {isDuelMode && (() => {
          const spectators = players.filter(p => p.role !== 'duel_p1' && p.role !== 'duel_p2')
          return spectators.length > 0 || isSpectator ? (
            <div className="flex items-center gap-2 px-4 py-1.5 text-xs"
              style={{ background: 'rgba(128,90,213,0.08)', borderBottom: '1px solid rgba(128,90,213,0.15)' }}>
              <span className="text-purple-300/60 shrink-0">👁 旁观席:</span>
              <span className="text-purple-300/80 truncate">
                {spectators.length > 0 ? spectators.map(s => s.username).join(', ') : '暂无'}
              </span>
              {isSpectator && <span className="text-purple-300/50 ml-auto shrink-0">(你在旁观)</span>}
            </div>
          ) : null
        })()}
        {isSpectator && !isDuelMode && !roomState.room.training && (
          <div className="flex items-center justify-between px-4 py-2 text-xs"
            style={{ background: 'rgb(var(--accent-primary)/ 0.08)', borderBottom: '1px solid rgb(var(--accent-primary)/ 0.15)' }}>
            <span className="text-gold/80">
              👁 你当前是旁观者，无法抢牌
            </span>
            <button
              onClick={async () => {
                try {
                  await api.rooms.spectate(roomId, false)
                  setIsSpectator(false)
                  setPlayers(prev => prev.map(p => p.user_id === user?.id ? { ...p, role: 'player' } : p))
                  toast.show('已加入战斗！下一首可以抢了。', 'success')
                } catch { /* ignore */ }
              }}
              className="px-3 py-1 rounded text-xs font-medium transition-all hover:scale-105"
              style={{ background: 'rgb(var(--accent-primary)/ 0.2)', border: '1px solid rgb(var(--accent-primary)/ 0.4)', color: 'rgb(var(--color-gold))' }}>
              <Swords size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
              加入战斗！
            </button>
          </div>
        )}

        {/* 控制栏（连接状态/房间码/房主控制/管理员操作/调试跳结算） */}
        <RoomControlBar
          connected={connected}
          roomId={roomId}
          roomCode={roomState.room.code}
          isHost={isHost}
          isPaused={isPaused}
          isReading={gameStatus === 'reading'}
          user={user}
          players={players}
          onPauseResume={handlePauseResume}
          onCloseRoom={handleCloseRoom}
          onLeaveRoom={handleLeaveRoom}
          onDebugEnd={(results) => { setGameResults(results); setGameStatus('end') }}
        />

        {/* 主体 */}
        {isDuelMode && duelState ? (
          // 对阵模式：DuelBoard
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <DuelBoard
                duelState={duelState}
                currentUserId={user?.id ?? 0}
                currentCardId={duelCurrentCardId}
                onGrab={handleDuelGrab}
                arranging={duelArranging}
                arrangeTimeout={arrangeTimeout}
                p1Ready={arrangeP1Ready}
                p2Ready={arrangeP2Ready}
                onArrangeSwap={handleArrangeSwap}
                onArrangeCrossSwap={handleArrangeCrossSwap}
                onArrangeReady={handleArrangeReady}
              />
            </div>
          </div>
        ) : isDuelMode && !duelState ? (
          // 对阵模式等待状态初始化
          <div className="flex flex-1 items-center justify-center">
            <span className="text-gold/60 font-serif animate-pulse">等待对阵初始化…</span>
          </div>
        ) : isJudgeMode && isHost ? (
          // 裁判视图：上方选牌区 + 下方只读棋布
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* 上：选牌区（固定高度） */}
            <div className="shrink-0 border-b border-white/5" style={{ height: '38%', overflow: 'hidden' }}>
              <JudgePanel
                roomId={roomId}
                cards={cards}
                playedCardIds={new Set(Array.from(cardRemaining.entries()).filter(([, r]) => r <= 0).map(([id]) => id))}
                currentCardId={currentReading?.cardId ?? null}
                currentAudioId={currentReading?.cardAudioId ?? null}
                currentHintText={currentReading?.hintText ?? null}
                isJudgeWaiting={isJudgeWaiting}
              />
            </div>
            {/* 下：棋布 + 计分板 */}
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto relative">
                <div className="absolute top-2 left-0 right-0 flex justify-center z-10 pointer-events-none">
                  <span className="text-white/20 text-xs bg-black/40 px-2 py-0.5 rounded-full">
                    裁判视角 · 仅观察
                  </span>
                </div>
                <CardGrid
                  cards={cards}
                  cardRemaining={cardRemaining}
                  discardPile={discardPile}
                />
              </div>
              <div className="hidden md:flex shrink-0">
                <ScoreBoard players={players} currentUserId={user?.id ?? 0}
                  hostId={roomState.room.host_id}
                  remainingCount={remainingCount} totalCount={totalCardCount}
                  onKick={async (userId) => {
                    try {
                      await api.rooms.kick(roomId, userId)
                      setPlayers(prev => prev.filter(p => p.user_id !== userId))
                    } catch { /* ignore */ }
                  }} />
              </div>
            </div>
          </div>
        ) : (
          // 玩家视图：棋布 + 计分板
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <CardGrid
                cards={cards}
                cardRemaining={cardRemaining}
                discardPile={discardPile}
                onGrab={handleGrab}
              />
            </div>
            <div className="hidden md:flex shrink-0">
              <ScoreBoard players={players} currentUserId={user?.id ?? 0}
                hostId={roomState.room.host_id}
                remainingCount={remainingCount} totalCount={totalCardCount}
                onKick={async (userId) => {
                  try {
                    await api.rooms.kick(roomId, userId)
                    setPlayers(prev => prev.filter(p => p.user_id !== userId))
                  } catch { /* ignore */ }
                }} />
            </div>
          </div>
        )}

        {/* 移动端底部计分条（duel 模式不显示） */}
        {!isDuelMode && (
          <MobileScoreBar
            players={players}
            currentUserId={user?.id ?? 0}
            hostId={roomState.room.host_id}
            isJudgeMode={isJudgeMode}
          />
        )}

        {/* Duel 轮次/倒计时信息 */}
        {isDuelMode && duelState && (
          <DuelStatusBar
            duelState={duelState}
            duelRound={duelRound}
            duelRoundTimer={duelRoundTimer}
            currentUserId={user?.id ?? 0}
          />
        )}

        {/* Duel 给牌弹窗 */}
        {duelGiveCards && duelGiveCards.length > 0 && (
          <DuelGiveModal cards={duelGiveCards} onGive={handleDuelGive} />
        )}

        {/* 聊天室 */}
        <ChatRoom
          messages={chatMessages}
          players={players}
          currentUserId={user?.id ?? 0}
          isSpectator={isSpectator}
          onSend={handleChatSend}
          onEgg={handleEgg}
        />

        {/* 丢蛋动画 */}
        <EggAnimation event={eggEvent} />

        {/* 打乱弹窗 */}
        {shuffleBlocking && <ShuffleOverlay />}

      </div>
    </Layout>
  )
}
