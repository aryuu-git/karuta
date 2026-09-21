import { Button } from '../../components/ui'

/** 我的身份：参与抢牌的玩家 / 旁观者 / 裁判 */
export type StatusStripIdentity = 'player' | 'spectator' | 'judge'
/** 我在本首的回合状态（与 roomReducer.myRoundStatus 同源） */
export type StatusStripRoundStatus = 'idle' | 'claimed' | 'banned'

export interface StatusStripProps {
  identity: StatusStripIdentity
  roundStatus: StatusStripRoundStatus
  /** 刚加入进行中的对局：本首结束后才可参与抢牌 */
  justJoined: boolean
  /** 本首剩余秒数（无倒计时源时为 null） */
  countdown: number | null
  /** 旁观态「加入战斗」入口（训练模式/决斗模式不提供） */
  onJoinBattle?: () => void
}

/** 各状态的样式与文案（渲染优先级见组件内分支顺序） */
const STYLES = {
  justJoined: 'text-muted bg-body-text/5 border-white/5',
  judge: 'text-gold bg-gold/10 border-gold/25',
  spectator: 'text-info bg-info/10 border-info/20',
  claimed: 'text-success bg-success/10 border-success/20',
  banned: 'text-danger/60 bg-danger/5 border-danger/15',
  active: 'text-gold bg-gold/15 border-gold/40',
} as const

/**
 * 我的状态条（设计规格 §5.1）：读牌区正下方恒驻单行，
 * 回答「我现在处于什么状态、能干什么」。取代旧的三提示条。
 * 渲染优先级：justJoined > 裁判 > 旁观 > 已抢到 > 本首出局 > 可抢。
 * 可抢态为全屏唯一强提示（gold 高亮 + 微脉冲）。纯 CSS，不依赖 framer-motion。
 */
export function StatusStrip({ identity, roundStatus, justJoined, countdown, onJoinBattle }: StatusStripProps) {
  // 优先级派生：每级命中即返回，保证状态条恒非空
  const render = () => {
    if (justJoined && identity === 'player') {
      return { text: '⏳ 本首结束后可参与抢牌', cls: STYLES.justJoined, strong: false }
    }
    if (identity === 'judge') {
      return { text: '👑 你是裁判 · 从上方选牌区选择要读的牌', cls: STYLES.judge, strong: false }
    }
    if (identity === 'spectator') {
      return { text: '👁 旁观中', cls: STYLES.spectator, strong: false }
    }
    if (roundStatus === 'claimed') {
      return { text: '✓ 你抢到了 +1 · 等待下一首', cls: STYLES.claimed, strong: false }
    }
    if (roundStatus === 'banned') {
      return { text: '✕ 本首出局 · 等待下一首', cls: STYLES.banned, strong: false }
    }
    return { text: '🎵 可抢牌！点击牌面抢答', cls: STYLES.active, strong: true }
  }
  const { text, cls, strong } = render()

  return (
    <div className={`flex items-center justify-between gap-2 px-4 py-2 border-b ${cls}`}>
      <span className="flex items-center gap-2 text-tiny font-medium truncate">
        {strong && (
          // 可抢态微脉冲：全屏唯一强提示锚点
          <span className="relative flex w-2 h-2 shrink-0" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-gold animate-ping opacity-60" />
            <span className="relative w-2 h-2 rounded-full bg-gold" />
          </span>
        )}
        <span className="truncate">{text}</span>
      </span>

      {identity === 'spectator' && onJoinBattle && (
        <Button size="sm" variant="outline" icon={<span aria-hidden="true">⚔️</span>} onClick={onJoinBattle} className="shrink-0">
          加入战斗
        </Button>
      )}

      {strong && countdown !== null && (
        <span className="shrink-0 text-tiny tabular-nums opacity-80">本首 {countdown}s ⏱</span>
      )}
    </div>
  )
}
