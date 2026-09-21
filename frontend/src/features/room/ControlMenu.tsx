import { useState, type ReactNode } from 'react'
import { Pause, Play, SkipForward, Zap, Flag, DoorClosed, LogOut } from 'lucide-react'
import { api } from '../../api/client'
import type { User, RoomPlayer } from '../../api/types'
import { Button, ConfirmDialog, Dialog } from '../../components/ui'
import type { GameResult } from './types'

export interface ControlMenuProps {
  open: boolean
  onClose: () => void
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

interface MenuItemProps {
  icon: ReactNode
  label: string
  danger?: boolean
  /** 收起菜单 */
  onClose: () => void
  action: () => void
}

/** 菜单项按钮：点击先收起菜单，再执行动作 */
function MenuItem({ icon, label, danger, onClose, action }: MenuItemProps) {
  return (
    <Button
      variant={danger ? 'danger' : 'ghost'}
      size="md"
      className="w-full justify-start"
      icon={icon}
      onClick={() => { onClose(); action() }}
    >
      {label}
    </Button>
  )
}

/**
 * 操作菜单（设计规格 §5.7）：md 以下收纳 RoomControlBar 的全部操作。
 * 回调接口与 RoomControlBar 桌面按钮一致；强制结束/跳到结算沿用二次确认。
 */
export function ControlMenu({
  open, onClose, roomId, isHost, isPaused, isReading, user, players,
  onPauseResume, onCloseRoom, onLeaveRoom, onDebugEnd,
}: ControlMenuProps) {
  const [confirmAction, setConfirmAction] = useState<'forceEnd' | 'debugEnd' | null>(null)

  return (
    <>
      <Dialog open={open} onClose={onClose} title="操作" size="sm">
        <div className="flex flex-col gap-2">
          {isHost && (
            <MenuItem
              icon={isPaused ? <Play size={15} /> : <Pause size={15} />}
              label={isPaused ? '继续对局' : '暂停'}
              onClose={onClose}
              action={onPauseResume}
            />
          )}
          {isHost && (
            <MenuItem
              icon={<SkipForward size={15} />}
              label="跳过"
              onClose={onClose}
              action={() => { void api.rooms.nextCard(roomId).catch(() => null) }}
            />
          )}
          {isHost ? (
            <MenuItem
              icon={<DoorClosed size={15} />}
              label="解散战场"
              danger
              onClose={onClose}
              action={onCloseRoom}
            />
          ) : (
            <MenuItem
              icon={<LogOut size={15} />}
              label="退出房间"
              onClose={onClose}
              action={onLeaveRoom}
            />
          )}
          {user?.is_admin && (
            <MenuItem
              icon={<Zap size={15} />}
              label="强制结束"
              onClose={onClose}
              action={() => setConfirmAction('forceEnd')}
            />
          )}
          {(isHost || user?.is_admin) && isReading && (
            <MenuItem
              icon={<Flag size={15} />}
              label="跳到结算"
              onClose={onClose}
              action={() => setConfirmAction('debugEnd')}
            />
          )}
        </div>
      </Dialog>

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
