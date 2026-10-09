// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Card, Deck } from '../api/types'
import { ToastProvider } from '../components/ui/Toast'
import { paths, routePatterns } from '../routes/paths'
import { CardCreatePage } from './CardCreatePage'
import { DeckDetailPage } from './DeckDetailPage'

vi.mock('framer-motion', () => import('../test/framerMock'))
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }))
vi.mock('../api/client', () => ({
  api: {
    cards: { get: vi.fn(), update: vi.fn(), listTags: vi.fn() },
    decks: { get: vi.fn() },
  },
}))

let card: Card
const deck: Deck = {
  id: 42, owner_id: 1, name: '来源牌组', description: '', card_count: 1,
  is_public: false, share_level: 'private', edit_level: 'full', created_at: '',
}
const clients: QueryClient[] = []

beforeEach(() => {
  vi.resetAllMocks()
  card = {
    id: 7, deck_id: 99, owner_id: 1, display_text: '原歌牌', series: '', tags: '',
    cover_url: '', is_shared: false, share_level: 'private', sort_order: 0,
  }
  vi.mocked(api.cards.get).mockImplementation(async () => ({ card: { ...card }, audios: [] }))
  vi.mocked(api.cards.listTags).mockResolvedValue([])
  vi.mocked(api.cards.update).mockImplementation(async (_id, fields) => {
    card = { ...card, ...fields }
    return card
  })
  vi.mocked(api.decks.get).mockImplementation(async () => ({ deck, cards: [{ ...card }] }))
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach(client => client.clear())
})

function renderPage(pathname = paths.deck(deck.id), state: unknown = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  clients.push(client)
  const router = createMemoryRouter([
    { path: routePatterns.deck, element: <DeckDetailPage /> },
    { path: routePatterns.cardEdit, element: <CardCreatePage /> },
    { path: paths.cardNew(), element: <CardCreatePage /> },
    { path: paths.cards(), element: <div>牌库页面</div> },
  ], { initialEntries: [{ pathname, state }] })
  const visited: string[] = []
  router.subscribe(({ location }) => visited.push(location.pathname))
  render(
    <QueryClientProvider client={client}>
      <ToastProvider><RouterProvider router={router} /></ToastProvider>
    </QueryClientProvider>,
  )
  return { router, visited }
}

async function openEditorFromDeck() {
  const result = renderPage()
  fireEvent.click(await screen.findByText('原歌牌'))
  const drawer = await screen.findByRole('complementary')
  fireEvent.click(await within(drawer).findByRole('button', { name: '编辑' }))
  await screen.findByDisplayValue('原歌牌')
  return result
}

function submitEdit() {
  const form = screen.getByRole('button', { name: '保存修改' }).closest('form')
  if (!form) throw new Error('Missing edit form')
  fireEvent.submit(form)
}

describe('歌牌编辑返回来源页面', () => {
  it('从牌组进入后保存，直接返回原牌组并显示最新歌牌', async () => {
    const { router, visited } = await openEditorFromDeck()
    fireEvent.change(screen.getByDisplayValue('原歌牌'), { target: { value: '修改后的歌牌' } })
    submitEdit()
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.deck(deck.id)))
    expect(await screen.findByText('修改后的歌牌')).toBeTruthy()
    expect(api.cards.update).toHaveBeenCalledWith(card.id, expect.objectContaining({ display_text: '修改后的歌牌' }))
    expect(api.decks.get).toHaveBeenCalledTimes(2)
    expect(visited).not.toContain(paths.cards())
  })

  it('从牌组进入后撤退，返回原牌组且不提交表单修改', async () => {
    const { router, visited } = await openEditorFromDeck()
    fireEvent.change(screen.getByDisplayValue('原歌牌'), { target: { value: '未保存的歌牌' } })
    fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.deck(deck.id)))
    expect(await screen.findByText('原歌牌')).toBeTruthy()
    expect(api.cards.update).not.toHaveBeenCalled()
    expect(visited).not.toContain(paths.cards())
  })

  it('撤退后也刷新已单独保存的素材数据', async () => {
    const { router } = await openEditorFromDeck()
    card.cover_url = '/updated-cover.png'
    fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.deck(deck.id)))
    await waitFor(() => expect(screen.getByAltText('').getAttribute('src')).toBe(card.cover_url))
    expect(api.decks.get).toHaveBeenCalledTimes(2)
  })

  it.each(['保存', '撤退'])('直接打开编辑页时%s仍返回牌库', async action => {
    const { router } = renderPage(paths.cardEdit(card.id))
    await screen.findByDisplayValue('原歌牌')
    if (action === '保存') submitEdit()
    else fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.cards()))
  })

  it('保存失败时停留在编辑页并保留输入', async () => {
    const { router } = await openEditorFromDeck()
    vi.mocked(api.cards.update).mockRejectedValueOnce(new Error('Save failed'))
    fireEvent.change(screen.getByDisplayValue('原歌牌'), { target: { value: '保留输入' } })
    submitEdit()
    await waitFor(() => expect(screen.getByRole('button', { name: '保存修改' }).hasAttribute('disabled')).toBe(false))
    expect(router.state.location.pathname).toBe(paths.cardEdit(card.id))
    expect(screen.getByDisplayValue('保留输入')).toBeTruthy()
  })

  it('刷新后保留的牌组来源仍用于撤退', async () => {
    const { router } = renderPage(paths.cardEdit(card.id), { fromDeckId: deck.id })
    await screen.findByDisplayValue('原歌牌')
    fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.deck(deck.id)))
  })

  it.each([0, -1, '42', NaN])('非法来源编号 %s 回退牌库', async fromDeckId => {
    const { router } = renderPage(paths.cardEdit(card.id), { fromDeckId })
    await screen.findByDisplayValue('原歌牌')
    fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.cards()))
  })

  it('非属主只读视图也使用来源牌组撤退', async () => {
    card.owner_id = 2
    const { router } = renderPage(paths.cardEdit(card.id), { fromDeckId: deck.id })
    await screen.findByRole('heading', { name: '🎴 原歌牌' })
    fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.deck(deck.id)))
  })

  it('创建模式的放弃确认保持返回牌库', async () => {
    const { router } = renderPage(paths.cardNew())
    fireEvent.change(screen.getByPlaceholderText('例：春晓'), { target: { value: '新歌牌' } })
    fireEvent.click(screen.getByRole('button', { name: '撤退' }))
    expect(router.state.location.pathname).toBe(paths.cardNew())
    fireEvent.click(await screen.findByRole('button', { name: '放弃' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.cards()))
  })
})
