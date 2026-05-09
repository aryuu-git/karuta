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
import { useRoomSocket } from '../hooks/useRoomSocket'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { RoomState, Card, RoomPlayer, WSEvent } from '../api/types'

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

  // 牌面打乱：cardRemaining 变化时检查是否需要打乱
  const shuffleThreshold = roomState?.room?.shuffle_remaining ?? 0
  const prevRemainingRef = useRef<number>(-1)
  useEffect(() => {
    if (shuffleThreshold <= 0 || cards.length === 0) return
    const boardCount = cards.filter(c => (cardRemaining.get(c.id) ?? c.audio_count ?? 1) > 0).length
    // 只在 boardCount 发生变化且 <= 阈值时打乱（避免初始化时打乱）
    if (boardCount <= shuffleThreshold && prevRemainingRef.current !== boardCount && prevRemainingRef.current >= 0) {
      setCards(prev => {
        const shuffled = [...prev]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
      })
    }
    prevRemainingRef.current = boardCount
  }, [cardRemaining, shuffleThreshold, cards.length])

  // 等待大厅阶段预加载所有封面图和音频
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

    let loaded = 0
    const tick = () => {
      loaded++
      setPreloadProgress({ loaded, total: items.length })
    }

    items.forEach(item => {
      if (item.type === 'image') {
        const img = new Image()
        img.onload = tick
        img.onerror = tick
        img.src = item.url
      } else {
        const audio = new Audio()
        audio.addEventListener('canplaythrough', tick, { once: true })
        audio.addEventListener('error', tick, { once: true })
        audio.preload = 'auto'
        audio.src = item.url
        audio.load()
      }
    })
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
        setCurrentReading({ cardId: event.card_id, cardAudioId: event.card_audio_id ?? 0, audioUrl: event.audio_url, hintText: event.hint_text, startRatio: event.start_ratio })
        setIsJudgeWaiting(false)
        setIsPaused(false)
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
            // 重连，恢复 online 状态
            return prev.map(p => p.user_id === event.user_id ? { ...p, online: true } : p)
          }
          showToast(`👋 ${event.username} 加入了战场！`, 'info')
          return [...prev, { room_id: roomId, user_id: event.user_id, username: event.username, role: 'player', score: 0, online: true }]
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
    }
  }, [user, roomId, playSound, showToast, navigate])

  const { send, connected } = useRoomSocket(roomId, handleEvent)

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
        />
        <ChatRoom messages={chatMessages} players={players} currentUserId={user?.id ?? 0}
          isSpectator={isSpectator} onSend={handleChatSend} onEgg={handleEgg} />
        <EggAnimation event={eggEvent} />
      </div>
    </Layout>
  )

  const isHost = roomState.room.host_id === user?.id
  const isJudgeMode = roomState.room.mode === 'judge'
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

        {/* 旁观者切换提示 */}
        {isSpectator && (
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
          {user?.username === 'aryuu' && (
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
        </div>

        {/* 主体 */}
        {isJudgeMode && isHost ? (
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

      </div>
    </Layout>
  )
}
