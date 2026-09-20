import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1/A3.2）
import {
  Swords, Layers, Globe, Images, Search, Plus, Eye,
  Lock, Gamepad2, Pencil, Share2, FileText, AlertCircle, RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { Button, Input, Textarea, Badge, EmptyState, PageSpinner, type BadgeTone } from '../components/ui'
import { api } from '../api/client'
import type { Deck } from '../api/types'

type Tab = 'mine' | 'editable' | 'public'

/** 分享等级 → 徽章语义映射（tone 约定：私有=muted、可使用=gold、可编辑=info） */
const SHARE_BADGE: Record<string, { icon: LucideIcon; text: string; tone: BadgeTone }> = {
  private: { icon: Lock, text: '私有', tone: 'muted' },
  playable: { icon: Gamepad2, text: '可使用', tone: 'gold' },
  editable: { icon: Pencil, text: '可编辑', tone: 'info' },
}

/** 卡片分享等级徽章：未知等级回退为原文本（中性 tone） */
function ShareBadge({ level }: { level: string }) {
  const meta = SHARE_BADGE[level]
  if (!meta) return <Badge tone="muted">{level}</Badge>
  const Icon = meta.icon
  return (
    <Badge tone={meta.tone}>
      <Icon size={11} />
      {meta.text}
    </Badge>
  )
}

export function DecksPage() {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('mine')
  const [myDecks, setMyDecks] = useState<Deck[]>([])
  const [editableDecks, setEditableDecks] = useState<Deck[]>([])
  const [publicDecks, setPublicDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOwner, setFilterOwner] = useState('')

  // 创建弹窗状态
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newShareLevel, setNewShareLevel] = useState('private')
  const [newEditLevel, setNewEditLevel] = useState('add_only')
  const [creating, setCreating] = useState(false)

  // 按页签拉取牌库列表；失败时记录错误文案供错误态渲染
  const loadDecks = async (t: Tab) => {
    setLoading(true)
    setError(null)
    try {
      if (t === 'mine') {
        const data = await api.decks.listMine()
        setMyDecks(data)
      } else if (t === 'editable') {
        const data = await api.decks.listEditable()
        setEditableDecks(data)
      } else {
        const data = await api.decks.listPublic(filterOwner || undefined)
        setPublicDecks(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '战阵典籍检索失败了… (；′⌒`)')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDecks(tab)
  }, [tab])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const deck = await api.decks.create(newName.trim(), newDesc.trim(), newShareLevel, newEditLevel)
      setMyDecks(prev => [deck, ...prev])
      setShowCreate(false)
      setNewName(''); setNewDesc('')
      setNewShareLevel('private'); setNewEditLevel('add_only')
    } catch { /* ignore */ }
    finally { setCreating(false) }
  }

  const allDecks = tab === 'mine' ? myDecks : tab === 'editable' ? editableDecks : publicDecks
  // 错误态时列表置空：只渲染错误卡片，不与新列表并存
  const decks: Deck[] = error
    ? []
    : searchQuery
      ? allDecks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : allDecks

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* 页头（保留和纸渐变容器） */}
        <div className="relative mb-8 overflow-hidden rounded-2xl p-6"
          style={{ background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.8) 50%, rgb(var(--accent-bg-end)/ 0.4) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.15)' }}>
          <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)' }} />
          <div className="flex items-center justify-between relative">
            <div>
              <h1 className="font-serif text-2xl text-gold font-bold tracking-wide flex items-center gap-2">
                <Swords size={22} aria-hidden="true" />
                战阵编纂所
              </h1>
              <p className="text-pink-300/60 text-sm mt-1 font-serif italic">
                {tab === 'mine' ? '编排你的最强阵容，战无不胜！✧' : tab === 'editable' ? '同盟之力，共铸战阵 ♪' : '天下阵法，尽收眼底 ～ ✦'}
              </p>
            </div>
            <Button icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>锻造新阵</Button>
          </div>
        </div>

        {/* 页签（pill 样式，图标 + 文案） */}
        <div className="flex gap-0.5 mb-6 bg-white/5 rounded-xl p-1 w-fit">
          <button onClick={() => setTab('mine')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 ${
              tab === 'mine'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            <Layers size={14} aria-hidden="true" />
            我的战阵
          </button>
          <button onClick={() => setTab('editable')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 ${
              tab === 'editable'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            <Pencil size={14} aria-hidden="true" />
            共编之阵
          </button>
          <button onClick={() => setTab('public')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 ${
              tab === 'public'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            <Globe size={14} aria-hidden="true" />
            万阵共享
          </button>
        </div>

        {/* 搜索与筛选 */}
        <div className="mb-5">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="text-sm pl-9"
                placeholder="以名索阵，寻觅你的命定之编…"
              />
              <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40" />
            </div>
            {tab === 'public' && (
              <input
                type="text"
                value={filterOwner}
                onChange={e => { setFilterOwner(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') loadDecks('public') }}
                className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-white/70 w-28 placeholder:text-white/30 focus:border-gold/30 outline-none"
                placeholder="创建人"
              />
            )}
          </div>
        </div>

        {/* 加载态（统一 PageSpinner） */}
        {loading && <PageSpinner text="～ 正在检索战阵典籍 ～ ♪" />}

        {/* 错误态：错误文案 + 重试 */}
        {!loading && error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-16 rounded-2xl"
            style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
            <AlertCircle size={28} className="mx-auto text-crimson mb-3" aria-hidden="true" />
            <p className="text-crimson text-sm font-serif mb-1">{error}</p>
            <p className="text-muted text-xs font-serif mb-5">战阵典籍暂时翻不开页，稍后再试试吧 ♪</p>
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => loadDecks(tab)}>再试一次！(ง •̀_•́)ง</Button>
          </motion.div>
        )}

        {/* 空状态（统一 EmptyState，外层保留和纸渐变容器） */}
        {!loading && !error && decks.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl"
            style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
            {tab === 'mine' ? (
              <EmptyState
                title="此处空无一阵…"
                description="战阵尚未铸成，去锻造你的第一副吧！✧"
                action={<Button icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>锻造第一副战阵</Button>}
              />
            ) : (
              <EmptyState
                title="暂无可用之阵…"
                description="等待同盟之人共享吧 (◕‿◕✿)"
              />
            )}
          </motion.div>
        )}

        {/* 牌组卡片网格 */}
        {!loading && decks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {decks.map((deck, i) => (
                <motion.div key={deck.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.04 }}
                  className="group relative rounded-xl overflow-hidden
                             cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-250"
                  style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}
                  onClick={() => navigate(`/decks/${deck.id}`)}>
                  {/* Top accent gradient */}
                  <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, rgb(var(--glow-color)/ 0.4), rgb(var(--accent-primary)/ 0.4), rgb(var(--glow-color)/ 0.4))' }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-sans font-semibold text-white text-sm truncate">{deck.name}</h3>
                      <span className="text-gold text-xs shrink-0 inline-flex items-center gap-1"><Images size={12} aria-hidden="true" /> {deck.card_count}</span>
                    </div>
                    <p className="text-pink-300/40 text-xs line-clamp-1 mb-3">{deck.description || '尚无铭文…'}</p>
                    <div className="flex items-center justify-between">
                      <ShareBadge level={deck.share_level} />
                      {deck.owner_name && tab !== 'mine' && (
                        <span className="text-muted/50 text-xs">by {deck.owner_name}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgb(var(--accent-primary)/ 0.08)' }}>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/decks/${deck.id}`) }}
                        className="text-xs text-gold/70 hover:text-gold transition-all px-2.5 py-1.5 rounded-lg border border-gold/20 hover:border-gold/50 hover:bg-gold/5 inline-flex items-center gap-1">
                        <Eye size={12} aria-hidden="true" />
                        查看
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/rooms/new?deck_id=${deck.id}`) }}
                        className="text-xs text-gold/70 hover:text-gold transition-all px-2.5 py-1.5 rounded-lg border border-gold/20 hover:border-gold/50 hover:bg-gold/5 inline-flex items-center gap-1">
                        <Swords size={12} aria-hidden="true" />
                        出阵
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 创建弹窗（手写 motion 弹窗保留，仅图标化） */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep rounded-xl p-6 w-full max-w-sm"
              style={{ border: '1px solid rgb(var(--accent-primary)/ 0.15)', boxShadow: '0 0 60px rgb(var(--accent-primary)/ 0.1)' }}
              onClick={e => e.stopPropagation()}>
              <h3 className="font-serif font-bold text-gold mb-1 text-lg">✨ 铸造新阵</h3>
              <p className="text-pink-300/50 text-xs mb-5 font-serif italic">赐予你的战阵一个响彻天下的名号吧！✧</p>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <Input label={<span className="inline-flex items-center gap-1.5"><Images size={12} aria-hidden="true" /> 牌组名称 *</span>} type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="例：百人一首·极" required autoFocus />
                </div>
                <div>
                  <Textarea label={<span className="inline-flex items-center gap-1.5"><FileText size={12} aria-hidden="true" /> 描述（选填）</span>} value={newDesc} onChange={e => setNewDesc(e.target.value)}
                    className="resize-none" placeholder="简单介绍一下这副牌吧～" rows={2} />
                </div>
                <div>
                  <label className="text-muted text-xs flex items-center gap-1.5 mb-1.5"><Share2 size={12} aria-hidden="true" /> 共享级别</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['private', 'playable', 'editable'] as const).map(value => {
                      const meta = SHARE_BADGE[value]
                      const OptIcon = meta.icon
                      return (
                        <button key={value} type="button"
                          onClick={() => setNewShareLevel(value)}
                          className={`text-xs px-2.5 py-1.5 rounded-md transition-all inline-flex items-center gap-1 ${
                            newShareLevel === value
                              ? 'bg-gold/20 text-gold border border-gold/40'
                              : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
                          }`}>
                          <OptIcon size={12} aria-hidden="true" />
                          {meta.text}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {newShareLevel === 'editable' && (
                  <div>
                    <label className="text-muted text-xs flex items-center gap-1.5 mb-1.5"><Pencil size={12} aria-hidden="true" /> 编辑权限</label>
                    <div className="flex gap-2">
                      {([
                        { value: 'add_only', label: '仅添加' },
                        { value: 'full', label: '完全编辑' },
                      ] as const).map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setNewEditLevel(opt.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-md transition-all ${
                            newEditLevel === opt.value
                              ? 'bg-gold/20 text-gold border border-gold/40'
                              : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-3 mt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>罢了罢了</Button>
                  <Button type="submit" className="flex-1" icon={<Plus size={16} />} loading={creating} disabled={!newName.trim()}>铸成！</Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
