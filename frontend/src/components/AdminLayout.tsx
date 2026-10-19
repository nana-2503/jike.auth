import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip, Avatar } from '@heroui/react'
import {
  HiArrowLeft, HiSun, HiMoon, HiLogout, HiUsers,
  HiCog, HiCube, HiUserGroup, HiTicket, HiMail, HiKey, HiGift, HiChat,
  HiCalendar, HiShieldCheck, HiSupport, HiChevronLeft, HiChevronRight,
  HiColorSwatch, HiHome, HiMenu, HiX, HiLockClosed, HiLogin, HiCash,
  HiCollection, HiDocumentReport, HiArchive, HiAtSymbol, HiBell, HiStatusOnline, HiClock, HiBadgeCheck,
} from 'react-icons/hi'
import { useThemeStore, useSiteStore, useAuthStore } from '../store'
import { useEffect, useState } from 'react'
import { userApi } from '../api'
import { avatarOrDefault } from '../utils/avatar'
import PixelToggle from './PixelToggle'

type NavItem = { path: string; label: string; icon: any }
type DividerItem = { type: 'divider'; label: string }

const brandTextClass = 'brand-flow bg-gradient-to-r from-fuchsia-500 via-sky-500 via-50% to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(56,189,248,0.25)]'

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()
  const { config: siteConfig } = useSiteStore()
  const { user, setUser, logout } = useAuthStore()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (!user) {
      userApi.getProfile().then((res: any) => setUser(res.data))
    }
  }, [user, setUser])

  useEffect(() => {
    document.title = `后台管理 - ${siteConfig.site_name || '极客验证'}`
  }, [siteConfig.site_name])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems: (NavItem | DividerItem)[] = [
    { path: '/admin', label: '数据一览', icon: HiHome },
    { path: '/admin/system-status', label: '系统状态', icon: HiStatusOnline },
    { path: '/admin/license-status', label: '免费说明', icon: HiBadgeCheck },
    { path: '/admin/tasks', label: '后台任务', icon: HiClock },
    { type: 'divider', label: '系统' },
    { path: '/admin/site', label: '网站配置', icon: HiCog },
    { path: '/admin/announcements', label: '公告管理', icon: HiBell },
    { path: '/admin/email', label: '邮箱配置', icon: HiMail },
    { path: '/admin/register', label: '注册登录', icon: HiLogin },
    { path: '/admin/telegram', label: '电报通知', icon: HiChat },
    { path: '/admin/social-login', label: '社交登录', icon: HiAtSymbol },
    { path: '/admin/security', label: '安全配置', icon: HiShieldCheck },
    { path: '/admin/sdk-crypto', label: 'SDK加解密', icon: HiLockClosed },
    { type: 'divider', label: '运营' },
    { path: '/admin/checkin', label: '签到配置', icon: HiCalendar },
    { path: '/admin/packages', label: '套餐管理', icon: HiGift },
    { path: '/admin/recharge', label: '充值管理', icon: HiCash },
    { type: 'divider', label: '管理' },
    { path: '/admin/users', label: '用户管理', icon: HiUsers },
    { path: '/admin/apps', label: '应用管理', icon: HiCube },
    { path: '/admin/appusers', label: '应用用户', icon: HiUserGroup },
    { path: '/admin/cardtypes', label: '应用卡种', icon: HiCollection },
    { path: '/admin/tickets', label: '工单管理', icon: HiSupport },
    { type: 'divider', label: '其他' },
    { path: '/admin/theme', label: '主题设置', icon: HiColorSwatch },
    { path: '/admin/logs', label: '操作日志', icon: HiDocumentReport },
    { path: '/admin/backup', label: '数据备份', icon: HiArchive },
  ]

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const systemMenuPaths = new Set([
    '/admin/system-status', '/admin/license-status', '/admin/tasks', '/admin/site', '/admin/announcements', '/admin/email',
    '/admin/register', '/admin/telegram', '/admin/social-login', '/admin/security', '/admin/sdk-crypto',
  ])
  const operationMenuPaths = new Set(['/admin/checkin', '/admin/packages', '/admin/recharge'])
  const manageMenuPaths = new Set(['/admin/users', '/admin/apps', '/admin/appusers', '/admin/cardtypes', '/admin/tickets'])
  const otherMenuPaths = new Set(['/admin/theme', '/admin/logs', '/admin/backup'])

  const getMenuIconClass = (path: string) => {
    if (path === '/admin') return 'text-amber-500 dark:text-amber-400'
    if (path === '/admin/system-status') return 'text-violet-500 dark:text-violet-400'
    if (path === '/admin/license-status') return 'text-violet-500 dark:text-violet-400'
    if (path === '/admin/tasks') return 'text-violet-500 dark:text-violet-400'
    if (systemMenuPaths.has(path)) return 'text-blue-500 dark:text-blue-400'
    if (operationMenuPaths.has(path)) return 'text-cyan-500 dark:text-cyan-400'
    if (manageMenuPaths.has(path)) return 'text-green-500 dark:text-green-400'
    if (otherMenuPaths.has(path)) return 'text-pink-400 dark:text-pink-300'
    return 'text-gray-500 dark:text-gray-400'
  }

  const getMenuAccentClass = (path: string) => {
    if (path === '/admin') return 'bg-amber-400 dark:bg-amber-400'
    if (path === '/admin/system-status') return 'bg-violet-400 dark:bg-violet-400'
    if (path === '/admin/license-status') return 'bg-violet-400 dark:bg-violet-400'
    if (path === '/admin/tasks') return 'bg-violet-400 dark:bg-violet-400'
    if (systemMenuPaths.has(path)) return 'bg-blue-400 dark:bg-blue-400'
    if (operationMenuPaths.has(path)) return 'bg-cyan-400 dark:bg-cyan-400'
    if (manageMenuPaths.has(path)) return 'bg-green-400 dark:bg-green-400'
    if (otherMenuPaths.has(path)) return 'bg-pink-300 dark:bg-pink-300'
    return 'bg-gray-400 dark:bg-gray-400'
  }

  const menuIconBoxClass = 'flex items-center justify-center rounded-md bg-gray-50/35 ring-1 ring-gray-200/35 dark:bg-white/5 dark:ring-white/8'
  const activeMenuClass = 'bg-gray-100/70 text-gray-900 font-semibold ring-1 ring-gray-200/70 dark:bg-white/8 dark:text-white dark:ring-white/10'

  const renderNav = (mobile = false) => (
    <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin">
      {navItems.map((item, index) => {
        if ('type' in item) {
          return !sidebarCollapsed || mobile ? (
            <div key={`divider-${index}`} className="px-3 pt-4 pb-1.5 first:pt-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">{item.label}</span>
            </div>
          ) : (
            <div key={`divider-${index}`} className="my-2" />
          )
        }

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
            <button
              key={item.path}
              onClick={() => { navigate(item.path); setMobileSidebarOpen(false) }}
              className={`${className} w-full text-left`}
            >
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

  return (
    <div className="min-h-screen bg-white dark:bg-background dark:text-foreground">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 border-b border-gray-200/70 dark:border-gray-700/50 bg-white/90 dark:bg-content1/90 backdrop-blur-xl backdrop-saturate-150 shadow-[0_4px_16px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_4px_16px_-12px_rgba(0,0,0,0.65)]">
        <div className="flex flex-1 items-center gap-4">
          <Link to="/admin" className="font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
            {theme === 'dark' && siteConfig.site_logo_dark ? (
              <img src={siteConfig.site_logo_dark} alt="Logo" className="h-8 flex-shrink-0" />
            ) : siteConfig.site_logo ? (
              <img src={siteConfig.site_logo} alt="Logo" className="h-8 flex-shrink-0" />
            ) : (
              <span className="text-2xl flex-shrink-0">☁️</span>
            )}
            <div className="flex flex-col min-w-0">
              <span className={`text-xl leading-tight truncate ${brandTextClass}`}>{siteConfig.site_name || '后台管理'}</span>
              {siteConfig.site_subtitle && (
                <span className="text-xs font-normal opacity-80 leading-tight truncate text-gray-600 dark:text-gray-300">
                  {siteConfig.site_subtitle}
                </span>
              )}
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
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
                  src={avatarOrDefault(user?.avatar)}
                  name={user?.nickname || user?.username}
                  radius="full"
                  classNames={{
                    base: 'h-8 w-8 shrink-0 overflow-hidden rounded-full',
                    img: 'h-full w-full rounded-full object-cover',
                    fallback: 'h-full w-full rounded-full',
                  }}
                />
                <span className="text-sm font-medium hidden md:inline">{user?.nickname || user?.username}</span>
              </button>
            </DropdownTrigger>
            <DropdownMenu>
              <DropdownItem key="front" startContent={<HiArrowLeft className="w-4 h-4" />} onPress={() => navigate('/')}>回到前台</DropdownItem>
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
          <Outlet />
        </div>
      </main>

      <div className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${mobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
        <aside className={`absolute left-0 top-0 bottom-0 w-[248px] max-w-[76vw] flex flex-col overflow-hidden border-r border-gray-200/80 dark:border-gray-700/60 bg-white/95 dark:bg-content1/95 backdrop-blur-xl backdrop-saturate-150 shadow-[10px_0_30px_-18px_rgba(15,23,42,0.45)] dark:shadow-[10px_0_30px_-18px_rgba(0,0,0,0.65)] transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100 dark:border-divider">
            <Link to="/admin" onClick={() => setMobileSidebarOpen(false)} className="font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
              {theme === 'dark' && siteConfig.site_logo_dark ? (
                <img src={siteConfig.site_logo_dark} alt="Logo" className="h-8 flex-shrink-0" />
              ) : siteConfig.site_logo ? (
                <img src={siteConfig.site_logo} alt="Logo" className="h-8 flex-shrink-0" />
              ) : (
                <span className="text-2xl flex-shrink-0">☁️</span>
              )}
              <span className={`text-lg leading-tight truncate ${brandTextClass}`}>后台管理</span>
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
