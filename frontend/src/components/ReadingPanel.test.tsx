// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadingPanel } from './ReadingPanel'

vi.mock('framer-motion', () => import('../test/framerMock'))

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderReading(isPaused = false) {
  const props = {
    hintText: '当前歌牌提示', audioUrl: '/first.mp3', intervalSec: 5,
    isActive: true, isPaused, countdown: null, intervalCountdown: null,
    onAudioEnded: vi.fn(), onBufferError: vi.fn(),
  }
  const view = render(<ReadingPanel {...props} />)
  const audio = view.container.querySelector('audio')!
  return { ...view, props, audio }
}

async function ready(audio: HTMLAudioElement) {
  await act(async () => { fireEvent.canPlayThrough(audio) })
}

describe('读牌音频故障与自动播放', () => {
  it('手机刷新后的自动播放限制不重试、不上报缓冲失败，点击可开启声音', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'))
    const { audio, props } = renderReading()
    await ready(audio)
    expect(screen.getByRole('button', { name: '开启声音' })).toBeTruthy()
    expect(screen.getByText('当前歌牌提示')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(props.onBufferError).not.toHaveBeenCalled()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '开启声音' })) })
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '开启声音' })).toBeNull()
    expect(props.onBufferError).not.toHaveBeenCalled()
  })

  it('连续切牌仍被拦截时继续提示开启声音，不影响房间进度', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('Gesture required', 'NotAllowedError'))
    const { audio, props, rerender } = renderReading()
    await ready(audio)
    rerender(<ReadingPanel {...props} audioUrl="/second.mp3" />)
    await ready(audio)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(props.onBufferError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '开启声音' })).toBeTruthy()
  })

  it('真正的播放错误耗尽重试后上报一次，仍显示找牌提示', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('Decode failed', 'NotSupportedError'))
    const { audio, props } = renderReading()
    await ready(audio)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(audio.play).toHaveBeenCalledTimes(3)
    expect(props.onBufferError).toHaveBeenCalledTimes(1)
    expect(screen.getByText('音频加载失败，可凭提示找牌')).toBeTruthy()
    expect(screen.getByText('当前歌牌提示')).toBeTruthy()
  })

  it('暂停或换源导致的播放中断不视为缓冲失败', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('Interrupted', 'AbortError'))
    const { audio, props } = renderReading()
    await ready(audio)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(props.onBufferError).not.toHaveBeenCalled()
    expect(screen.queryByText('音频加载失败，可凭提示找牌')).toBeNull()
  })

  it('换牌后旧音频的异步失败不会影响新回合', async () => {
    let rejectPrevious!: (reason: unknown) => void
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectPrevious = reject
    }))
    const { audio, props, rerender } = renderReading()
    await ready(audio)
    rerender(<ReadingPanel {...props} audioUrl="/second.mp3" />)
    await ready(audio)
    await act(async () => {
      rejectPrevious(new DOMException('Old source failed', 'NotSupportedError'))
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(props.onBufferError).not.toHaveBeenCalled()
    expect(screen.queryByText('音频加载失败，可凭提示找牌')).toBeNull()
  })

  it('暂停时加载完成也不播放，恢复后继续播放', async () => {
    const { audio, props, rerender } = renderReading(true)
    await ready(audio)
    expect(audio.play).not.toHaveBeenCalled()
    await act(async () => { rerender(<ReadingPanel {...props} isPaused={false} />) })
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(props.onBufferError).not.toHaveBeenCalled()
  })
})
