// @vitest-environment happy-dom
// ConfirmDialog 契约回归：确认/取消回调、loading 锁定（Esc/按钮/遮罩全禁）、danger 文案透传。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

vi.mock('framer-motion', () => import('../../test/framerMock'))

afterEach(cleanup)

describe('ConfirmDialog 回调', () => {
  it('点击确认触发 onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="解散战场？" description="所有成员将被移出，无法撤销"
        confirmText="解散" danger onConfirm={onConfirm} onCancel={onCancel} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '解散' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('点击取消触发 onCancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="要退出战场吗？" onConfirm={onConfirm} onCancel={onCancel} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '再想想' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmDialog loading 锁定', () => {
  it('loading：确认/取消按钮禁用、Esc 与遮罩不关闭', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="删除这张歌牌？" confirmText="删除" danger loading
        onConfirm={onConfirm} onCancel={onCancel} />,
    )
    expect((screen.getByRole('button', { name: '删除' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '再想想' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
