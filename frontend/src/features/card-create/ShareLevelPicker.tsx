import { Lock, Eye, Pencil } from 'lucide-react'
import type { ShareLevel } from './useCardForm'

interface ShareLevelPickerProps {
  shareLevel: ShareLevel
  /** 切换分享级别（调用方同步 isShared 联动） */
  onChange: (value: ShareLevel) => void
}

/** 分享级别三选一：私有/可使用/可编辑 */
export function ShareLevelPicker({ shareLevel, onChange }: ShareLevelPickerProps) {
  return (
    <div>
      <label className="text-muted text-xs block mb-1.5"><Lock className="mr-1 inline h-3.5 w-3.5" /> 权限</label>
      <div className="flex gap-2">
        {([
          { value: 'private', label: '私有', desc: '仅自己可见', Icon: Lock },
          { value: 'playable', label: '可使用', desc: '他人可用不可改', Icon: Eye },
          { value: 'editable', label: '可编辑', desc: '他人可编辑', Icon: Pencil },
        ] as const).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex-1 p-2.5 rounded-lg text-center transition-all duration-200"
            style={{
              background: shareLevel === opt.value ? 'rgb(var(--accent-primary)/ 0.1)' : 'rgba(255,255,255,0.03)',
              border: shareLevel === opt.value ? '1px solid rgb(var(--accent-primary)/ 0.4)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className={`text-xs font-medium ${shareLevel === opt.value ? 'text-gold' : 'text-white/50'}`}>
              <opt.Icon className="mr-0.5 inline h-3 w-3" /> {opt.label}
            </p>
            <p className="text-[9px] text-muted/50 mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
