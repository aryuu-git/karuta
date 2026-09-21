// @vitest-environment happy-dom
// ConnectionBanner 渲染回归（设计规格 §2.3）：冷启动不误报、断线进度、恢复 2s 自动消失。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ConnectionBanner } from './ConnectionBanner'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ConnectionBanner 显隐逻辑', () => {
  it('已连接且无重连记录：不渲染（冷启动不误报）', () => {
    const { container } = render(<ConnectionBanner connected retries={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('未连接但 retries=0（首次建连中）：不渲染', () => {
    const { container } = render(<ConnectionBanner connected={false} retries={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('断线重连中：显示进度 n/10', () => {
    render(<ConnectionBanner connected={false} retries={3} />)
    expect(screen.getByText(/连接中断/)).toBeTruthy()
    expect(screen.getByText(/\(3\/10\)/)).toBeTruthy()
  })

  it('重试次数封顶展示（retries 超上限显示 max/max）', () => {
    render(<ConnectionBanner connected={false} retries={15} />)
    expect(screen.getByText(/\(10\/10\)/)).toBeTruthy()
  })

  it('自定义上限透传', () => {
    render(<ConnectionBanner connected={false} retries={2} maxRetries={5} />)
    expect(screen.getByText(/\(2\/5\)/)).toBeTruthy()
  })
})

describe('ConnectionBanner 恢复提示', () => {
  it('断线 → 恢复：显示「已恢复」，2 秒后自动消失', () => {
    vi.useFakeTimers()
    const { rerender, container } = render(<ConnectionBanner connected={false} retries={1} />)
    expect(screen.getByText(/连接中断/)).toBeTruthy()

    // 重连成功
    rerender(<ConnectionBanner connected retries={0} />)
    expect(screen.getByText('已恢复')).toBeTruthy()

    // 2s 后横幅消失
    act(() => { vi.advanceTimersByTime(2000) })
    expect(container.firstChild).toBeNull()
  })

  it('从未断线过的恢复不提示（首连成功场景）', () => {
    const { rerender, container } = render(<ConnectionBanner connected retries={0} />)
    rerender(<ConnectionBanner connected retries={0} />)
    expect(container.firstChild).toBeNull()
  })
})
