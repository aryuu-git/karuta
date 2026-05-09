/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#442038', deep: '#381830' },
        gold: { DEFAULT: '#f8b0c8', light: '#fdd8e8', dark: '#f090b0' },
        crimson: { DEFAULT: '#f87090', light: '#ff98b0' },
        surface: { DEFAULT: '#552a40', elevated: '#66304a' },
        border: '#884868',
        muted: '#e8c0d4',
      },
      fontFamily: {
        serif: ['"Noto Serif JP"', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 15px rgba(var(--accent-primary, 232,164,184),0.4)',
        'gold-lg': '0 0 30px rgba(var(--accent-primary, 232,164,184),0.6)',
        crimson: '0 0 15px rgba(var(--color-crimson, 248,112,144),0.4)',
      },
      backgroundImage: {
        'washi': `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(232,164,184,0.03) 2px,
          rgba(232,164,184,0.03) 4px
        ), repeating-linear-gradient(
          90deg,
          transparent,
          transparent 2px,
          rgba(232,164,184,0.02) 2px,
          rgba(232,164,184,0.02) 4px
        )`,
        'gold-gradient': 'linear-gradient(135deg, #e8a4b8 0%, #f5c6d0 50%, #d4849a 100%)',
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
          '0%, 100%': { boxShadow: '0 0 10px rgba(232,164,184,0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(232,164,184,0.7)' },
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
