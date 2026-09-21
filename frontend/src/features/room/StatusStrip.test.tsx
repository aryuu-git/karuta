// @vitest-environment happy-dom
// StatusStrip 渲染回归（设计规格 §5.1）：六状态优先级、恒非空、旁观入口、倒计时可见性。
// 对应 P1 交付的行为契约：渲染优先级 justJoined(player) > 裁判 > 旁观 > claimed > banned > 可抢。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StatusStrip } from './StatusStrip'

// vitest 未开 globals，RTL 自动清理不生效——显式清理防 DOM 跨用例残留
afterEach(cleanup)

describe('StatusStrip 状态渲染', () => {
  it('可抢态：强提示 + 倒计时', () => {
    render(<StatusStrip identity="player" roundStatus="idle" justJoined={false} countdown={23} />)
    expect(screen.getByText(/可抢牌/)).toBeTruthy()
    expect(screen.getByText(/本首 23s/)).toBeTruthy()
  })

  it('刚加入：本首结束后可参与（不显示倒计时）', () => {
    render(<StatusStrip identity="player" roundStatus="idle" justJoined countdown={23} />)
    expect(screen.getByText(/本首结束后可参与抢牌/)).toBeTruthy()
    expect(screen.queryByText(/本首 23s/)).toBeNull()
  })

  it('裁判优先于 justJoined（守卫仅对 player 生效）', () => {
    render(<StatusStrip identity="judge" roundStatus="idle" justJoined countdown={null} />)
    expect(screen.getByText(/你是裁判/)).toBeTruthy()
    expect(screen.queryByText(/本首结束后/)).toBeNull()
  })

  it('旁观态：显示旁观中', () => {
    render(<StatusStrip identity="spectator" roundStatus="idle" justJoined={false} countdown={null} />)
    expect(screen.getByText(/旁观中/)).toBeTruthy()
  })

  it('已抢到：success 文案', () => {
    render(<StatusStrip identity="player" roundStatus="claimed" justJoined={false} countdown={null} />)
    expect(screen.getByText(/你抢到了/)).toBeTruthy()
  })

  it('本首出局：banned 文案', () => {
    render(<StatusStrip identity="player" roundStatus="banned" justJoined={false} countdown={null} />)
    expect(screen.getByText(/本首出局/)).toBeTruthy()
  })

  it('恒非空：任意组合至少渲染一条状态文案', () => {
    const combos = [
      { identity: 'player', roundStatus: 'idle', justJoined: false },
      { identity: 'player', roundStatus: 'claimed', justJoined: true },
      { identity: 'spectator', roundStatus: 'banned', justJoined: true },
      { identity: 'judge', roundStatus: 'claimed', justJoined: false },
    ] as const
    for (const c of combos) {
      const { container, unmount } = render(<StatusStrip {...c} countdown={null} />)
      // 状态条内必有文字内容（恒非空契约）
      expect(container.textContent?.length ?? 0).toBeGreaterThan(0)
      unmount()
    }
  })
})

describe('StatusStrip 旁观入口', () => {
  it('旁观 + 提供回调：渲染「加入战斗」并可点击', () => {
    const onJoinBattle = vi.fn()
    render(<StatusStrip identity="spectator" roundStatus="idle" justJoined={false} countdown={null} onJoinBattle={onJoinBattle} />)
    fireEvent.click(screen.getByText('加入战斗'))
    expect(onJoinBattle).toHaveBeenCalledTimes(1)
  })

  it('玩家态不渲染加入按钮', () => {
    const onJoinBattle = vi.fn()
    render(<StatusStrip identity="player" roundStatus="idle" justJoined={false} countdown={null} onJoinBattle={onJoinBattle} />)
    expect(screen.queryByText('加入战斗')).toBeNull()
  })

  it('旁观但无回调（训练/决斗）：不渲染按钮', () => {
    render(<StatusStrip identity="spectator" roundStatus="idle" justJoined={false} countdown={null} />)
    expect(screen.queryByText('加入战斗')).toBeNull()
  })
})
