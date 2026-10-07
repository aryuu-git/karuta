import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Swords, Users } from 'lucide-react'
import { Button, EmptyState, FadeIn, HeroHeader, ListPageShell, Skeleton } from '../components/ui'
import { useMyGames } from '../api/queries'
import { paths } from '../routes/paths'

/** 每页条数：后端 /api/me/games 上限 50，取 20（与接口默认档一致） */
const PAGE_SIZE = 20

/** 模式代号 → 展示名（与个人页「最近对局」同口径） */
const MODE_LABEL: Record<string, string> = { auto: '自动', judge: '裁判', duel: '对阵' }

/**
 * 对局记录页：完整历史对局流水（GET /api/me/games 服务端分页翻页）。
 * 与个人页「最近对局」同口径，只是不再截断在前 10 条。
 */
export function GamesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useMyGames({ page, size: PAGE_SIZE })
  const games = data ?? []
  // 返回满页即认为后面还有（接口不返回总数，沿用牌库列表的判据）
  const hasMore = games.length >= PAGE_SIZE

  return (
    <ListPageShell
      hero={
        <HeroHeader compact icon={<Swords size={20} />} title="对局记录" subtitle="全部历史对局"
          onBack={() => navigate(-1)} />
      }
    >
      {isLoading && (
        <Skeleton variant="row" rows={6} className="space-y-2" />
      )}

      {!isLoading && error && (
        <FadeIn className="rounded-2xl text-center py-14 px-6 bg-panel-void border border-danger/30">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center bg-danger/10 border border-danger/30">
            <AlertCircle size={20} className="text-crimson" />
          </div>
          <h3 className="font-serif text-title text-gold-light mb-2">加载失败</h3>
          <p className="text-muted text-body mb-5">对局记录没能取回来，稍后再试</p>
          <Button variant="outline" onClick={() => refetch()} icon={<RotateCcw size={16} />}>重试</Button>
        </FadeIn>
      )}

      {!isLoading && !error && games.length === 0 && (
        <FadeIn className="rounded-2xl bg-panel-void border border-accent/15">
          <EmptyState icon="⚔️" title="还没有对局" description="打完第一局，这里会留下完整记录"
            action={<Button onClick={() => navigate(paths.home())} icon={<Swords size={16} />}>去开战</Button>} />
        </FadeIn>
      )}

      {!isLoading && !error && games.length > 0 && (
        <>
          <FadeIn className="space-y-2">
            {games.map(g => (
              <div key={`${g.room_id}-${g.ended_at ?? ''}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/[0.06] text-caption">
                <span className="px-2 py-0.5 rounded-full bg-gold/10 text-gold/90 text-tiny shrink-0">
                  {MODE_LABEL[g.mode] ?? g.mode}
                </span>
                <span className="flex-1 min-w-0 truncate text-body-text/80">{g.deck_name || '—'}</span>
                <span className="shrink-0 text-muted/70 text-tiny flex items-center gap-1">
                  <Users size={12} />{g.player_count}
                </span>
                <span className={`shrink-0 font-bold ${g.rank === 1 ? 'text-gold' : 'text-muted'}`}>第 {g.rank} 名</span>
                <span className="shrink-0 text-muted tabular-nums">{g.score} 分</span>
                <span className="shrink-0 text-muted/70 text-tiny tabular-nums">
                  {g.ended_at ? new Date(g.ended_at).toLocaleDateString('zh-CN') : '—'}
                </span>
              </div>
            ))}
          </FadeIn>

          {/* 服务端分页：无总数接口，只能按页翻 */}
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>首页</Button>
            <Button variant="ghost" size="sm" disabled={page <= 1} icon={<ChevronLeft size={12} />}
              onClick={() => setPage(p => p - 1)}>上一页</Button>
            <span className="text-caption px-3 py-1.5 rounded-lg bg-gold/15 text-gold border border-gold/30 font-medium">第 {page} 页</span>
            <Button variant="ghost" size="sm" disabled={!hasMore}
              onClick={() => setPage(p => p + 1)}>下一页 <ChevronRight size={12} /></Button>
          </div>
        </>
      )}
    </ListPageShell>
  )
}
