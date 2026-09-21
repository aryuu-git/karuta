import { defaultRoomConfig, type RoomConfig } from './roomConfig'

/** 一个前端常量预设：标签 + 一句话说明 + 完整建房配置 */
export interface RoomPreset {
  key: string
  label: string
  desc: string
  config: RoomConfig
}

/**
 * 四个前端常量预设（§4.2）：均从 defaultRoomConfig 派生，只覆盖差异字段。
 * 决斗预设保留 duel 七字段全量默认值（defaultRoomConfig 已含）。
 */
export const PRESETS: RoomPreset[] = [
  {
    key: 'standard',
    label: '标准抢牌',
    desc: '间隔5s 无惩罚',
    config: { ...defaultRoomConfig, mode: 'auto', intervalSec: 5, penaltyWrong: false, penaltySlow: false },
  },
  {
    key: 'duel',
    label: '决斗1v1',
    desc: '50牌 30s/轮',
    config: { ...defaultRoomConfig, mode: 'duel', duelTotalCards: 50, duelRoundTime: 30 },
  },
  {
    key: 'judge',
    label: '裁判模式',
    desc: '房主选牌',
    config: { ...defaultRoomConfig, mode: 'judge' },
  },
  {
    key: 'practice',
    label: '练手',
    desc: '无惩罚 随机起播',
    config: { ...defaultRoomConfig, mode: 'auto', training: true, randomStart: true, penaltyWrong: false, penaltySlow: false },
  },
]

/**
 * 按配置值反查所属预设（用于自定义建房页标注「基于：{label}」）。
 * onCustomize 固定契约只回传 (config, deckId)，故按字段值匹配还原预设标签。
 */
export function matchPreset(config: RoomConfig): RoomPreset | undefined {
  return PRESETS.find(p =>
    (Object.keys(p.config) as (keyof RoomConfig)[]).every(k => p.config[k] === config[k]),
  )
}

// —— 我的预设（B 轮增补：命名自定义预设，localStorage 起步）——

const CUSTOM_PRESETS_KEY = 'karuta_custom_presets'

/** 自定义预设（与内置同构，多 createdAt） */
export interface CustomPreset extends RoomPreset {
  createdAt: number
}

export function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
    const list = raw ? (JSON.parse(raw) as CustomPreset[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveCustomPreset(label: string, config: RoomConfig): CustomPreset[] {
  const preset: CustomPreset = {
    key: `custom-${Date.now()}`,
    label: label.trim().slice(0, 20),
    desc: `间隔${config.intervalSec}s · ${config.mode === 'duel' ? '对决' : config.mode === 'judge' ? '裁判' : '自动'}`,
    config,
    createdAt: Date.now(),
  }
  const next = [preset, ...loadCustomPresets()].slice(0, 12) // 上限 12 个
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next))
  } catch { /* 存储不可用静默降级 */ }
  return next
}

export function removeCustomPreset(key: string): CustomPreset[] {
  const next = loadCustomPresets().filter(p => p.key !== key)
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  return next
}
