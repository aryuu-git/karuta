/**
 * 装饰光晕唯一出口（设计系统 §1.5 组件表）：auth 品牌时刻专用的径向光斑。
 * 光斑色走 currentColor + token 类（默认樱花粉 gold 同族，元素级 opacity ~0.35），
 * 不复用 glow-radial 的 gold-foil 暖橙，消除暖橙撞色；blur 保留原散装光晕的柔化。
 * 渐变只此一处且不引用 CSS 变量（design:lint R3），业务层禁止再手写散装 glow div（R10）。
 *
 * 定位/尺寸一律由调用方 className 控制（absolute）；内部默认 `-z-10` 垫底，
 * 调用方容器需带 z-index 建立堆叠上下文，光晕才会压在内容之下、背景之上。
 */
export interface BrandGlowProps {
  /** 定位/尺寸类，如 `left-1/2 top-1/2 w-96 h-96 -translate-x-1/2 -translate-y-1/2` */
  className?: string
}

export function BrandGlow({ className = '' }: BrandGlowProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 blur-3xl opacity-[0.35] text-gold ${className}`}
      style={{ backgroundImage: 'radial-gradient(circle, currentColor, transparent 70%)' }}
    />
  )
}
