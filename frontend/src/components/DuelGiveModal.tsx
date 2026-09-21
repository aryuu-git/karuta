import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui'

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
        className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 backdrop-blur"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="w-[90vw] max-w-md rounded-2xl p-5 mx-4 border border-gold/20"
          style={{
            background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.95) 0%, rgb(var(--accent-bg-mid)/ 0.98) 100%)',
            boxShadow: '0 0 40px rgb(var(--glow-color)/ 0.15), 0 20px 60px rgba(0,0,0,0.6)',
          }}
        >
          {/* 标题 */}
          <div className="text-center mb-4">
            <h2 className="text-gold font-serif text-lg font-bold">
              -- 送牌时间 --
            </h2>
            <p className="text-gold/60 text-tiny mt-1 font-serif italic">
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
                    className={`relative rounded-lg overflow-hidden cursor-pointer ${isSelected ? 'border-2 border-gold shadow-gold' : 'border border-gold/15'}`}
                    style={{ aspectRatio: '3/4' }}
                  >
                    {card.cover_url ? (
                      <img src={card.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(160deg, rgb(var(--color-surface)), rgb(var(--color-ink)))' }}>
                        <span className="text-gold/40 text-tiny">{card.display_text.slice(0, 4)}</span>
                      </div>
                    )}
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40"
                      >
                        <span className="text-gold text-lg font-bold">OK</span>
                      </motion.div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center bg-black/70">
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
          <Button
            variant="gold"
            size="lg"
            className="w-full mt-4 font-serif"
            disabled={selectedId === null}
            onClick={() => { if (selectedId !== null) onGive(selectedId) }}
          >
            {selectedId !== null ? '「送出这张牌！」(ノ>ω<)ノ' : '请选择一张牌…'}
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
