import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { api } from '../../api/client'
import type { User, RoomPlayer } from '../../api/types'
import type { GameResult } from './types'

interface RoomControlBarProps {
  connected: boolean
  roomId: number
  roomCode: string
  isHost: boolean
  isPaused: boolean
  /** 当前处于 reading 阶段（控制"跳到结算"调试按钮的可见性） */
  isReading: boolean
  user: User | null
  players: RoomPlayer[]
  onPauseResume: () => void
  onCloseRoom: () => void
  onLeaveRoom: () => void
  /** 调试：跳到结算画面——组件生成模拟结果，页面负责落状态 */
  onDebugEnd: (results: GameResult[]) => void
}

/** 控制栏：连接状态 / 房间码 / 房主控制（暂停·跳过·解散）/ 管理员强制结束 / 调试跳结算 */
export function RoomControlBar({
  connected, roomId, roomCode, isHost, isPaused, isReading, user, players,
  onPauseResume, onCloseRoom, onLeaveRoom, onDebugEnd,
}: RoomControlBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2"
      style={{ background: 'rgb(var(--accent-bg-mid)/ 0.6)', borderBottom: '1px solid rgb(var(--accent-primary)/ 0.08)' }}>
      {/* 连接状态 */}
      <div className="flex items-center gap-1.5">
        <motion.div animate={{ opacity: connected ? 1 : [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: connected ? 0 : Infinity }}
          className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-crimson'}`} />
        <span className="text-white/30 text-xs">{connected ? '已连接' : '重连中…'}</span>
      </div>

      {/* 房间码 */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
        style={{ background: 'rgb(var(--accent-primary)/ 0.05)', border: '1px solid rgb(var(--accent-primary)/ 0.1)' }}>
        <span className="text-white/30 text-xs">房间</span>
        <span className="text-gold/80 font-serif text-xs font-bold tracking-widest">{roomCode}</span>
      </div>

      <div className="flex-1" />

      {/* 房主控制 */}
      {isHost && (
        <motion.button onClick={onPauseResume} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: isPaused ? 'rgb(var(--accent-primary)/ 0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isPaused ? 'rgb(var(--accent-primary)/ 0.4)' : 'rgba(255,255,255,0.08)'}`, color: isPaused ? 'rgb(var(--color-gold))' : 'rgba(255,255,255,0.5)' }}>
          {isPaused ? '▶ 继续战斗！' : '⏸ 暂停'}
        </motion.button>
      )}
      {isHost && (
        <motion.button
          onClick={() => api.rooms.nextCard(roomId).catch(() => null)}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.25)', color: 'rgba(255,165,0,0.8)' }}
          title="跳过当前牌，直接下一首">
          ⏭ 跳过
        </motion.button>
      )}
      {isHost ? (
        <motion.button onClick={onCloseRoom} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)', color: 'rgba(192,57,43,0.7)' }}>
          解散战场
        </motion.button>
      ) : (
        <motion.button onClick={onLeaveRoom} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
          溜了 (｀・ω・´)
        </motion.button>
      )}
      {/* aryuu 专属：强制结束对局 */}
      {user?.is_admin && (
        <motion.button
          onClick={async () => {
            if (!confirm('强制结束本场对局？')) return
            await api.rooms.forceEnd(roomId).catch(() => null)
          }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="px-3 py-1.5 rounded-lg text-xs transition-all ml-1"
          style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.35)', color: 'rgba(255,165,0,0.9)' }}>
          <Zap size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
          强制结束
        </motion.button>
      )}
      {/* 跳到结算画面（调试用） */}
      {(isHost || user?.is_admin) && isReading && (
        <motion.button
          onClick={() => {
            if (!confirm('跳过剩余对局，直接进入结算画面？')) return
            // 生成模拟的结算数据
            const mockResults: GameResult[] = players
              .filter(p => p.role === 'player')
              .map((p, idx) => ({
                user_id: p.user_id,
                username: p.username,
                score: p.score,
                rank: idx + 1,
                penalty_count: 0,
                grabbed_cards: [],
              }))
              .sort((a, b) => b.score - a.score)
              .map((r, idx) => ({ ...r, rank: idx + 1 }))
            onDebugEnd(mockResults)
          }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="px-3 py-1.5 rounded-lg text-xs transition-all ml-1"
          style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', color: 'rgba(139,92,246,0.9)' }}>
          🏁 跳到结算
        </motion.button>
      )}
    </div>
  )
}
