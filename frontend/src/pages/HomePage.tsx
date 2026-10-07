import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1–A3.4）
import { KeyRound, Zap, Wrench, Crown, RefreshCw, Trophy, Medal, Sparkles, Swords } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, Badge, EmptyState, PageContainer, ConfirmDialog, Skeleton, StatCard, SegmentedTabs, PanelSurface, SiteFooter, useToast, type BadgeTone } from '../components/ui'
import { FadeIn } from '../components/ui/FadeIn'
import { useAuth } from '../hooks/useAuth'
import { api, HttpError } from '../api/client'
import { useRoomList, useMyDecks, useRankings, useMyStats, queryKeys } from '../api/queries'
import { paths } from '../routes/paths'
import { PresetPicker } from '../features/play/PresetPicker'
import { createRoomFromConfig, writeLastConfig, readLastConfig } from '../features/play/roomCreate'
import type { RoomConfig } from '../features/play/roomConfig'
import type { RoomListItem } from '../api/types'

/** 房间状态 → 徽章文案与色调（设计系统状态色 token） */
const STATUS_LABEL: Record<string, { text: string; tone: BadgeTone }> = {
  waiting: { text: '可加入', tone: 'success' },
  reading: { text: '游戏中', tone: 'crimson' },
  paused:  { text: '暂停中', tone: 'muted' },
  end:     { text: '已结束', tone: 'muted' },
}

/** 排行榜前三名奖牌 emoji（其余名次回落到数字） */
const RANK_MEDALS = ['🥇', '🥈', '🥉']

/**
 * 开战中枢（PlayHub，Home 重构后，§4.1）：双主 CTA（快速开局 / 自定义建房）
 * + 邀请码加入 + 活跃战场列表。牌组/公共牌区已外迁至牌组页。
 */
export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = !!user?.is_admin
  const queryClient = useQueryClient()
  const toast = useToast()

  // 战场大厅：8 秒可见性感知轮询（后台标签页自动停），刷新中保留旧数据不闪烁。
  const roomsQuery = useRoomList()
  const rooms = roomsQuery.data ?? []
  // 牌组仅作为快速开局的必选项数据源，不再单独成区
  const decks = useMyDecks().data ?? []
  const myStatsQ = useMyStats()
  // 战绩速览：四项全 0（或还没有任何数据）视为「还没有战绩」，
  // 整行换成 onboarding 引导条；有数值时才展示 StatCard。
  const myStats = myStatsQ.data
  const statsEmpty =
    !myStatsQ.isLoading &&
    (myStats == null ||
      (myStats.total_games === 0 && myStats.first_games === 0 && myStats.top3_games === 0 && myStats.best_score === 0))

  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [forceEndTarget, setForceEndTarget] = useState<RoomListItem | null>(null)
  const [forceEnding, setForceEnding] = useState(false)

  // 快速开局（PresetPicker）状态
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lastConfig, setLastConfig] = useState<RoomConfig | null>(null)
  const [creating, setCreating] = useState(false)

  const doJoin = async (code: string) => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await api.rooms.join(code)
      navigate(paths.room(res.room.id))
    } catch (err) {
      // 按错误码本地化（2026-09-21 修复：原透传后端英文 message）
      const errCode = err instanceof HttpError ? err.code : undefined
      setJoinError(
        errCode === 'ROOM_ENDED' ? '这个战场已结束'
        : errCode === 'NOT_FOUND' ? '房间不存在，请检查邀请码'
        : '加入失败，请检查邀请码',
      )
    } finally { setJoining(false) }
  }

  // 邀请码输入：逐字符大写；满 6 位自动提交；失败保留输入（不清空）
  const handleJoinCodeChange = (value: string) => {
    const upper = value.toUpperCase()
    setJoinCode(upper)
    setJoinError(null)
    if (upper.trim().length === 6 && !joining) void doJoin(upper.trim())
  }

  const handleJoinByCode = (e: FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code) void doJoin(code)
  }

  // 管理员强制收束对局：确认后调用接口并失效房间列表缓存。
  const handleForceEnd = async () => {
    if (!forceEndTarget) return
    setForceEnding(true)
    try {
      await api.rooms.forceEnd(forceEndTarget.id)
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.list })
      setForceEndTarget(null)
    } catch {
      // 失败时保持弹窗，交由用户重试或取消
    } finally {
      setForceEnding(false)
    }
  }

  // 打开快速开局弹层：读取「上次配置」（无则该行隐藏）
  const openPicker = () => {
    setLastConfig(readLastConfig())
    setPickerOpen(true)
  }

  // 全站排行榜：总分 / 胜场 两榜 TOP10（世一网次数走成就展示，不再单独设榜）
  const [rankKind, setRankKind] = useState<'score' | 'wins'>('score')
  const rankQ = useRankings(rankKind)
  const RANK_LABEL: Record<typeof rankKind, string> = { score: '总分', wins: '胜场' }

  // 预设直接创建：成功写上次配置并跳新房，失败 toast（弹层保留）
  const handlePresetSelect = async (config: RoomConfig, deckId: number) => {
    if (creating) return
    setCreating(true)
    try {
      const room = await createRoomFromConfig(deckId, config)
      writeLastConfig(config)
      setPickerOpen(false)
      navigate(paths.room(room.id))
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '开辟失败，请重试', 'fail', 2500)
    } finally {
      setCreating(false)
    }
  }

  // 预设跳完整表单：携带预设配置，页头标注「基于：{label}」
  const handlePresetCustomize = (config: RoomConfig, deckId: number) => {
    setPickerOpen(false)
    navigate(paths.roomNew(deckId), { state: { presetConfig: config } })
  }

  return (
    <>
      <PageContainer size="lg" padding="md">

        {/* 三入口：快速开局 / 自定义建房 / 邀请码加入（§4.1）
            节奏契约（§1.3 外松内紧）：卡间 gap-5、区块间 mb-6、页面上下 py-8；
            2026-09-30 拆除 viewport-h 拉伸——内容定高，允许首屏滚动 */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr] gap-5 mb-6">
          {/* 主 CTA：快速开局（焦点金标题/图标，品牌时刻）；三入口卡 hover 统一走 lift */}
          <button onClick={openPicker} className="w-full">
            <PanelSurface variant="ink" radius="2xl"
              className="px-5 py-4 flex flex-col items-center justify-center gap-1.5 hover:-translate-y-1 hover:shadow-lg transition-all duration-250">
              <span className="flex items-center gap-2">
                <Zap size={20} className="text-gold" />
                <span className="font-serif text-title text-gold font-bold">快速开局</span>
              </span>
              <span className="text-muted text-caption">选预设，一步开战</span>
            </PanelSurface>
          </button>
          {/* 次级入口：自定义建房（标题亮金，图标退为中性） */}
          <button onClick={() => navigate(paths.roomNew())} className="w-full">
            <PanelSurface variant="ink" radius="2xl"
              className="px-5 py-4 flex flex-col items-center justify-center gap-1.5 hover:-translate-y-1 hover:shadow-lg transition-all duration-250">
              <span className="flex items-center gap-2">
                <Wrench size={20} className="text-muted/60" />
                <span className="font-serif text-title text-gold-light font-bold">自定义建房</span>
              </span>
              <span className="text-muted text-caption">全部规则随你调</span>
            </PanelSurface>
          </button>
          {/* 次级入口：邀请码加入（标题亮金，图标退为中性；内嵌表单不整卡可点） */}
          <PanelSurface variant="ink" radius="2xl"
            className="px-5 py-4 flex flex-col items-center justify-center gap-1.5 hover:-translate-y-1 hover:shadow-lg transition-all duration-250">
            <span className="flex items-center gap-2">
              <KeyRound size={20} className="text-muted/60" />
              <span className="font-serif text-title text-gold-light font-bold">邀请码加入</span>
            </span>
            <form onSubmit={handleJoinByCode} className="flex gap-2 relative w-full">
              <Input
                type="text"
                size="sm"
                onChange={e => handleJoinCodeChange(e.target.value)}
                className="code-input text-center font-serif font-bold tracking-[0.2em] text-caption"
                placeholder="输入邀请码"
                maxLength={10}
                aria-label="房间邀请码"
              />
              <Button type="submit" size="sm" loading={joining} disabled={!joinCode.trim()} className="shrink-0">
                加入
              </Button>
            </form>
            {joinError && (
              <p className="text-crimson text-caption text-center bg-crimson/10 border border-crimson/20 rounded-lg px-2 py-1">
                {joinError}
              </p>
            )}
          </PanelSurface>
        </div>

        {/* 我的战绩速览（StatCard：数值恒 body-text，图标按 tone 金点缀）；
            全 0 / 还没数据时整行换成 onboarding 引导条（同槽同材质，单行体量） */}
        {statsEmpty ? (
          // 同槽同材质：与 StatCard 行共用 void-soft 渐变面板（换槽不换物种）；
          // 轻重只靠体量（单行 py-2.5），不靠异材质（2026-09-30 修正玻璃条）
          <PanelSurface variant="void-soft" radius="2xl"
            className="mb-6 flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-gold shrink-0" />
              <span className="text-body text-body-text">打一局就有战绩 ✨</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={openPicker}>⚔️ 去开战</Button>
              <Button size="sm" variant="ghost" onClick={() => navigate(paths.roomNew())}>🔧 自定义建房</Button>
            </div>
          </PanelSurface>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-6">
            <StatCard compact icon={Swords} label="参与场数" value={myStats?.total_games} tone="gold" delay={0} />
            <StatCard compact icon={Medal} label="第一名" value={myStats?.first_games} tone="gold" delay={0.05} />
            <StatCard compact icon={Trophy} label="前三名" value={myStats?.top3_games} tone="gold" delay={0.1} />
            <StatCard compact icon={Sparkles} label="最高分" value={myStats?.best_score} tone="gold" delay={0.15} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 活跃战场列表（面板头归 PanelSurface title/actions） */}
        <PanelSurface variant="ink" radius="2xl" className="flex flex-col min-h-0 max-h-[420px]"
          title={
              <span className="flex items-center gap-2">
                <span aria-hidden="true">⚔️</span>
                <span className="flex items-center gap-1.5 font-bold">
                  活跃战场
                </span>
                <span className="text-muted/70 text-caption">进行中的房间</span>
              </span>
          }
          actions={
            <Button variant="ghost" size="sm" onClick={() => roomsQuery.refetch()}
              className="flex items-center gap-1 text-muted/70 hover:text-gold">
              <RefreshCw size={12} />
              刷新
            </Button>
          }>

          {roomsQuery.isLoading && (
            <div className="px-5 py-3">
              <Skeleton variant="row" rows={4} />
            </div>
          )}

          {/* 列表空态（§7.2：必须带下一步 CTA） */}
          {!roomsQuery.isLoading && rooms.length === 0 && (
            <EmptyState
              icon="🏯"
              title="还没有战场"
              description="开辟一个，把邀请码发给战友 🎴"
              action={<Button onClick={openPicker}>⚔️ 开辟第一个战场 →</Button>}
            />
          )}

          {/* 轮询失败：保留旧数据 + 顶部细提示 */}
          {roomsQuery.isError && rooms.length > 0 && (
            <p className="text-warning/70 text-tiny text-center py-1.5 bg-warning/5 border-b border-warning/15">
              刷新失败，显示的可能是旧数据
            </p>
          )}

          {rooms.length > 0 && (
          <div className="divide-y divide-border flex-1 overflow-y-auto min-h-0">
            <AnimatePresence>
              {rooms.map((room, i) => {
                const s = STATUS_LABEL[room.status] ?? { text: room.status, tone: 'muted' as BadgeTone }
                return (
                  <motion.div key={room.id} exit={{ opacity: 0, scale: 0.9 }}
                    className="transition-colors group hover:bg-gold/5 cursor-pointer"
                    onClick={() => doJoin(room.code)}>
                    {/* 入场走 FadeIn（设计系统 §1.5），motion 仅保留 AnimatePresence 退场 */}
                    <FadeIn delay={i * 30} y={8} className="flex items-center gap-3 px-5 py-2.5">
                    {/* 状态呼吸点 */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      room.status === 'waiting' ? 'bg-success' :
                      room.status === 'reading' ? 'bg-gold animate-pulse' : 'bg-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-body-text text-caption font-medium truncate">{room.deck_name}</span>
                        <Badge tone={s.tone}>{s.text}</Badge>
                        {room.is_private && <Badge tone="muted">私密</Badge>}
                      </div>
                      <div className="text-muted text-tiny mt-0.5 flex items-center gap-1">
                        <Crown size={12} className="text-gold-foil/60" />
                        {room.host_name} · {room.player_count} 位玩家
                      </div>
                    </div>
                    {room.status !== 'end' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-caption group-hover:text-gold transition-all ${room.training ? 'text-warning/70' : room.status === 'waiting' ? 'text-gold/70' : 'text-muted'}`}>
                          {/* CTA 语义只看状态：waiting 以玩家身份加入，其余旁观
                              （2026-09-21 修复：training 房此前误标「旁观」实际加入为玩家） */}
                          {room.status === 'waiting' ? '加入 →' : '旁观 →'}
                        </span>
                        {isAdmin && (
                          <Button size="xs" variant="danger" icon={<Zap size={12} />}
                            onClick={e => { e.stopPropagation(); setForceEndTarget(room) }}>
                            结束
                          </Button>
                        )}
                      </div>
                    )}
                    </FadeIn>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
          )}
        </PanelSurface>

      {/* 全站排行榜：总分 / 胜场 两榜 TOP20，游客同榜（面板头归 PanelSurface title/actions） */}
      <PanelSurface variant="ink" radius="2xl" className="flex flex-col min-h-0 max-h-[420px]"
        title={
          <span className="flex items-center gap-1.5 font-bold">
            <span aria-hidden="true">🏆</span> 排行榜
          </span>
        }
        actions={
          <SegmentedTabs
            value={rankKind}
            onChange={setRankKind}
            variant="bar"
            size="sm"
            aria-label="排行榜切换"
            options={(Object.keys(RANK_LABEL) as Array<'score' | 'wins'>).map(k => ({ value: k, label: RANK_LABEL[k] }))}
          />
        }>
        {/* 加载态：与活跃战场同款行骨架 */}
        {rankQ.isLoading && (
          <div className="px-5 py-3">
            <Skeleton variant="row" rows={4} />
          </div>
        )}

        {/* 空态：EmptyState 面板内居中，与活跃战场观感对称（§7.2 带下一步 CTA） */}
        {!rankQ.isLoading && (rankQ.data ?? []).length === 0 && (
          <EmptyState
            icon="🏆"
            title="还没有战绩"
            description="打几局就能上榜，加油 💪"
            action={<Button onClick={openPicker}>⚔️ 去开战</Button>}
          />
        )}

        {(rankQ.data ?? []).length > 0 && (
          <div className="divide-y divide-border flex-1 overflow-y-auto min-h-0">
            {(rankQ.data ?? []).map((entry, i) => (
              <div key={entry.user_id} className="flex items-center gap-3 px-5 py-2.5">
                {/* 前三名奖牌 emoji（2026-10-05）：名次一眼可辨，其余保持数字 */}
                <span className={`w-7 text-center shrink-0 ${i < 3 ? 'text-title' : 'text-muted/70 text-sm font-serif font-bold'}`}>
                  {RANK_MEDALS[i] ?? i + 1}
                </span>
                <span className="flex-1 text-sm text-body-text/90 truncate">{entry.username}</span>
                <span className="text-sm text-body-text font-bold tabular-nums">{entry.value}</span>
              </div>
            ))}
          </div>
        )}
      </PanelSurface>
        </div>

        {/* 开源仓库页脚（2026-09-30 位置评审：顶栏图标钮迁至内容页底注） */}
        <SiteFooter />
    </PageContainer>

      {/* 快速开局弹层 */}
      <PresetPicker
        open={pickerOpen}
        decks={decks}
        lastConfig={lastConfig}
        onSelect={handlePresetSelect}
        loading={creating}
        onCustomize={handlePresetCustomize}
        onClose={() => setPickerOpen(false)}
      />

      {/* 管理员强制收束确认 */}
      <ConfirmDialog
        open={forceEndTarget !== null}
        title={`强制结束「${forceEndTarget?.deck_name ?? ''}」对局？`}
        description="结束后对局将立即停止，所有成员退出，无法撤销。"
        confirmText="强制结束"
        cancelText="取消"
        danger
        loading={forceEnding}
        onConfirm={handleForceEnd}
        onCancel={() => setForceEndTarget(null)}
      />
    </>
  )
}
