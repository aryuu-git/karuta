import { useParams } from 'react-router-dom'
import { Button, PageSpinner, EmptyState } from '../components/ui'
import { GameOver } from '../components/GameOver'
import { DuelGameOver } from '../components/DuelGameOver'
import { useAuth } from '../hooks/useAuth'
import { useRoomGame } from '../features/room/useRoomGame'
import { RoomWaitingView } from '../features/room/views/RoomWaitingView'
import { RoomBattleView } from '../features/room/views/RoomBattleView'

/**
 * 对战房间页（组装层，重构 R3/R4）。
 * 职责边界：
 * - 状态迁移：roomReducer（纯函数）；副作用编排：useRoomGame（WS/toast/音效/定时器/动作）；
 * - 本页只做视图分发：加载 → 等待大厅 → 对局战场（经典/裁判/对阵）→ 结算；
 * - 导航壳由路由层 AppLayout 提供，页面不再自裹 Layout。
 */
export function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const roomId = parseInt(id ?? '0', 10)

  const {
    state, connected, preloadProgress, chatMessages, eggEvent, duel,
    handleGrab, handleDuelGrab, handleDuelGive, handleChatSend, handleEgg,
    handleAudioEnded, handleBufferError,
    joinBattle, kickPlayer, claimSeat, leaveSeat, kickSeat,
    pauseResume, closeRoom, leaveRoom, setSpectator, debugEnd, retries,
  } = useRoomGame(roomId, user)

  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <PageSpinner text="战场加载中…" />
      </div>
    )
  }

  if (state.error || !state.roomState) {
    // 403 与 404 语义区分（D12-补8）：已登录但不在房间 ≠ 房间不存在
    const notInRoom = state.errorCode === 'NOT_IN_ROOM'
    return (
      <div className="flex items-center justify-center py-32">
        <EmptyState
          icon={notInRoom ? '🗝️' : '😣'}
          title={notInRoom ? '你还未加入这个房间' : '找不到这个战场'}
          description={notInRoom
            ? '这个房间存在，但你不是它的成员。请通过战友发来的邀请链接加入。'
            : (state.error ?? '这个战场可能已经解散了')}
          action={<Button variant="outline" onClick={leaveRoom}>回到大本营</Button>}
        />
      </div>
    )
  }

  // 结算页 rematch 所需的房间上下文（error 守卫已保证 roomState 非空）
  const room = state.roomState.room
  const isHost = room.host_id === (user?.id ?? 0)

  // 对阵结算
  if (state.status === 'end' && state.roomState.room.mode === 'duel' && duel.duelEndData) {
    return <DuelGameOver data={duel.duelEndData} currentUserId={user?.id ?? 0} roomId={room.id} isHost={isHost} deckId={room.deck_id} />
  }

  // 经典/裁判结算
  if (state.status === 'end' && state.gameResults) {
    return <GameOver results={state.gameResults} currentUserId={user?.id ?? 0} lastCardWinnerId={state.lastCardWinnerId} roomId={room.id} isHost={isHost} deckId={room.deck_id} />
  }

  // 等待大厅
  if (state.status === 'waiting') {
    return (
      <RoomWaitingView
        room={state.roomState.room}
        players={state.players}
        user={user}
        preloadProgress={preloadProgress}
        duelSeats={duel.duelSeats}
        chatMessages={chatMessages}
        eggEvent={eggEvent}
        onRoleChange={setSpectator}
        onKick={kickPlayer}
        onClaimSeat={claimSeat}
        onLeaveSeat={leaveSeat}
        onKickSeat={kickSeat}
        onChatSend={handleChatSend}
        onEgg={handleEgg}
        onCloseRoom={closeRoom}
        onLeaveRoom={leaveRoom}
      />
    )
  }

  // 对局战场（经典 / 裁判 / 对阵）
  return (
    <RoomBattleView
      state={state}
      user={user}
      connected={connected}
      retries={retries}
      chatMessages={chatMessages}
      eggEvent={eggEvent}
      duel={duel}
      onGrab={handleGrab}
      onDuelGrab={handleDuelGrab}
      onDuelGive={handleDuelGive}
      onChatSend={handleChatSend}
      onEgg={handleEgg}
      onAudioEnded={handleAudioEnded}
      onBufferError={handleBufferError}
      onJoinBattle={joinBattle}
      onKick={kickPlayer}
      onPauseResume={pauseResume}
      onCloseRoom={closeRoom}
      onLeaveRoom={leaveRoom}
      onDebugEnd={debugEnd}
    />
  )
}
