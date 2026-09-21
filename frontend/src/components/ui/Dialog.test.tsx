// @vitest-environment happy-dom
// Dialog 行为回归（R4 组件规范）：Esc 关闭、遮罩点击、closable=false 抑制关闭、actions 渲染。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Dialog } from './Dialog'

vi.mock('framer-motion', () => import('../../test/framerMock'))

afterEach(cleanup)

describe('Dialog 关闭行为', () => {
  it('Esc 触发 onClose', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="快速开局"><p>内容</p></Dialog>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击遮罩触发 onClose', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="标题"><p>内容</p></Dialog>)
    // role=dialog 挂在遮罩层上；内容区 stopPropagation
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击内容区不关闭', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="标题"><p>内部内容</p></Dialog>)
    fireEvent.click(screen.getByText('内部内容'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closable=false：Esc 与遮罩点击均不关闭，且无关闭按钮', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="处理中" closable={false}><p>内容</p></Dialog>)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '关闭' })).toBeNull()
  })
})

describe('Dialog 内容渲染', () => {
  it('open=false 不渲染内容', () => {
    render(<Dialog open={false} onClose={vi.fn()} title="标题"><p>不可见内容</p></Dialog>)
    expect(screen.queryByText('不可见内容')).toBeNull()
  })

  it('title 与 actions 槽渲染', () => {
    render(
      <Dialog open onClose={vi.fn()} title="删除歌牌？" actions={<button>确认按钮</button>}>
        <p>描述</p>
      </Dialog>,
    )
    expect(screen.getByText('删除歌牌？')).toBeTruthy()
    expect(screen.getByText('确认按钮')).toBeTruthy()
  })
})
