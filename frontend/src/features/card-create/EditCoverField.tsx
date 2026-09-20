import { useRef } from 'react'
import { api } from '../../api/client'
import { Image as ImageIcon } from 'lucide-react'

interface EditCoverFieldProps {
  cardId: number
  coverPreview: string | null
  /** 预览更新回调：选图后先本地预览，updateCover 成功后换服务端 URL */
  onPreviewChange: (preview: string) => void
}

/** 编辑模式封面更换：点击选图 → 本地即时预览 → 调用 updateCover 持久化 */
export function EditCoverField({ cardId, coverPreview, onPreviewChange }: EditCoverFieldProps) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="text-muted text-xs block mb-1.5"><ImageIcon className="mr-1 inline h-3.5 w-3.5" /> 封面（点击更换）</label>
      <div className="relative w-24 cursor-pointer group" onClick={() => coverInputRef.current?.click()}>
        <img src={coverPreview ?? ''} alt="cover" className="w-24 rounded-lg object-cover group-hover:opacity-70 transition-opacity" style={{ aspectRatio: '3/4' }} />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xs bg-black/60 px-2 py-1 rounded">换封面</span>
        </div>
      </div>
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0]
        if (!file || !cardId) return
        onPreviewChange(URL.createObjectURL(file))
        try {
          const fd = new FormData()
          fd.append('cover', file)
          const updated = await api.cards.updateCover(cardId, fd)
          if (updated.cover_url) onPreviewChange(updated.cover_url)
        } catch { /* ignore */ }
      }} />
    </div>
  )
}
