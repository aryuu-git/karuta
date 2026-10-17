// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JudgePanel } from './JudgePanel'
import { ToastProvider } from './ui/Toast'
import { api } from '../api/client'
import type { Card } from '../api/types'

vi.mock('framer-motion', () => import('../test/framerMock'))
vi.mock('../api/client', () => ({ api: { rooms: { updateJudgeQueue: vi.fn() } } }))

const cards = [{ id: 7, display_text: '歌牌', audios: [
  { id: 1, hint_text: '歌曲一', duration_sec: 60 },
  { id: 2, hint_text: '歌曲二', duration_sec: 90 },
  { id: 3, hint_text: '歌曲三', duration_sec: 120 },
] }] as Card[]
const base = {
  roomId: 1, cards, playedCardIds: new Set<number>(), currentCardId: null,
  currentAudioId: null, currentHintText: null, isJudgeWaiting: false,
  isPaused: false, queue: { items: [], played: [] },
}

beforeEach(() => { vi.mocked(api.rooms.updateJudgeQueue).mockReset().mockResolvedValue(undefined) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('裁判待播队列', () => {
  const songOrder = () => within(screen.getByRole('region', { name: '可选歌曲' }))
    .getAllByRole('button', { name: /^加入待播：/ })
    .map(button => button.getAttribute('aria-label')?.replace('加入待播：', ''))

  it('只把同一张牌中已播放的音频置底，保留两组的原有顺序', () => {
    render(<ToastProvider><JudgePanel {...base} queue={{ items: [], played: [{ card_id: 7, card_audio_id: 2 }] }} /></ToastProvider>)
    expect(songOrder()).toEqual(['歌曲一', '歌曲三', '歌曲二'])
    expect(screen.getByRole('button', { name: '加入待播：歌曲二' }).textContent).toBe('已播放')
    expect((screen.getByRole('button', { name: '加入待播：歌曲三' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('当前播放项即使已计入服务端已播记录，也留在未播放组的原位置', () => {
    render(<ToastProvider><JudgePanel {...base} currentCardId={7} currentAudioId={3}
      queue={{ items: [], played: [{ card_id: 7, card_audio_id: 1 }, { card_id: 7, card_audio_id: 3 }] }} /></ToastProvider>)
    expect(songOrder()).toEqual(['歌曲二', '歌曲三', '歌曲一'])
    expect(screen.getByRole('button', { name: '加入待播：歌曲三' }).textContent).toBe('播放中')
  })

  it('耗尽歌牌的全部音频置底，搜索和待播队列仍保留各自顺序', () => {
    const exhaustedCard = { id: 6, display_text: '耗尽歌牌', audios: [
      { id: 4, hint_text: '耗尽歌曲一', duration_sec: 60 },
      { id: 5, hint_text: '耗尽歌曲二', duration_sec: 60 },
    ] } as Card
    render(<ToastProvider><JudgePanel {...base} cards={[exhaustedCard, ...cards]} playedCardIds={new Set([6])}
      queue={{ items: [{ card_id: 7, card_audio_id: 3 }, { card_id: 7, card_audio_id: 1 }], played: [] }} /></ToastProvider>)
    expect(songOrder()).toEqual(['歌曲一', '歌曲二', '歌曲三', '耗尽歌曲一', '耗尽歌曲二'])
    expect(screen.getByRole('button', { name: '加入待播：耗尽歌曲一' }).textContent).toBe('已播放')
    expect(screen.getByRole('button', { name: '加入待播：耗尽歌曲二' }).textContent).toBe('已播放')
    fireEvent.change(screen.getByRole('textbox', { name: '搜索歌曲' }), { target: { value: '歌曲一' } })
    expect(songOrder()).toEqual(['歌曲一', '耗尽歌曲一'])
    fireEvent.click(screen.getByRole('button', { name: '待播队列（2）' }))
    const queuedNames = within(screen.getByRole('region', { name: '待播队列' }))
      .getAllByRole('button', { name: /^移除：/ })
      .map(button => button.getAttribute('aria-label'))
    expect(queuedNames).toEqual(['移除：歌曲三', '移除：歌曲一'])
  })

  it('播放及冷却期间仍可选歌，并发送精确的秒数', async () => {
    const view = render(<ToastProvider><JudgePanel {...base} currentCardId={7} currentAudioId={1} /></ToastProvider>)
    const add = screen.getByRole('button', { name: '加入待播：歌曲二' }) as HTMLButtonElement
    expect(add.disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('歌曲二播放起点（秒）'), { target: { value: '30.5' } })
    await act(async () => fireEvent.click(add))
    expect(api.rooms.updateJudgeQueue).toHaveBeenCalledWith(1, { action: 'add', card_id: 7, card_audio_id: 2, start_sec: 30.5 })
    view.rerender(<ToastProvider><JudgePanel {...base} /></ToastProvider>)
    expect((screen.getByRole('button', { name: '加入待播：歌曲三' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('恢复队列和已播歌曲，防止重复加入；允许暂停时调整顺序和移除', async () => {
    const queue = { items: [{ card_id: 7, card_audio_id: 2, start_sec: 20 }, { card_id: 7, card_audio_id: 3 }], played: [{ card_id: 7, card_audio_id: 1 }] }
    render(<ToastProvider><JudgePanel {...base} queue={queue} isPaused /></ToastProvider>)
    for (const name of ['歌曲一', '歌曲二', '歌曲三']) {
      expect((screen.getByRole('button', { name: `加入待播：${name}` }) as HTMLButtonElement).disabled).toBe(true)
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '上移：歌曲三' })))
    expect(api.rooms.updateJudgeQueue).toHaveBeenLastCalledWith(1, { action: 'move', card_id: 7, card_audio_id: 3, position: 0 })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '移除：歌曲二' })))
    expect(api.rooms.updateJudgeQueue).toHaveBeenLastCalledWith(1, { action: 'remove', card_id: 7, card_audio_id: 2 })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '清空待播' })))
    expect(api.rooms.updateJudgeQueue).toHaveBeenLastCalledWith(1, { action: 'clear' })
  })

  it('拒绝超出时长的起点，显式 0 可以提交', async () => {
    render(<ToastProvider><JudgePanel {...base} /></ToastProvider>)
    const input = screen.getByLabelText('歌曲一播放起点（秒）')
    fireEvent.change(input, { target: { value: '60' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '加入待播：歌曲一' })))
    expect(api.rooms.updateJudgeQueue).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '0' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '加入待播：歌曲一' })))
    expect(api.rooms.updateJudgeQueue).toHaveBeenCalledWith(1, { action: 'add', card_id: 7, card_audio_id: 1, start_sec: 0 })
  })

  it('待播起点可改回房间默认；保存失败会显示错误并恢复原值', async () => {
    render(<ToastProvider><JudgePanel {...base} queue={{ items: [{ card_id: 7, card_audio_id: 2, start_sec: 20 }], played: [] }} /></ToastProvider>)
    const input = within(screen.getByRole('region', { name: '待播队列' })).getByLabelText('歌曲二播放起点（秒）') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => fireEvent.blur(input))
    expect(api.rooms.updateJudgeQueue).toHaveBeenLastCalledWith(1, { action: 'update', card_id: 7, card_audio_id: 2, start_sec: undefined })
    vi.mocked(api.rooms.updateJudgeQueue).mockRejectedValueOnce(new Error('歌曲已经开始播放'))
    fireEvent.change(input, { target: { value: '35' } })
    await act(async () => fireEvent.blur(input))
    expect(screen.getByText('歌曲已经开始播放')).toBeTruthy()
    expect(input.value).toBe('20')
  })

  it('同步完成前不发送操作，提交中防止重复点击', async () => {
    const view = render(<ToastProvider><JudgePanel {...base} queue={null} /></ToastProvider>)
    expect((screen.getByRole('button', { name: '加入待播：歌曲一' }) as HTMLButtonElement).disabled).toBe(true)
    view.rerender(<ToastProvider><JudgePanel {...base} /></ToastProvider>)
    let resolve!: () => void
    vi.mocked(api.rooms.updateJudgeQueue).mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    fireEvent.click(screen.getByRole('button', { name: '加入待播：歌曲一' }))
    fireEvent.click(screen.getByRole('button', { name: '加入待播：歌曲一' }))
    expect(api.rooms.updateJudgeQueue).toHaveBeenCalledTimes(1)
    await act(async () => resolve())
  })
})
