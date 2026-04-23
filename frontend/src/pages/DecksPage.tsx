import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Deck } from '../api/types'

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function DecksPage() {
  const navigate = useNavigate()

  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New deck dialog
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadDecks()
  }, [])

  const loadDecks = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.decks.list()
      setDecks(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const deck = await api.decks.create(newName.trim(), newDesc.trim())
      setDecks((prev) => [deck, ...prev])
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await api.decks.delete(id)
      setDecks((prev) => prev.filter((d) => d.id !== id))
      setDeleteId(null)
    } catch {
      // silently ignore
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-gold font-medium">🃏 我的牌组</h1>
            <p className="text-muted text-sm mt-1">收集你的专属歌牌～ (ﾉ◕ヮ◕)ﾉ</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-gold text-sm"
          >
            ＋ 新建牌组
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="text-crimson text-center py-12 bg-crimson/5 border border-crimson/20 rounded-lg">
            {error}
            <button
              onClick={loadDecks}
              className="block mx-auto mt-3 text-sm underline hover:text-crimson-light"
            >
              重试
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-gold animate-pulse font-serif text-xl">加载中… ٩(ˊᗜˋ*)و</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && decks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <div className="font-serif text-5xl text-gold/20 mb-4">歌</div>
            <p className="text-muted mb-2">还没有牌组哦 (｡•́︿•̀｡)</p>
            <p className="text-muted text-sm mb-6">快来创建你的第一个专属歌牌组吧！</p>
            <button onClick={() => setShowCreate(true)} className="btn-gold">
              ✨ 创建第一个牌组
            </button>
          </motion.div>
        )}

        {/* Deck grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {decks.map((deck, i) => (
                <motion.div
                  key={deck.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.04 }}
                  className="group relative bg-surface border border-border rounded-xl overflow-hidden cursor-pointer
                             hover:-translate-y-1 hover:border-gold/40 hover:shadow-gold transition-all duration-300"
                  style={{ borderTop: '2px solid rgba(232,164,184,0.4)' }}
                  onClick={() => navigate(`/decks/${deck.id}`)}
                >
                  {/* Gold top border accent */}
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
                    }}
                  />

                  <div className="p-5">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 font-serif text-gold font-bold"
                      style={{
                        background: 'linear-gradient(135deg, rgba(232,164,184,0.15), rgba(232,164,184,0.05))',
                        border: '1px solid rgba(232,164,184,0.2)',
                      }}
                    >
                      歌
                    </div>

                    <h3 className="font-sans font-semibold text-white mb-1 truncate">
                      {deck.name}
                    </h3>
                    <p className="text-muted text-xs line-clamp-2 mb-4 min-h-[2rem]">
                      {deck.description || '暂无描述'}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-gold text-xs font-sans">
                        {deck.card_count} 张
                      </span>
                      <span className="text-muted text-xs">
                        {formatDate(deck.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteId(deck.id)
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity
                               w-6 h-6 rounded flex items-center justify-center text-muted hover:text-crimson
                               hover:bg-crimson/10 text-xs"
                    title="删除"
                  >
                    ×
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-sans font-semibold text-white mb-1">✨ 新建牌组</h3>
              <p className="text-muted text-xs mb-5">给你的牌组起个好听的名字吧～</p>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label className="text-muted text-xs block mb-1.5">牌组名称 *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="input-dark"
                    placeholder="例：百人一首"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-muted text-xs block mb-1.5">描述</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="input-dark resize-none"
                    placeholder="牌组描述（选填）"
                    rows={2}
                  />
                </div>
                {createError && (
                  <p className="text-crimson text-sm">{createError}</p>
                )}
                <div className="flex gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="btn-outline flex-1"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="btn-gold flex-1 disabled:opacity-50"
                  >
                    {creating ? '创建中...' : '创建'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm dialog */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setDeleteId(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="font-sans font-semibold text-white mb-2">真的要删除吗？(；′⌒`)</h3>
              <p className="text-muted text-sm mb-6">删了就找不回来了哦，要三思！</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="btn-outline flex-1"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light transition-colors text-white font-medium text-sm disabled:opacity-50"
                >
                  {deleting ? '删除中…' : '狠心删除 (╥_╥)'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
