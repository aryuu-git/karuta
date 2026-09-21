import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { Play, Lock, Eye, Pencil, Check, Heart } from 'lucide-react'
import type { Card } from '../api/types'

/** 无封面占位：按 card id 种子生成确定性渐变（与 Avatar 同思路），彻底消灭「—」 */
export function cardPlaceholderStyle(id: number): CSSProperties {
  const hue = (id * 47) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 22%))`,
  }
}

/** 时长格式化：92 → 1:32；不足 1 分钟只显示秒 */
export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return ''
  const s = Math.round(sec)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const SHARE_TONE: Record<string, { icon: typeof Lock; label: string; color: string }> = {
  private: { icon: Lock, label: '私有', color: 'rgb(150,150,150)' },
  playable: { icon: Eye, label: '可使用', color: 'rgb(74,144,217)' },
  editable: { icon: Pencil, label: '可编辑', color: 'rgb(34,197,94)' },
}

/**
 * 牌库网格牌面（V1 视觉统一）：3:4 和纸质感、金边 hover、无封面确定性渐变占位、
 * 卡角徽标（音频数·时长 / 共享级别）。复用 KarutaCard 的视觉基因但独立实现——
 * 对局是热路径，不共用组件以杜绝回归风险。
 */
export function CardTile({ card, selectable, selected, playing, showOwner, onOpen, onTogglePlay, onSelect, onLike }: {
  card: Card
  selectable?: boolean
  selected?: boolean
  playing?: boolean
  showOwner?: boolean
  onOpen?: (card: Card) => void
  onTogglePlay?: (card: Card) => void
  onSelect?: (id: number) => void
  onLike?: (card: Card) => void
}) {
  const share = SHARE_TONE[card.share_level ?? 'playable'] ?? SHARE_TONE.playable
  const ShareIcon = share.icon
  const duration = formatDuration(card.audio_duration ?? 0)
  const initial = (card.display_text || card.series || '牌').trim().charAt(0)

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`relative rounded-xl overflow-hidden cursor-pointer group aspect-[3/4] border transition-all
        ${selected ? 'border-gold shadow-gold' : 'border-border hover:border-gold/50'}`}
      style={card.cover_url ? undefined : cardPlaceholderStyle(card.id)}
      onClick={() => (selectable ? onSelect?.(card.id) : onOpen?.(card))}
    >
      {card.cover_url ? (
        <img src={card.cover_url} alt="" loading="lazy"
          className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-serif font-bold text-white/70 drop-shadow">{initial}</span>
        </div>
      )}

      {/* 底部渐变压名称 */}
      <div className="absolute inset-x-0 bottom-0 p-2 pt-6"
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}>
        <p className="text-xs font-medium text-white truncate">{card.display_text || '未命名'}</p>
        {(showOwner || card.series) && (
          <p className="text-[10px] text-white/60 truncate">
            {showOwner ? card.owner_name : card.series}
          </p>
        )}
      </div>

      {/* 卡角徽标：音频数·时长 + 共享级别 */}
      <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white/85 backdrop-blur-sm tabular-nums">
          {card.audio_count ?? 0} 首{duration ? ` · ${duration}` : ''}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm"
          style={{ color: share.color }}>
          <ShareIcon size={9} /> {share.label}
        </span>
      </div>

      {/* 多选态：左上勾选框 */}
      {selectable && (
        <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border flex items-center justify-center transition-all
          ${selected ? 'bg-gold border-gold' : 'bg-black/40 border-white/40 group-hover:border-gold/70'}`}>
          {selected && <Check size={13} className="text-ink-deep" />}
        </div>
      )}

      {/* hover 试听（有音频且非多选态） */}
      {onTogglePlay && !selectable && (card.audio_count ?? 0) > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onTogglePlay(card) }}
          className={`absolute bottom-9 left-1.5 w-8 h-8 rounded-full flex items-center justify-center
            bg-gold/90 text-ink-deep shadow-lg transition-all
            ${playing ? 'opacity-100 scale-105' : 'opacity-0 group-hover:opacity-100'}`}
          title={playing ? '停止试听' : '试听'}>
          {playing ? <span className="text-sm font-bold">■</span> : <Play size={14} fill="currentColor" />}
        </button>
      )}

      {/* 点赞（公共库社交；常显计数，点击切换） */}
      {onLike && !selectable && (
        <button
          onClick={e => { e.stopPropagation(); onLike(card) }}
          className={`absolute bottom-9 right-1.5 h-7 px-1.5 rounded-full flex items-center gap-1 text-[10px]
            shadow-lg transition-all bg-black/60 backdrop-blur-sm
            ${card.liked_by_me ? 'text-crimson' : 'text-white/70 hover:text-crimson'}`}
          title={card.liked_by_me ? '取消点赞' : '点赞'}>
          <Heart size={12} fill={card.liked_by_me ? 'currentColor' : 'none'} />
          <span className="tabular-nums">{card.likes ?? 0}</span>
        </button>
      )}
    </motion.div>
  )
}
