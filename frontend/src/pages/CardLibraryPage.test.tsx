// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Card } from '../api/types'

const mocks = vi.hoisted(() => ({
  batchTag: vi.fn(),
  toast: vi.fn(),
  pages: [] as Card[][],
}))

vi.mock('framer-motion', () => import('../test/framerMock'))
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }))
vi.mock('../components/CardDrawer', () => ({ CardDrawer: () => null }))
vi.mock('../components/PackPromptDialog', () => ({ PackPromptDialog: () => null }))
vi.mock('../api/client', () => ({ api: { cards: { batchTag: mocks.batchTag } } }))
vi.mock('../components/ui', async importOriginal => ({
  ...await importOriginal<typeof import('../components/ui')>(),
  useToast: () => ({ show: mocks.toast }),
}))
vi.mock('../api/queries', async importOriginal => ({
  ...await importOriginal<typeof import('../api/queries')>(),
  useMyCards: (params: { page: number }) => ({ data: mocks.pages[params.page - 1] ?? [], isPending: false }),
  usePublicCards: () => ({ data: [], isPending: false }),
  useCardTags: () => ({ data: ['公开分类'] }),
  useMyCardTags: () => ({ data: ['私有分类'] }),
  useMyDecks: () => ({ data: [] }),
}))

import { CardLibraryPage } from './CardLibraryPage'
import { queryKeys } from '../api/queries'

function card(id: number): Card {
  return { id, owner_id: 1, display_text: `歌牌${id}`, tags: '原标签', series: '', audio_count: 0 } as Card
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><MemoryRouter><CardLibraryPage /></MemoryRouter></QueryClientProvider>)
  return { invalidate }
}

function enterCategory() {
  fireEvent.click(screen.getByRole('button', { name: '批量归类' }))
}

function selectFirstAndFinish() {
  fireEvent.click(screen.getByRole('checkbox', { name: '选择歌牌1' }))
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
}

beforeEach(() => {
  mocks.batchTag.mockReset()
  mocks.toast.mockReset()
  mocks.pages = [[card(1), card(2), card(3)]]
})
afterEach(cleanup)

describe('我的歌牌批量归类', () => {
  it('圆圈选择、完成选分类，成功后退出并刷新标签与列表', async () => {
    mocks.batchTag.mockResolvedValue({ applied: 2 })
    const { invalidate } = mount()
    expect(screen.queryByRole('checkbox')).toBeNull()
    enterCategory()
    expect(screen.getByRole('button', { name: '完成' }).hasAttribute('disabled')).toBe(true)
    const first = screen.getByRole('checkbox', { name: '选择歌牌1' })
    expect(first.classList.contains('rounded-full')).toBe(true)
    fireEvent.click(first)
    expect(first.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('checkbox', { name: '选择歌牌2' }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '私有分类' }))
    expect((dialog.getByLabelText('分类名称') as HTMLInputElement).value).toBe('私有分类')
    fireEvent.click(dialog.getByRole('button', { name: '确认归类' }))
    await waitFor(() => expect(mocks.batchTag).toHaveBeenCalledWith([1, 2], ['私有分类']))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cards.mineTags })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cards.tags })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cards.publicRoot })
  })

  it('取消弹窗保留已选歌牌，取消归类清空选择', () => {
    mount()
    enterCategory()
    selectFirstAndFinish()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(screen.getByRole('checkbox', { name: '选择歌牌1' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '取消归类' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(mocks.batchTag).not.toHaveBeenCalled()
  })

  it('提交失败时保留分类名称和勾选，可以重试', async () => {
    mocks.batchTag.mockRejectedValueOnce(new Error('网络异常')).mockResolvedValueOnce({ applied: 1 })
    mount()
    enterCategory()
    selectFirstAndFinish()
    fireEvent.change(screen.getByLabelText('分类名称'), { target: { value: '  新分类  ' } })
    fireEvent.click(screen.getByRole('button', { name: '确认归类' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('网络异常', 'fail'))
    expect(screen.getByRole('checkbox', { name: '选择歌牌1' }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByLabelText('分类名称') as HTMLInputElement).value).toBe('  新分类  ')
    fireEvent.click(screen.getByRole('button', { name: '确认归类' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.batchTag).toHaveBeenLastCalledWith([1], ['新分类'])
  })

  it('拒绝空名称和逗号，等待提交时阻止重复请求和关闭弹窗', async () => {
    let resolve!: (result: { applied: number }) => void
    mocks.batchTag.mockReturnValue(new Promise(done => { resolve = done }))
    mount()
    enterCategory()
    selectFirstAndFinish()
    expect(screen.getByRole('button', { name: '确认归类' }).hasAttribute('disabled')).toBe(true)
    const input = screen.getByLabelText('分类名称')
    fireEvent.change(input, { target: { value: '游戏，动画' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toContain('一个分类')
    expect(mocks.batchTag).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '新分类' } })
    fireEvent.click(screen.getByRole('button', { name: '确认归类' }))
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mocks.batchTag).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '关闭' })).toBeNull()
    resolve({ applied: 1 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('跨页选择时，全选或取消本页不清除其他页的选择', async () => {
    mocks.pages = [Array.from({ length: 48 }, (_, i) => card(i + 1)), [card(49), card(50)]]
    mocks.batchTag.mockResolvedValue({ applied: 1 })
    mount()
    enterCategory()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择歌牌1' }))
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    fireEvent.click(screen.getByRole('button', { name: '全选本页' }))
    expect(screen.getByRole('checkbox', { name: '选择歌牌49' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '取消本页全选' }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    fireEvent.change(screen.getByLabelText('分类名称'), { target: { value: '跨页分类' } })
    fireEvent.click(screen.getByRole('button', { name: '确认归类' }))
    await waitFor(() => expect(mocks.batchTag).toHaveBeenCalledWith([1], ['跨页分类']))
  })

  it('原有多选完成仍然退出，公共牌库不显示批量归类入口', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '多选' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择歌牌1' }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /万牌共享/ }))
    expect(screen.queryByRole('button', { name: '批量归类' })).toBeNull()
  })
})
