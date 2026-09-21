import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import type { RoomPlayer } from '../api/types'
import { Button } from './ui'

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
  /** 浮动按钮定位类覆盖（默认 bottom-4 right-4）；战场移动端需上移避让底部计分条 */
  fabClassName?: string
}

export function ChatRoom({ messages, players, currentUserId, isSpectator, onSend, onEgg, fabClassName = 'bottom-4 right-4' }: ChatRoomProps) {
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
      {/* 浮动按钮 — 定位由 fabClassName 控制，移动端战场由调用方上移避让计分条 */}
      <div className={`fixed z-float flex flex-col items-end gap-2 ${fabClassName}`}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="w-72 sm:w-80 rounded-2xl overflow-hidden shadow-2xl flex flex-col bg-ink-deep/95 border border-gold/15 backdrop-blur"
              style={{ height: '360px' }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <span className="text-gold/80 text-caption font-serif flex items-center gap-1"><MessageCircle size={12} aria-hidden="true" />聊天</span>
                <Button variant="ghost" size="sm" onClick={() => setShowEggMenu(v => !v)}
                  className="bg-warning/10 border border-warning/30 text-warning/90 hover:bg-warning/20 hover:text-warning/90">
                  🥚 丢鸡蛋
                </Button>
              </div>

              {/* 丢蛋目标菜单 */}
              <AnimatePresence>
                {showEggMenu && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden border-b border-white/5">
                    <div className="px-3 py-2 flex flex-wrap gap-1.5">
                      {targets.length === 0 ? (
                        <span className="text-muted text-tiny">暂无可丢的目标</span>
                      ) : targets.map(p => (
                        <button key={p.user_id}
                          onClick={() => { onEgg(p.user_id); setShowEggMenu(false) }}
                          className="text-tiny px-2.5 py-1 rounded-full transition-all hover:scale-105 bg-warning/10 border border-warning/25 text-warning/90">
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
                  <p className="text-gold/30 text-tiny text-center mt-8 font-serif italic">还没有消息，来说点什么吧</p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-1.5 ${msg.user_id === currentUserId ? 'flex-row-reverse' : ''}`}>
                    {msg.isEgg ? (
                      <div className="w-full text-center">
                        <span className="text-tiny px-2 py-0.5 rounded-full bg-warning/10 text-warning/80">
                          🥚 {msg.fromName} 向 {msg.targetName} 丢了一个鸡蛋！
                        </span>
                      </div>
                    ) : (
                      <div className={`max-w-[85%] ${msg.user_id === currentUserId ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                        <span className="text-tiny text-muted/60 px-1">
                          {msg.user_id !== currentUserId && msg.username}
                          {msg.role === 'spectator' && <span className="ml-1 text-muted/40">👁</span>}
                        </span>
						<div className={`px-3 py-1.5 text-tiny leading-relaxed break-words ${msg.user_id === currentUserId ? 'bg-gold/20 text-gold-light rounded-[16px_4px_16px_16px]' : 'bg-body-text/5 text-body-text/80 rounded-[4px_16px_16px_16px]'}`}>
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
                  className="flex-1 text-tiny rounded-xl px-3 py-2 outline-none bg-body-text/5 border border-body-text/10 text-body-text/85"
                  placeholder={isSpectator ? '旁观者也可以发言' : '说点什么…（回车发送）'}
                  maxLength={100}
                />
                <Button onClick={handleSend} disabled={!input.trim()}
                  variant="outline" size="sm">
                  发
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 聊天按钮 — 更大更显眼 */}
        <motion.button
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
          onClick={() => { setOpen(v => !v); setUnread(0) }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl relative border border-gold/40 backdrop-blur ${open ? 'bg-gold/20' : 'bg-ink-deep/95'}`}>
          <span className="text-lg">{open ? '✕' : '💬'}</span>
          {!open && <span className="text-tiny font-medium text-gold">聊天</span>}
          {unread > 0 && !open && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-tiny font-bold bg-danger text-white">
              {unread > 9 ? '9+' : unread}
            </motion.div>
          )}
        </motion.button>
      </div>
    </>
  )
}
