import { useRef, useState } from 'react'
import type { Card } from '../api/types'
import type { JudgeQueueItem, JudgeQueueState } from '../api/ws-events'
import { api, type JudgeQueueCommand } from '../api/client'
import { Input, SearchInput, useToast } from './ui'

interface PlayableItem extends JudgeQueueItem {
  displayText: string
  hintText: string
  duration: number
}

export interface JudgePanelProps {
  roomId: number
  cards: Card[]
  playedCardIds: Set<number>
  currentCardId: number | null
  currentAudioId: number | null
  currentHintText: string | null
  isJudgeWaiting: boolean
  queue: JudgeQueueState | null
  isPaused: boolean
  layout?: 'wide' | 'sidebar'
}

const keyOf = (item: JudgeQueueItem) => `${item.card_id}-${item.card_audio_id}`
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function JudgePanel({ roomId, cards, playedCardIds, currentCardId, currentAudioId, currentHintText, isJudgeWaiting, queue, isPaused, layout = 'wide' }: JudgePanelProps) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [tab, setTab] = useState<'songs' | 'queue'>('songs')
  const [starts, setStarts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const items: PlayableItem[] = cards.flatMap(card => card.audios?.length
    ? card.audios.map(audio => ({ card_id: card.id, card_audio_id: audio.id, displayText: card.display_text, hintText: audio.hint_text, duration: audio.duration_sec ?? 0 }))
    : [{ card_id: card.id, card_audio_id: 0, displayText: card.display_text, hintText: card.hint_text ?? '', duration: card.audio_duration ?? 0 }])
  const byKey = new Map(items.map(item => [keyOf(item), item]))
  const played = new Set(queue?.played.map(keyOf) ?? [])
  const queued = new Set(queue?.items.map(keyOf) ?? [])
  const isCurrentItem = (item: PlayableItem) => item.card_id === currentCardId && (currentAudioId !== null ? item.card_audio_id === currentAudioId : item.hintText === currentHintText)
  const isPlayedItem = (item: PlayableItem) => !isCurrentItem(item) && (played.has(keyOf(item)) || playedCardIds.has(item.card_id))
  const songItems = [...items.filter(item => !isPlayedItem(item)), ...items.filter(isPlayedItem)]
  const disabled = busy || queue === null

  const update = async (command: JudgeQueueCommand) => {
    if (busyRef.current || queue === null) return false
    busyRef.current = true
    setBusy(true)
    try {
      await api.rooms.updateJudgeQueue(roomId, command)
      return true
    } catch (error) {
      toast.show(error instanceof Error ? error.message : '修改待播队列失败，请重试', 'fail')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const parseStart = (value: string, item: PlayableItem): number | undefined | null => {
    if (value.trim() === '') return undefined
    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds < 0 || (item.duration > 0 ? seconds >= item.duration : seconds > 0)) {
      toast.show('播放起点必须小于歌曲时长；时长未知时只能从头播放', 'fail')
      return null
    }
    return seconds
  }

  const startInput = (item: PlayableItem, pending?: JudgeQueueItem) => (
    <div className="flex flex-wrap items-center gap-1 text-tiny text-body-text/60">
      从
      <Input size="sm" fit
        key={pending ? `${keyOf(pending)}-${pending.start_sec ?? 'default'}` : keyOf(item)}
        aria-label={`${item.hintText || item.displayText}播放起点（秒）`}
        type="number" min="0" step="0.1"
        max={item.duration > 0 ? Math.max(0, item.duration - 0.1) : 0}
        placeholder="默认"
        className="w-20"
        disabled={disabled}
        {...(pending ? {
          defaultValue: pending.start_sec ?? '',
          onBlur: async (event: React.FocusEvent<HTMLInputElement>) => {
            const input = event.target
            const start = parseStart(input.value, item)
            if (start === null) { input.value = String(pending.start_sec ?? ''); return }
            if (start !== pending.start_sec) {
              const saved = await update({ action: 'update', card_id: item.card_id, card_audio_id: item.card_audio_id, start_sec: start })
              if (!saved) input.value = String(pending.start_sec ?? '')
            }
          },
        } : {
          value: starts[keyOf(item)] ?? '',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setStarts(prev => ({ ...prev, [keyOf(item)]: event.target.value })),
        })}
      />
      秒开始{item.duration > 0 && <span> / {timeLabel(item.duration)}</span>}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-gold/10 bg-gold/5 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-caption text-gold">
          <span>{isPaused ? '已暂停 · 可以继续编排' : currentCardId !== null ? '正在播放 · 可以提前选歌' : isJudgeWaiting ? '选择下一首要播放的牌' : '冷却中 · 可以提前选歌'}</span>
          <span className="shrink-0 text-tiny">待播 {queue?.items.length ?? 0} 首</span>
        </div>
        <p className="mt-1 text-tiny text-body-text/50">按队列顺序自动播放；起点留空按房间设置，填 0 从头播放。</p>
        <div className={`mt-2 flex gap-3 text-caption ${layout === 'wide' ? 'md:hidden' : ''}`}>
          <button type="button" onClick={() => setTab('songs')} aria-pressed={tab === 'songs'} className={tab === 'songs' ? 'text-gold' : 'text-body-text/50'}>选歌</button>
          <button type="button" onClick={() => setTab('queue')} aria-pressed={tab === 'queue'} className={tab === 'queue' ? 'text-gold' : 'text-body-text/50'}>待播队列（{queue?.items.length ?? 0}）</button>
        </div>
      </div>
      <div className={`grid min-h-0 flex-1 ${layout === 'wide' ? 'md:grid-cols-2' : ''}`}>
        <section aria-label="可选歌曲" className={`min-h-0 overflow-y-auto p-2 ${layout === 'wide' ? 'md:block' : ''} ${tab === 'songs' ? '' : 'hidden'}`}>
          <SearchInput aria-label="搜索歌曲" value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="搜索歌牌或歌曲" className="mb-2" />
          {queue === null && <p className="text-caption text-body-text/50">正在同步待播队列…</p>}
          {songItems.filter(item => `${item.displayText} ${item.hintText}`.toLowerCase().includes(search.toLowerCase())).map(item => {
            const key = keyOf(item)
            const current = isCurrentItem(item)
            const done = isPlayedItem(item)
            const inQueue = queued.has(key)
            return (
              <div key={key} className={`mb-1.5 rounded-lg border p-2 ${current ? 'border-gold/50 bg-gold/10' : 'border-gold/10 bg-gold/5'}`}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-caption text-body-text/85">{item.displayText}</div>
                    {item.hintText && <div className="truncate text-tiny text-body-text/50">♪ {item.hintText}</div>}
                  </div>
                  <button type="button" disabled={disabled || done || current || inQueue}
                    aria-label={`加入待播：${item.hintText || item.displayText}`}
                    className="shrink-0 rounded border border-gold/20 px-2 py-1 text-tiny text-gold disabled:opacity-40"
                    onClick={() => {
                      const start = parseStart(starts[key] ?? '', item)
                      if (start !== null) void update({ action: 'add', card_id: item.card_id, card_audio_id: item.card_audio_id, start_sec: start })
                    }}>
                    {current ? '播放中' : done ? '已播放' : inQueue ? '已排队' : '加入待播'}
                  </button>
                </div>
                {!done && !current && !inQueue && <div className="mt-1">{startInput(item)}</div>}
              </div>
            )
          })}
        </section>
        <section aria-label="待播队列" className={`min-h-0 overflow-y-auto border-gold/10 p-2 ${layout === 'wide' ? 'md:block md:border-l' : ''} ${tab === 'queue' ? '' : 'hidden'}`}>
          <div className="mb-2 flex items-center justify-between text-caption text-gold">
            <span>待播顺序</span>
            <button type="button" disabled={disabled || !queue?.items.length} onClick={() => void update({ action: 'clear' })} className="text-tiny text-body-text/50 disabled:opacity-40">清空待播</button>
          </div>
          {!queue?.items.length && <p className="text-caption text-body-text/50">队列为空，添加歌曲后会在可播放时自动开始。</p>}
          {queue?.items.map((entry, index) => {
            const item = byKey.get(keyOf(entry))
            if (!item) return null
            const name = item.hintText || item.displayText
            return (
              <div key={keyOf(entry)} className="mb-1.5 rounded-lg border border-gold/20 bg-gold/5 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-caption text-gold">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-caption text-body-text/85">{name}</span>
                  <button type="button" aria-label={`上移：${name}`} disabled={disabled || index === 0} onClick={() => void update({ action: 'move', card_id: entry.card_id, card_audio_id: entry.card_audio_id, position: index - 1 })} className="px-1 text-gold disabled:opacity-25">↑</button>
                  <button type="button" aria-label={`下移：${name}`} disabled={disabled || index === queue.items.length - 1} onClick={() => void update({ action: 'move', card_id: entry.card_id, card_audio_id: entry.card_audio_id, position: index + 1 })} className="px-1 text-gold disabled:opacity-25">↓</button>
                  <button type="button" aria-label={`移除：${name}`} disabled={disabled} onClick={() => void update({ action: 'remove', card_id: entry.card_id, card_audio_id: entry.card_audio_id })} className="px-1 text-body-text/50 disabled:opacity-25">×</button>
                </div>
                <div className="mt-1">{startInput(item, entry)}</div>
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}
