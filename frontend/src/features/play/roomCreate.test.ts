// roomCreate 回归测试：固化 createRoomFromConfig 的对象字段映射
// （2026-09-21 位置参数→对象参数化，防止未来字段漂移）与 localStorage 读写容错。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoomFromConfig, readLastConfig, writeLastConfig, inviteLink } from './roomCreate'
import { defaultRoomConfig, type RoomConfig } from './roomConfig'
import { api } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: { rooms: { create: vi.fn(() => Promise.resolve({ id: 7 })) } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  // node 环境无 localStorage/window：按测试需要 stub
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  vi.stubGlobal('window', { location: { origin: 'https://karuta.example' } })
})

describe('createRoomFromConfig 参数映射', () => {
  it('标准模式：对象字段逐位对齐 api.rooms.create 请求体', async () => {
    const config: RoomConfig = {
      ...defaultRoomConfig,
      intervalSec: 8,
      mode: 'auto',
      maskEnabled: true,
      maskDifficulty: 'hard',
      penaltyWrong: true,
      penaltySlow: true,
      shuffleEnabled: true,
      shuffleRemaining: 6,
      randomStart: true,
      randomStartMax: 40,
      penaltyLast: 3,
      training: true,
      minPlayTime: 10,
      multiAudioMode: 'once',
      isPrivate: true,
      maxPlayers: 12,
    }
    await createRoomFromConfig(55, config)
    expect(api.rooms.create).toHaveBeenCalledWith({
      deck_id: 55,
      interval_sec: 8,
      mode: 'auto',
      mask_enabled: true,
      mask_difficulty: 'hard',
      penalty_wrong: true,
      penalty_slow: true,
      shuffle_remaining: 6,
      random_start: true,
      random_start_max: 40,
      penalty_last: 3,
      training: true,
      min_play_time: 10,
      multi_audio_mode: 'once',
      is_private: true,
      max_players: 12,
      duel: undefined,
    })
  })

  it('shuffle 关闭时 remaining 归零（对齐原 NewRoomPage 三元语义）', async () => {
    await createRoomFromConfig(1, { ...defaultRoomConfig, shuffleEnabled: false, shuffleRemaining: 6 })
    expect(api.rooms.create).toHaveBeenCalledWith(expect.objectContaining({ shuffle_remaining: 0 }))
  })

  it('duel 模式组装 duel 七字段，非 duel 不带 duel 键值', async () => {
    const config: RoomConfig = {
      ...defaultRoomConfig,
      mode: 'duel',
      duelTotalCards: 30,
      duelFlip: false,
      duelRequeue: false,
      duelMaxRounds: 9,
      duelRoundTime: 45,
      duelGrabChances: 2,
      duelArrangeTime: 90,
    }
    await createRoomFromConfig(2, config)
    expect(api.rooms.create).toHaveBeenCalledWith(expect.objectContaining({
      deck_id: 2,
      mode: 'duel',
      duel: { total_cards: 30, flip: false, requeue: false, max_rounds: 9, round_time: 45, grab_chances: 2, arrange_time: 90 },
    }))
    await createRoomFromConfig(2, { ...defaultRoomConfig, mode: 'auto' })
    expect(api.rooms.create).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'auto', duel: undefined }))
  })
})

describe('last-config 持久化容错', () => {
  it('写后可读回完整配置', () => {
    writeLastConfig({ ...defaultRoomConfig, intervalSec: 9 })
    expect(readLastConfig()?.intervalSec).toBe(9)
  })

  it('无记录返回 null（PresetPicker 据此隐藏整行）', () => {
    expect(readLastConfig()).toBeNull()
  })

  it('损坏 JSON 返回 null 不抛错', () => {
    localStorage.setItem('karuta_last_room_config', '{broken')
    expect(readLastConfig()).toBeNull()
  })
})

describe('inviteLink', () => {
  it('拼接 origin 与邀请码', () => {
    expect(inviteLink('ABC123')).toBe('https://karuta.example/rooms/join?code=ABC123')
  })
})
