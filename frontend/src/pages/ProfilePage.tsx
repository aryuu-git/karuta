import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1–A3.4）
import {
  Swords, Medal, Trophy, Star, Sparkles, Award, Ticket,
  Plus, Check, Pencil, Camera, Zap, Shield, type LucideIcon,
} from 'lucide-react'
import {
  Button, Dialog, EmptyState, HeroHeader, Input, PageContainer, Skeleton, useToast,
} from '../components/ui'
import { useMyStats, useMyAchievements, useMyGames, queryKeys } from '../api/queries'
import { useAuth } from '../hooks/useAuth'
import { api, HttpError } from '../api/client'
import { paths } from '../routes/paths'

/** 管理员用户列表：加载/空/数据三态，支持设管理、禁用与邀请码开关。 */
function AdminUserList() {
  const [users, setUsers] = useState<Array<{ id: number; username: string; invited_by: number; disabled: boolean; is_admin: boolean; is_guest: boolean; created_at: string }>>([])
  const [allUsers, setAllUsers] = useState<Map<number, string>>(new Map())
  const [inviteRequired, setInviteRequired] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)
  // 操作进行中的用户 id（0=无）：防双击重复提交，同时禁用整列按钮
  const [busyId, setBusyId] = useState(0)
  const toast = useToast()

  // 管理操作以服务端为唯一真相：成功后整表刷新；失败 toast 提示且不动本地状态。
  // 此前为乐观更新 + 无 catch——后端 409/400（禁用同僚管理员/提拔游客/降级最后
  // 一个管理员）时静默失败，UI 与真实状态不一致。
  const refreshUsers = () =>
    api.auth.adminListUsers()
      .then(list => {
        setUsers(list)
        const m = new Map<number, string>()
        list.forEach(u => m.set(u.id, u.username))
        setAllUsers(m)
      })
      .catch(() => {})

  useEffect(() => {
    refreshUsers().finally(() => setLoadingUsers(false))
    api.auth.adminInviteStatus().then(r => setInviteRequired(r.invite_required)).catch(() => {})
  }, [])

  const adminErrorText = (err: unknown): string => {
    const code = err instanceof HttpError ? err.code : undefined
    switch (code) {
      case 'TARGET_IS_ADMIN': return '请先取消该用户的管理员，再禁用'
      case 'LAST_ADMIN': return '不能取消最后一个可用管理员'
      case 'GUEST_NOT_ALLOWED': return '游客不能设为管理员'
      default: return '操作失败，请重试'
    }
  }

  // 单用户操作封装：置忙 → 调用 → 成功刷新服务端状态 / 失败提示，finally 复位
  const runUserAction = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id)
    try {
      await action()
      await refreshUsers()
    } catch (err) {
      toast.fail(adminErrorText(err))
    } finally {
      setBusyId(0)
    }
  }

  return (
    <div>
      {/* 用户统计 */}
      <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-white/5">
        <span className="text-xs text-white/70">已注册用户：<span className="text-gold font-bold">{users.length}</span> 人</span>
        <span className="text-xs text-muted/50">（游客 {users.filter(u => u.is_guest).length} / 正式 {users.filter(u => !u.is_guest).length}）</span>
      </div>

      {/* 邀请码开关 */}
      <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-white/5">
        <span className="text-xs text-white/70">邀请码注册</span>
        <button onClick={async () => {
          try {
            const res = await api.auth.adminToggleInvite(!inviteRequired)
            setInviteRequired(res.invite_required)
            toast.success('已保存')
          } catch {
            toast.fail('保存失败，请重试')
          }
        }}
          className={`px-3 py-1 rounded text-[10px] font-medium transition-all ${inviteRequired ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-muted'}`}>
          {inviteRequired ? '已开启（需邀请码）' : '未开启（开放注册）'}
        </button>
      </div>

      {/* 用户列表：加载/空/数据三态（加载用行骨架屏替代裸 Spinner） */}
      {loadingUsers ? (
        <Skeleton variant="row" rows={4} className="space-y-2" />
      ) : users.length === 0 ? (
        <div className="py-5 text-center text-muted/50 text-xs">暂无注册用户</div>
      ) : (
      <div className="max-h-scroll-lg overflow-y-auto space-y-1.5">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-xs">
            <span className={`font-medium ${u.disabled ? 'text-muted line-through' : 'text-white/80'}`}>
              {u.username}
              {u.is_admin && <Zap size={11} className="inline-block align-middle ml-1 text-orange-400" />}
            </span>
            <span className="text-muted/50 flex-1 text-right truncate">
              {u.invited_by ? `← ${allUsers.get(u.invited_by) || '?'}` : ''}
            </span>
            <button
              disabled={busyId !== 0}
              onClick={() => runUserAction(u.id, () => api.auth.adminSetAdmin(u.id, !u.is_admin))}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-all disabled:opacity-40 ${u.is_admin ? 'bg-orange-400/15 text-orange-400' : 'bg-white/5 text-muted/40'}`}>
              {u.is_admin ? '管理员' : '设管理'}
            </button>
            <button
              disabled={busyId !== 0}
              onClick={() => runUserAction(u.id, () => api.auth.adminToggleUser(u.id, !u.disabled))}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-all disabled:opacity-40 ${u.disabled ? 'bg-green-500/15 text-green-400' : 'bg-crimson/15 text-crimson/70'}`}>
              {u.disabled ? '启用' : '禁用'}
            </button>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

/** 统计卡：lucide 图标 + 大数值 + 说明文案（color 同时着色图标与数值）。 */
function StatCard({ icon: Icon, label, value, sub, color = 'rgb(var(--color-gold))', delay = 0, compact = false }: {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  color?: string
  delay?: number
  /** 紧凑档：统计横排使用 */
  compact?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={`rounded-xl flex flex-col hover:shadow-lg hover:shadow-pink-500/5 transition-all ${compact ? 'p-3 gap-1' : 'p-5 gap-2'}`}
      style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.4), rgb(var(--accent-bg-mid)/ 0.6))', border: '1px solid rgb(var(--accent-primary)/ 0.08)' }}
    >
      <Icon size={compact ? 16 : 22} strokeWidth={1.75} style={{ color }} className="shrink-0" />
      <div>
        <div className={`font-bold tabular-nums font-serif ${compact ? 'text-xl' : 'text-2xl'}`} style={{ color }}>
          {value}
        </div>
        {sub && <div className="text-muted text-xs mt-0.5">{sub}</div>}
      </div>
      <div className="text-white/40 text-xs">{label}</div>
    </motion.div>
  )
}

/** 前三名占比环形图：SVG 描边动画展示前三比例。 */
function Top3Ring({ rate, games, top3 }: { rate: number; games: number; top3: number }) {
  const pct = Math.round(rate * 100)
  const circumference = 2 * Math.PI * 38
  const strokeDash = circumference * rate

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1, duration: 0.5, ease: 'backOut' }}
      className="flex flex-col items-center gap-3"
    >
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
          <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <motion.circle
            cx="48" cy="48" r="38" fill="none"
            stroke="url(#profileGrad)" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - strokeDash }}
            transition={{ delay: 0.4, duration: 1, ease: 'easeOut' }}
          />
          <defs>
            <linearGradient id="profileGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="50%" stopColor="rgb(var(--color-gold))" />
              <stop offset="100%" stopColor="rgb(var(--color-gold-light))" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-serif" style={{ color: 'rgb(var(--color-gold))' }}>{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-white/70 text-sm font-medium">前三名比例</p>
        <p className="text-muted text-xs mt-0.5">{top3} 次 / {games} 场</p>
      </div>
    </motion.div>
  )
}

/** 成就分类展示顺序与文案（后端 category 权威，此处仅中文标签） */
const ACHIEVEMENT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'participate', label: '参与' },
  { key: 'victory', label: '胜利' },
  { key: 'skill', label: '抢牌技巧' },
  { key: 'mode', label: '模式专精' },
  { key: 'content', label: '内容创造' },
  { key: 'social', label: '社交' },
  { key: 'fun', label: '趣味' },
]

/** 个人页成就网格：32 项全量。已解锁=着色+日期；未解锁=灰阶剪影+累计进度条；
 * 隐藏型未解锁仅显示谜语（❓/？？？）。历史数据已丢弃（Owner 决策），进度从零累计。 */
function AchievementsSection() {
  const { data, isLoading } = useMyAchievements()
  if (isLoading || !data) return null
  const achievements = data.achievements
  const unlockedCount = achievements.filter(a => a.unlocked_at !== null).length
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
      className="rounded-2xl p-4 h-full min-h-0 flex flex-col"
      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgb(var(--accent-bg-mid)/ 0.6) 100%)', border: '1px solid rgb(var(--color-gold)/ 0.15)' }}>
      <p className="text-muted text-xs mb-3 tracking-widest flex items-center gap-1.5 shrink-0">
        <Award size={12} />成就
        <span className="text-gold font-bold ml-1">{unlockedCount}/{achievements.length}</span>
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 gap-x-6 flex-1 overflow-y-auto min-h-0 content-start pr-1">
        {ACHIEVEMENT_CATEGORIES.map(cat => {
          const items = achievements.filter(a => a.category === cat.key)
          if (items.length === 0) return null
          return (
            <div key={cat.key}>
              <p className="text-[10px] text-muted/80 tracking-widest mb-1.5">{cat.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {items.map(a => {
                  const unlocked = a.unlocked_at !== null
                  const lockedHidden = a.hidden && !unlocked
                  const pct = a.target > 0 ? Math.min(100, Math.round((a.progress / a.target) * 100)) : 0
                  return (
                    <div key={a.key} title={lockedHidden ? '继续探索以解锁' : a.description}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                      style={{
                        background: unlocked ? 'rgb(var(--color-gold)/ 0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${unlocked ? 'rgb(var(--color-gold)/ 0.35)' : 'rgba(255,255,255,0.06)'}`,
                      }}>
                      <span className={`text-xl leading-none shrink-0 ${unlocked ? '' : 'grayscale opacity-40'}`}>
                        {lockedHidden ? '❓' : a.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-medium truncate ${unlocked ? 'text-gold' : 'text-muted/70'}`}>
                          {lockedHidden ? '？？？' : a.title}
                        </p>
                        {unlocked ? (
                          <p className="text-[10px] text-muted/70">
                            {a.unlocked_at ? new Date(a.unlocked_at).toLocaleDateString() : ''}
                          </p>
                        ) : a.target > 1 && !a.hidden ? (
                          <>
                            <div className="h-1 rounded-full bg-white/10 mt-1 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'rgb(var(--color-gold)/ 0.6)' }} />
                            </div>
                            <p className="text-[10px] text-muted/70 mt-0.5 tabular-nums">{a.progress}/{a.target}</p>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

/** 最近对局（v7 增补）：与个人统计同口径的历史流水（排除练习局、裁判行） */
function RecentGamesSection() {
  const { data, isLoading } = useMyGames({ page: 1, size: 10 })
  if (isLoading || !data || data.length === 0) return null
  const modeLabel: Record<string, string> = { auto: '自动', judge: '裁判', duel: '对阵' }
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
      className="rounded-2xl p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-muted text-xs mb-3 tracking-widest flex items-center gap-1.5"><Swords size={12} />最近对局</p>
      <div className="space-y-1.5">
        {data.map(g => (
          <div key={g.room_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-gold/10 text-gold/90 text-[10px] shrink-0">
              {modeLabel[g.mode] ?? g.mode}
            </span>
            <span className="flex-1 truncate text-body-text/80">{g.deck_name || '—'}</span>
            <span className={`shrink-0 font-bold ${g.rank === 1 ? 'text-gold' : 'text-muted'}`}>第 {g.rank} 名</span>
            <span className="shrink-0 text-muted tabular-nums">{g.score} 分</span>
            <span className="shrink-0 text-muted/70 text-[10px]">
              {g.ended_at ? new Date(g.ended_at).toLocaleDateString() : ''}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/** 个人主页：头像/改名头部 + 统计三态 + 称号 + 邀请码 + 管理员面板。 */
export function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // 改密弹窗（v7 增补：已登录改密，忘记密码走 karuta-admin reset-password）
  const [pwDialog, setPwDialog] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const handleChangePassword = async () => {
    if (pwBusy) return
    setPwBusy(true)
    try {
      await api.auth.changePassword(oldPw, newPw)
      toast.show('✓ 密码已更新', 'success')
      setPwDialog(false)
      setOldPw('')
      setNewPw('')
    } catch (err) {
      const code = err instanceof HttpError ? err.code : undefined
      toast.show(code === 'INVALID_CREDENTIALS' ? '旧密码不正确' : (err as Error).message || '修改失败，请重试', 'fail')
    } finally {
      setPwBusy(false)
    }
  }

  // 改名弹窗态
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState('')

  // 邀请码（沿用既有本地实现）
  const [invites, setInvites] = useState<Array<{ id: number; code: string; used_by?: number; created_at: string }>>([])
  const [invitesLoading, setInvitesLoading] = useState(true)

  // —— 战绩查询（TanStack Query）——
  const statsQ = useMyStats()
  const stats = statsQ.data ?? null
  const loading = statsQ.isPending

  useEffect(() => {
    api.auth.listInvites().then(setInvites).catch(() => {}).finally(() => setInvitesLoading(false))
  }, [])

  // 打开改名弹窗并预填当前昵称
  const startRename = () => {
    setNewName(user?.username || '')
    setNameError('')
    setEditingName(true)
  }

  /** 保存昵称：成功后失效战绩缓存并整页刷新（useAuth 无就地刷新，需重载同步导航栏身份） */
  const saveName = async () => {
    if (!newName.trim() || newName.trim() === user?.username) { setEditingName(false); return }
    try {
      await api.auth.updateMe(newName.trim())
      setEditingName(false)
      await qc.invalidateQueries({ queryKey: queryKeys.profile.stats })
      window.location.reload()
    } catch (err) { setNameError((err as Error).message) }
  }

  /** 上传头像：成功后失效战绩缓存并整页刷新同步身份 */
  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      await api.auth.uploadAvatar(fd)
      await qc.invalidateQueries({ queryKey: queryKeys.profile.stats })
      window.location.reload()
    } catch { /* ignore */ }
  }
  return (
    <PageContainer size="xl" padding="sm" className="lg:h-[calc(100vh-3.625rem)] lg:flex lg:flex-col lg:overflow-hidden">
      {/* 用户信息头部（HeroHeader：icon=头像，title=昵称） */}
      <HeroHeader
        icon={
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-2xl font-bold font-serif relative cursor-pointer group overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgb(var(--accent-primary)/ 0.3), rgb(var(--accent-bg-end)/ 0.8))', border: '2px solid rgb(var(--accent-primary)/ 0.4)', color: 'rgb(var(--color-gold))', boxShadow: '0 0 20px rgb(var(--accent-primary)/ 0.2)' }}
            onClick={() => avatarInputRef.current?.click()}
            role="button"
            aria-label="更换头像"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.username?.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={14} className="text-white" />
              <span className="text-white text-xs">换头像</span>
            </div>
          </div>
        }
        title={
          <span className="cursor-pointer group inline-flex items-center" onClick={startRename} role="button" aria-label="修改昵称">
            {user?.username}
            <Pencil size={14} className="text-muted/0 group-hover:text-muted/50 ml-2 transition-colors" />
          </span>
        }
        subtitle={stats?.total_games
          ? `已进行 ${stats.total_games} 场对局`
          : '还没有对局记录'}
      />
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      {loading ? (
        /* 战绩区骨架：用卡面骨架替代裸 Spinner（§7.1） */
        <Skeleton variant="card" rows={4} className="grid grid-cols-2 sm:grid-cols-3 gap-3" />
      ) : !stats || stats.total_games === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
          <EmptyState
            title="还没有对局记录"
            description="完成一局后这里会显示统计"
            action={<Button onClick={() => navigate(paths.home())} icon={<Swords size={14} />}>去开战</Button>}
          />
        </motion.div>
      ) : (
        <>
          {/* 核心数据横排：环形图 + 五项紧凑指标 */}
          <div className="flex gap-3 items-stretch mb-4">
            <div className="rounded-2xl px-5 flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Top3Ring rate={stats.top3_rate} games={stats.total_games} top3={stats.top3_games} />
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard compact icon={Swords} label="参与场数" value={stats.total_games} delay={0.1} />
              <StatCard compact icon={Medal} label="第一名" value={stats.first_games} color="#FFD700" delay={0.15} />
              <StatCard compact icon={Trophy} label="前三名" value={stats.top3_games} delay={0.2} />
              <StatCard compact icon={Star} label="总得分" value={stats.total_score} color="rgb(var(--color-gold-light))" delay={0.25} />
              <StatCard compact icon={Sparkles} label="最高分" value={stats.best_score} color="#4ade80" delay={0.3} />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 lg:min-h-0 lg:overflow-hidden mt-4">
        <div className="lg:col-span-2 min-h-0">
          {/* 成就（32 项全量；不依赖对局统计，0 局用户也可见内容类成就） */}
          <AchievementsSection />

          {/* 最近对局（v7 增补） */}
          <RecentGamesSection />
        </div>

        <div className="space-y-4 min-h-0 lg:overflow-y-auto lg:pr-1">

      {/* 账号安全：已登录改密（游客无密码体系，转正后可用） */}
      {user && !user.is_guest && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="rounded-2xl p-5 flex items-center justify-between"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-muted text-xs tracking-widest flex items-center gap-1.5"><Shield size={12} />账号安全</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPwDialog(true)}>修改密码</Button>
        </motion.div>
      )}

      {/* 改密弹窗 */}
      <Dialog open={pwDialog} title="修改密码" onClose={() => setPwDialog(false)}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPwDialog(false)}>取消</Button>
            <Button size="sm" loading={pwBusy} disabled={!oldPw || newPw.length < 6} onClick={() => void handleChangePassword()}>确认修改</Button>
          </>
        }>
        <div className="space-y-3">
          <Input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="当前密码" autoComplete="current-password" />
          <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="新密码（至少 6 位）" autoComplete="new-password" />
          <p className="text-[10px] text-muted/50">修改后其他设备需重新登录；忘记密码可在服务器执行 karuta-admin reset-password</p>
        </div>
      </Dialog>

      {/* 邀请码 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="rounded-2xl p-5"
        style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.5) 0%, rgb(var(--accent-bg-mid)/ 0.8) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-sm font-bold text-gold flex items-center gap-1.5"><Ticket size={13} />我的邀请码</h2>
          <Button size="sm" onClick={async () => {
            const inv = await api.auth.generateInvite()
            setInvites(prev => [{ ...inv, created_at: new Date().toISOString() }, ...prev])
          }} icon={<Plus size={12} />}>生成邀请码</Button>
        </div>
        {invitesLoading ? (
          <Skeleton variant="row" rows={2} className="space-y-2" />
        ) : invites.length === 0 ? (
          <p className="text-muted text-xs">还没有邀请码，点击上方按钮生成</p>
        ) : (
          <div className="space-y-2 max-h-scroll-md overflow-y-auto">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
                <code className="text-gold font-mono text-sm tracking-wider">{inv.code}</code>
                <span className={`text-[10px] ${inv.used_by ? 'text-muted/50' : 'text-green-400/70'}`}>
                  {inv.used_by ? '已使用' : '未使用'}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-muted/40 text-[10px] mt-2">分享邀请码给朋友，他们注册时填写即可</p>
      </motion.div>

      {/* 管理员面板（aryuu only） */}
      {user?.is_admin && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="rounded-2xl p-5"
          style={{ background: 'linear-gradient(180deg, rgba(255,100,50,0.05) 0%, rgb(var(--accent-bg-mid)/ 0.8) 100%)', border: '1px solid rgba(255,100,50,0.2)' }}>
          <h2 className="font-serif text-sm font-bold text-orange-300 mb-1 flex items-center gap-1.5"><Shield size={13} />管理员面板</h2>
          <p className="text-muted text-[10px] mb-3">关闭邀请码时允许公开注册；开启后仅接受未使用的邀请码。</p>
          <AdminUserList />
        </motion.div>
      )}

        </div>
      </div>

      {/* 改名弹窗 */}
      <Dialog
        open={editingName}
        onClose={() => setEditingName(false)}
        title="修改昵称"
        size="sm"
        actions={
          <>
            <Button variant="outline" onClick={() => setEditingName(false)}>取消</Button>
            <Button onClick={saveName} disabled={!newName.trim()} icon={<Check size={14} strokeWidth={3} />}>保存</Button>
          </>
        }
      >
        <Input label="昵称" type="text" value={newName}
          onChange={e => { setNewName(e.target.value); setNameError('') }}
          onKeyDown={e => { if (e.key === 'Enter') saveName() }}
          autoFocus />
        {nameError && <p className="text-crimson text-xs mt-2">{nameError}</p>}
      </Dialog>
    </PageContainer>
  )
}
