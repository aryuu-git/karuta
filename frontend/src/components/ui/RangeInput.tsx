/**
 * 统一滑杆：收敛裸 <input type="range">，滑道/滑钮走焦点金 token。
 * 呈现细节由浏览器原生控件渲染，accent-color 统一色调。
 */
export interface RangeInputProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

export function RangeInput({ value, onChange, min, max, step = 1, disabled = false, 'aria-label': ariaLabel, className = '' }: RangeInputProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={e => onChange(Number(e.target.value))}
      className={`w-full accent-gold cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${className}`}
    />
  )
}
