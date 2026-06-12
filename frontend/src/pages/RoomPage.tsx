import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
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
import { useRoomSocket } from '../hooks/useRoomSocket'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { RoomState, Card, RoomPlayer, WSEvent, DuelState } from '../api/types'

interface CurrentReading { cardId: number; cardAudioId: number; audioUrl: string; hintText: string; startRatio?: number }
interface GrabbedCard { id: number; display_text: string; cover_url: string; hint_text: string }
interface GameResult { user_id: number; username: string; score: number; rank: number; penalty_count?: number; grabbed_cards?: GrabbedCard[] }

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

// 音效工具（用 Web Audio API 生成简单音效，不依赖外部文件）
function useSound() {
  const ctxRef = useRef<AudioContext | null>(null)
  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }
  const play = useCallback((type: 'grab_ok' | 'grab_fail' | 'card_start' | 'game_over') => {
    try {
      const ctx = getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      const now = ctx.currentTime
      switch (type) {
        case 'grab_ok':
          // 上升双音——成功感
          osc.type = 'sine'
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.linearRampToValueAtTime(660, now + 0.12)
          gain.gain.setValueAtTime(0.3, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.25)
          osc.start(now); osc.stop(now + 0.25)
          break
        case 'grab_fail':
          // 下降短音——惩罚感
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(300, now)
          osc.frequency.linearRampToValueAtTime(150, now + 0.18)
          gain.gain.setValueAtTime(0.25, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.2)
          osc.start(now); osc.stop(now + 0.2)
          break
        case 'card_start':
          // 轻柔提示音
          osc.type = 'sine'
          osc.frequency.setValueAtTime(523, now)
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.15)
          osc.start(now); osc.stop(now + 0.15)
          break
        case 'game_over':
          // 三连升调
          const freqs = [523, 659, 784]
          freqs.forEach((f, i) => {
            const o2 = ctx.createOscillator()
            const g2 = ctx.createGain()
            o2.connect(g2); g2.connect(ctx.destination)
            o2.type = 'sine'
            o2.frequency.value = f
            g2.gain.setValueAtTime(0.2, now + i * 0.15)
            g2.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.25)
            o2.start(now + i * 0.15); o2.stop(now + i * 0.15 + 0.25)
          })
          break
      }
    } catch { /* AudioContext 不支持时静默失败 */ }
  }, [])
  return play
}

export function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const playSound = useSound()

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
  const [preloadProgress, setPreloadProgress] = useState<{ loaded: number; total: number } | null>(null)
  const preloadStartedRef = useRef(false)

  // Duel mode state
  const [duelState, setDuelState] = useState<DuelState | null>(null)
  const [duelCurrentCardId, setDuelCurrentCardId] = useState<number | null>(null)
  const [duelGiveCards, setDuelGiveCards] = useState<Array<{ id: number; display_text: string; cover_url: string }> | null>(null)
  const [duelRound, setDuelRound] = useState(0)
  const [duelRoundTimer, setDuelRoundTimer] = useState<number | null>(null)
  const [duelEndData, setDuelEndData] = useState<{
    winner: string; winnerId: number; isTie: boolean; rounds: number
    p1: { id: number; username: string; grabbed: Array<{ id: number; display_text: string; cover_url: string }>; remaining: Array<{ id: number; display_text: string; cover_url: string }> }
    p2: { id: number; username: string; grabbed: Array<{ id: number; display_text: string; cover_url: string }>; remaining: Array<{ id: number; display_text: string; cover_url: string }> }
  } | null>(null)
  const duelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Duel seat state
  const [duelSeats, setDuelSeats] = useState<{ seat1: { user_id: number; username: string } | null; seat2: { user_id: number; username: string } | null }>({ seat1: null, seat2: null })

  // Duel arranging state
  const [duelArranging, setDuelArranging] = useState(false)
  const [arrangeTimeout, setArrangeTimeout] = useState<number | null>(null)
  const [arrangeP1Ready, setArrangeP1Ready] = useState(false)
  const [arrangeP2Ready, setArrangeP2Ready] = useState(false)
  const arrangeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 聊天室
  interface ChatMsg { id: number; user_id: number; username: string; role: string; text: string; isEgg?: boolean; fromName?: string; targetName?: string }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const chatIdRef = useRef(0)

  // 丢蛋动画
  const [eggEvent, setEggEvent] = useState<{ id: number; fromName: string; targetName: string; isMe: boolean } | null>(null)

  // 反馈 toast：抢牌结果
  const [toast, setToast] = useState<{
    text: string
    type: 'success' | 'fail' | 'info'
    id: number
  } | null>(null)
  const toastCounter = useRef(0)
  const showToast = useCallback((text: string, type: 'success' | 'fail' | 'info', ms = 2000) => {
    const id = ++toastCounter.current
    setToast({ text, type, id })
    setTimeout(() => setToast(prev => prev?.id === id ? null : prev), ms)
  }, [])

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
        const me = (state.players ?? []).find((p: any) => p.user_id === user?.id)
        if (me && (me as any).role === 'spectator') setIsSpectator(true)
        // 初始化 duel 席位
        if (state.room.mode === 'duel') {
          let s1: { user_id: number; username: string } | null = null
          let s2: { user_id: number; username: string } | null = null
          for (const p of (state.players ?? []) as any[]) {
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
          state.cards.forEach((c: any) => rm.set(c.id, c.remaining ?? c.audio_count ?? 1))
          setCardRemaining(rm)
        }
        // 恢复废牌堆（从 grabbed_cards 重建）
        if (state.grabbed_cards?.length) {
          setDiscardPile(state.grabbed_cards.map((g: any) => ({
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
      showToast('🌀 下一首开始前要打乱牌面了！', 'info', 2000)
    }
    prevBoardCountRef.current = boardCount
  }, [cardRemaining, shuffleThreshold, cards.length, showToast])

  // 等待大厅阶段预加载所有封面图和音频（含本地缓存）
  useEffect(() => {
    if (!cards.length || gameStatus !== 'waiting' || preloadStartedRef.current) return
    preloadStartedRef.current = true

    const items: { type: 'image' | 'audio'; url: string }[] = []
    cards.forEach(card => {
      if (card.cover_url) items.push({ type: 'image', url: card.cover_url })
      if (card.audios?.length) {
        card.audios.forEach(a => { if (a.audio_url) items.push({ type: 'audio', url: a.audio_url }) })
      } else if (card.audio_url) {
        items.push({ type: 'audio', url: card.audio_url })
      }
    })
    if (!items.length) return

    setPreloadProgress({ loaded: 0, total: items.length })

    // 异步缓存 + 预加载
    let cancelled = false
    ;(async () => {
      const { cacheMedia } = await import('../utils/mediaCache')
      let loaded = 0
      const tick = () => {
        loaded++
        if (!cancelled) setPreloadProgress({ loaded, total: items.length })
      }

      for (const item of items) {
        if (cancelled) break
        try {
          // 先缓存到本地
          const localUrl = await cacheMedia(item.url)
          // 再用浏览器预加载（确保解码完成）
          if (item.type === 'image') {
            await new Promise<void>((resolve) => {
              const img = new Image()
              img.onload = () => { tick(); resolve() }
              img.onerror = () => { tick(); resolve() }
              img.src = localUrl
            })
          } else {
            await new Promise<void>((resolve) => {
              const audio = new Audio()
              audio.addEventListener('canplaythrough', () => { tick(); resolve() }, { once: true })
              audio.addEventListener('error', () => { tick(); resolve() }, { once: true })
              audio.preload = 'auto'
              audio.src = localUrl
              audio.load()
            })
          }
        } catch {
          tick()
        }
      }
    })()

    return () => { cancelled = true }
  }, [cards, gameStatus])

  const handleEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case 'room_state': {
        const s = event.data
        setRoomState(s)
        // 合并 online 状态：room_state 里如果 online=true 则采用，false 时保留本地状态
        // 避免时序问题导致刚重连的玩家显示离线
        setPlayers(prev => {
          const newPlayers = s.players ?? []
          return newPlayers.map((np: any) => {
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
          s.cards.forEach((c: any) => rm.set(c.id, c.remaining ?? c.audio_count ?? 1))
          setCardRemaining(rm)
        }
        if (s.grabbed_cards?.length) {
          setDiscardPile(s.grabbed_cards.map((g: any) => ({
            cardId: g.card_id as number,
            winner: (g.winner_name || '无人') as string,
            hintText: (g.hint_text || '') as string,
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
        const remaining = (event as any).remaining ?? 0
        setCardRemaining(prev => new Map(prev).set(event.card_id, remaining))
        setDiscardPile(prev => [...prev, { cardId: event.card_id, winner: event.winner_name, hintText: (event as any).hint_text ?? '' }])
        setCurrentReading(null)
        const isMe = user && event.winner_id === user.id
        if (isMe) {
          showToast('🎉 你抢到了！太厉害了！+1分 (ﾉ◕ヮ◕)ﾉ', 'success')
          playSound('grab_ok')
        } else {
          showToast(`✨ ${event.winner_name} 手速真快！+1分`, 'info')
        }
        // 牌面打乱
        break
      }

      case 'card_missed': {
        const remaining = (event as any).remaining ?? 0
        setCardRemaining(prev => new Map(prev).set(event.card_id, remaining))
        setDiscardPile(prev => [...prev, { cardId: event.card_id, winner: '无人', hintText: '' }])
        setCurrentReading(null)
        showToast('这张牌成功逃跑了… (°ω°)', 'info', 1500)
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
          showToast('⚡ 晚了一步！(>_<) 下次要更快！', 'fail', 1200)
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
            showToast(hasPenalty ? '🎯 抢错牌了！-1分，本首禁止抢牌 (╥_╥)' : '🎯 抢错牌了！本首禁止抢牌 (°ω°)', 'fail', 3000)
          } else {
            showToast(hasPenalty ? '😭 被人抢先了！-1分，本首禁止抢牌 (╥_╥)' : '😭 被人抢先了！本首禁止抢牌 (°ω°)', 'fail', 3000)
          }
        } else {
          if (isNotCurrent) {
            showToast(hasPenalty ? `❌ ${event.username} 抢了错误的牌，扣1分！本首出局` : `❌ ${event.username} 抢错了！本首出局`, 'info', 2500)
          } else {
            showToast(hasPenalty ? `💨 ${event.username} 抢慢了一步，扣1分！本首出局` : `💨 ${event.username} 抢慢了！本首出局`, 'info', 2500)
          }
        }
        playSound('grab_fail')
        break
      }

      case 'grab_banned': {
        showToast('🚫 你已出局，只能看别人抢了… (´-ω-`)', 'fail', 2000)
        playSound('grab_fail')
        break
      }

      case 'all_banned': {
        showToast('💀 全员出局！本首自动结束… (°ω°)', 'info', 2500)
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
        showToast('⏸ 暂停了，喘口气 (´-ω-`)', 'info')
        break
      }

      case 'resumed': {
        setIsPaused(false)
        setGameStatus('reading')
        setRoomState(prev => prev ? { ...prev, room: { ...prev.room, status: 'reading' } } : null)
        showToast('▶ 战斗继续！(ง •̀_•́)ง', 'info', 1200)
        break
      }

      case 'player_joined': {
        setPlayers(prev => {
          const existing = prev.find(p => p.user_id === event.user_id)
          if (existing) {
            return prev.map(p => p.user_id === event.user_id ? { ...p, online: true, role: event.role || p.role } : p)
          }
          showToast(`👋 ${event.username} 加入了战场！`, 'info')
          return [...prev, { room_id: roomId, user_id: event.user_id, username: event.username, avatar_url: event.avatar_url, role: event.role || 'player', score: 0, online: true }]
        })
        break
      }

      case 'player_offline': {
        // 标记为离线而非删除，保留分数展示
        setPlayers(prev => {
          const leaving = prev.find(p => p.user_id === event.user_id)
          if (leaving) showToast(`💨 ${leaving.username} 离开了战场`, 'info', 1500)
          return prev.map(p => p.user_id === event.user_id ? { ...p, online: false } : p)
        })
        break
      }

      case 'chat_message': {
        setChatMessages(prev => [...prev, {
          id: ++chatIdRef.current,
          user_id: event.user_id,
          username: event.username,
          role: event.role,
          text: event.text,
        }])
        break
      }

      case 'egg_throw': {
        const isMe = user?.id === event.target_id
        setChatMessages(prev => [...prev, {
          id: ++chatIdRef.current,
          user_id: 0,
          username: '',
          role: '',
          text: '',
          isEgg: true,
          fromName: event.from_name,
          targetName: event.target_name,
        }])
        setEggEvent({ id: Date.now(), fromName: event.from_name, targetName: event.target_name, isMe })
        setTimeout(() => setEggEvent(null), 2500)
        break
      }

      case 'room_closed': {
        showToast('战场已解散，撤退中… (｡•́︿•̀｡)', 'info', 3000)
        setTimeout(() => navigate('/'), 2000)
        break
      }

      case 'kicked': {
        showToast('😢 你被房主移出了房间…', 'fail', 3000)
        setTimeout(() => navigate('/'), 2000)
        break
      }

      case 'seat_update': {
        setDuelSeats({ seat1: event.seat1, seat2: event.seat2 })
        break
      }

      case 'seat_kicked': {
        showToast('😯 你被房主从席位上移除了', 'info', 2000)
        break
      }

      case 'duel_arrange_start': {
        setDuelArranging(true)
        setArrangeTimeout(event.timeout)
        setArrangeP1Ready(false)
        setArrangeP2Ready(false)
        if (arrangeTimerRef.current) clearInterval(arrangeTimerRef.current)
        arrangeTimerRef.current = setInterval(() => {
          setArrangeTimeout(prev => {
            if (prev === null || prev <= 1) {
              if (arrangeTimerRef.current) { clearInterval(arrangeTimerRef.current); arrangeTimerRef.current = null }
              return null
            }
            return prev - 1
          })
        }, 1000)
        break
      }

      case 'duel_arrange_state': {
        if (!duelArranging) setDuelArranging(true)
        setDuelState(prev => prev ? {
          ...prev,
          player1: { ...prev.player1, cards: event.player1_cards },
          player2: { ...prev.player2, cards: event.player2_cards },
        } : null)
        setArrangeP1Ready(event.p1_ready)
        setArrangeP2Ready(event.p2_ready)
        break
      }

      case 'duel_arrange_done': {
        setDuelArranging(false)
        if (arrangeTimerRef.current) { clearInterval(arrangeTimerRef.current); arrangeTimerRef.current = null }
        setArrangeTimeout(null)
        setDuelState(prev => prev ? {
          ...prev,
          player1: { ...prev.player1, cards: event.player1_cards },
          player2: { ...prev.player2, cards: event.player2_cards },
        } : null)
        break
      }

      case 'judge_waiting': {
        setIsJudgeWaiting(true)
        setCurrentReading(null)
        break
      }

      case 'judge_offline': {
        showToast(`👑 裁判断线了！等待重连中… (最多 ${event.timeout}s)`, 'info', event.timeout * 1000)
        break
      }

      case 'judge_timeout': {
        showToast('👑 裁判长时间未归，对局自动结束 (｡•́︿•̀｡)', 'info', 3000)
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
          showToast('❌ 拍错了！本轮机会-1 (╥_╥)', 'fail', 2000)
        } else {
          showToast(`❌ ${event.username} 拍错了，机会-1！`, 'info', 1500)
        }
        playSound('grab_fail')
        break
      }

      case 'duel_grab_invalid': {
        showToast('⚠️ 无效操作，现在不能拍牌 (°_°)', 'info', 1200)
        break
      }

      case 'duel_grab_blocked': {
        showToast('🚫 本轮机会用完了！等下一轮吧… (´-ω-`)', 'fail', 2000)
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
          showToast(`🎉 你从${areaText}抢到了！(ﾉ◕ヮ◕)ﾉ`, 'success')
          playSound('grab_ok')
        } else {
          showToast(`✨ ${event.username} 抢到了！`, 'info')
        }
        break
      }

      case 'duel_timeout': {
        if (duelTimerRef.current) { clearInterval(duelTimerRef.current); duelTimerRef.current = null }
        setDuelRoundTimer(null)
        setDuelCurrentCardId(null)
        setCurrentReading(null)
        if (event.requeued) {
          showToast('⏰ 超时了！歌曲已重新入队 (´-ω-`)', 'info', 2000)
        } else {
          showToast('⏰ 超时了！这首歌飞走了… (°ω°)', 'info', 2000)
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
          showToast('📤 牌已送出！ (ﾉ´∀`*)ﾉ', 'info', 1500)
        } else {
          showToast('📥 对方送了一张牌过来！', 'info', 1500)
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
          showToast('🤝 平局！旗鼓相当！(´・ω・`)', 'info', 5000)
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
            showToast('🏆 你赢了！对决胜利！！(ﾉ◕ヮ◕)ﾉ*:・゜✧', 'success', 5000)
          } else {
            showToast(`💫 ${event.winner} 获胜了… 下次再战！(>_<)`, 'info', 5000)
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
  }, [user, roomId, playSound, showToast, navigate, roomState, duelState, shufflePending, duelArranging])

  const { send, connected } = useRoomSocket(roomId, handleEvent)

  // WS 连接成功后，确保自己在 players 列表中是 online
  useEffect(() => {
    if (connected && user) {
      setPlayers(prev => prev.map(p => p.user_id === user.id ? { ...p, online: true } : p))
    }
  }, [connected, user])

  const handleGrab = useCallback((cardId: number) => {
    if (isSpectator) {
      showToast('👁 旁观者不能抢牌哦！(´-ω-`)', 'info', 1000)
      return
    }
    if (!currentReading) {
      showToast('🎵 等待下一张牌吧… (´。• ω •。`)', 'info', 1000)
      return
    }
    send({ type: 'grab', card_id: cardId })
  }, [send, currentReading, showToast, isSpectator])

  const handleDuelGrab = useCallback((cardId: number) => {
    if (isSpectator) {
      showToast('👁 旁观者不能抢牌哦！(´-ω-`)', 'info', 1000)
      return
    }
    if (!duelCurrentCardId) {
      showToast('🎵 等待下一轮吧… (´。• ω •。`)', 'info', 1000)
      return
    }
    send({ type: 'grab', card_id: cardId })
  }, [send, duelCurrentCardId, showToast, isSpectator])

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
    if (!confirm('确定要解散战场吗？所有战友都会被驱逐出去哦 (；′⌒`)')) return
    await api.rooms.close(roomId).catch(() => null)
    navigate('/')
  }

  const handleLeaveRoom = () => {
    if (confirm('真的要撤退吗？(｡•́︿•̀｡) 战友们会想念你的！')) navigate('/')
  }

  const handleAudioEnded = useCallback(() => {
    // 重试最多3次，间隔500ms，确保消息送达
    const trySend = (attempts: number) => {
      send({ type: 'audio_ended' })
      if (attempts > 1) setTimeout(() => trySend(attempts - 1), 500)
    }
    trySend(3)
  }, [send])

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-32">
        <span className="text-gold animate-pulse font-serif text-xl">战场加载中… (｡･ω･｡) 稍等一下</span>
      </div>
    </Layout>
  )

  if (error || !roomState) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-32 text-crimson gap-4">
        <div className="text-5xl">😣</div>
        <p>{error ?? '找不到这个战场 (>_<)'}</p>
        <button onClick={() => navigate('/')} className="btn-outline transition-all duration-200 hover:scale-105">回到大本营</button>
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
            try { await api.rooms.claimSeat(roomId, seat) } catch (e) { showToast(e instanceof Error ? e.message : '入座失败', 'fail') }
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
      <div className="flex flex-col h-[calc(100vh-3.5rem)]" style={{ background: 'linear-gradient(160deg, var(--color-ink-deep) 0%, var(--color-ink-deep) 50%, var(--color-ink-deep) 100%)' }}>

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
          isLastCard={isLastCard}
        />

        {/* 刚加入进行中游戏的提示 */}
        {justJoined && !isSpectator && (
          <div className="flex items-center justify-between px-4 py-2 text-xs"
            style={{ background: 'rgba(128,90,213,0.12)', borderBottom: '1px solid rgba(128,90,213,0.2)' }}>
            <span style={{ color: 'rgba(167,139,250,0.9)' }}>
              👋 你刚加入，正在进行中的这首结束后可以参与抢牌～ (｡•̀ᴗ-)
            </span>
            <button onClick={() => setJustJoined(false)}
              className="text-muted hover:text-white ml-2 shrink-0">✕</button>
          </div>
        )}

        {/* 旁观者切换提示（duel 模式不显示加入战斗按钮） */}
        {isDuelMode && (() => {
          const spectators = players.filter(p => (p as any).role !== 'duel_p1' && (p as any).role !== 'duel_p2')
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
            style={{ background: 'rgba(var(--accent-primary),0.08)', borderBottom: '1px solid rgba(var(--accent-primary),0.15)' }}>
            <span className="text-gold/80">
              👁 你当前是旁观者，无法抢牌
            </span>
            <button
              onClick={async () => {
                try {
                  await api.rooms.spectate(roomId, false)
                  setIsSpectator(false)
                  setPlayers(prev => prev.map(p => p.user_id === user?.id ? { ...p, role: 'player' } : p))
                  showToast('⚔️ 已加入战斗！下一首可以抢了！', 'success')
                } catch { /* ignore */ }
              }}
              className="px-3 py-1 rounded text-xs font-medium transition-all hover:scale-105"
              style={{ background: 'rgba(var(--accent-primary),0.2)', border: '1px solid rgba(var(--accent-primary),0.4)', color: 'var(--color-gold)' }}>
              ⚔️ 加入战斗！
            </button>
          </div>
        )}

        {/* 控制栏 */}
        <div className="flex items-center gap-3 px-4 py-2"
          style={{ background: 'rgba(var(--accent-bg-mid),0.6)', borderBottom: '1px solid rgba(var(--accent-primary),0.08)' }}>
          {/* 连接状态 */}
          <div className="flex items-center gap-1.5">
            <motion.div animate={{ opacity: connected ? 1 : [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: connected ? 0 : Infinity }}
              className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-crimson'}`} />
            <span className="text-white/30 text-xs">{connected ? '已连接' : '重连中…'}</span>
          </div>

          {/* 房间码 */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
            style={{ background: 'rgba(var(--accent-primary),0.05)', border: '1px solid rgba(var(--accent-primary),0.1)' }}>
            <span className="text-white/30 text-xs">房间</span>
            <span className="text-gold/80 font-serif text-xs font-bold tracking-widest">{roomState.room.code}</span>
          </div>

          <div className="flex-1" />

          {/* 房主控制 */}
          {isHost && (
            <motion.button onClick={handlePauseResume} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: isPaused ? 'rgba(var(--accent-primary),0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isPaused ? 'rgba(var(--accent-primary),0.4)' : 'rgba(255,255,255,0.08)'}`, color: isPaused ? 'var(--color-gold)' : 'rgba(255,255,255,0.5)' }}>
              {isPaused ? '▶ 继续战斗！' : '⏸ 暂停'}
            </motion.button>
          )}
          {isHost && (
            <motion.button
              onClick={() => api.rooms.nextCard(roomId).catch(() => null)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.25)', color: 'rgba(255,165,0,0.8)' }}
              title="跳过当前牌，直接下一首">
              ⏭ 跳过
            </motion.button>
          )}
          {isHost ? (
            <motion.button onClick={handleCloseRoom} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)', color: 'rgba(192,57,43,0.7)' }}>
              解散战场
            </motion.button>
          ) : (
            <motion.button onClick={handleLeaveRoom} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
              溜了 (｀・ω・´)
            </motion.button>
          )}
          {/* aryuu 专属：强制结束对局 */}
          {user?.is_admin && (
            <motion.button
              onClick={async () => {
                if (!confirm('强制结束本场对局？')) return
                await api.rooms.forceEnd(roomId).catch(() => null)
              }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 rounded-lg text-xs transition-all ml-1"
              style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.35)', color: 'rgba(255,165,0,0.9)' }}>
              ⚡ 强制结束
            </motion.button>
          )}
          {/* 跳到结算画面（调试用） */}
          {(isHost || user?.is_admin) && gameStatus === 'reading' && (
            <motion.button
              onClick={() => {
                if (!confirm('跳过剩余对局，直接进入结算画面？')) return
                // 生成模拟的结算数据
                const mockResults: GameResult[] = players
                  .filter(p => p.role === 'player')
                  .map((p, idx) => ({
                    user_id: p.user_id,
                    username: p.username,
                    score: p.score,
                    rank: idx + 1,
                    penalty_count: 0,
                    grabbed_cards: [],
                  }))
                  .sort((a, b) => b.score - a.score)
                  .map((r, idx) => ({ ...r, rank: idx + 1 }))
                setGameResults(mockResults)
                setGameStatus('end')
              }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 rounded-lg text-xs transition-all ml-1"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', color: 'rgba(139,92,246,0.9)' }}>
              🏁 跳到结算
            </motion.button>
          )}
        </div>

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
            <span className="text-gold/60 font-serif animate-pulse">等待对阵初始化… (｡･ω･｡)</span>
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

        {/* 移动端底部计分条 */}
        {!isDuelMode && (
          <div className="md:hidden"
            style={{ background: 'rgba(var(--accent-bg-mid),0.9)', borderTop: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <div className="flex overflow-x-auto gap-1 px-3 py-2">
              {[...players]
                .filter(p => !(isJudgeMode && p.user_id === roomState.room.host_id))
                .sort((a, b) => b.score - a.score).map((p, i) => {
                const medals = ['🥇','🥈','🥉']
                const isMe = p.user_id === user?.id
                return (
                  <div key={p.user_id}
                    className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg"
                    style={{ background: isMe ? 'rgba(var(--accent-primary),0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isMe ? 'rgba(var(--accent-primary),0.2)' : 'rgba(255,255,255,0.04)'}` }}>
                    <span className="text-xs">{medals[i] ?? `${i+1}.`}</span>
                    <span className={`text-xs ${isMe ? 'text-gold font-medium' : 'text-white/60'} ${!p.online ? 'opacity-40' : ''}`}>
                      {p.username}
                    </span>
                    <motion.span key={`${p.user_id}-${p.score}`}
                      initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}
                      className="text-xs font-bold tabular-nums"
                      style={{ color: isMe ? 'var(--color-gold)' : 'rgba(255,255,255,0.4)' }}>
                      {p.score}
                    </motion.span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Duel 轮次/倒计时信息 */}
        {isDuelMode && duelState && (
          <div className="flex items-center justify-center gap-4 px-4 py-1.5"
            style={{ background: 'rgba(var(--accent-bg-mid),0.8)', borderTop: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <span className="text-muted text-xs">第 {duelRound} 轮</span>
            {duelRoundTimer !== null && (
              <motion.span
                key={duelRoundTimer}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className={`text-sm font-bold tabular-nums ${duelRoundTimer <= 5 ? 'text-crimson' : 'text-gold/80'}`}
              >
                {duelRoundTimer}s
              </motion.span>
            )}
            <span className="text-muted text-xs">
              {duelState.player1.id === (user?.id ?? 0) ? duelState.p1_count : duelState.p2_count} 张 vs {duelState.player1.id === (user?.id ?? 0) ? duelState.p2_count : duelState.p1_count} 张
            </span>
          </div>
        )}

        {/* Duel 给牌弹窗 */}
        {duelGiveCards && duelGiveCards.length > 0 && (
          <DuelGiveModal cards={duelGiveCards} onGive={handleDuelGive} />
        )}

        {/* Toast 反馈 */}
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              transition={{ duration: 0.25, ease: 'backOut' }}
              className="fixed bottom-20 md:top-24 md:bottom-auto left-1/2 -translate-x-1/2 z-50 pointer-events-none"
              style={{ minWidth: '180px', maxWidth: '280px' }}>
              <div className={[
                'px-5 py-3 rounded-2xl text-sm font-medium text-center shadow-2xl backdrop-blur-md',
                toast.type === 'success'
                  ? 'border border-gold/50 text-white'
                  : toast.type === 'fail'
                  ? 'border border-crimson/50 text-white'
                  : 'border border-white/10 text-white/80',
              ].join(' ')}
                style={{
                  background: toast.type === 'success'
                    ? 'linear-gradient(135deg, rgba(var(--glow-color),0.3), rgba(var(--accent-primary),0.2))'
                    : toast.type === 'fail'
                    ? 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(231,76,60,0.2))'
                    : 'rgba(var(--accent-bg-mid),0.85)',
                  boxShadow: toast.type === 'success'
                    ? '0 0 30px rgba(var(--accent-primary),0.3), 0 8px 24px rgba(0,0,0,0.5)'
                    : toast.type === 'fail'
                    ? '0 0 30px rgba(192,57,43,0.3), 0 8px 24px rgba(0,0,0,0.5)'
                    : '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                {toast.text}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
        {shuffleBlocking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12 }}
              className="text-center"
            >
              <span className="text-5xl sm:text-7xl font-bold font-serif text-gold"
                style={{ textShadow: '0 0 40px rgba(var(--accent-primary),0.6)' }}>
                🌀 打乱！
              </span>
            </motion.div>
          </motion.div>
        )}

      </div>
    </Layout>
  )
}
