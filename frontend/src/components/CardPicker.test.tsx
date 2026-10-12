// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Card } from '../api/types'
import { CardPicker } from './CardPicker'

vi.mock('framer-motion', () => import('../test/framerMock'))
vi.mock('../api/client', () => ({
  api: { cards: { listMine: vi.fn(), listPublic: vi.fn(), listTags: vi.fn() } },
}))

function card(id: number): Card {
  return {
    id, owner_id: 1, display_text: `歌牌 ${id}`, series: '', tags: '',
    cover_url: '', is_shared: false, sort_order: 0,
  }
}

const firstPage = Array.from({ length: 40 }, (_, i) => card(i + 1))
const secondPage = [card(41), card(42)]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.cards.listTags).mockResolvedValue([])
  vi.mocked(api.cards.listMine).mockImplementation(async params => params?.page === 2 ? secondPage : firstPage)
  vi.mocked(api.cards.listPublic).mockImplementation(async params => params?.page === 2 ? [card(141)] : firstPage.map(c => card(c.id + 100)))
})

afterEach(cleanup)

function renderPicker(excludeIds: number[] = []) {
  const props = { open: true, onClose: vi.fn(), onSelect: vi.fn(), excludeIds }
  return { ...render(<CardPicker {...props} />), props }
}

function nextPage() {
  fireEvent.click(screen.getByRole('button', { name: /下页/ }))
}

describe('加入牌组时的牌库分页', () => {
  it('我的牌库可前后翻页，保留跨页选中并阻止添加已有歌牌', async () => {
    const { props } = renderPicker([1])
    await screen.findByText('歌牌 1')
    expect(api.cards.listMine).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, size: 40 }))
    expect((screen.getByRole('button', { name: /上页/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTitle('歌牌 1'))
    fireEvent.click(screen.getByTitle('歌牌 2'))
    nextPage()
    await screen.findByText('歌牌 41')
    expect(api.cards.listMine).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, size: 40 }))
    expect(screen.getByText('第 2 页')).toBeTruthy()
    expect((screen.getByRole('button', { name: /下页/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTitle('歌牌 41'))
    fireEvent.click(screen.getByRole('button', { name: /上页/ }))
    await screen.findByText('歌牌 2')
    expect(screen.getByText('第 1 页')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认选择 2 张' }))
    expect(props.onSelect).toHaveBeenCalledWith([2, 41])
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('搜索查询整个牌库并回到首页，清除搜索恢复分页列表', async () => {
    vi.mocked(api.cards.listMine).mockImplementation(async params => {
      if (params?.search === '旧歌牌') return [{ ...card(79), display_text: '旧歌牌' }]
      return params?.page === 2 ? secondPage : firstPage
    })
    renderPicker()
    await screen.findByText('歌牌 1')
    nextPage()
    await screen.findByText('歌牌 41')
    const search = screen.getByPlaceholderText('搜索我的牌…')
    fireEvent.change(search, { target: { value: '旧歌牌' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    await screen.findByText('旧歌牌')
    expect(api.cards.listMine).toHaveBeenLastCalledWith(expect.objectContaining({ search: '旧歌牌', page: 1, size: 40 }))
    expect(screen.getByText('第 1 页')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    await screen.findByText('歌牌 1')
    expect(api.cards.listMine).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined, page: 1 }))
  })

  it('标签筛选查询整个牌库并保留已选歌牌', async () => {
    vi.mocked(api.cards.listMine).mockImplementation(async params => {
      if (params?.tag === '动画') return [{ ...card(80), tags: '动画' }]
      return params?.page === 2 ? secondPage : firstPage
    })
    renderPicker()
    await screen.findByText('歌牌 1')
    fireEvent.click(screen.getByTitle('歌牌 2'))
    nextPage()
    await screen.findByText('歌牌 41')
    fireEvent.click(screen.getByRole('tab', { name: '动画' }))
    await screen.findByText('歌牌 80')
    expect(api.cards.listMine).toHaveBeenLastCalledWith(expect.objectContaining({ tag: '动画', page: 1 }))
    expect(screen.getByRole('button', { name: '确认选择 1 张' })).toBeTruthy()
  })

  it('公共牌库仍可翻页，切换来源回到第一页', async () => {
    renderPicker()
    await screen.findByText('歌牌 1')
    nextPage()
    await screen.findByText('歌牌 41')
    fireEvent.click(screen.getByRole('tab', { name: '公共牌库' }))
    await screen.findByText('歌牌 101')
    expect(api.cards.listPublic).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, size: 40 }))
    nextPage()
    await screen.findByText('歌牌 141')
    expect(screen.getByText('第 2 页')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '我的牌库' }))
    await screen.findByText('歌牌 1')
    expect(screen.getByText('第 1 页')).toBeTruthy()
  })

  it('慢请求返回后不会覆盖新来源的内容，加载期间禁止连续翻页', async () => {
    let resolvePage!: (cards: Card[]) => void
    vi.mocked(api.cards.listMine).mockImplementation(params => params?.page === 2
      ? new Promise(resolve => { resolvePage = resolve })
      : Promise.resolve(firstPage))
    renderPicker()
    await screen.findByText('歌牌 1')
    nextPage()
    expect((screen.getByRole('button', { name: /下页/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /上页/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: '公共牌库' }))
    await screen.findByText('歌牌 101')
    await act(async () => { resolvePage(secondPage) })
    expect(screen.queryByText('歌牌 41')).toBeNull()
    expect(screen.getByText('歌牌 101')).toBeTruthy()
    expect(screen.getByText('第 1 页')).toBeTruthy()
  })

  it('翻页失败后显示错误，并可重试当前页', async () => {
    renderPicker()
    await screen.findByText('歌牌 1')
    vi.mocked(api.cards.listMine).mockRejectedValueOnce(new Error('network'))
    nextPage()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '加载失败，请重试')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await screen.findByText('歌牌 41')
    expect(screen.getByText('第 2 页')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('关闭后重新打开回到首页，并清空上次选中', async () => {
    const { props, rerender } = renderPicker()
    await screen.findByText('歌牌 1')
    nextPage()
    await screen.findByText('歌牌 41')
    fireEvent.click(screen.getByTitle('歌牌 41'))
    rerender(<CardPicker {...props} open={false} />)
    rerender(<CardPicker {...props} open />)
    await screen.findByText('歌牌 1')
    await waitFor(() => expect(screen.getByText('第 1 页')).toBeTruthy())
    expect((screen.getByRole('button', { name: '确认选择 0 张' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
