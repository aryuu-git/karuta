/** @type {import('tailwindcss').Config} */
// 设计系统映射：颜色全部引用 index.css 的 RGB 三元组变量，
// 主题切换（sakura/shimapan）由 CSS 变量驱动，无需任何 !important 覆盖。
// 详细规范见 docs/design-system.md。
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          deep: 'rgb(var(--color-ink-deep) / <alpha-value>)',
        },
        // 历史名 "gold" 实为主强调色（樱花粉/绀青随主题）
        gold: {
          DEFAULT: 'rgb(var(--color-gold) / <alpha-value>)',
          light: 'rgb(var(--color-gold-light) / <alpha-value>)',
          dark: 'rgb(var(--color-gold-dark) / <alpha-value>)',
        },
        crimson: {
          DEFAULT: 'rgb(var(--color-crimson) / <alpha-value>)',
          light: 'rgb(var(--color-crimson-light) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'body-bg': 'rgb(var(--color-body-bg) / <alpha-value>)',
        'body-text': 'rgb(var(--color-body-text) / <alpha-value>)',
        'gold-foil': 'rgb(var(--gold-foil) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',

        // ---- 迁移期重映射：旧代码直接用了 Tailwind 内置 pink 系 ----
        // 值指向语义 token，老类名自动适配双主题；新代码禁止新增内置色类。
        'pink-300': 'rgb(var(--color-gold) / <alpha-value>)',
        'pink-500': 'rgb(var(--color-gold-dark) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"Noto Serif JP"', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
      fontSize: {
        // 字阶 token（docs/design-system.md §1.2）
        display: ['2.5rem', { lineHeight: '3rem', fontWeight: '700' }],
        'title-xl': ['1.875rem', { lineHeight: '2.375rem', fontWeight: '700' }],
        title: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '500' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.625rem' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        caption: ['0.875rem', { lineHeight: '1.25rem' }],
        tiny: ['0.75rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 2px 8px rgb(0 0 0 / 0.25)',
        card: '0 4px 16px rgb(0 0 0 / 0.3)',
        gold: '0 0 15px rgb(var(--accent-primary) / 0.4)',
        'gold-lg': '0 0 30px rgb(var(--accent-primary) / 0.6)',
        crimson: '0 0 15px rgb(var(--color-crimson) / 0.4)',
        foil: '0 0 12px rgb(var(--gold-foil) / 0.45)',
      },
      backgroundImage: {
        // 和纸质感：细密十字纹理，随主题基色变化
        'washi': `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgb(var(--accent-primary) / 0.03) 2px,
          rgb(var(--accent-primary) / 0.03) 4px
        ), repeating-linear-gradient(
          90deg,
          transparent,
          transparent 2px,
          rgb(var(--accent-primary) / 0.02) 2px,
          rgb(var(--accent-primary) / 0.02) 4px
        )`,
        'gold-gradient': 'linear-gradient(135deg, rgb(var(--color-gold)) 0%, rgb(var(--color-gold-light)) 50%, rgb(var(--color-gold-dark)) 100%)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '250ms',
      },
      // 层级体系（重构 L1）：替代散落的 z-50/[100]/[200] 任意值。
      // 递增语义：内容层 < 下拉层 < 吸顶导航 < 浮动按钮 < 全屏覆盖 < 模态 < Toast
      zIndex: {
        dropdown: '30',   // 页内绝对定位下拉（读牌倒计时遮罩）
        sticky: '40',     // 吸顶导航 header
        float: '50',      // 浮动按钮（聊天 FAB、主题切换器）
        overlay: '80',     // 全屏一次性覆盖（洗牌遮罩、丢蛋动画，pointer-events-none）
        modal: '100',     // 模态（Dialog、结算页、更新日志、各类弹层）
        toast: '200',     // Toast 置顶
      },
      // 内嵌滚动区档位（重构 L2）：收敛散落的 max-h-12/20/40/56/60 魔法值
      maxHeight: {
        'scroll-xs': '3rem',   // 48px：极小内嵌列表
        'scroll-sm': '5rem',   // 80px：短列表
        'scroll-md': '10rem',  // 160px：中列表
        'scroll-lg': '15rem',  // 240px：长列表
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.4,0,.2,1)',
        entrance: 'cubic-bezier(.34,1.56,.64,1)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px rgb(var(--accent-primary) / 0.3)' },
          '50%': { boxShadow: '0 0 25px rgb(var(--accent-primary) / 0.7)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
    },
  },
  plugins: [],
}
