import { Lock, Eye, Pencil } from 'lucide-react'
import { OptionCard } from '../../components/ui'
import type { ShareLevel } from './useCardForm'

interface ShareLevelPickerProps {
  shareLevel: ShareLevel
  /** 切换分享级别（调用方同步 isShared 联动） */
  onChange: (value: ShareLevel) => void
}

/** 分享级别三选一：私有/可使用/可编辑（OptionCard 描金高亮单选卡） */
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
          <OptionCard
            key={opt.value}
            className="flex-1"
            selected={shareLevel === opt.value}
            onSelect={() => onChange(opt.value)}
            selection="none"
            layout="column"
            icon={<opt.Icon size={16} />}
            title={opt.label}
            desc={opt.desc}
          />
        ))}
      </div>
    </div>
  )
}
