import { useState, useEffect } from 'react'
import { useNavigate, Outlet, useLocation, Link } from 'react-router-dom'
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Avatar, Tooltip } from '@heroui/react'
import { agentCenterApi, configApi } from '../../api'
import { qqAvatarUrl } from '../../utils/qqAvatar'
import { toast } from '../../components/Toast'
import { useThemeStore, useSiteStore } from '../../store'
import PixelToggle from '../../components/PixelToggle'
import {
  HiChevronLeft,
  HiChevronRight,
  HiClipboardList,
  HiCog,
  HiCreditCard,
  HiCash,
  HiCollection,
  HiHome,
  HiLogout,
  HiMenu,
  HiMoon,
  HiSearch,
  HiSun,
  HiUser,
  HiUserGroup,
  HiUsers,
  HiX,
} from 'react-icons/hi'

type NavItem = { path: string; label: string; icon: any }

const brandTextClass = 'brand-flow bg-gradient-to-r from-fuchsia-500 via-sky-500 via-50% to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(56,189,248,0.25)]'
const menuIconBoxClass = 'flex items-center justify-center rounded-md bg-gray-50/35 ring-1 ring-gray-200/35 dark:bg-white/5 dark:ring-white/8'
const activeMenuClass = 'bg-gray-100/70 text-gray-900 font-semibold ring-1 ring-gray-200/70 dark:bg-white/8 dark:text-white dark:ring-white/10'

export default function AgentDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [agentInfo, setAgentInfo] = useState<any>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { theme, toggleTheme } = useThemeStore()
  const siteConfig = useSiteStore((state) => state.config)
  const setConfig = useSiteStore((state) => state.setConfig)

  useEffect(() => {
    const token = localStorage.getItem('agent_token')
    if (!token) {
      navigate('/agent/login')
      return
    }

    agentCenterApi.getProfile().then((res: any) => {
      setAgentInfo(res.data)
    }).catch(() => {
      localStorage.removeItem('agent_token')
      navigate('/agent/login')
    })

    if (!siteConfig.site_logo) {
      configApi.getSite().then((res: any) => {
        const data = res.data || {}
        setConfig({
          site_name: data.site_name || '验证',
          site_subtitle: data.site_subtitle || '',
          site_logo: data.site_logo || '',
          site_logo_dark: data.site_logo_dark || '',
          site_favicon: data.site_favicon || '',
          service_qq: data.service_qq || '',
        })
      }).catch(() => {})
    }
  }, [navigate])

  useEffect(() => {
    if (siteConfig.site_name) {
      document.title = `${siteConfig.site_name} - 代理中心`
    }
  }, [siteConfig.site_name])

  const handleLogout = () => {
    let lastAppCode = agentInfo?.app?.app_code || localStorage.getItem('agent_last_app_code') || ''
    if (!lastAppCode) {
      try {
        const storedAgentInfo = JSON.parse(localStorage.getItem('agent_info') || '{}')
        lastAppCode = storedAgentInfo.app_code || storedAgentInfo.app?.app_code || ''
      } catch {}
    }
    if (lastAppCode) {
      localStorage.setItem('agent_last_app_code', lastAppCode)
    }
    localStorage.removeItem('agent_token')
    localStorage.removeItem('agent_info')
    toast.success('已退出登录')
    navigate(lastAppCode ? `/agent/login?app_code=${encodeURIComponent(lastAppCode)}` : '/agent/login')
  }

  const menuItems: NavItem[] = [
    { path: '/agent', icon: HiHome, label: '首页' },
    { path: '/agent/generate', icon: HiCreditCard, label: '制卡' },
    { path: '/agent/cards', icon: HiSearch, label: '查卡' },
    { path: '/agent/logs', icon: HiClipboardList, label: '记录' },
    { path: '/agent/users', icon: HiUsers, label: '用户' },
    { path: '/agent/sub-agents', icon: HiUserGroup, label: '下级' },
    { path: '/agent/stock-packages', icon: HiCollection, label: '卡包' },
    { path: '/agent/balance', icon: HiCash, label: '流水' },
    { path: '/agent/settings', icon: HiCog, label: '设置' },
  ]

  const isActive = (path: string) => {
    if (path === '/agent') return location.pathname === '/agent'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const getMenuIconClass = (path: string) => {
    if (path === '/agent') return 'text-sky-500 dark:text-sky-400'
    if (path === '/agent/generate') return 'text-blue-500 dark:text-blue-400'
    if (path === '/agent/cards') return 'text-emerald-500 dark:text-emerald-400'
    if (path === '/agent/logs') return 'text-orange-500 dark:text-orange-400'
    if (path === '/agent/users') return 'text-teal-500 dark:text-teal-400'
    if (path === '/agent/sub-agents') return 'text-cyan-500 dark:text-cyan-400'
    if (path === '/agent/stock-packages') return 'text-amber-500 dark:text-amber-400'
    if (path === '/agent/balance') return 'text-violet-500 dark:text-violet-400'
    if (path === '/agent/settings') return 'text-pink-400 dark:text-pink-300'
    return 'text-slate-500 dark:text-slate-400'
  }

  const getMenuAccentClass = (path: string) => {
    if (path === '/agent') return 'bg-sky-400 dark:bg-sky-400'
    if (path === '/agent/generate') return 'bg-blue-400 dark:bg-blue-400'
    if (path === '/agent/cards') return 'bg-emerald-400 dark:bg-emerald-400'
    if (path === '/agent/logs') return 'bg-orange-400 dark:bg-orange-400'
    if (path === '/agent/users') return 'bg-teal-400 dark:bg-teal-400'
    if (path === '/agent/sub-agents') return 'bg-cyan-400 dark:bg-cyan-400'
    if (path === '/agent/stock-packages') return 'bg-amber-400 dark:bg-amber-400'
    if (path === '/agent/balance') return 'bg-violet-400 dark:bg-violet-400'
    if (path === '/agent/settings') return 'bg-pink-300 dark:bg-pink-300'
    return 'bg-slate-400 dark:bg-slate-400'
  }

  const renderNav = (mobile = false) => (
    <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin">
      <div className={sidebarCollapsed && !mobile ? 'my-2' : 'px-3 pt-2 pb-1.5'}>
        {(!sidebarCollapsed || mobile) && (
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">代理中心</span>
        )}
      </div>
      {menuItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.path)
        const className = `relative h-[40px] flex items-center gap-3 ${sidebarCollapsed && !mobile ? 'justify-center px-2' : 'px-3'} mb-1 transition-colors duration-200 rounded-lg group ${active ? activeMenuClass : 'text-gray-600 dark:text-default-500 hover:bg-gray-100/80 dark:hover:bg-content2/60 hover:text-gray-900 dark:hover:text-white'}`
        const content = (
          <>
            {active && <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full ${getMenuAccentClass(item.path)}`} />}
            <div className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${menuIconBoxClass} ${active ? 'bg-white/70 ring-gray-200 dark:bg-white/10 dark:ring-white/15' : ''} ${sidebarCollapsed && !mobile ? 'w-8 h-8' : mobile ? 'w-7 h-7' : 'w-6.5 h-6.5'}`}>
              <Icon className={`${getMenuIconClass(item.path)} ${sidebarCollapsed && !mobile ? 'w-4.5 h-4.5' : 'w-4 h-4'}`} />
            </div>
            {(!sidebarCollapsed || mobile) && <span className="flex-1 text-sm whitespace-nowrap overflow-hidden truncate">{item.label}</span>}
          </>
        )

        if (mobile) {
          return (
            <button key={item.path} onClick={() => { navigate(item.path); setMobileSidebarOpen(false) }} className={`${className} w-full text-left`}>
              {content}
            </button>
          )
        }

        return (
          <Tooltip key={item.path} content={item.label} placement="right" isDisabled={!sidebarCollapsed} delay={200}>
            <Link to={item.path} className={className}>{content}</Link>
          </Tooltip>
        )
      })}
    </nav>
  )

  if (!agentInfo) return null

  const logo = theme === 'dark' && siteConfig.site_logo_dark ? siteConfig.site_logo_dark : siteConfig.site_logo
  const displayName = agentInfo.nickname || agentInfo.username

  return (
    <div className="min-h-screen bg-white dark:bg-background dark:text-foreground">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 border-b border-gray-200/70 dark:border-gray-700/50 bg-white/90 dark:bg-content1/90 backdrop-blur-xl backdrop-saturate-150 shadow-[0_4px_16px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_4px_16px_-12px_rgba(0,0,0,0.65)]">
        <div className="flex flex-1 items-center gap-4 min-w-0">
          <Link to="/agent" className="font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
            {logo ? (
              <img src={logo} alt="Logo" className="h-8 flex-shrink-0" />
            ) : (
              <span className="text-2xl flex-shrink-0">☁️</span>
            )}
            <div className="flex flex-col min-w-0">
              <span className={`text-xl leading-tight truncate ${brandTextClass}`}>{siteConfig.site_name || '代理中心'}</span>
              <span className="text-xs font-normal opacity-80 leading-tight truncate text-gray-600 dark:text-gray-300">
                {agentInfo.app?.app_name || '代理中心'}
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center rounded-lg bg-gray-50/80 px-3 py-1.5 text-xs text-gray-600 ring-1 ring-gray-200/70 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10">
            余额: ¥{agentInfo.balance?.toFixed(2)}
          </div>
          <PixelToggle />
          <Tooltip content={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}>
            <button onClick={toggleTheme} className="p-2.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-600 dark:text-gray-200">
              {theme === 'light' ? <HiMoon className="w-5 h-5" /> : <HiSun className="w-5 h-5 text-yellow-400" />}
            </button>
          </Tooltip>
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <button className="flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg px-2.5 py-1.5 transition-colors text-gray-800 dark:text-white ml-1">
                <Avatar
                  src={agentInfo.avatar || qqAvatarUrl(agentInfo.qq)}
                  name={displayName}
                  radius="full"
                  classNames={{
                    base: 'h-8 w-8 shrink-0 overflow-hidden rounded-full',
                    img: 'h-full w-full rounded-full object-cover',
                    fallback: 'h-full w-full rounded-full',
                  }}
                  imgProps={{ referrerPolicy: 'no-referrer' }}
                />
                <span className="text-sm font-medium hidden md:inline">{displayName}</span>
              </button>
            </DropdownTrigger>
            <DropdownMenu>
              <DropdownItem key="profile" startContent={<HiUser className="w-4 h-4" />}>
                余额: ¥{agentInfo.balance?.toFixed(2)}
              </DropdownItem>
              <DropdownItem key="logout" startContent={<HiLogout className="w-4 h-4" />} color="danger" onPress={handleLogout}>退出登录</DropdownItem>
            </DropdownMenu>
          </Dropdown>
          <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-600 dark:text-gray-200" aria-label="打开菜单">
            <HiMenu className="w-5 h-5" />
          </button>
        </div>
      </header>

      <aside className={`hidden md:flex fixed left-0 top-14 bottom-0 z-50 flex-col overflow-hidden transition-all duration-300 border-r border-gray-200/80 dark:border-gray-700/60 bg-white/95 dark:bg-content1/95 backdrop-blur-xl backdrop-saturate-150 shadow-[6px_0_22px_-20px_rgba(15,23,42,0.35)] dark:shadow-[6px_0_22px_-20px_rgba(0,0,0,0.55)] ${sidebarCollapsed ? 'w-20' : 'w-56'}`}>
        <div className="flex justify-end p-2 border-b border-gray-100 dark:border-divider">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-500 dark:text-gray-300" title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>
            {sidebarCollapsed ? <HiChevronRight className="w-4 h-4" /> : <HiChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        {renderNav()}
      </aside>

      <main className={`transition-all duration-300 pt-[70px] pb-4 min-h-screen flex flex-col ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-56'}`}>
        <div key={location.pathname} className="px-3 md:px-5 flex-1">
          <Outlet context={{ agentInfo, refreshProfile: () => agentCenterApi.getProfile().then((res: any) => setAgentInfo(res.data)) }} />
        </div>
      </main>

      <div className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${mobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
        <aside className={`absolute left-0 top-0 bottom-0 w-[248px] max-w-[76vw] flex flex-col overflow-hidden border-r border-gray-200/80 dark:border-gray-700/60 bg-white/95 dark:bg-content1/95 backdrop-blur-xl backdrop-saturate-150 shadow-[10px_0_30px_-18px_rgba(15,23,42,0.45)] dark:shadow-[10px_0_30px_-18px_rgba(0,0,0,0.65)] transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100 dark:border-divider">
            <Link to="/agent" onClick={() => setMobileSidebarOpen(false)} className="font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
              {logo ? (
                <img src={logo} alt="Logo" className="h-8 flex-shrink-0" />
              ) : (
                <span className="text-2xl flex-shrink-0">☁️</span>
              )}
              <span className={`text-lg leading-tight truncate ${brandTextClass}`}>代理中心</span>
            </Link>
            <button onClick={() => setMobileSidebarOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-600 dark:text-gray-200" aria-label="关闭菜单">
              <HiX className="w-5 h-5" />
            </button>
          </div>
          {renderNav(true)}
        </aside>
      </div>
    </div>
  )
}
