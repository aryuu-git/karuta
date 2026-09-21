// presets 回归测试：模板值与 matchPreset 反查契约
// （「基于：{label}」页头标注与 PresetPicker 模板行为依赖此表）。
import { describe, it, expect } from 'vitest'
import { PRESETS, matchPreset } from './presets'
import { defaultRoomConfig } from './roomConfig'

describe('预设模板', () => {
  it('四个模板齐全且 key 唯一', () => {
    expect(PRESETS.map(p => p.key)).toEqual(['standard', 'duel', 'judge', 'practice'])
    expect(new Set(PRESETS.map(p => p.key)).size).toBe(4)
  })

  it('练手模板：无惩罚 + 随机起播 + training', () => {
    const t = PRESETS.find(p => p.key === 'practice')!
    expect(t.config.training).toBe(true)
    expect(t.config.penaltyWrong).toBe(false)
    expect(t.config.randomStart).toBe(true)
  })

  it('对决模板：duel 模式 + 50 牌 + 30s 轮时', () => {
    const d = PRESETS.find(p => p.key === 'duel')!
    expect(d.config.mode).toBe('duel')
    expect(d.config.duelTotalCards).toBe(50)
    expect(d.config.duelRoundTime).toBe(30)
  })
})

describe('matchPreset 值反查', () => {
  it('标准模板配置 → 命中「标准抢牌」标签', () => {
    const standard = PRESETS.find(p => p.key === 'standard')!
    expect(matchPreset(standard.config)?.label).toBe(standard.label)
  })

  it('默认配置与标准模板等价时也能命中', () => {
    // defaultRoomConfig 即标准模板的基底
    expect(matchPreset(defaultRoomConfig)?.key).toBe('standard')
  })

  it('非模板组合返回 undefined（表单页头不显示「基于：」）', () => {
    expect(matchPreset({ ...defaultRoomConfig, intervalSec: 99 })).toBeUndefined()
  })
})
