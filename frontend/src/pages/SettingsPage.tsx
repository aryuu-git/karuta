import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IS_NATIVE } from '../config'

export function SettingsPage() {
  const navigate = useNavigate()
  const [cacheDir, setCacheDir] = useState('')
  const [cacheInfo, setCacheInfo] = useState<{ fileCount: number; totalSize: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCacheInfo()
  }, [])

  async function loadCacheInfo() {
    setLoading(true)
    try {
      const { getCacheInfo } = await import('../utils/mediaCache')
      const info = await getCacheInfo()
      if (info) {
        setCacheDir(info.dir)
        setCacheInfo({ fileCount: info.fileCount, totalSize: info.totalSize })
      }
    } catch {
      // ignore
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!cacheDir.trim()) return
    setSaving(true)
    setMessage('')
    try {
      const { setCacheDir: setDir } = await import('../utils/mediaCache')
      const ok = await setDir(cacheDir.trim())
      if (ok) {
        setMessage('保存成功！')
        await loadCacheInfo()
      } else {
        setMessage('保存失败，请检查路径是否有效')
      }
    } catch {
      setMessage('保存失败')
    }
    setSaving(false)
  }

  async function handleClear() {
    if (!confirm('确定要清空所有缓存文件吗？')) return
    try {
      const { clearCache } = await import('../utils/mediaCache')
      await clearCache()
      setMessage('缓存已清空')
      await loadCacheInfo()
    } catch {
      setMessage('清空失败')
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  // 非原生客户端不显示此页面
  if (!IS_NATIVE) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <p className="text-white/60 mb-4">设置页面仅在桌面客户端中可用</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20">
            返回首页
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-lg mx-auto">
        {/* 返回按钮 */}
        <button onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors">
          <span>←</span> 返回
        </button>

        <h1 className="text-2xl font-bold text-white mb-8">设置</h1>

        {/* 缓存目录 */}
        <div className="rounded-xl p-6 mb-6" style={{ background: 'var(--color-surface)' }}>
          <h2 className="text-lg font-semibold text-white mb-4">媒体缓存</h2>
          <p className="text-white/50 text-sm mb-4">
            图片和音频会缓存到本地目录，减少流量消耗。修改后需要重启应用生效。
          </p>

          <div className="mb-4">
            <label className="block text-white/60 text-sm mb-2">缓存目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cacheDir}
                onChange={(e) => setCacheDir(e.target.value)}
                placeholder="留空使用默认目录"
                className="flex-1 px-4 py-2.5 rounded-lg bg-black/30 border border-white/10 text-white text-sm focus:outline-none focus:border-white/30"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--color-gold)', color: '#1a1a2e' }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>

          {/* 缓存信息 */}
          {cacheInfo && (
            <div className="flex gap-6 text-sm text-white/50 mb-4">
              <span>文件数: <span className="text-white/80">{cacheInfo.fileCount}</span></span>
              <span>占用空间: <span className="text-white/80">{formatSize(cacheInfo.totalSize)}</span></span>
            </div>
          )}

          {/* 清空缓存 */}
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-lg text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            清空缓存
          </button>

          {message && (
            <p className="mt-3 text-sm" style={{ color: message.includes('成功') || message.includes('清空') ? '#4ade80' : '#f87171' }}>
              {message}
            </p>
          )}
        </div>

        {loading && (
          <div className="text-center text-white/30 text-sm">加载中...</div>
        )}
      </div>
    </div>
  )
}
