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

        // 深景/光晕族（原 inline style 专用变量，现可走类名消费）
        accent: {
          DEFAULT: 'rgb(var(--accent-primary) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
          bg: 'rgb(var(--accent-bg) / <alpha-value>)',
          'bg-mid': 'rgb(var(--accent-bg-mid) / <alpha-value>)',
          'bg-end': 'rgb(var(--accent-bg-end) / <alpha-value>)',
        },
        glow: 'rgb(var(--glow-color) / <alpha-value>)',
      },
      fontFamily: {
        // 2026-09-30 字体换血：思源宋体 SC 为主（覆盖简体/假名/拉丁）；
        // 旧 Noto Serif JP 包字重损坏已清退，不再进字体链
        serif: ['"Noto Serif SC"', 'serif'],
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

        // ---- 迁移期字阶别名：内置字号统一到 token 档位（同 pink-300 重映射法）----
        // 只统一字号/行高（与 token 同值），不注入字重/字族；2xl 以上为仪式性大字，保留默认。
        xs: ['0.75rem', { lineHeight: '1rem' }],        // = tiny
        sm: ['0.875rem', { lineHeight: '1.25rem' }],    // = caption
        base: ['1rem', { lineHeight: '1.5rem' }],       // = body
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],  // = body-lg
        xl: ['1.25rem', { lineHeight: '1.75rem' }],     // = title
      },
      boxShadow: {
        panel: '0 2px 8px rgb(0 0 0 / 0.25)',
        card: '0 4px 16px rgb(0 0 0 / 0.3)',
        gold: '0 0 15px rgb(var(--accent-primary) / 0.4)',
        'gold-lg': '0 0 30px rgb(var(--accent-primary) / 0.6)',
        crimson: '0 0 15px rgb(var(--color-crimson) / 0.4)',
        foil: '0 0 12px rgb(var(--gold-foil) / 0.45)',
        // 浮层专用：投影 + 金晕（收编各模态手写 0 0 60px boxShadow）
        modal: '0 24px 48px rgb(0 0 0 / 0.6), 0 0 60px rgb(var(--accent-primary) / 0.18)',
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

        // 深景面板族（PanelSurface 消费；禁止在组件里再写 inline 渐变）
        'panel-ink': 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)',
        'panel-abyss': 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.15), rgb(var(--accent-bg-mid)/ 0.4))',
        'panel-void': 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))',
        'panel-void-soft': 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.4), rgb(var(--accent-bg-mid)/ 0.6))',
        'panel-hero': 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.8) 50%, rgb(var(--accent-bg-end)/ 0.4) 100%)',
        // 描金顶线（Panel/Login/Register 三处同款）与装饰光斑
        'accent-line': 'linear-gradient(90deg, transparent, rgb(var(--glow-color)/ 0.4), rgb(var(--accent-primary)/ 0.4), transparent)',
        'glow-radial': 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '250ms',
      },
      // 层级体系（重构 L1）：替代散落的 z-50/[100]/[200] 任意值。
      // 递增语义：内容层 < 下拉层 < 吸顶导航 < 浮动按钮 < 全屏覆盖 < 模态 < 模态内浮层 < Toast
      zIndex: {
        dropdown: '30',   // 页内绝对定位下拉（读牌倒计时遮罩）
        sticky: '40',     // 吸顶导航 header
        float: '50',      // 浮动按钮（聊天 FAB、主题切换器）
        overlay: '80',     // 全屏一次性覆盖（洗牌遮罩、丢蛋动画，pointer-events-none）
        modal: '100',     // 模态（Dialog、结算页、更新日志、各类弹层）
        popover: '150',   // portal 到 body 的模态内浮层（Select 下拉，须高于模态）
        toast: '200',     // Toast 置顶
      },
      // 内容列宽度契约（布局契约 §1.3）：内容页的内容列统一 1120px。
      // 由 PageContainer(size="lg") / ListPageShell 消费为 max-w-content；
      // 业务页面禁止再写自定义 max-w-* 与内容列竞争。
      maxWidth: {
        content: '1120px',
      },
      // compact HeroHeader 档高度下限（~120px，见 HeroHeader）
      minHeight: {
        hero: '7.5rem',
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
        'progress-sweep': 'progressSweep 1.5s linear infinite',
      },
      keyframes: {
        progressSweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(350%)' },
        },
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
