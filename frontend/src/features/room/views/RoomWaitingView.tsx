import { useState } from 'react'
import type { Room, RoomPlayer, User } from '../../../api/types'
import { Button, ConfirmDialog } from '../../../components/ui'
import { WaitingLobby } from '../../../components/WaitingLobby'
import { ChatRoom } from '../../../components/ChatRoom'
import { EggAnimation } from '../../../components/EggAnimation'
import type { ChatMsg } from '../useChat'

interface DuelSeats {
  seat1: { user_id: number; username: string } | null
  seat2: { user_id: number; username: string } | null
}

/** 等待大厅视图（房间码操作栏 + 大厅 + 聊天）契约 */
export interface RoomWaitingViewProps {
  room: Room
  players: RoomPlayer[]
  user: User | null
  preloadProgress: { loaded: number; total: number } | null
  duelSeats: DuelSeats
  chatMessages: ChatMsg[]
  eggEvent: { id: number; fromName: string; targetName: string; isMe: boolean } | null
  onRoleChange: (isSpectator: boolean) => void
  onKick: (userId: number) => Promise<void>
  onClaimSeat: (seat: 1 | 2) => Promise<void>
  onLeaveSeat: () => Promise<void>
  onKickSeat: (userId: number) => Promise<void>
  onChatSend: (text: string) => void
  onEgg: (targetId: number) => void
  onCloseRoom: () => Promise<void>
  onLeaveRoom: () => void
}

/** 房间等待视图：房间操作栏 + WaitingLobby + 聊天室 + 丢蛋动画 */
export function RoomWaitingView({
  room, players, user, preloadProgress, duelSeats, chatMessages, eggEvent,
  onRoleChange, onKick, onClaimSeat, onLeaveSeat, onKickSeat,
  onChatSend, onEgg, onCloseRoom, onLeaveRoom,
}: RoomWaitingViewProps) {
  // 解散/离开走统一确认弹窗（替换原 window.confirm）
  const [confirmAction, setConfirmAction] = useState<'close' | 'leave' | null>(null)
  const isHost = room.host_id === user?.id

  return (
    <div className="relative">
      {/* 房间操作栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-muted text-tiny">房间</span>
          <span className="text-gold font-serif text-caption font-bold tracking-widest">{room.code}</span>
        </div>
        <div className="flex items-center gap-2">
          {isHost ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmAction('close')}>
              解散战场
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmAction('leave')}>
              退出房间
            </Button>
          )}
        </div>
      </div>

      <WaitingLobby
        room={room}
        players={players}
        currentUserId={user?.id ?? 0}
        onRoleChange={onRoleChange}
        onKick={onKick}
        preloadProgress={preloadProgress}
        duelSeats={duelSeats}
        onClaimSeat={onClaimSeat}
        onLeaveSeat={onLeaveSeat}
        onKickSeat={onKickSeat}
      />

      <ChatRoom
        messages={chatMessages}
        players={players}
        currentUserId={user?.id ?? 0}
        isSpectator={false}
        onSend={onChatSend}
        onEgg={onEgg}
      />
      <EggAnimation event={eggEvent} />

      <ConfirmDialog
        open={confirmAction === 'close'}
        title="解散战场？"
        description="所有成员将被移出，无法撤销"
        confirmText="解散战场"
        danger
        onConfirm={() => { setConfirmAction(null); void onCloseRoom() }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'leave'}
        title="要退出战场吗？"
        description="对局不会为你暂停"
        confirmText="退出房间"
        onConfirm={() => { setConfirmAction(null); onLeaveRoom() }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
