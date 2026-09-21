import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, SkipForward, Zap, Flag, DoorClosed, LogOut, MoreHorizontal } from 'lucide-react'
import { api } from '../../api/client'
import type { User, RoomPlayer } from '../../api/types'
import { Button, ConfirmDialog } from '../../components/ui'
import { ControlMenu, buildMockResults } from './ControlMenu'
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

/** 控制栏：连接状态 / 房间码 / 房主控制（暂停·跳过·解散）/ 管理员强制结束 / 调试跳结算；md 以下操作收进 ControlMenu */
export function RoomControlBar({
  connected, roomId, roomCode, isHost, isPaused, isReading, user, players,
  onPauseResume, onCloseRoom, onLeaveRoom, onDebugEnd,
}: RoomControlBarProps) {
  // 危险/调试动作走统一确认弹窗（替换原 window.confirm）
  const [confirmAction, setConfirmAction] = useState<'forceEnd' | 'debugEnd' | null>(null)
  // 窄屏「⋯」操作菜单显隐
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    // md 以下外露仅连接点 + 房间码 + 「⋯」（其余操作收进 ControlMenu）；桌面保持横排可滚
    <div className="flex items-center gap-3 px-4 py-2 bg-ink-deep/60 border-b border-gold/10 overflow-x-auto">
      {/* 连接状态 */}
      <div className="flex items-center gap-1.5 shrink-0">
        <motion.div animate={{ opacity: connected ? 1 : [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: connected ? 0 : Infinity }}
          className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-crimson'}`} />
        <span className="text-body-text/30 text-tiny">{connected ? '已连接' : '重连中…'}</span>
      </div>

      {/* 房间码 */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-gold/5 border border-gold/10 shrink-0">
        <span className="text-body-text/30 text-tiny">房间</span>
        <span className="text-gold/80 font-serif text-tiny font-bold tracking-widest">{roomCode}</span>
      </div>

      {/* 弹性间隔：最小 2 窄屏下让位给横向滚动 */}
      <div className="flex-1 min-w-2" />

      {/* 桌面：操作横排（md 以下收进 ControlMenu） */}
      <div className="hidden md:flex items-center gap-3">
        {/* 房主控制 */}
        {isHost && (
          <Button size="sm" variant={isPaused ? 'gold' : 'ghost'} className="shrink-0"
            icon={isPaused ? <Play size={13} /> : <Pause size={13} />}
            onClick={onPauseResume}>
            {isPaused ? '继续对局' : '暂停'}
          </Button>
        )}
        {isHost && (
          <Button size="sm" variant="ghost" className="shrink-0" icon={<SkipForward size={13} />}
            onClick={() => api.rooms.nextCard(roomId).catch(() => null)}
            title="跳过当前牌，直接下一首">
            跳过
          </Button>
        )}
        {isHost ? (
          <Button size="sm" variant="danger" className="shrink-0" icon={<DoorClosed size={13} />} onClick={onCloseRoom}>
            解散战场
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="shrink-0" icon={<LogOut size={13} />} onClick={onLeaveRoom}>
            退出房间
          </Button>
        )}
        {/* 管理员专属：强制结束对局 */}
        {user?.is_admin && (
          <Button size="sm" variant="outline" className="shrink-0" icon={<Zap size={13} />} onClick={() => setConfirmAction('forceEnd')}>
            强制结束
          </Button>
        )}
        {/* 跳到结算画面（调试用） */}
        {(isHost || user?.is_admin) && isReading && (
          <Button size="sm" variant="ghost" className="shrink-0" icon={<Flag size={13} />} onClick={() => setConfirmAction('debugEnd')}>
            跳到结算
          </Button>
        )}
      </div>

      {/* 窄屏收纳入口：点开 ControlMenu */}
      <Button size="sm" variant="ghost" className="md:hidden shrink-0"
        icon={<MoreHorizontal size={13} />} aria-label="更多操作"
        onClick={() => setMenuOpen(true)} />

      <ConfirmDialog
        open={confirmAction === 'forceEnd'}
        title="强制结束本场对局？"
        description="对局立即结束并进入结算，无法撤销"
        confirmText="强制结束"
        danger
        onConfirm={() => {
          setConfirmAction(null)
          void api.rooms.forceEnd(roomId).catch(() => null)
        }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'debugEnd'}
        title="跳过剩余对局，直接进入结算画面？"
        confirmText="跳到结算"
        onConfirm={() => {
          setConfirmAction(null)
          onDebugEnd(buildMockResults(players))
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ControlMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomId={roomId}
        isHost={isHost}
        isPaused={isPaused}
        isReading={isReading}
        user={user}
        players={players}
        onPauseResume={onPauseResume}
        onCloseRoom={onCloseRoom}
        onLeaveRoom={onLeaveRoom}
        onDebugEnd={onDebugEnd}
      />
    </div>
  )
}
