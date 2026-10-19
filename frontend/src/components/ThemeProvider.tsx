import { useEffect } from 'react'
import { useThemeStore } from '../store'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme)
  const pixel = useThemeStore((state) => state.pixel)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('pixel', pixel)
  }, [pixel])

  return <>{children}</>
}
