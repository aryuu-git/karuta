import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

interface CardInfo {
  id: number
  display_text: string
  cover_url: string
}

interface DuelEndData {
  winner: string
  winnerId: number
  isTie: boolean
  rounds: number
  p1: { id: number; username: string; grabbed: CardInfo[]; remaining: CardInfo[] }
  p2: { id: number; username: string; grabbed: CardInfo[]; remaining: CardInfo[] }
}

interface DuelGameOverProps {
  data: DuelEndData
  currentUserId: number
}

export function DuelGameOver({ data, currentUserId }: DuelGameOverProps) {
  const navigate = useNavigate()
  const isWinner = data.winnerId === currentUserId
  const isPlayer = currentUserId === data.p1.id || currentUserId === data.p2.id

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 flex items-center justify-center washi-bg"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        className="relative z-10 bg-ink-deep/95 border border-gold/30 rounded-2xl p-5 sm:p-6 max-w-2xl w-full mx-4 shadow-gold-lg overflow-y-auto"
        style={{ maxHeight: '92vh', boxShadow: '0 0 60px rgba(var(--accent-primary),0.2), 0 20px 40px rgba(0,0,0,0.6)' }}
      >
        {/* 标题 */}
        <div className="text-center mb-5">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="font-serif text-3xl sm:text-4xl font-bold text-gold-shimmer mb-1"
            style={{ textShadow: '0 0 40px rgba(var(--accent-primary),0.4)' }}
          >
            {data.isTie ? '🤝 平局！' : isWinner ? '🏆 你赢了！' : `⚔️ ${data.winner} 获胜！`}
          </motion.h1>
          <p className="text-muted text-xs">共 {data.rounds} 轮</p>
          <div className="h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent mt-3" />
        </div>

        {/* 双方对比 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <PlayerResult
            player={data.p1}
            isWinner={data.winnerId === data.p1.id}
            isTie={data.isTie}
            isMe={data.p1.id === currentUserId}
            delay={0.5}
          />
          <PlayerResult
            player={data.p2}
            isWinner={data.winnerId === data.p2.id}
            isTie={data.isTie}
            isMe={data.p2.id === currentUserId}
            delay={0.6}
          />
        </div>

        {/* 详细展示 */}
        <div className="space-y-4">
          <CardSection
            title={`${data.p1.username} 抢到的牌`}
            cards={data.p1.grabbed}
            color="gold"
            delay={0.7}
          />
          <CardSection
            title={`${data.p2.username} 抢到的牌`}
            cards={data.p2.grabbed}
            color="gold"
            delay={0.8}
          />
          {data.p1.remaining.length > 0 && (
            <CardSection
              title={`${data.p1.username} 未被抢走的牌`}
              cards={data.p1.remaining}
              color="muted"
              delay={0.9}
            />
          )}
          {data.p2.remaining.length > 0 && (
            <CardSection
              title={`${data.p2.username} 未被抢走的牌`}
              cards={data.p2.remaining}
              color="muted"
              delay={1.0}
            />
          )}
        </div>

        {/* 返回按钮 */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          onClick={() => navigate('/')}
          className="btn-gold w-full mt-6 py-3 text-sm font-serif"
        >
          {isPlayer ? '「再战江湖！」(ง •̀_•́)ง' : '返回大厅'}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

function PlayerResult({ player, isWinner, isTie, isMe, delay }: {
  player: { id: number; username: string; grabbed: CardInfo[]; remaining: CardInfo[] }
  isWinner: boolean
  isTie: boolean
  isMe: boolean
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-3 text-center"
      style={{
        background: isWinner ? 'rgba(var(--accent-primary),0.08)' : 'rgba(255,255,255,0.02)',
        border: isWinner ? '1px solid rgba(var(--accent-primary),0.3)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="text-xs text-muted mb-1">
        {isWinner && !isTie ? '👑 胜者' : isTie ? '🤝' : ''}
      </div>
      <div className={`font-serif text-sm font-bold ${isMe ? 'text-gold' : 'text-white/80'}`}>
        {player.username}
        {isMe && <span className="text-gold/50 text-xs ml-1">(我)</span>}
      </div>
      <div className="mt-2 flex items-center justify-center gap-3 text-xs">
        <span className="text-gold/80">抢到 <b>{player.grabbed.length}</b></span>
        <span className="text-muted">剩余 <b>{player.remaining.length}</b></span>
      </div>
    </motion.div>
  )
}

function CardSection({ title, cards, color, delay }: {
  title: string
  cards: CardInfo[]
  color: 'gold' | 'muted'
  delay: number
}) {
  if (cards.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/15 to-transparent" />
        <span className={`text-xs font-serif shrink-0 ${color === 'gold' ? 'text-gold/70' : 'text-muted/60'}`}>
          {title} ({cards.length})
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-gold/15 via-transparent to-transparent" />
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))' }}>
        {cards.map((card, i) => (
          <motion.div
            key={card.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: color === 'muted' ? 0.5 : 1 }}
            transition={{ delay: delay + i * 0.03, ease: 'backOut' }}
            className="relative rounded-md overflow-hidden"
            style={{
              aspectRatio: '3/4',
              border: `1px solid rgba(var(--accent-primary),${color === 'gold' ? '0.2' : '0.08'})`,
              filter: color === 'muted' ? 'grayscale(0.6)' : undefined,
            }}
            title={card.display_text}
          >
            {card.cover_url ? (
              <img src={card.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
                <span className="text-gold/20 text-xs font-serif">{card.display_text.slice(0, 3)}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
