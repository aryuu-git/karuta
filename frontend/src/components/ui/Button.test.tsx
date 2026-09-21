// @vitest-environment happy-dom
// Button 契约回归（设计系统 §1.6 五状态）：loading/disabled 锁定、点击穿透阻断。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Button } from './Button'

vi.mock('framer-motion', () => import('../../test/framerMock'))

afterEach(cleanup)

describe('Button 交互锁定', () => {
  it('loading：按钮禁用且点击不触发回调（防重复提交契约）', () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>开辟战场</Button>)
    const btn = screen.getByRole('button', { name: /开辟战场/ }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabled：点击不触发回调', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>解散</Button>)
    fireEvent.click(screen.getByRole('button', { name: '解散' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('正常态：点击触发一次', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>加入</Button>)
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('loading 时渲染加载图标并保留文案', () => {
    render(<Button loading>保存</Button>)
    expect(screen.getByText('保存')).toBeTruthy()
    expect(document.querySelector('.animate-spin')).toBeTruthy()
  })
})
