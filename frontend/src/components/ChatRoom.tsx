import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RoomPlayer } from '../api/types'

interface ChatMessage {
  id: number
  user_id: number
  username: string
  role: string
  text: string
  isEgg?: boolean
  fromName?: string
  targetName?: string
}

interface ChatRoomProps {
  messages: ChatMessage[]
  players: RoomPlayer[]
  currentUserId: number
  isSpectator: boolean
  onSend: (text: string) => void
  onEgg: (targetId: number) => void
}

export function ChatRoom({ messages, players, currentUserId, isSpectator, onSend, onEgg }: ChatRoomProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [showEggMenu, setShowEggMenu] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(messages.length)

  // 未读计数
  useEffect(() => {
    if (!open && messages.length > prevLen.current) {
      setUnread(n => n + messages.length - prevLen.current)
    }
    prevLen.current = messages.length
  }, [messages.length, open])

  // 滚到底部
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setUnread(0)
    }
  }, [messages.length, open])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    onSend(text)
    setInput('')
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // 可以被丢蛋的目标（非自己）
  const targets = players.filter(p => p.user_id !== currentUserId && p.online)

  return (
    <>
      {/* 浮动按钮 — bottom-4 确保在所有设备上可见 */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="w-72 sm:w-80 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              style={{ height: '360px', background: 'rgba(20,5,15,0.96)', border: '1px solid rgba(232,164,184,0.15)', backdropFilter: 'blur(12px)' }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <span className="text-gold/80 text-sm font-serif">💬 聊天室</span>
                <button onClick={() => setShowEggMenu(v => !v)}
                  className="text-xs px-2 py-1 rounded-lg transition-all hover:scale-105"
                  style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.3)', color: 'rgba(255,165,0,0.9)' }}>
                  🥚 丢鸡蛋
                </button>
              </div>

              {/* 丢蛋目标菜单 */}
              <AnimatePresence>
                {showEggMenu && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden border-b border-white/5">
                    <div className="px-3 py-2 flex flex-wrap gap-1.5">
                      {targets.length === 0 ? (
                        <span className="text-muted text-xs">没有可以扔的目标 (°ω°)</span>
                      ) : targets.map(p => (
                        <button key={p.user_id}
                          onClick={() => { onEgg(p.user_id); setShowEggMenu(false) }}
                          className="text-xs px-2.5 py-1 rounded-full transition-all hover:scale-105"
                          style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.25)', color: 'rgba(255,200,100,0.9)' }}>
                          🎯 {p.username}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {messages.length === 0 && (
                  <p className="text-muted/40 text-xs text-center mt-8">还没有消息，来打个招呼吧！(｡•̀ᴗ-)</p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-1.5 ${msg.user_id === currentUserId ? 'flex-row-reverse' : ''}`}>
                    {msg.isEgg ? (
                      <div className="w-full text-center">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,165,0,0.1)', color: 'rgba(255,200,100,0.8)' }}>
                          🥚 {msg.fromName} 向 {msg.targetName} 丢了一个鸡蛋！
                        </span>
                      </div>
                    ) : (
                      <div className={`max-w-[85%] ${msg.user_id === currentUserId ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                        <span className="text-[10px] text-muted/60 px-1">
                          {msg.user_id !== currentUserId && msg.username}
                          {msg.role === 'spectator' && <span className="ml-1 text-muted/40">👁</span>}
                        </span>
                        <div className="px-3 py-1.5 rounded-2xl text-xs leading-relaxed"
                          style={{
                            background: msg.user_id === currentUserId ? 'rgba(232,164,184,0.2)' : 'rgba(255,255,255,0.06)',
                            color: msg.user_id === currentUserId ? '#f5c6d0' : 'rgba(255,255,255,0.8)',
                            borderRadius: msg.user_id === currentUserId ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          }}>
                          {msg.text}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* 输入框 */}
              <div className="px-3 py-2.5 border-t border-white/5 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  className="flex-1 text-xs rounded-xl px-3 py-2 outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                  placeholder={isSpectator ? '旁观者也能发言 (｡•̀ᴗ-)' : '说点什么... (回车发送)'}
                  maxLength={100}
                />
                <button onClick={handleSend} disabled={!input.trim()}
                  className="text-xs px-3 py-1.5 rounded-xl transition-all hover:scale-105 disabled:opacity-40"
                  style={{ background: 'rgba(232,164,184,0.2)', border: '1px solid rgba(232,164,184,0.3)', color: '#e8a4b8' }}>
                  发
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 聊天按钮 — 更大更显眼 */}
        <motion.button
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
          onClick={() => { setOpen(v => !v); setUnread(0) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl relative"
          style={{
            background: open ? 'rgba(232,164,184,0.2)' : 'rgba(15,5,12,0.95)',
            border: '1px solid rgba(232,164,184,0.4)',
            backdropFilter: 'blur(12px)',
          }}>
          <span className="text-lg">{open ? '✕' : '💬'}</span>
          {!open && <span className="text-xs font-medium" style={{ color: '#e8a4b8' }}>聊天室</span>}
          {unread > 0 && !open && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: '#c0392b', color: 'white' }}>
              {unread > 9 ? '9+' : unread}
            </motion.div>
          )}
        </motion.button>
      </div>
    </>
  )
}
