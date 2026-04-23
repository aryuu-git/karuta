import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layout } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { UserStats } from '../api/types'

function StatCard({ icon, label, value, sub, color = '#e8a4b8', delay = 0 }: {
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
      className="rounded-xl p-5 flex flex-col gap-2"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
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
              <stop offset="50%" stopColor="#e8a4b8" />
              <stop offset="100%" stopColor="#f5c6d0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-serif" style={{ color: '#e8a4b8' }}>{pct}%</span>
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
          className="flex items-center gap-5 mb-8 p-6 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(232,164,184,0.08) 0%, rgba(45,10,26,0.6) 100%)', border: '1px solid rgba(232,164,184,0.15)' }}
        >
          {/* 头像 */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-2xl font-bold font-serif"
            style={{ background: 'linear-gradient(135deg, rgba(232,164,184,0.3), rgba(45,10,26,0.8))', border: '2px solid rgba(232,164,184,0.4)', color: '#e8a4b8' }}>
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-gold">{user?.username}</h1>
            <p className="text-muted text-sm mt-0.5">
              {stats?.total_games
                ? `参与了 ${stats.total_games} 场对局 (ง •̀_•́)ง`
                : '还没有对局记录哦 (｡•́︿•̀｡)'}
            </p>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-16 text-gold animate-pulse font-serif">
            统计战绩中… (｡･ω･｡)
          </div>
        ) : !stats || stats.total_games === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-16">
            <div className="text-5xl mb-4">🌸</div>
            <p className="text-white/50 text-base font-serif mb-2">还没有完整对局记录</p>
            <p className="text-muted text-sm mb-6">快去参加对局，建立你的战绩吧！(ﾉ◕ヮ◕)ﾉ</p>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="btn-gold text-sm">
              ⚔️ 去战场大厅
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
                sub="所有场次合计" color="#f5c6d0" />
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
                      style={{ background: 'rgba(232,164,184,0.1)', border: '1px solid rgba(232,164,184,0.25)' }}>
                      <span className="text-base">🌐</span>
                      <div>
                        <p className="text-xs font-medium" style={{ color: '#e8a4b8' }}>世一网</p>
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
      </div>
    </Layout>
  )
}
