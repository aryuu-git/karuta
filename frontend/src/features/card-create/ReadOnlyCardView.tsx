import { useNavigate } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import type { Card, CardAudio } from '../../api/types'
import { ArrowLeft, Tv, Play, Pause } from 'lucide-react'

interface ReadOnlyCardViewProps {
  card: Card
  coverPreview: string | null
  audios: CardAudio[]
  playingAudioId: number | null
  onTogglePlay: (audio: CardAudio) => void
}

/** 编辑模式下非属主的只读视图：展示卡牌信息与可试听音频 */
export function ReadOnlyCardView({ card, coverPreview, audios, playingAudioId, onTogglePlay }: ReadOnlyCardViewProps) {
  const navigate = useNavigate()
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="relative mb-6 overflow-hidden rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.8) 50%, rgb(var(--accent-bg-end)/ 0.4) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.15)' }}>
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)' }} />
          <div className="flex items-center gap-3 relative">
            <button onClick={() => navigate('/cards')}
              className="text-pink-300/50 hover:text-gold transition-all text-sm shrink-0 hover:scale-110">
              <ArrowLeft className="mr-0.5 inline h-3.5 w-3.5" /> 撤退
            </button>
            <h1 className="font-serif text-xl text-gold font-bold tracking-wide">
              🎴 {card.display_text || '未命名'}
            </h1>
          </div>
        </div>
        <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.5) 0%, rgb(var(--accent-bg-mid)/ 0.8) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
          <div className="flex gap-5">
            {coverPreview && (
              <img src={coverPreview} alt="" className="w-24 rounded-lg object-cover shrink-0" style={{ aspectRatio: '3/4' }} />
            )}
            <div className="flex-1 space-y-2">
              <p className="text-white/90 text-sm font-medium">{card.display_text}</p>
              {card.series && <p className="text-muted text-xs"><Tv className="mr-0.5 inline h-3 w-3" /> {card.series}</p>}
              {card.tags && (
                <div className="flex gap-1 flex-wrap">
                  {card.tags.split(',').filter(Boolean).map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold/60 border border-gold/20">{t.trim()}</span>
                  ))}
                </div>
              )}
              <p className="text-pink-300/40 text-xs font-serif">by {card.owner_name || '未知'}</p>
            </div>
          </div>
          {audios.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <h3 className="text-gold/70 text-xs mb-2 font-serif">♪ 歌曲 ({audios.length})</h3>
              <div className="space-y-1.5">
                {audios.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                    <button onClick={() => onTogglePlay(a)}
                      className="text-gold/60 hover:text-gold text-sm transition-all shrink-0">
                      {playingAudioId === a.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-xs text-white/60 truncate flex-1">{a.hint_text || `歌曲 ${a.sort_order + 1}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
