import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DuelGiveModalProps {
  cards: Array<{ id: number; display_text: string; cover_url: string }>
  onGive: (cardId: number) => void
}

export function DuelGiveModal({ cards, onGive }: DuelGiveModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="w-[90vw] max-w-md rounded-2xl p-5 mx-4"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.95) 0%, rgba(var(--accent-bg-mid),0.98) 100%)',
            border: '1px solid rgba(var(--accent-primary),0.2)',
            boxShadow: '0 0 40px rgba(var(--glow-color),0.15), 0 20px 60px rgba(0,0,0,0.6)',
          }}
        >
          {/* 标题 */}
          <div className="text-center mb-4">
            <h2 className="text-gold font-serif text-lg font-bold">
              -- 送牌时间 --
            </h2>
            <p className="text-pink-300/60 text-xs mt-1 font-serif italic">
              你抢到了对方区域的牌！选择一张自己的牌送给对方吧 (*'v'*)
            </p>
          </div>

          {/* 牌面网格 */}
          <div className="max-h-[50vh] overflow-y-auto">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}
            >
              {cards.map((card) => {
                const isSelected = selectedId === card.id
                return (
                  <motion.div
                    key={card.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedId(card.id)}
                    className="relative rounded-lg overflow-hidden cursor-pointer"
                    style={{
                      aspectRatio: '3/4',
                      border: isSelected
                        ? '2px solid var(--color-gold)'
                        : '1px solid rgba(var(--accent-primary),0.15)',
                      boxShadow: isSelected
                        ? '0 0 12px rgba(var(--glow-color),0.5)'
                        : '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    {card.cover_url ? (
                      <img src={card.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(160deg, var(--color-surface), var(--color-ink))' }}>
                        <span className="text-gold/40 text-xs">{card.display_text.slice(0, 4)}</span>
                      </div>
                    )}
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.4)' }}
                      >
                        <span className="text-gold text-lg font-bold">OK</span>
                      </motion.div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center"
                      style={{ background: 'rgba(0,0,0,0.7)' }}>
                      <span className="text-white/80 leading-none" style={{ fontSize: '0.55rem' }}>
                        {card.display_text.slice(0, 6)}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* 确认按钮 */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={selectedId === null}
            onClick={() => { if (selectedId !== null) onGive(selectedId) }}
            className="btn-gold w-full mt-4 py-3 text-sm font-serif disabled:opacity-40 transition-all"
          >
            {selectedId !== null ? '「送出这张牌！」(ノ>ω<)ノ' : '请选择一张牌…'}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
