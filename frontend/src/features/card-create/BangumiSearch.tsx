import { Input } from '../../components/ui'
import { X } from 'lucide-react'
import type { BangumiResult } from './useBangumiSearch'

interface BangumiSearchProps {
  query: string
  results: BangumiResult[]
  loading: boolean
  onQueryChange: (value: string) => void
  /** Enter 立即搜索 */
  onSearch: () => void
  onClose: () => void
  onSelect: (item: BangumiResult) => void
}

/** Bangumi 搜索面板：搜索框 + 结果下拉（选中回填由页面注入） */
export function BangumiSearch({ query, results, loading, onQueryChange, onSearch, onClose, onSelect }: BangumiSearchProps) {
  return (
    <div className="absolute z-20 left-0 right-0 mt-2 rounded-xl overflow-hidden"
      style={{ background: 'rgb(var(--color-ink-deep))', border: '1px solid rgb(var(--accent-primary)/ 0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: '320px' }}>
      <div className="p-3 flex gap-2" style={{ borderBottom: '1px solid rgb(var(--accent-primary)/ 0.1)' }}>
        <Input type="text" value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSearch()
            }
          }}
          className="text-xs" placeholder="搜索动画/游戏名…" autoFocus />
        <button type="button" onClick={onClose}
          className="text-muted text-xs hover:text-white px-1"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
        {loading && <p className="text-center text-muted text-xs py-4 animate-pulse">搜索中…</p>}
        {!loading && results.length === 0 && query && (
          <p className="text-center text-muted text-xs py-4">无结果</p>
        )}
        {results.map(item => (
          <div key={item.id}
            onClick={() => onSelect(item)}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
            style={{ borderBottom: '1px solid rgb(var(--accent-primary)/ 0.05)' }}>
            <div className="w-10 h-14 rounded shrink-0 overflow-hidden bg-black/30">
              {item.images?.common && <img src={item.images.common} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs truncate">{item.name_cn || item.name}</p>
              {item.name_cn && item.name !== item.name_cn && (
                <p className="text-muted/50 text-[10px] truncate">{item.name}</p>
              )}
              <span className="text-[9px] px-1.5 py-0.5 rounded mt-0.5 inline-block"
                style={{ background: item.type === 2 ? 'rgba(74,144,217,0.15)' : 'rgba(34,197,94,0.15)', color: item.type === 2 ? 'rgba(74,144,217,0.8)' : 'rgba(34,197,94,0.8)' }}>
                {item.type === 2 ? '动画' : item.type === 4 ? '游戏' : '其他'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
