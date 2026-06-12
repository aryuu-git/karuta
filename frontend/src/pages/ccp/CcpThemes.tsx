import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { ccpApi, type CcpBank, type CcpBankImage } from '../../api/ccp'
import { useCcpToast } from './useCcpToast'
import { CcpImage } from './CcpImage'

export function CcpThemes() {
  const navigate = useNavigate()
  const { showToast, ToastView } = useCcpToast()
  const [banks, setBanks] = useState<CcpBank[]>([])
  const [selectedBank, setSelectedBank] = useState<CcpBank | null>(null)
  const [bankImages, setBankImages] = useState<CcpBankImage[]>([])
  const [showCreateBank, setShowCreateBank] = useState(false)
  const [showAddImage, setShowAddImage] = useState(false)
  const [newBank, setNewBank] = useState({ name: '', description: '' })
  const [answerKeywords, setAnswerKeywords] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState<{ text: string; onConfirm: () => void } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadBanks() }, [])

  const loadBanks = () => {
    ccpApi.themes.list().then(setBanks).catch(() => {})
  }

  const handleSelectBank = async (bank: CcpBank) => {
    setSelectedBank(bank)
    try {
      const imgs = await ccpApi.themes.listImages(bank.id)
      setBankImages(imgs)
    } catch {}
  }

  const handleCreateBank = async () => {
    if (!newBank.name.trim()) { setError('请输入题库名称'); return }
    try {
      const bank = await ccpApi.themes.create(newBank)
      setBanks([...banks, bank])
      setShowCreateBank(false)
      setNewBank({ name: '', description: '' })
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    }
  }

  const handleAddImages = async () => {
    if (!selectedBank || selectedFiles.length === 0) return
    setUploading(true)
    const newImages: CcpBankImage[] = []
    let failed = 0
    for (const file of selectedFiles) {
      try {
        const fd = new FormData()
        fd.append('image', file)
        fd.append('answer_keywords', answerKeywords)
        const img = await ccpApi.themes.uploadImage(selectedBank.id, fd)
        newImages.push(img)
      } catch { failed++ }
    }
    setUploading(false)
    setBankImages([...bankImages, ...newImages])
    setShowAddImage(false)
    setSelectedFiles([])
    setAnswerKeywords('')
    if (failed > 0) showToast(`${failed} 张图片上传失败`, 'fail')
    else if (newImages.length > 0) showToast(`成功上传 ${newImages.length} 张`, 'success')
  }

  const handleDeleteBank = (id: number) => {
    setConfirmState({
      text: '确定删除这个题库吗？所有图片都会一起删除！',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await ccpApi.themes.delete(id)
          setBanks(banks.filter(b => b.id !== id))
          if (selectedBank?.id === id) { setSelectedBank(null); setBankImages([]) }
        } catch (err) {
          showToast(err instanceof Error ? err.message : '删除失败', 'fail')
        }
      },
    })
  }

  const handleDeleteImage = (id: number) => {
    setConfirmState({
      text: '确定删除这张图片吗？',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await ccpApi.themes.deleteImage(id)
          setBankImages(bankImages.filter(img => img.id !== id))
        } catch (err) {
          showToast(err instanceof Error ? err.message : '删除失败', 'fail')
        }
      },
    })
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/ccp')}
              className="text-xs text-muted/50 hover:text-gold transition-colors font-serif">← 返回</button>
            <h1 className="font-serif text-2xl text-gold font-bold">📚 题库管理</h1>
          </div>
          <button onClick={() => setShowCreateBank(true)}
            className="btn-gold px-4 py-2 rounded-xl font-serif text-sm flex items-center gap-1.5">
            + 新建题库
          </button>
        </motion.div>

        {error && <div className="text-crimson bg-crimson/10 border border-crimson/20 px-4 py-2 rounded-xl text-xs mb-4">{error}</div>}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Bank list */}
          <div className="md:col-span-1 space-y-2">
            <AnimatePresence>
              {banks.map(bank => (
                <motion.div key={bank.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleSelectBank(bank)}
                  className={`rounded-xl p-4 cursor-pointer transition-all ${
                    selectedBank?.id === bank.id ? 'ring-1 ring-gold/50' : ''
                  }`}
                  style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.08)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-serif text-sm text-white/80">{bank.name}</p>
                      <p className="text-[10px] text-muted/40 mt-0.5">{bank.description}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteBank(bank.id) }}
                      className="p-1.5 hover:bg-crimson/10 rounded-lg text-[10px] text-crimson/50 hover:text-crimson transition-colors">✕</button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {banks.length === 0 && (
              <p className="text-muted/30 text-sm font-serif italic text-center py-8">还没有题库~</p>
            )}
          </div>

          {/* Bank detail */}
          <div className="md:col-span-2">
            <AnimatePresence mode="wait">
              {selectedBank ? (
                <motion.div key={selectedBank.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-serif text-gold font-bold">{selectedBank.name}</h2>
                    <button onClick={() => setShowAddImage(true)}
                      className="btn-gold px-3 py-1.5 rounded-xl font-serif text-xs">+ 添加图片</button>
                  </div>
                  {bankImages.length === 0 ? (
                    <div className="rounded-2xl p-16 text-center"
                      style={{ background: 'rgba(var(--accent-primary),0.03)', border: '1px solid rgba(var(--accent-primary),0.06)' }}>
                      <p className="text-muted/30 font-serif">还没有图片，快来添加吧~</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {bankImages.map(img => (
                        <div key={img.id} className="rounded-xl overflow-hidden group"
                          style={{ background: 'rgba(var(--accent-primary),0.03)', border: '1px solid rgba(var(--accent-primary),0.06)' }}>
                          <CcpImage src={img.image_url} className="w-full h-28" alt="" />
                          <div className="p-2 flex items-center justify-between">
                            <span className="text-[10px] text-muted/30 truncate flex-1 mr-2">
                              {img.answer_keywords || '无关键词'}
                            </span>
                            <button onClick={() => handleDeleteImage(img.id)}
                              className="p-1 hover:bg-crimson/10 rounded-lg text-[10px] text-crimson/50 hover:text-crimson opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl p-16 text-center"
                  style={{ background: 'rgba(var(--accent-primary),0.03)', border: '1px solid rgba(var(--accent-primary),0.06)' }}>
                  <p className="text-muted/30 font-serif">选择左侧题库查看图片~</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Create bank modal */}
        <AnimatePresence>
          {showCreateBank && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                className="rounded-2xl p-6 w-full max-w-md"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                <h2 className="text-xl font-serif text-gold font-bold mb-5">📚 新建题库</h2>
                <input value={newBank.name} onChange={e => setNewBank({ ...newBank, name: e.target.value })}
                  placeholder="题库名称" className="input-dark w-full py-3 mb-3 font-serif" />
                <input value={newBank.description} onChange={e => setNewBank({ ...newBank, description: e.target.value })}
                  placeholder="描述" className="input-dark w-full py-3 mb-5 font-serif" />
                <div className="flex gap-2">
                  <button onClick={() => setShowCreateBank(false)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60">取消</button>
                  <button onClick={handleCreateBank}
                    className="flex-1 py-3 btn-gold rounded-xl font-serif font-bold">创建</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add image modal */}
        <AnimatePresence>
          {showAddImage && selectedBank && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                className="rounded-2xl p-6 w-full max-w-md"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                <h2 className="text-xl font-serif text-gold font-bold mb-5">🖼️ 添加图片</h2>
                <input type="file" ref={fileInputRef} multiple accept="image/*" className="hidden"
                  onChange={e => { if (e.target.files) setSelectedFiles(Array.from(e.target.files)) }} />
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-gold/20 rounded-xl hover:border-gold/40 transition-colors flex flex-col items-center gap-2 mb-3">
                  <span className="text-gold/50 font-serif text-sm">
                    {selectedFiles.length > 0 ? `已选 ${selectedFiles.length} 张` : '点击选择图片（可多选）'}
                  </span>
                </button>
                {selectedFiles.length > 0 && (
                  <div className="text-xs text-muted/40 mb-3 space-y-1 max-h-20 overflow-auto">
                    {selectedFiles.map((f, i) => <p key={i}>{f.name}</p>)}
                  </div>
                )}
                <div className="mb-4">
                  <label className="text-[10px] text-muted/40 font-serif mb-1 block">
                    答案关键词（逗号分隔，仅自动判定模式使用）
                  </label>
                  <input value={answerKeywords} onChange={e => setAnswerKeywords(e.target.value)}
                    placeholder="如: saber,fate,阿尔托莉雅"
                    className="input-dark w-full py-2 text-xs font-serif" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowAddImage(false); setSelectedFiles([]); setAnswerKeywords('') }}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60">取消</button>
                  <button onClick={handleAddImages} disabled={selectedFiles.length === 0 || uploading}
                    className="flex-1 py-3 btn-gold rounded-xl font-serif font-bold disabled:opacity-50">
                    {uploading ? '上传中…' : `上传 ${selectedFiles.length || 0} 张`}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm delete modal */}
        <AnimatePresence>
          {confirmState && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setConfirmState(null)}
            >
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                onClick={e => e.stopPropagation()}
                className="rounded-2xl p-6 w-full max-w-xs text-center"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                <div className="text-3xl mb-2">⚠️</div>
                <p className="font-serif text-white/80 text-sm mb-5">{confirmState.text}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmState(null)} className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60">取消</button>
                  <button onClick={confirmState.onConfirm} className="flex-1 py-3 bg-crimson/15 text-crimson border border-crimson/30 rounded-xl font-serif font-bold hover:bg-crimson/25 transition-colors">删除</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {ToastView}
      </div>
    </Layout>
  )
}
