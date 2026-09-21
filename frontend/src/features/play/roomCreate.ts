import { api } from '../../api/client'
import type { Room } from '../../api/types'
import type { RoomConfig } from './roomConfig'

/** 「上次配置」持久化键（§4.2：创建成功时写入） */
const LAST_CONFIG_KEY = 'karuta_last_room_config'

/**
 * 按建房配置组装参数创建房间。
 * 从 NewRoomPage 的提交逻辑抽出，供自定义建房与预设快开两条动线复用（P0）。
 */
export function createRoomFromConfig(deckId: number, config: RoomConfig): Promise<Room> {
  return api.rooms.create({
    deck_id: deckId,
    interval_sec: config.intervalSec,
    mode: config.mode,
    mask_enabled: config.maskEnabled,
    mask_difficulty: config.maskDifficulty,
    penalty_wrong: config.penaltyWrong,
    penalty_slow: config.penaltySlow,
    shuffle_remaining: config.shuffleEnabled ? config.shuffleRemaining : 0,
    random_start: config.randomStart,
    random_start_max: config.randomStartMax,
    penalty_last: config.penaltyLast,
    training: config.training,
    min_play_time: config.minPlayTime,
    multi_audio_mode: config.multiAudioMode,
    is_private: config.isPrivate,
    max_players: config.maxPlayers,
    duel: config.mode === 'duel' ? {
      total_cards: config.duelTotalCards,
      flip: config.duelFlip,
      requeue: config.duelRequeue,
      max_rounds: config.duelMaxRounds,
      round_time: config.duelRoundTime,
      grab_chances: config.duelGrabChances,
      arrange_time: config.duelArrangeTime,
    } : undefined,
  })
}

/** 读取上次建房配置；无记录或解析失败返回 null（PresetPicker 据此隐藏整行） */
export function readLastConfig(): RoomConfig | null {
  try {
    const raw = localStorage.getItem(LAST_CONFIG_KEY)
    return raw ? (JSON.parse(raw) as RoomConfig) : null
  } catch {
    return null
  }
}

/** 写入上次建房配置（创建成功后调用） */
export function writeLastConfig(config: RoomConfig): void {
  try {
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(config))
  } catch {
    /* 存储不可用时静默降级，不影响主流程 */
  }
}

/** 房间邀请链接：{origin}/rooms/join?code=XXXXXX */
export function inviteLink(code: string): string {
  return `${window.location.origin}/rooms/join?code=${code}`
}
