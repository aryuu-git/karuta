import { useState } from 'react'
import { Pause, Play, SkipForward, Zap, Flag, DoorClosed, LogOut, MoreHorizontal } from 'lucide-react'
import { api } from '../../api/client'
import type { User, RoomPlayer } from '../../api/types'
import { Button, ConfirmDialog, Menu, type MenuItem } from '../../components/ui'
import type { GameResult } from './types'

export interface ControlMenuProps {
  roomId: number
  isHost: boolean
  isPaused: boolean
  /** 当前处于 reading 阶段（控制"跳到结算"调试项的可见性） */
  isReading: boolean
  user: User | null
  players: RoomPlayer[]
  onPauseResume: () => void
  onCloseRoom: () => void
  onLeaveRoom: () => void
  /** 调试：跳到结算画面——菜单生成模拟结果，页面负责落状态 */
  onDebugEnd: (results: GameResult[]) => void
}

/** 生成模拟结算数据（调试跳结算用；桌面控制栏共用） */
export function buildMockResults(players: RoomPlayer[]): GameResult[] {
  return players
    .filter(p => p.role === 'player')
    .map((p) => ({ user_id: p.user_id, username: p.username, score: p.score, rank: 0, penalty_count: 0, grabbed_cards: [] }))
    .sort((a, b) => b.score - a.score)
    .map((r, idx) => ({ ...r, rank: idx + 1 }))
}

/**
 * 操作菜单（设计规格 §5.7）：md 以下收纳 RoomControlBar 的全部操作。
 * 自带「⋯」触发按钮（ui/Menu 下拉），回调接口与 RoomControlBar 桌面按钮一致；
 * 强制结束/跳到结算沿用二次确认。
 */
export function ControlMenu({
  roomId, isHost, isPaused, isReading, user, players,
  onPauseResume, onCloseRoom, onLeaveRoom, onDebugEnd,
}: ControlMenuProps) {
  /** 菜单开合（「⋯」触发钮仅窄屏 md 以下展示） */
  const [open, setOpen] = useState(false)
  /** 待二次确认的动作：forceEnd=强制结束；debugEnd=跳到结算 */
  const [confirmAction, setConfirmAction] = useState<'forceEnd' | 'debugEnd' | null>(null)

  // 菜单条目逐条映射原 MenuItem 行；确认语义的动作在 onSelect 里只挂起 ConfirmDialog
  // 色调：Menu 行仅 default/danger 两档，原 danger（解散·红）与 warning（强制结束·橙）统一并入 danger
  const items: MenuItem[] = [
    ...(isHost
      ? [{
          key: 'pause',
          icon: isPaused ? <Play size={16} /> : <Pause size={16} />,
          label: isPaused ? '继续对局' : '暂停',
          onSelect: onPauseResume,
        }]
      : []),
    ...(isHost
      ? [{
          key: 'skip',
          icon: <SkipForward size={16} />,
          label: '跳过',
          onSelect: () => { void api.rooms.nextCard(roomId).catch(() => null) },
        }]
      : []),
    isHost
      ? {
          key: 'closeRoom',
          icon: <DoorClosed size={16} />,
          label: '解散战场',
          tone: 'danger' as const,
          onSelect: onCloseRoom,
        }
      : {
          key: 'leaveRoom',
          icon: <LogOut size={16} />,
          label: '退出房间',
          onSelect: onLeaveRoom,
        },
    ...(user?.is_admin
      ? [{
          key: 'forceEnd',
          icon: <Zap size={16} />,
          label: '强制结束',
          tone: 'danger' as const,
          onSelect: () => setConfirmAction('forceEnd'),
        }]
      : []),
    ...((isHost || user?.is_admin) && isReading
      ? [{
          key: 'debugEnd',
          icon: <Flag size={16} />,
          label: '跳到结算',
          onSelect: () => setConfirmAction('debugEnd'),
        }]
      : []),
  ]

  return (
    <>
      {/* 「⋯」收纳入口 + 下拉菜单：absolute 挂外层 relative 容器，避免下拉面板被控制条 overflow 裁剪 */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-dropdown">
        <Menu
          open={open}
          onOpenChange={setOpen}
          align="end"
          trigger={<Button size="sm" variant="ghost" className="md:hidden" icon={<MoreHorizontal size={16} />} aria-label="更多操作" />}
          items={items}
        />
      </div>

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
    </>
  )
}
