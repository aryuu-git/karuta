import { type ReactNode } from 'react'
import { ThemeContext, useThemeProvider } from '../hooks/useTheme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeValue = useThemeProvider()
  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  )
}
