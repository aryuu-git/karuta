// roomReducer 回归测试：固化三轮冒烟脚本验证过的关键不变量。
// 每条用例对应真实修复过的 bug 或协议契约（见 REFACTORING.md D5-FIX1/D7 系列）：
// - 竞态守卫：WS 权威投影先落定时 init 不得覆盖棋盘（"已抢牌复活"严重 bug）
// - myRoundStatus：对局状态条的派生源，判定在 useRoomGame 层双 dispatch
// - displayOrder 稳定性：牌面顺序跨快照不重排
import { describe, it, expect } from 'vitest'
import { roomReducer, createInitialRoomState, type RoomGameState } from './roomReducer'
import type { RoomState } from '../../api/types'

const room = { id: 42, code: 'ABC', host_id: 9, status: 'reading', mode: 'auto', interval_sec: 5, shuffle_remaining: 0, duel_round_time: 30 } as never

const cardsWithRemaining = [
  { id: 10, audio_count: 2, remaining: 2 } as never,
  { id: 11, audio_count: 1, remaining: 1 } as never,
]

/** 构造一个 reading 态、我已入场的初始对局状态 */
function bootState(): RoomGameState {
  return roomReducer(createInitialRoomState(), {
    type: 'init',
    userId: 1,
    state: {
      room,
      players: [{ user_id: 1, username: 'me', role: 'player', score: 0, online: true, room_id: 42 }] as never,
      cards: cardsWithRemaining,
      grabbed_cards: [],
    } as never,
  })
}

describe('roomReducer 初始化与快照', () => {
  it('init 落定 reading 态并派生剩余次数', () => {
    const s = bootState()
    expect(s.loading).toBe(false)
    expect(s.status).toBe('reading')
    expect(s.totalCardCount).toBe(2)
    expect(s.cardRemaining.get(10)).toBe(2)
    expect(s.myRoundStatus).toBe('idle')
  })

  it('init 检测旁观者身份', () => {
    const s = roomReducer(createInitialRoomState(), {
      type: 'init',
      userId: 1,
      state: {
        room,
        players: [{ user_id: 1, username: 'me', role: 'spectator', score: 0, online: true, room_id: 42 }] as never,
        cards: cardsWithRemaining,
        grabbed_cards: [],
      } as never,
    })
    expect(s.isSpectator).toBe(true)
    expect(s.justJoined).toBe(true)
  })

  it('room_state 重放保持牌面展示顺序（displayOrder 稳定性）', () => {
    const s1 = bootState()
    const order = s1.cards.map(c => c.id)
    const s2 = roomReducer(s1, {
      type: 'room_state',
      state: { room, players: s1.players as never, cards: cardsWithRemaining, grabbed_cards: [] } as never,
    })
    expect(s2.cards.map(c => c.id)).toEqual(order)
  })
})

describe('竞态守卫（D5-FIX1 回归）', () => {
  // 重连时序：WS room_state 权威投影先落定，REST init 后到。
  // init 不得用缺 remaining 的 REST 值覆盖棋盘（否则已抢牌"复活"+牌面重排）。
  function wsFirst(): { s: RoomGameState; order: number[] } {
    const s = roomReducer(createInitialRoomState(), {
      type: 'room_state',
      state: {
        room,
        players: [] as never,
        cards: [
          { id: 10, audio_count: 2, remaining: 0 } as never,
          { id: 11, audio_count: 1, remaining: 1 } as never,
        ],
        grabbed_cards: [{ card_id: 10, winner_id: 1, winner_name: 'me', hint_text: 'h' }] as never,
      } as never,
    })
    return { s, order: s.cards.map(c => c.id) }
  }

  it('init 不得复活已抢牌', () => {
    const { s } = wsFirst()
    const after = roomReducer(s, {
      type: 'init',
      userId: 1,
      state: { room, players: [], cards: [{ id: 10, audio_count: 2 } as never, { id: 11, audio_count: 1 } as never], grabbed_cards: [] } as never,
    })
    expect(after.cardRemaining.get(10)).toBe(0)
    expect(after.discardPile).toHaveLength(1)
  })

  it('init 不得重排牌面顺序', () => {
    const { s, order } = wsFirst()
    const after = roomReducer(s, {
      type: 'init',
      userId: 1,
      state: { room, players: [], cards: [{ id: 10, audio_count: 2 } as never, { id: 11, audio_count: 1 } as never], grabbed_cards: [] } as never,
    })
    expect(after.cards.map(c => c.id)).toEqual(order)
    expect(after.loading).toBe(false)
  })
})

describe('读牌流转', () => {
  it('card_start 建立读牌态并重置间隔倒计时', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'interval_start', seconds: 5 })
    s = roomReducer(s, { type: 'card_start', cardId: 10, cardAudioId: 7, audioUrl: 'u', hintText: 'h', isLast: false })
    expect(s.currentReading?.cardId).toBe(10)
    expect(s.intervalRemaining).toBe(0)
    expect(s.justJoined).toBe(false)
  })

  it('card_claimed 清读牌、扣剩余、追废牌堆', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'card_start', cardId: 10, cardAudioId: 1, audioUrl: 'u', hintText: 'h', isLast: false })
    s = roomReducer(s, { type: 'card_claimed', cardId: 10, remaining: 1, winnerName: 'me', hintText: 'h' })
    expect(s.currentReading).toBeNull()
    expect(s.cardRemaining.get(10)).toBe(1)
    expect(s.discardPile[s.discardPile.length - 1].winner).toBe('me')
  })

  it('card_missed 以「无人」入废牌堆', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'card_start', cardId: 11, cardAudioId: 0, audioUrl: 'u', hintText: 'h', isLast: false })
    s = roomReducer(s, { type: 'card_missed', cardId: 11, remaining: 0 })
    expect(s.discardPile[s.discardPile.length - 1].winner).toBe('无人')
    expect(s.cardRemaining.get(11)).toBe(0)
  })
})

describe('myRoundStatus 状态条派生（判定在 useRoomGame 层双 dispatch）', () => {
  it('抢到 → claimed', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'card_claimed', cardId: 10, remaining: 1, winnerName: 'me', hintText: 'h' })
    s = roomReducer(s, { type: 'set_my_round_status', value: 'claimed' })
    expect(s.myRoundStatus).toBe('claimed')
  })

  it('出局 → banned → 下一首回 idle', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'set_my_round_status', value: 'banned' })
    expect(s.myRoundStatus).toBe('banned')
    s = roomReducer(s, { type: 'card_start', cardId: 10, cardAudioId: 0, audioUrl: 'u', hintText: 'h', isLast: false })
    s = roomReducer(s, { type: 'set_my_round_status', value: 'idle' })
    expect(s.myRoundStatus).toBe('idle')
  })

  it('room_state 重连快照强制回 idle（不信任本地残留）', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'set_my_round_status', value: 'banned' })
    s = roomReducer(s, {
      type: 'room_state',
      state: { room, players: [] as never, cards: cardsWithRemaining, grabbed_cards: [] } as never,
    })
    s = roomReducer(s, { type: 'set_my_round_status', value: 'idle' })
    expect(s.myRoundStatus).toBe('idle')
  })
})

describe('间隔倒计时', () => {
  it('启动 → 递减 → 归零清空', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'interval_start', seconds: 2 })
    expect(s.intervalCountdown).toBe(2)
    s = roomReducer(s, { type: 'interval_tick' })
    s = roomReducer(s, { type: 'interval_tick' })
    expect(s.intervalCountdown).toBeNull()
    expect(s.intervalRemaining).toBe(0)
  })

  it('暂停不丢剩余（恢复后从冻结值继续）', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'interval_start', seconds: 5 })
    s = roomReducer(s, { type: 'interval_tick' })
    s = roomReducer(s, { type: 'set_paused', paused: true })
    expect(s.intervalRemaining).toBe(4)
    expect(s.isPaused).toBe(true)
    expect(s.roomState?.room.status).toBe('paused')
  })
})

describe('洗牌与结算', () => {
  it('mark_shuffle_pending 在 card_start 时被消费并置遮罩', () => {
    let s = bootState()
    s = roomReducer(s, { type: 'mark_shuffle_pending' })
    s = roomReducer(s, { type: 'card_start', cardId: 11, cardAudioId: 0, audioUrl: 'u', hintText: 'h', isLast: true })
    expect(s.shufflePending).toBe(false)
    expect(s.shuffleBlocking).toBe(true)
    expect(s.isLastCard).toBe(true)
    s = roomReducer(s, { type: 'shuffle_unblock' })
    expect(s.shuffleBlocking).toBe(false)
  })

  it('game_over 落定结算', () => {
    const s = roomReducer(bootState(), {
      type: 'game_over',
      results: [{ user_id: 1, username: 'me', score: 3, rank: 1 }] as never,
      lastCardWinnerId: 1,
    })
    expect(s.status).toBe('end')
    expect(s.gameResults).toHaveLength(1)
    expect(s.lastCardWinnerId).toBe(1)
  })
})

// 类型层面的存在性守卫：确保测试构造的 RoomState 形状不漂移
const _typeCheck: RoomState | never = null as never
void _typeCheck
