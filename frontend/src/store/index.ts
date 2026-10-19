import { create } from 'zustand'

// 当前登录的作者/管理员账号。管理员也是 User，只是 role=1。
interface User {
  id: number
  username: string
  email: string
  nickname: string
  avatar: string
  role: number
  status: number
  balance: number
}

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

// 普通后台登录态。token 持久化在 localStorage，刷新页面后 App/AdminRoute 会重新拉 profile。
export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  setUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, user: null })
  },
}))

interface SiteConfig {
  site_name: string
  site_subtitle: string
  site_logo: string
  site_logo_dark: string
  site_favicon: string
  service_qq: string
  primary_color?: string
}

interface SiteState {
  config: SiteConfig
  setConfig: (config: Partial<SiteConfig>) => void
}

// 站点配置由 App.tsx 启动时从 /api/config/site 加载，布局、标题、Logo、主题色都会读这里。
export const useSiteStore = create<SiteState>((set) => ({
  config: {
    site_name: '极客验证',
    site_subtitle: '',
    site_logo: '',
    site_logo_dark: '',
    site_favicon: '',
    service_qq: '',
    primary_color: '',
  },
  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),
}))

interface ThemeState {
  theme: 'light' | 'dark'
  pixel: boolean
  toggleTheme: () => void
  togglePixel: () => void
}

// 暗色模式偏好。ThemeProvider 会监听这个状态并同步 document.documentElement.classList。
export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  pixel: localStorage.getItem('pixel') === '1',
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', newTheme)
      return { theme: newTheme }
    }),
  togglePixel: () =>
    set((state) => {
      const newPixel = !state.pixel
      localStorage.setItem('pixel', newPixel ? '1' : '0')
      return { pixel: newPixel }
    }),
}))
