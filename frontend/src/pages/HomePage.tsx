import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1–A3.4）
import { KeyRound, Zap, Wrench, Crown, RefreshCw, Castle, Trophy, Code2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, Badge, EmptyState, PageContainer, ConfirmDialog, Skeleton, useToast, type BadgeTone } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { api, HttpError } from '../api/client'
import { useRoomList, useMyDecks, useRankings, queryKeys } from '../api/queries'
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
      <PageContainer size="lg" padding="sm" className="lg:h-[calc(100vh-3.625rem)] lg:flex lg:flex-col lg:overflow-hidden">

        {/* 三入口：快速开局 / 自定义建房 / 邀请码加入（§4.1） */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr] gap-4 mb-4 shrink-0">
          <button
            onClick={openPicker}
            className="relative overflow-hidden rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all hover:scale-[1.02] hover:border-gold/30"
            style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}
          >
            <Zap size={22} className="text-gold" />
            <span className="font-serif text-title text-gold font-bold">快速开局</span>
            <span className="text-muted text-caption">选预设，一步开战</span>
          </button>
          <button
            onClick={() => navigate(paths.roomNew())}
            className="relative overflow-hidden rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all hover:scale-[1.02] hover:border-gold/30"
            style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}
          >
            <Wrench size={22} className="text-gold/70" />
            <span className="font-serif text-title text-white/90 font-bold">自定义建房</span>
            <span className="text-muted text-caption">全部规则随你调</span>
          </button>
          <div
            className="relative overflow-hidden rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all hover:scale-[1.02] hover:border-gold/30"
            style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}
          >
            <KeyRound size={22} className="text-gold" />
            <span className="font-serif text-title text-gold font-bold">邀请码加入</span>
            <form onSubmit={handleJoinByCode} className="flex gap-2 relative w-full">
              <Input
                type="text"
                size="sm"
                onChange={e => handleJoinCodeChange(e.target.value)}
                className="text-center font-serif font-bold tracking-[0.2em] text-caption"
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0 lg:h-[420px]">
        {/* 活跃战场列表 */}
        <div className="rounded-2xl overflow-hidden border flex flex-col min-h-0"
          style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', borderColor: 'rgb(var(--accent-primary)/ 0.12)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 relative border-b border-gold/10">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-title text-gold font-bold flex items-center gap-1.5">
                <Castle size={16} className="text-gold-dark" />
                活跃战场
              </h2>
              <span className="text-muted/30 text-caption font-serif italic">进行中的房间</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => roomsQuery.refetch()}
              className="flex items-center gap-1 text-muted/40 hover:text-gold">
              <RefreshCw size={12} />
              刷新
            </Button>
          </div>

          {roomsQuery.isLoading && (
            <div className="px-5 py-3">
              <Skeleton variant="row" rows={4} />
            </div>
          )}

          {/* 列表空态（§7.2：必须带下一步 CTA） */}
          {!roomsQuery.isLoading && rooms.length === 0 && (
            <EmptyState
              icon="🌸"
              title="还没有战场"
              description="开辟一个，把链接发给战友"
              action={<Button onClick={openPicker}>开辟第一个 →</Button>}
            />
          )}

          {/* 轮询失败：保留旧数据 + 顶部细提示 */}
          {roomsQuery.isError && rooms.length > 0 && (
            <p className="text-warning/70 text-tiny text-center py-1.5 bg-warning/5 border-b border-warning/15">
              刷新失败，显示的可能是旧数据
            </p>
          )}

          <div className="divide-y divide-border flex-1 overflow-y-auto min-h-0">
            <AnimatePresence>
              {rooms.map((room, i) => {
                const s = STATUS_LABEL[room.status] ?? { text: room.status, tone: 'muted' as BadgeTone }
                return (
                  <motion.div key={room.id}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 px-5 py-3 transition-colors group hover:bg-gold/5 cursor-pointer"
                    onClick={() => doJoin(room.code)}>
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
                        <Crown size={11} className="text-gold-foil/60" />
                        {room.host_name} · {room.player_count} 位玩家
                      </div>
                    </div>
                    {room.status !== 'end' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-caption group-hover:text-gold transition-all ${room.training ? 'text-warning/60' : room.status === 'waiting' ? 'text-gold/60' : 'text-muted'}`}>
                          {/* CTA 语义只看状态：waiting 以玩家身份加入，其余旁观
                              （2026-09-21 修复：training 房此前误标「旁观」实际加入为玩家） */}
                          {room.status === 'waiting' ? '加入 →' : '旁观 →'}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={e => { e.stopPropagation(); setForceEndTarget(room) }}
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded text-warning border border-warning/35 bg-warning/10 transition-all hover:scale-105">
                            <Zap size={10} />
                            结束
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

      {/* 全站排行榜：总分 / 胜场 两榜 TOP20，游客同榜 */}
      <div className="rounded-2xl overflow-hidden border flex flex-col min-h-0"
        style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', borderColor: 'rgb(var(--accent-primary)/ 0.12)' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gold/10">
          <h2 className="font-serif text-title text-gold font-bold flex items-center gap-1.5">
            <Trophy size={16} className="text-gold-dark" /> 排行榜
          </h2>
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            {(Object.keys(RANK_LABEL) as Array<'score' | 'wins'>).map(k => (
              <button key={k} onClick={() => setRankKind(k)}
                className={`text-xs px-3 py-1 rounded transition-all ${rankKind === k ? 'bg-gold/20 text-gold' : 'text-muted hover:text-white/70'}`}>
                {RANK_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-border flex-1 overflow-y-auto min-h-0">
          {(rankQ.data ?? []).length === 0 && !rankQ.isLoading && (
            <p className="text-muted/50 text-xs text-center py-6">还没有战绩，打几局就上榜了</p>
          )}
          {(rankQ.data ?? []).map((entry, i) => (
            <div key={entry.user_id} className="flex items-center gap-3 px-5 py-2.5">
              <span className={`w-6 text-center font-serif font-bold ${i === 0 ? 'text-gold text-title' : i < 3 ? 'text-gold/70' : 'text-muted/50'} text-sm`}>
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-body-text/90 truncate">{entry.username}</span>
              <span className="text-sm text-gold font-bold tabular-nums">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
        </div>

        <a href="https://github.com/aryuu-git/karuta" target="_blank" rel="noopener noreferrer" title="aryuu-git/karuta"
          className="fixed bottom-4 left-4 z-float inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-ink-deep/90 backdrop-blur text-tiny text-muted/60 hover:text-gold hover:border-gold/30 transition-all">
          <Code2 size={12} />
          GitHub 开源仓库
        </a>
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
