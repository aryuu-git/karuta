// @vitest-environment happy-dom
// PresetPicker 渲染回归（设计规格 §4.2）：上次配置显隐、牌组锁定、空牌组防御、创建回调载荷。
import { describe, it, expect, vi, afterEach } from 'vitest'
import type React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PresetPicker } from './PresetPicker'
import { defaultRoomConfig, type RoomConfig } from './roomConfig'
import type { Deck } from '../../api/types'

// framer-motion 卸载动画在 happy-dom 下抛 AbortError 未处理 rejection（噪音且可能染红 CI）。
// 测试关注点是 PresetPicker 的条件渲染逻辑而非动画，mock 为直通实现。
// 注：vi.mock 工厂被 hoist，不能引用外部值；JSX 走 react/jsx-runtime 静态导入，合法。
vi.mock('framer-motion', () => {
  const cache = new Map<string, unknown>()
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: new Proxy({}, {
      get: (_t, tag: string) => {
        if (!cache.has(tag)) {
          cache.set(tag, (props: Record<string, unknown>) => {
            // 剥离动画 props，其余原样传递
            const { initial, animate, exit, transition, whileHover, whileTap, layout, variants, ...rest } = props
            const Tag = tag as 'div'
            return <Tag {...(rest as JSX.IntrinsicElements['div'])} />
          })
        }
        return cache.get(tag)
      },
    }),
  }
})

afterEach(cleanup)

const deck = { id: 5, name: '主力牌组', card_count: 24 } as Deck
const lastConfig: RoomConfig = { ...defaultRoomConfig, intervalSec: 8 }

const noop = () => {}

describe('PresetPicker 上次配置行', () => {
  it('有 lastConfig：渲染「上次配置」且默认选中', () => {
    render(
      <PresetPicker open decks={[deck]} lastConfig={lastConfig}
        onSelect={noop} onCustomize={noop} onClose={noop} />,
    )
    expect(screen.getByText('上次配置')).toBeTruthy()
    // 摘要文案由配置派生：标准 · 8s
    expect(screen.getByText(/8s/)).toBeTruthy()
  })

  it('无 lastConfig：整行隐藏，落点为第一个模板', () => {
    render(
      <PresetPicker open decks={[deck]} lastConfig={null}
        onSelect={noop} onCustomize={noop} onClose={noop} />,
    )
    expect(screen.queryByText('上次配置')).toBeNull()
    expect(screen.getByText('标准抢牌')).toBeTruthy()
  })
})

describe('PresetPicker 牌组锁定与空态', () => {
  it('defaultDeckId：Select 禁用并提示已锁定', () => {
    render(
      <PresetPicker open decks={[deck]} defaultDeckId={5} lastConfig={null}
        onSelect={noop} onCustomize={noop} onClose={noop} />,
    )
    expect(screen.getByText('已锁定该牌组')).toBeTruthy()
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })

  it('未锁定：Select 可用', () => {
    render(
      <PresetPicker open decks={[deck]} lastConfig={null}
        onSelect={noop} onCustomize={noop} onClose={noop} />,
    )
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false)
  })

  it('空牌组：提示先创建，两个提交按钮禁用', () => {
    render(
      <PresetPicker open decks={[]} lastConfig={null}
        onSelect={noop} onCustomize={noop} onClose={noop} />,
    )
    expect(screen.getByText(/还没有牌组/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /开辟战场/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /查看完整配置/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('PresetPicker 创建回调', () => {
  it('点击开辟战场：onSelect 收到选中配置与牌组 id', () => {
    const onSelect = vi.fn()
    render(
      <PresetPicker open decks={[deck]} lastConfig={null}
        onSelect={onSelect} onCustomize={noop} onClose={noop} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /开辟战场/ }))
    // 默认选中第一个模板（标准抢牌），牌组默认第一个
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ mode: 'auto' }), 5)
  })

  it('切换预设后 onSelect 收到对应配置', () => {
    const onSelect = vi.fn()
    render(
      <PresetPicker open decks={[deck]} lastConfig={null}
        onSelect={onSelect} onCustomize={noop} onClose={noop} />,
    )
    fireEvent.click(screen.getByText('练手'))
    fireEvent.click(screen.getByText('开辟战场'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ training: true }), 5)
  })

  it('loading：主按钮锁定防重复提交', () => {
    const onSelect = vi.fn()
    render(
      <PresetPicker open decks={[deck]} lastConfig={null} loading
        onSelect={onSelect} onCustomize={noop} onClose={noop} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /开辟战场/ }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('查看完整配置：onCustomize 收到同一载荷', () => {
    const onCustomize = vi.fn()
    render(
      <PresetPicker open decks={[deck]} defaultDeckId={5} lastConfig={lastConfig}
        onSelect={noop} onCustomize={onCustomize} onClose={noop} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /查看完整配置/ }))
    expect(onCustomize).toHaveBeenCalledWith(expect.objectContaining({ intervalSec: 8 }), 5)
  })
})
