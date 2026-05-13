import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layout } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { UserStats } from '../api/types'

function AdminUserList() {
  const [users, setUsers] = useState<Array<{ id: number; username: string; invited_by: number; disabled: boolean; is_admin: boolean; is_guest: boolean; created_at: string }>>([])
  const [allUsers, setAllUsers] = useState<Map<number, string>>(new Map())
  const [inviteRequired, setInviteRequired] = useState(false)

  useEffect(() => {
    api.auth.adminListUsers().then(list => {
      setUsers(list)
      const m = new Map<number, string>()
      list.forEach(u => m.set(u.id, u.username))
      setAllUsers(m)
    }).catch(() => {})
    api.auth.adminInviteStatus().then(r => setInviteRequired(r.invite_required)).catch(() => {})
  }, [])

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
          const res = await api.auth.adminToggleInvite(!inviteRequired)
          setInviteRequired(res.invite_required)
        }}
          className={`px-3 py-1 rounded text-[10px] font-medium transition-all ${inviteRequired ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-muted'}`}>
          {inviteRequired ? '已开启（需邀请码）' : '未开启（暗号 33989）'}
        </button>
      </div>

      {/* 用户列表 */}
      <div className="max-h-60 overflow-y-auto space-y-1.5">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-xs">
            <span className={`font-medium ${u.disabled ? 'text-muted line-through' : 'text-white/80'}`}>
              {u.username}
              {u.is_admin && <span className="text-orange-400 ml-1">⚡</span>}
            </span>
            <span className="text-muted/50 flex-1 text-right truncate">
              {u.invited_by ? `← ${allUsers.get(u.invited_by) || '?'}` : ''}
            </span>
            <button
              onClick={async () => {
                await api.auth.adminSetAdmin(u.id, !u.is_admin)
                setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: !x.is_admin } : x))
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-all ${u.is_admin ? 'bg-orange-400/15 text-orange-400' : 'bg-white/5 text-muted/40'}`}>
              {u.is_admin ? '管理员' : '设管理'}
            </button>
            <button
              onClick={async () => {
                await api.auth.adminToggleUser(u.id, !u.disabled)
                setUsers(prev => prev.map(x => x.id === u.id ? { ...x, disabled: !x.disabled } : x))
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-all ${u.disabled ? 'bg-green-500/15 text-green-400' : 'bg-crimson/15 text-crimson/70'}`}>
              {u.disabled ? '启用' : '禁用'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color = 'var(--color-gold)', delay = 0 }: {
  icon: string
  label: string
  value: string | number
  sub?: string
  color?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-xl p-5 flex flex-col gap-2 hover:shadow-lg hover:shadow-pink-500/5 transition-all"
      style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.08)' }}
    >
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-2xl font-bold tabular-nums font-serif" style={{ color }}>
          {value}
        </div>
        {sub && <div className="text-muted text-xs mt-0.5">{sub}</div>}
      </div>
      <div className="text-white/40 text-xs">{label}</div>
    </motion.div>
  )
}

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
              <stop offset="50%" stopColor="var(--color-gold)" />
              <stop offset="100%" stopColor="var(--color-gold-light)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-serif" style={{ color: 'var(--color-gold)' }}>{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-white/70 text-sm font-medium">前三名比例</p>
        <p className="text-muted text-xs mt-0.5">{top3} 次 / {games} 场</p>
      </div>
    </motion.div>
  )
}

export function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState('')
  const [invites, setInvites] = useState<Array<{ id: number; code: string; used_by?: number; created_at: string }>>([])

  useEffect(() => {
    api.auth.listInvites().then(setInvites).catch(() => {})
  }, [])

  useEffect(() => {
    api.auth.myStats()
      .then(setStats)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* 用户信息头部 */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-5 mb-8 p-6 rounded-2xl relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
          {/* 头像 */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-2xl font-bold font-serif relative cursor-pointer group overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-primary),0.3), rgba(var(--accent-bg-end),0.8))', border: '2px solid rgba(var(--accent-primary),0.4)', color: 'var(--color-gold)', boxShadow: '0 0 20px rgba(var(--accent-primary),0.2)' }}
            onClick={() => avatarInputRef.current?.click()}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.username?.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs">换头像</span>
            </div>
          </div>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const fd = new FormData()
            fd.append('avatar', file)
            try {
              await api.auth.uploadAvatar(fd)
              window.location.reload()
            } catch { /* ignore */ }
          }} />
          <div className="relative">
            {editingName ? (
              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!newName.trim() || newName.trim() === user?.username) { setEditingName(false); return }
                try {
                  await api.auth.updateMe(newName.trim())
                  setEditingName(false)
                  window.location.reload()
                } catch (err) { setNameError((err as Error).message) }
              }} className="flex items-center gap-2">
                <input type="text" value={newName} onChange={e => { setNewName(e.target.value); setNameError('') }}
                  className="input-dark text-lg font-bold font-serif w-40" autoFocus />
                <button type="submit" className="text-green-400 text-sm">✓</button>
                <button type="button" onClick={() => setEditingName(false)} className="text-muted text-sm">✕</button>
                {nameError && <span className="text-crimson text-xs">{nameError}</span>}
              </form>
            ) : (
              <h1 className="font-serif text-2xl font-bold text-gold tracking-wide cursor-pointer group" onClick={() => { setEditingName(true); setNewName(user?.username || '') }}>
                {user?.username}
                <span className="text-muted/0 group-hover:text-muted/50 text-xs ml-2 transition-colors">✏️</span>
              </h1>
            )}
            <p className="text-pink-300/50 text-sm mt-0.5 font-serif italic">
              {stats?.total_games
                ? `征战 ${stats.total_games} 场，英姿飒爽 (ง •̀_•́)ง ✧`
                : '传说尚未开始… (｡•́︿•̀｡)'}
            </p>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-16 text-pink-300/50 animate-pulse font-serif">
            ～ 翻阅战绩古卷中 ～ ♪
          </div>
        ) : !stats || stats.total_games === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-16 rounded-2xl"
            style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px dashed rgba(var(--accent-primary),0.2)' }}>
            <div className="text-5xl mb-4">🌸</div>
            <p className="text-gold text-base font-serif mb-2">传说的篇章尚未书写…</p>
            <p className="text-pink-300/40 text-sm mb-6 font-serif">踏入战场，用实力刻下你的名字！✧</p>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="btn-gold text-sm shadow-lg shadow-gold/20">
              ⚔️ 前往战场大厅
            </motion.button>
          </motion.div>
        ) : (
          <>
            {/* 前三名环形图 + 核心数据 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              {/* 前三名占比 */}
              <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-2xl p-6 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Top3Ring rate={stats.top3_rate} games={stats.total_games} top3={stats.top3_games} />
              </motion.div>

              {/* 关键数据 */}
              <div className="flex flex-col gap-3">
                <StatCard icon="⚔️" label="参与场数" value={stats.total_games} sub="场完整对局" delay={0.1} />
                <StatCard icon="🥇" label="第一名次数" value={stats.first_games}
                  sub={stats.total_games > 0 ? `${Math.round(stats.first_games / stats.total_games * 100)}% 的对局` : ''}
                  color="#FFD700" delay={0.15} />
              </div>
            </div>

            {/* 次要数据 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon="🏆" label="前三名次数" value={stats.top3_games} delay={0.2}
                sub={`共 ${stats.total_games} 场`} />
              <StatCard icon="💯" label="历史总得分" value={stats.total_score} delay={0.25}
                sub="所有场次合计" color="var(--color-gold-light)" />
              <StatCard icon="✨" label="单场最高分" value={stats.best_score} delay={0.3}
                sub="个人纪录" color="#4ade80" />
            </div>

            {/* 称号区 */}
            {stats.world_first_count > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-xl p-4 mt-1"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-muted text-xs mb-3 tracking-widest">🎖️ 获得称号</p>
                <div className="flex flex-wrap gap-2">
                  {stats.world_first_count > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(var(--accent-primary),0.1)', border: '1px solid rgba(var(--accent-primary),0.25)' }}>
                      <span className="text-base">🌐</span>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--color-gold)' }}>世一网</p>
                        <p className="text-muted text-xs">已获得 {stats.world_first_count} 次</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 激励文案 */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="mt-6 text-center">
              {stats.top3_rate >= 0.7 ? (
                <p className="text-gold/60 text-sm font-serif">传说级战士！胜率超高！(*´▽`*) ヽ(°〇°)ﾉ</p>
              ) : stats.top3_rate >= 0.4 ? (
                <p className="text-gold/60 text-sm font-serif">实力不俗，继续加油！(ง •̀_•́)ง</p>
              ) : stats.total_games > 0 ? (
                <p className="text-gold/60 text-sm font-serif">多打多练，下次一定行！(｡•́︿•̀｡) 加油～</p>
              ) : null}
            </motion.div>
          </>
        )}
        {/* 邀请码 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="mt-6 rounded-2xl p-5"
          style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5) 0%, rgba(var(--accent-bg-mid),0.8) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-sm font-bold text-gold">🎫 我的邀请码</h2>
            <button onClick={async () => {
              const inv = await api.auth.generateInvite()
              setInvites(prev => [{ ...inv, created_at: new Date().toISOString() }, ...prev])
            }}
              className="text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105"
              style={{ background: 'rgba(var(--accent-primary),0.15)', border: '1px solid rgba(var(--accent-primary),0.3)', color: 'var(--color-gold)' }}>
              + 生成邀请码
            </button>
          </div>
          {invites.length === 0 ? (
            <p className="text-muted text-xs">还没有邀请码，点击上方按钮生成</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
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

        {/* Admin panel (aryuu only) */}
        {user?.is_admin && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="mt-6 rounded-2xl p-5"
            style={{ background: 'linear-gradient(180deg, rgba(255,100,50,0.05) 0%, rgba(var(--accent-bg-mid),0.8) 100%)', border: '1px solid rgba(255,100,50,0.2)' }}>
            <h2 className="font-serif text-sm font-bold text-orange-300 mb-1">⚡ 管理员面板</h2>
            <p className="text-muted text-[10px] mb-3">固定暗号：<code className="text-gold">33989</code>（邀请码系统关闭时生效）</p>
            <AdminUserList />
          </motion.div>
        )}
      </div>
    </Layout>
  )
}
