import { motion } from 'framer-motion'
import { useTheme } from '../hooks/useTheme'

export function ThemeSwitcher() {
  const { theme, toggle } = useTheme()

  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="fixed bottom-4 left-4 z-50 w-10 h-10 rounded-full flex items-center justify-center
                 shadow-lg transition-all duration-300 border"
      style={{
        background: `linear-gradient(135deg, var(--color-surface), var(--color-ink))`,
        borderColor: 'rgba(var(--accent-secondary),0.4)',
        boxShadow: '0 4px 20px rgba(var(--accent-secondary),0.3)',
      }}
      title={theme === 'sakura' ? '切换到蓝白条纹' : '切换到樱花粉'}
    >
      <span className="text-lg">
        {theme === 'sakura' ? '🌸' : '🥣'}
      </span>
    </motion.button>
  )
}
