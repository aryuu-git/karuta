// @vitest-environment happy-dom
// Toast 回归：自动过期计时、堆叠上限、类型方法、脱 Provider 抛错。
// 对应 D2 决策：ToastProvider 渲染层零 framer（纯 CSS 动画），无需 mock。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Component, type ReactNode } from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ToastProvider, useToast, type ToastContextValue } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** 测试探针：暴露 toast 句柄给用例（test seam，保持独立组件以获得正常 hooks 上下文） */
function Trigger({ onReady }: { onReady: (t: ToastContextValue) => void }) {
  const toast = useToast()
  onReady(toast)
  return null
}

function renderToast(): () => ToastContextValue {
  let handle: ToastContextValue | undefined
  render(
    <ToastProvider>
      <Trigger onReady={t => { handle = t }} />
    </ToastProvider>,
  )
  return () => handle!
}

describe('Toast 显示与过期', () => {
  it('show 后渲染文案，到时自动移除', () => {
    vi.useFakeTimers()
    const getToast = renderToast()
    act(() => { getToast().show('✓ 抢到 +1', 'success', 2000) })
    expect(screen.getByText('✓ 抢到 +1')).toBeTruthy()

    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByText('✓ 抢到 +1')).toBeNull()
  })

  it('便捷方法 success/fail/info 均可渲染', () => {
    const getToast = renderToast()
    act(() => { getToast().success('成功'); getToast().fail('失败'); getToast().info('提示') })
    expect(screen.getByText('成功')).toBeTruthy()
    expect(screen.getByText('失败')).toBeTruthy()
    expect(screen.getByText('提示')).toBeTruthy()
  })

  it('堆叠上限 4 条：第 5 条顶掉最旧的', () => {
    const getToast = renderToast()
    act(() => {
      getToast().show('t1'); getToast().show('t2'); getToast().show('t3'); getToast().show('t4'); getToast().show('t5')
    })
    expect(screen.queryByText('t1')).toBeNull()
    expect(screen.getByText('t2')).toBeTruthy()
    expect(screen.getByText('t5')).toBeTruthy()
  })
})

describe('useToast 契约', () => {
  it('脱 ToastProvider 使用抛错（错误边界捕获）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    class Boundary extends Component<{ children: ReactNode }, { err: boolean }> {
      state = { err: false }
      static getDerivedStateFromError() { return { err: true } }
      render() { return this.state.err ? <span>caught</span> : this.props.children }
    }
    render(<Boundary><Trigger onReady={() => {}} /></Boundary>)
    expect(screen.getByText('caught')).toBeTruthy()
    spy.mockRestore()
  })
})
