import type { User } from '../../../api/types'
import { ReadingPanel } from '../../../components/ReadingPanel'
import { CardGrid } from '../../../components/CardGrid'
import { ScoreBoard } from '../../../components/ScoreBoard'
import { JudgePanel } from '../../../components/JudgePanel'
import { ChatRoom } from '../../../components/ChatRoom'
import { EggAnimation } from '../../../components/EggAnimation'
import { DuelBoard } from '../../../components/DuelBoard'
import { DuelGiveModal } from '../../../components/DuelGiveModal'
import { RoomControlBar } from '../RoomControlBar'
import { StatusStrip } from '../StatusStrip'
import { MobileScoreSheet } from '../MobileScoreSheet'
import { ConnectionBanner } from '../ConnectionBanner'
import { DuelStatusBar } from '../DuelStatusBar'
import { ShuffleOverlay } from '../ShuffleOverlay'
import type { ChatMsg } from '../useChat'
import type { GameResult } from '../types'
import type { RoomGameState } from '../roomReducer'
import type { UseRoomGameDuel } from '../useRoomGame'

/** 对局战场视图契约：读牌区 + 状态条 + 控制栏 + 三种模式棋布 + 聊天 */
export interface RoomBattleViewProps {
  state: RoomGameState
  user: User | null
  connected: boolean
  /** WS 重连次数（ConnectionBanner 显示 n/10；缺省 0 表示未重连） */
  retries?: number
  chatMessages: ChatMsg[]
  eggEvent: { id: number; fromName: string; targetName: string; isMe: boolean } | null
  duel: UseRoomGameDuel
  onGrab: (cardId: number) => void
  onDuelGrab: (cardId: number) => void
  onDuelGive: (cardId: number) => void
  onChatSend: (text: string) => void
  onEgg: (targetId: number) => void
  onAudioEnded: () => void
  onBufferError: () => void
  onJoinBattle: () => Promise<void>
  onKick: (userId: number) => Promise<void>
  onPauseResume: () => void
  onCloseRoom: () => void
  onLeaveRoom: () => void
  onDebugEnd: (results: GameResult[]) => void
}

/**
 * 对局战场视图（reading/paused 态）。
 * 信息层级：连接横幅 > 读牌区 > 我的状态条 > 控制栏 > 棋布 > 计分；聊天降权重在底部。
 */
export function RoomBattleView({
  state, user, connected, retries = 0, chatMessages, eggEvent, duel,
  onGrab, onDuelGrab, onDuelGive, onChatSend, onEgg, onAudioEnded, onBufferError,
  onJoinBattle, onKick, onPauseResume, onCloseRoom, onLeaveRoom, onDebugEnd,
}: RoomBattleViewProps) {
  const room = state.roomState!.room
  const isHost = room.host_id === user?.id
  const isJudgeMode = room.mode === 'judge'
  const isDuelMode = room.mode === 'duel'
  const remainingCount = Array.from(state.cardRemaining.values()).filter(r => r > 0).length
  // 身份派生（StatusStrip）：旁观 > 裁判 > 玩家
  const myIdentity = state.isSpectator
    ? 'spectator' as const
    : (isJudgeMode && isHost ? 'judge' as const : 'player' as const)
  // 状态条倒计时源：决斗=轮次倒计时；经典/裁判=间隔倒计时
  const stripCountdown = isDuelMode ? duel.duelRoundTimer : state.intervalCountdown

  return (
    <div className="flex flex-col battle-viewport bg-ink-deep">

      {/* 连接横幅（仅断线/恢复时出现） */}
      <ConnectionBanner connected={connected} retries={retries} />

      {/* 读牌区 */}
      <ReadingPanel
        hintText={state.currentReading?.hintText ?? null}
        audioUrl={state.currentReading?.audioUrl ?? null}
        startRatio={state.currentReading?.startRatio}
        intervalSec={room.interval_sec}
        isActive={!!state.currentReading}
        isPaused={state.isPaused}
        countdown={state.countdown}
        intervalCountdown={state.intervalCountdown}
        onAudioEnded={onAudioEnded}
        onBufferError={onBufferError}
        isLastCard={state.isLastCard}
      />

      {/* 我的状态条：取代旧的三提示条，恒非空。
          onJoinBattle 恢复（2026-09-21 Owner 裁定：对局中旁观↔玩家切换是合法玩法，
          waiting-only 限制已撤）；duel 不显示（席位制）、training 局外人只能旁观 */}
      <StatusStrip
        identity={myIdentity}
        roundStatus={state.myRoundStatus}
        justJoined={state.justJoined && !state.isSpectator}
        countdown={stripCountdown}
        onJoinBattle={state.isSpectator && !isDuelMode && !room.training ? () => void onJoinBattle() : undefined}
      />

      {/* 控制栏（连接状态/房间码/房主控制/管理员操作/调试跳结算） */}
      <RoomControlBar
        connected={connected}
        roomId={room.id}
        roomCode={room.code}
        isHost={isHost}
        isPaused={state.isPaused}
        isReading={state.status === 'reading'}
        user={user}
        players={state.players}
        onPauseResume={onPauseResume}
        onCloseRoom={onCloseRoom}
        onLeaveRoom={onLeaveRoom}
        onDebugEnd={onDebugEnd}
      />

      {/* 主体：按模式分发棋布 */}
      {isDuelMode && duel.duelState ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <DuelBoard
              duelState={duel.duelState}
              currentUserId={user?.id ?? 0}
              currentCardId={duel.duelCurrentCardId}
              onGrab={onDuelGrab}
              arranging={duel.duelArranging}
              arrangeTimeout={duel.arrangeTimeout}
              p1Ready={duel.arrangeP1Ready}
              p2Ready={duel.arrangeP2Ready}
              onArrangeSwap={duel.onArrangeSwap}
              onArrangeCrossSwap={duel.onArrangeCrossSwap}
              onArrangeReady={duel.onArrangeReady}
            />
          </div>
        </div>
      ) : isDuelMode ? (
        // 对阵模式等待状态初始化
        <div className="flex flex-1 items-center justify-center">
          <span className="text-gold/60 font-serif animate-pulse">正在初始化对局…</span>
        </div>
      ) : isJudgeMode && isHost ? (
        // 裁判视图：上方选牌区 + 下方只读棋布
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="shrink-0 border-b border-white/5 h-[38%] overflow-hidden">
            <JudgePanel
              roomId={room.id}
              cards={state.cards}
              playedCardIds={new Set(Array.from(state.cardRemaining.entries()).filter(([, r]) => r <= 0).map(([id]) => id))}
              currentCardId={state.currentReading?.cardId ?? null}
              currentAudioId={state.currentReading?.cardAudioId ?? null}
              currentHintText={state.currentReading?.hintText ?? null}
              isJudgeWaiting={state.isJudgeWaiting}
            />
          </div>
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto relative">
              <div className="absolute top-2 left-0 right-0 flex justify-center z-10 pointer-events-none">
                <span className="text-white/20 text-tiny bg-black/40 px-2 py-0.5 rounded-full">
                  裁判视角 · 仅观察
                </span>
              </div>
              <CardGrid cards={state.cards} cardRemaining={state.cardRemaining} discardPile={state.discardPile} />
            </div>
            <div className="hidden md:flex shrink-0">
              <ScoreBoard
                players={state.players}
                currentUserId={user?.id ?? 0}
                hostId={room.host_id}
                remainingCount={remainingCount}
                totalCount={state.totalCardCount}
                onKick={onKick}
              />
            </div>
          </div>
        </div>
      ) : (
        // 玩家视图：棋布 + 计分板
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <CardGrid
              cards={state.cards}
              cardRemaining={state.cardRemaining}
              discardPile={state.discardPile}
              onGrab={onGrab}
            />
          </div>
          <div className="hidden md:flex shrink-0">
            <ScoreBoard
              players={state.players}
              currentUserId={user?.id ?? 0}
              hostId={room.host_id}
              remainingCount={remainingCount}
              totalCount={state.totalCardCount}
              onKick={onKick}
            />
          </div>
        </div>
      )}

      {/* 移动端计分抽屉（duel 模式不显示） */}
      {!isDuelMode && (
        <MobileScoreSheet
          players={state.players}
          currentUserId={user?.id ?? 0}
          hostId={room.host_id}
          isJudgeMode={isJudgeMode}
        />
      )}

      {/* Duel 轮次/倒计时信息 */}
      {isDuelMode && duel.duelState && (
        <DuelStatusBar
          duelState={duel.duelState}
          duelRound={duel.duelRound}
          duelRoundTimer={duel.duelRoundTimer}
          currentUserId={user?.id ?? 0}
        />
      )}

      {/* Duel 给牌弹窗 */}
      {duel.duelGiveCards && duel.duelGiveCards.length > 0 && (
        <DuelGiveModal cards={duel.duelGiveCards} onGive={onDuelGive} />
      )}

      {/* 聊天室（FAB 避让：移动端避让计分抽屉；duel 全断避让 DuelStatusBar/编排操作条——
          D12-补9 实测：FAB 会吞掉编排「准备」按钮的点击） */}
      <ChatRoom
        messages={chatMessages}
        players={state.players}
        currentUserId={user?.id ?? 0}
        isSpectator={state.isSpectator}
        onSend={onChatSend}
        onEgg={onEgg}
        fabClassName={isDuelMode ? 'bottom-16 right-4' : 'bottom-16 right-4 md:bottom-4'}
      />

      {/* 丢蛋动画 */}
      <EggAnimation event={eggEvent} />

      {/* 打乱弹窗 */}
      {state.shuffleBlocking && <ShuffleOverlay />}
    </div>
  )
}
