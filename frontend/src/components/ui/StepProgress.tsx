/**
 * 分步向导进度条（docs/ui-interaction-design.md §6.4）
 * 纯 CSS 实现（遵守 framer 隔离规则）：当前步 gold 高亮，已完成步可点击回退。
 */
export interface StepProgressProps {
  /** 步骤名列表（按顺序） */
  steps: string[]
  /** 当前步骤下标（0 起） */
  current: number
  /** 点击已完成步骤回退；未提供时所有步骤均不可点击 */
  onStepClick?: (i: number) => void
}

export function StepProgress({ steps, current, onStepClick }: StepProgressProps) {
  return (
    <div className="flex items-center justify-center flex-wrap gap-y-2">
      {steps.map((name, i) => {
        const done = i < current
        const active = i === current
        const clickable = done && !!onStepClick
        return (
          <div key={name} className="flex items-center">
            {i > 0 && (
              <span className={`h-px w-4 sm:w-8 mx-1 sm:mx-2 ${done || active ? 'bg-gold/40' : 'bg-white/10'}`} />
            )}
            <button
              type="button"
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              title={clickable ? `回到${name}` : undefined}
              onClick={clickable && onStepClick ? () => onStepClick(i) : undefined}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-tiny transition-colors
                ${active
                  ? 'bg-gold/15 text-gold border border-gold/40'
                  : done
                    ? 'text-gold/70 border border-transparent hover:bg-gold/10'
                    : 'text-muted/60 border border-transparent'}
                ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium leading-none
                ${active ? 'bg-gold text-ink' : done ? 'bg-gold/30 text-gold' : 'bg-white/10 text-muted'}`}>
                {i + 1}
              </span>
              {name}
            </button>
          </div>
        )
      })}
    </div>
  )
}
