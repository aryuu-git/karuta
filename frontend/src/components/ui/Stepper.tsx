import { type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

/**
 * 统一步进器：收敛 NewRoomPage 手写 StepperBox/StepButton/StepValue 三件套与裸数值输入框。
 * 步进数学（边界/回绕语义）留在调用方（各配置项边界互异），本组件只负责外观与交互反馈。
 */
export interface StepperProps {
  value: number
  onDecrease: () => void
  onIncrease: () => void
  /** 自定义数值显示（默认 String(value)；用于 '∞'/'全程'/'关闭' 等） */
  display?: ReactNode
  /** 数值后缀（如 's'、'%'） */
  suffix?: ReactNode
  /** 可输入变体：数值可直接键入（键入值钳制在 min/max） */
  editable?: { min: number; max: number; onEdit: (value: number) => void }
  /** 宽档数值区（三位数/带后缀场景） */
  wide?: boolean
  disabled?: boolean
}

export function Stepper({ value, onDecrease, onIncrease, display, suffix, editable, wide = false, disabled = false }: StepperProps) {
  const stepBtnClass = 'px-2.5 py-1 text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors text-sm font-bold inline-flex items-center disabled:opacity-40 disabled:pointer-events-none'

  return (
    <div className="flex items-center rounded-lg overflow-hidden border border-gold/20">
      <button type="button" aria-label="减少" onClick={onDecrease} disabled={disabled} className={stepBtnClass}>
        <Minus size={12} />
      </button>
      {editable ? (
        <input
          type="text"
          inputMode="numeric"
          value={value}
          aria-label="数值"
          disabled={disabled}
          onChange={e => {
            const v = parseInt(e.target.value)
            if (!isNaN(v)) editable.onEdit(Math.min(editable.max, Math.max(editable.min, v)))
          }}
          className="w-8 text-center text-sm text-body-text font-medium bg-accent/5 outline-none py-1"
        />
      ) : (
        <span className={`${wide ? 'w-12' : 'w-10'} text-center text-sm text-body-text font-medium py-1 bg-accent/5`}>
          {display ?? value}
        </span>
      )}
      {editable && suffix && (
        <span className="text-white/50 text-xs pr-1">{suffix}</span>
      )}
      <button type="button" aria-label="增加" onClick={onIncrease} disabled={disabled} className={stepBtnClass}>
        <Plus size={12} />
      </button>
    </div>
  )
}
