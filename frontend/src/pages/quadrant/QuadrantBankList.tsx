import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { quadrantApi, type QBank } from '../../api/quadrant'

export function QuadrantBankList() {
  const navigate = useNavigate()
  const [banks, setBanks] = useState<QBank[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<string>('mine')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('custom')

  useEffect(() => {
    setLoading(true)
    quadrantApi.banks.list(scope).then(setBanks).catch(() => setBanks([])).finally(() => setLoading(false))
  }, [scope])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await quadrantApi.banks.create({ name: newName, category: newCategory })
    setNewName('')
    setShowCreate(false)
    quadrantApi.banks.list(scope).then(setBanks)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除?')) return
    await quadrantApi.banks.delete(id)
    setBanks(banks.filter(b => b.id !== id))
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-serif text-gold">📚 题库管理</h1>
          <button onClick={() => navigate('/quadrant')}
            className="text-xs text-white/50 border border-white/10 rounded-lg px-3 py-1 hover:border-white/30">
            ← 返回大厅
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {[['mine', '我的'], ['public', '公开']].map(([key, label]) => (
            <button key={key} onClick={() => setScope(key)}
              className={`px-3 py-1.5 rounded-lg text-xs border ${scope === key ? 'border-gold/50 text-gold bg-gold/10' : 'border-white/10 text-white/50 hover:border-white/30'}`}>
              {label}
            </button>
          ))}
          <button onClick={() => setShowCreate(true)}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs border border-gold/30 text-gold hover:bg-gold/10">
            + 新建题库
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="rounded-xl border border-gold/20 p-4 mb-4" style={{ background: 'rgba(255,200,0,0.03)' }}>
            <div className="flex gap-2">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="题库名称"
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                <option value="anime">动画</option>
                <option value="game">游戏</option>
                <option value="character">角色</option>
                <option value="people">群友</option>
                <option value="custom">自定义</option>
              </select>
              <button onClick={handleCreate} className="px-4 py-2 bg-gold/20 text-gold border border-gold/30 rounded-lg text-sm">创建</button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-white/50 text-sm">取消</button>
            </div>
          </motion.div>
        )}

        {/* Bank list */}
        {loading ? (
          <p className="text-white/40 text-center py-8">加载中...</p>
        ) : banks.length === 0 ? (
          <p className="text-white/40 text-center py-8">暂无题库</p>
        ) : (
          <div className="space-y-2">
            {banks.map(bank => (
              <motion.div key={bank.id}
                whileHover={{ scale: 1.01 }}
                className="flex items-center justify-between p-4 rounded-xl border border-white/10 cursor-pointer hover:border-gold/30"
                style={{ background: 'rgba(255,255,255,0.02)' }}
                onClick={() => navigate(`/quadrant/banks/${bank.id}`)}
              >
                <div>
                  <span className="text-white font-medium">{bank.name}</span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-white/40">{bank.question_count}题</span>
                    <span className="text-xs text-white/40">{bank.category}</span>
                    <span className="text-xs text-white/40">▶ {bank.play_count}</span>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(bank.id) }}
                  className="text-xs text-red-400/50 hover:text-red-400 px-2">删除</button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
