import { useNavigate } from 'react-router-dom'
import type { Card, CardAudio } from '../../api/types'
import { Tv, Play, Pause } from 'lucide-react'
import { PageContainer, HeroHeader, Button } from '../../components/ui'
import { paths } from '../../routes/paths'

interface ReadOnlyCardViewProps {
  card: Card
  coverPreview: string | null
  audios: CardAudio[]
  playingAudioId: number | null
  onTogglePlay: (audio: CardAudio) => void
}

/** 编辑模式下非属主的只读视图：展示卡牌信息与可试听音频（导航壳由路由层 AppLayout 提供） */
export function ReadOnlyCardView({ card, coverPreview, audios, playingAudioId, onTogglePlay }: ReadOnlyCardViewProps) {
  const navigate = useNavigate()
  return (
    <PageContainer size="sm">
      <HeroHeader
        title={`🎴 ${card.display_text || '未命名'}`}
        onBack={() => navigate(paths.cards())}
      />

      <div className="rounded-2xl p-6 bg-surface/50 border border-gold/10">
        <div className="flex gap-5">
          {coverPreview && (
            <img src={coverPreview} alt="" className="w-24 rounded-lg object-cover shrink-0" style={{ aspectRatio: '3/4' }} />
          )}
          <div className="flex-1 space-y-2">
            <p className="text-body-text/90 text-caption font-medium">{card.display_text}</p>
            {card.series && <p className="text-muted text-tiny"><Tv className="mr-0.5 inline h-3 w-3" /> {card.series}</p>}
            {card.tags && (
              <div className="flex gap-1 flex-wrap">
                {card.tags.split(',').filter(Boolean).map(t => (
                  <span key={t} className="text-tiny px-2 py-0.5 rounded-full bg-gold/10 text-gold/60 border border-gold/20">{t.trim()}</span>
                ))}
              </div>
            )}
            <p className="text-gold/40 text-tiny font-serif">by {card.owner_name || '未知'}</p>
          </div>
        </div>
        {audios.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border">
            <h3 className="text-gold/70 text-tiny mb-2 font-serif">♪ 歌曲 ({audios.length})</h3>
            <div className="space-y-1.5">
              {audios.map(a => (
                <div key={a.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => onTogglePlay(a)} aria-label="试听">
                    {playingAudioId === a.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="text-tiny text-body-text/60 truncate flex-1">{a.hint_text || `歌曲 ${a.sort_order + 1}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
