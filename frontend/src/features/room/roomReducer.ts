import type { Card, RoomState, RoomPlayer } from '../../api/types'
import type { GameResult } from './types'

/** 当前正在读的牌（读牌区展示契约） */
export interface CurrentReading {
  cardId: number
  cardAudioId: number
  audioUrl: string
  hintText: string
  startRatio?: number
}

/** 废牌堆条目 */
export interface DiscardEntry {
  cardId: number
  winner: string
  hintText: string
}

/**
 * 房间对局核心状态（重构 R3：原 RoomPage 的 22 个平行 useState 收敛）。
 * 本状态由纯 reducer 驱动；副作用（toast/音效/定时器/WS）全部留在 useRoomGame。
 */
export interface RoomGameState {
  /** 服务端房间快照（配置 + players 初始值） */
  roomState: RoomState | null
  loading: boolean
  error: string | null
  /** 错误分类码（如 NOT_IN_ROOM：已登录但非房间成员，与"房间不存在"语义不同） */
  errorCode: string | null
  /** 对局状态：waiting / reading / paused / end */
  status: string
  players: RoomPlayer[]
  /** 牌面展示顺序（初始化时打乱一次，之后固定，不跟随服务端顺序） */
  cards: Card[]
  /** 打乱后的 id 顺序（保持跨快照稳定） */
  displayOrder: number[]
  /** 每张牌剩余可抢次数 */
  cardRemaining: Map<number, number>
  discardPile: DiscardEntry[]
  currentReading: CurrentReading | null
  isPaused: boolean
  isLastCard: boolean
  isJudgeWaiting: boolean
  isSpectator: boolean
  /** 刚加入进行中的对局（本首结束后才可参与抢牌） */
  justJoined: boolean
  /** 我在本首的回合状态（StatusStrip 派生源）：idle=可抢 / claimed=已抢到 / banned=本首出局 */
  myRoundStatus: 'idle' | 'claimed' | 'banned'
  /** 开局倒计时数字 */
  countdown: number | null
  /** 间隔倒计时显示值 */
  intervalCountdown: number | null
  /** 间隔倒计时剩余秒数（暂停冻结语义依赖此值） */
  intervalRemaining: number
  gameResults: GameResult[] | null
  lastCardWinnerId: number | null
  totalCardCount: number
  /** 下一首开始前需要打乱牌面 */
  shufflePending: boolean
  /** 打乱进行中的短暂遮罩 */
  shuffleBlocking: boolean
}

export function createInitialRoomState(): RoomGameState {
  return {
    roomState: null,
    loading: true,
    error: null,
    errorCode: null,
    status: 'waiting',
    players: [],
    cards: [],
    displayOrder: [],
    cardRemaining: new Map(),
    discardPile: [],
    currentReading: null,
    isPaused: false,
    isLastCard: false,
    isJudgeWaiting: false,
    isSpectator: false,
    justJoined: false,
    myRoundStatus: 'idle',
    countdown: null,
    intervalCountdown: null,
    intervalRemaining: 0,
    gameResults: null,
    lastCardWinnerId: null,
    totalCardCount: 0,
    shufflePending: false,
    shuffleBlocking: false,
  }
}

export type RoomAction =
  | { type: 'init'; state: RoomState; userId: number }
  | { type: 'load_error'; message: string; code?: string }
  | { type: 'room_state'; state: RoomState }
  | { type: 'set_countdown'; count: number }
  | { type: 'clear_countdown' }
  | { type: 'card_start'; cardId: number; cardAudioId: number; audioUrl: string; hintText: string; startRatio?: number; isLast: boolean }
  | { type: 'card_claimed'; cardId: number; remaining: number; winnerName: string; hintText: string }
  | { type: 'card_missed'; cardId: number; remaining: number }
  | { type: 'card_exhausted'; cardId: number }
  | { type: 'score_update'; scores: Array<{ user_id: number; score: number }> }
  | { type: 'game_over'; results: GameResult[]; lastCardWinnerId?: number }
  | { type: 'set_paused'; paused: boolean }
  | { type: 'player_joined'; roomId: number; userId: number; username: string; avatarUrl?: string; role?: string }
  | { type: 'player_offline'; userId: number }
  | { type: 'set_judge_waiting' }
  | { type: 'set_reading'; reading: CurrentReading | null }
  | { type: 'interval_start'; seconds: number }
  | { type: 'interval_tick' }
  | { type: 'interval_clear' }
  | { type: 'mark_shuffle_pending' }
  | { type: 'shuffle_unblock' }
  | { type: 'set_my_round_status'; value: 'idle' | 'claimed' | 'banned' }
  | { type: 'set_spectator'; value: boolean }
  | { type: 'set_player_role'; userId: number; role: string }
  | { type: 'remove_player'; userId: number }
  | { type: 'set_online'; userId: number; online: boolean }
  | { type: 'debug_end'; results: GameResult[] }

/** 打乱牌面顺序并落定展示 id 序列（已有顺序则按存储顺序还原） */
function orderCards(cards: Card[], displayOrder: number[]): Pick<RoomGameState, 'cards' | 'displayOrder'> {
  if (displayOrder.length === cards.length) {
    const idxMap = new Map(cards.map(c => [c.id, c]))
    return { cards: displayOrder.map(id => idxMap.get(id)!).filter(Boolean), displayOrder }
  }
  const arr = [...cards]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return { cards: arr, displayOrder: arr.map(c => c.id) }
}

/** 从服务端快照恢复牌面剩余次数 */
function buildRemaining(cards: Card[]): Map<number, number> {
  const rm = new Map<number, number>()
  cards.forEach(c => rm.set(c.id, c.remaining ?? c.audio_count ?? 1))
  return rm
}

/** 从服务端快照恢复废牌堆 */
function buildDiscardPile(state: RoomState): DiscardEntry[] {
  return (state.grabbed_cards ?? []).map(g => ({
    cardId: g.card_id,
    winner: g.winner_name || '无人',
    hintText: g.hint_text || '',
  }))
}

/**
 * 房间对局纯 reducer：WS 事件与本地动作 → 状态迁移。
 * 不变量：
 * - cards 展示顺序只由 orderCards 决定，displayOrder 一旦建立即保持稳定；
 * - currentReading 仅在 card_start/手动设置时出现，card_claimed/missed/结束时清空；
 * - intervalRemaining 暂停时冻结（set_paused 不清零，恢复后继续递减）。
 */
export function roomReducer(state: RoomGameState, action: RoomAction): RoomGameState {
  switch (action.type) {
    case 'init': {
      const s = action.state

      // 竞态防御：重连时 hub 会立即向新连接推送 room_state，可能先于 REST 快照到达。
      // 棋盘投影（cards/displayOrder/cardRemaining/discardPile）以先落定的权威数据为准：
      // 已有投影时 init 只补齐元信息，绝不用 REST 值重排牌面或重算剩余次数
      // （否则已抢的牌会"复活"，且牌面顺序被重新打乱）。
      if (state.roomState !== null) {
        const me = (s.players ?? []).find(p => p.user_id === action.userId)
        return {
          ...state,
          roomState: s,
          loading: false,
          players: s.players ?? state.players,
          status: s.room.status,
          isPaused: s.room.status === 'paused',
          justJoined: s.room.status === 'reading' || s.room.status === 'paused',
          isSpectator: me?.role === 'spectator' || state.isSpectator,
          totalCardCount: s.cards?.length ?? state.totalCardCount,
        }
      }

      const ordered = s.cards?.length ? orderCards(s.cards, []) : { cards: [], displayOrder: [] }
      const me = (s.players ?? []).find(p => p.user_id === action.userId)
      return {
        ...state,
        roomState: s,
        loading: false,
        players: s.players ?? [],
        status: s.room.status,
        isPaused: s.room.status === 'paused',
        justJoined: s.room.status === 'reading' || s.room.status === 'paused',
        isSpectator: me?.role === 'spectator',
        ...ordered,
        totalCardCount: s.cards?.length ?? 0,
        cardRemaining: s.cards?.length ? buildRemaining(s.cards) : new Map(),
        discardPile: buildDiscardPile(s),
      }
    }

    case 'load_error':
      return { ...state, loading: false, error: action.message, errorCode: action.code ?? null }

    case 'room_state': {
      const s = action.state
      // 合并 online 状态：快照 online=true 采用，false 时保留本地状态，避免重连时序误显示离线
      const players = (s.players ?? []).map(np => {
        const existing = state.players.find(p => p.user_id === np.user_id)
        return { ...np, online: np.online ? true : (existing?.online ?? false) }
      })
      const ordered = s.cards?.length ? orderCards(s.cards, state.displayOrder) : { cards: state.cards, displayOrder: state.displayOrder }
      return {
        ...state,
        roomState: s,
        players,
        status: s.room.status,
        ...(s.cards?.length ? ordered : {}),
        totalCardCount: s.cards?.length ?? state.totalCardCount,
        cardRemaining: s.cards?.length ? buildRemaining(s.cards) : state.cardRemaining,
        discardPile: s.grabbed_cards?.length ? buildDiscardPile(s) : state.discardPile,
        isJudgeWaiting: s.judge_waiting ? true : state.isJudgeWaiting,
      }
    }

    case 'set_countdown':
      return { ...state, countdown: action.count }

    case 'clear_countdown':
      return { ...state, countdown: null }

    case 'card_start': {
      // 有待执行的打乱：先打乱再开始（打乱完立即可抢，遮罩仅短暂提示）
      const shuffled = state.shufflePending
        ? (() => {
            const arr = [...state.cards]
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[arr[i], arr[j]] = [arr[j], arr[i]]
            }
            return arr
          })()
        : state.cards
      return {
        ...state,
        cards: shuffled,
        displayOrder: shuffled.map(c => c.id),
        shufflePending: false,
        shuffleBlocking: state.shufflePending ? true : state.shuffleBlocking,
        intervalCountdown: null,
        intervalRemaining: 0,
        justJoined: false,
        isLastCard: action.isLast,
        isJudgeWaiting: false,
        isPaused: false,
        currentReading: {
          cardId: action.cardId,
          cardAudioId: action.cardAudioId,
          audioUrl: action.audioUrl,
          hintText: action.hintText,
          startRatio: action.startRatio,
        },
      }
    }

    case 'card_claimed':
      return {
        ...state,
        cardRemaining: new Map(state.cardRemaining).set(action.cardId, action.remaining),
        discardPile: [...state.discardPile, { cardId: action.cardId, winner: action.winnerName, hintText: action.hintText }],
        currentReading: null,
      }

    case 'card_missed':
      return {
        ...state,
        cardRemaining: new Map(state.cardRemaining).set(action.cardId, action.remaining),
        discardPile: [...state.discardPile, { cardId: action.cardId, winner: '无人', hintText: '' }],
        currentReading: null,
      }

    case 'card_exhausted':
      return { ...state, cardRemaining: new Map(state.cardRemaining).set(action.cardId, 0) }

    case 'score_update':
      return {
        ...state,
        players: state.players.map(p => {
          const u = action.scores.find(s => s.user_id === p.user_id)
          return u ? { ...p, score: u.score } : p
        }),
      }

    case 'game_over':
      return {
        ...state,
        status: 'end',
        gameResults: action.results,
        lastCardWinnerId: action.lastCardWinnerId ?? null,
      }

    case 'set_paused':
      return {
        ...state,
        isPaused: action.paused,
        status: action.paused ? 'paused' : 'reading',
        roomState: state.roomState
          ? { ...state.roomState, room: { ...state.roomState.room, status: action.paused ? 'paused' : 'reading' } }
          : null,
      }

    case 'player_joined': {
      const existing = state.players.find(p => p.user_id === action.userId)
      if (existing) {
        return {
          ...state,
          players: state.players.map(p =>
            p.user_id === action.userId ? { ...p, online: true, role: action.role || p.role } : p),
        }
      }
      return {
        ...state,
        players: [...state.players, {
          room_id: action.roomId,
          user_id: action.userId,
          username: action.username,
          avatar_url: action.avatarUrl,
          role: action.role || 'player',
          score: 0,
          online: true,
        }],
      }
    }

    case 'player_offline':
      // 标记为离线而非删除，保留分数展示
      return {
        ...state,
        players: state.players.map(p =>
          p.user_id === action.userId ? { ...p, online: false } : p),
      }

    case 'set_judge_waiting':
      return { ...state, isJudgeWaiting: true, currentReading: null }

    case 'set_reading':
      return { ...state, currentReading: action.reading }

    case 'interval_start':
      return { ...state, intervalRemaining: action.seconds, intervalCountdown: action.seconds }

    case 'interval_tick': {
      const remaining = state.intervalRemaining - 1
      if (remaining <= 0) {
        return { ...state, intervalRemaining: 0, intervalCountdown: null }
      }
      return { ...state, intervalRemaining: remaining, intervalCountdown: remaining }
    }

    case 'interval_clear':
      return { ...state, intervalCountdown: null, intervalRemaining: 0 }

    case 'mark_shuffle_pending':
      return { ...state, shufflePending: true }

    case 'shuffle_unblock':
      return { ...state, shuffleBlocking: false }

    case 'set_my_round_status':
      return { ...state, myRoundStatus: action.value }

    case 'set_spectator':
      return { ...state, isSpectator: action.value }

    case 'set_player_role':
      return {
        ...state,
        players: state.players.map(p =>
          p.user_id === action.userId ? { ...p, role: action.role } : p),
      }

    case 'remove_player':
      return { ...state, players: state.players.filter(p => p.user_id !== action.userId) }

    case 'set_online':
      return {
        ...state,
        players: state.players.map(p =>
          p.user_id === action.userId ? { ...p, online: action.online } : p),
      }

    case 'debug_end':
      return { ...state, gameResults: action.results, status: 'end' }
  }
}
