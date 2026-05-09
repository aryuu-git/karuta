import { createContext, useContext, useState, useEffect } from 'react'

export type Theme = 'sakura' | 'shimapan'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const STORAGE_KEY = 'karuta_theme'

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'sakura',
  setTheme: () => {},
  toggle: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function useThemeProvider() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return (saved === 'shimapan') ? 'shimapan' : 'sakura'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggle = () => setThemeState(prev => prev === 'sakura' ? 'shimapan' : 'sakura')

  return { theme, setTheme, toggle }
}
