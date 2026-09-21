import { Tag, Plus } from 'lucide-react'
import { DEFAULT_TAGS } from './useCardForm'

interface TagPickerProps {
  /** 当前 tags 逗号串 */
  tags: string
  /** 可选的自定义标签全集 */
  customTags: string[]
  /** 切换标签选中态 */
  onToggle: (tag: string) => void
  /** 请求打开自定义标签弹窗 */
  onRequestCustom: () => void
}

/** 标签芯片选择器：预置/自定义/已选标签合并去重后展示 */
export function TagPicker({ tags, customTags, onToggle, onRequestCustom }: TagPickerProps) {
  const selectedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const allTags = [...new Set([...DEFAULT_TAGS, ...customTags, ...selectedTags])]
  return (
    <div>
      <label className="text-muted text-xs block mb-1.5"><Tag className="mr-1 inline h-3.5 w-3.5" /> 标签（选填）</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {allTags.map(tag => {
          const isSelected = selectedTags.includes(tag)
          return (
            <button key={tag} type="button"
              onClick={() => onToggle(tag)}
              className={`text-tiny px-2.5 py-1 rounded-md transition-all ${
                isSelected
                  ? 'bg-gold/20 text-gold border border-gold/40'
                  : 'bg-white/5 text-body-text/50 border border-transparent hover:border-white/10'
              }`}>
              {tag}
            </button>
          )
        })}
        <button type="button"
          onClick={onRequestCustom}
          className="text-tiny px-2.5 py-1 rounded-md bg-white/5 text-muted border border-dashed border-white/10 hover:border-gold/30 hover:text-gold/70 transition-all">
          <Plus className="mr-0.5 inline h-3 w-3" /> 自定义
        </button>
      </div>
    </div>
  )
}
