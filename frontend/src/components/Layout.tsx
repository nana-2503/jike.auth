import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip, Tooltip, Avatar } from '@heroui/react'
import { useAuthStore, useThemeStore, useSiteStore } from '../store'
import { useEffect, useState, useRef } from 'react'
import { userApi, configApi } from '../api'
import { avatarOrDefault } from '../utils/avatar'
import PixelToggle from './PixelToggle'
import { 
  HiSun, HiMoon, HiCog, HiUser, HiLogout, HiDotsHorizontal, HiMenu, HiX,
  HiHome, HiChevronLeft, HiChevronRight, HiBell,
  HiCube, HiTag, HiUsers, HiCollection, HiCreditCard, HiBadgeCheck,
  HiStatusOnline, HiDatabase, HiShieldCheck, HiBan, HiShieldExclamation,
  HiDocumentReport, HiUserGroup, HiCalendar, HiTrendingUp, HiKey,
  HiMail, HiCloud, HiShoppingBag, HiCash, HiClipboardCheck, HiSupport,
  HiPuzzle, HiChartPie
} from 'react-icons/hi'

const MenuIcon = ({ icon: Icon }: { icon: any }) => <Icon className="w-full h-full text-current" />

const brandTextClass = 'brand-flow bg-gradient-to-r from-fuchsia-500 via-sky-500 via-50% to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(56,189,248,0.25)]'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, setUser, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const siteConfig = useSiteStore((state) => state.config)
  const [announcementModal, setAnnouncementModal] = useState(false)
  const [popupAnnouncements, setPopupAnnouncements] = useState<{ id: number; title: string; content: string; color: string }[]>([])
  const navRef = useRef<HTMLElement>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pageAnimation, setPageAnimation] = useState('blur-in')

  // 加载页面动画配置
  useEffect(() => {
    const loadAnimation = async () => {
      try {
        const res: any = await configApi.getPublicSecurityConfig()
        setPageAnimation(res.data?.page_animation || 'blur-in')
      } catch (e) {
        // 忽略错误，使用默认值
      }
    }
    loadAnimation()
  }, [])

  // 徽章数据
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({
    '/tickets': 0,      // 未读工单数
    '/notifications': 0,
    '/online': 0,       // 在线人数
    '/activities': 0,   // 进行中的活动数
  })
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // 加载徽章数据
  useEffect(() => {
    const loadBadgeCounts = async () => {
      if (!user) return
      
      const counts: Record<string, number> = {
        '/tickets': 0,
        '/notifications': 0,
        '/online': 0,
        '/activities': 0,
      }
      
      // 获取未读工单数 (status=0表示待处理)
      try {
        const ticketsRes: any = await userApi.listTickets(1, 1, 0)
        counts['/tickets'] = ticketsRes.data?.total || 0
        console.log('Tickets count:', counts['/tickets'])
      } catch (e) {
        // 忽略错误
      }

      try {
        const notificationsRes: any = await userApi.listNotifications(1, 1, '0')
        counts['/notifications'] = notificationsRes.data?.unread || 0
      } catch (e) {
        // 忽略错误
      }
      
      // 获取在线人数
      try {
        const onlineRes: any = await userApi.listOnlineSessions(null, 1, 1)
        counts['/online'] = onlineRes.data?.total || 0
        console.log('Online count:', counts['/online'])
      } catch (e) {
        // 忽略错误
      }
      
      // 获取进行中的活动数 (status=1表示进行中)
      try {
        const activitiesRes: any = await userApi.listActivities(1, 100)
        const activeActivities = activitiesRes.data?.list?.filter((a: any) => a.status === 1) || []
        counts['/activities'] = activeActivities.length
        console.log('Activities count:', counts['/activities'])
      } catch (e) {
        // 忽略错误
      }
      
      console.log('Badge counts updated:', counts)
      setBadgeCounts(counts)
    }
    
    if (user) {
      loadBadgeCounts()
      // 每30秒刷新一次
      const interval = setInterval(loadBadgeCounts, 30000)
      return () => clearInterval(interval)
    }
  }, [user])

  // 路由变化时滚动侧边栏到当前菜单项
  useEffect(() => {
    if (navRef.current) {
      const activeItem = navRef.current.querySelector('a.bg-primary\\/10')
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [location.pathname])

  // 加载弹窗公告
  useEffect(() => {
    const loadPopupAnnouncements = async () => {
      try {
        const res: any = await configApi.getAnnouncements()
        const announcements = res.data || []
        // 筛选需要弹窗的公告
        const popups = announcements.filter((a: any) => a.popup === 1)
        if (popups.length > 0) {
          // 检查今天是否已经显示过
          const today = new Date().toDateString()
          const lastShown = localStorage.getItem('announcement_popup_date')
          if (lastShown !== today) {
            setPopupAnnouncements(popups)
            setAnnouncementModal(true)
            localStorage.setItem('announcement_popup_date', today)
          }
        }
      } catch (err) {
        // 忽略错误
      }
    }
    if (user) {
      loadPopupAnnouncements()
    }
  }, [user])

  useEffect(() => {
    if (siteConfig.site_name) {
      document.title = siteConfig.site_name
    }
  }, [siteConfig.site_name])

  useEffect(() => {
    if (!user) {
      userApi.getProfile().then((res: any) => setUser(res.data))
    }
  }, [user, setUser])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  type NavItem = {
    path: string
    label: string
    iconComponent: any
  }

  type DividerItem = {
    type: 'divider'
    label: string
  }

  const navItems: (NavItem | DividerItem)[] = [
    { path: '/', label: '首页', iconComponent: () => <MenuIcon icon={HiHome} /> },
    { type: 'divider', label: '项目' },
    { path: '/apps', label: '应用', iconComponent: () => <MenuIcon icon={HiCube} /> },
    { path: '/app-versions', label: '版本', iconComponent: () => <MenuIcon icon={HiTag} /> },
    { path: '/app-users', label: '用户', iconComponent: () => <MenuIcon icon={HiUsers} /> },
    { path: '/card-types', label: '卡种', iconComponent: () => <MenuIcon icon={HiCollection} /> },
    { path: '/cards', label: '卡号', iconComponent: () => <MenuIcon icon={HiCreditCard} /> },
    { path: '/licenses', label: '证书', iconComponent: () => <MenuIcon icon={HiBadgeCheck} /> },
    { path: '/online', label: '在线', iconComponent: () => <MenuIcon icon={HiStatusOnline} /> },
    { path: '/data-pools', label: '数据池', iconComponent: () => <MenuIcon icon={HiDatabase} /> },
    { type: 'divider', label: '安全' },
    { path: '/firewall', label: '防火墙', iconComponent: () => <MenuIcon icon={HiShieldCheck} /> },
    { path: '/blacklist', label: '黑名单', iconComponent: () => <MenuIcon icon={HiBan} /> },
    { path: '/risk-users', label: '风险用户', iconComponent: () => <MenuIcon icon={HiShieldExclamation} /> },
    { path: '/security-logs', label: '安全日志', iconComponent: () => <MenuIcon icon={HiDocumentReport} /> },
    { path: '/client-errors', label: '异常日志', iconComponent: () => <MenuIcon icon={HiDocumentReport} /> },
    { type: 'divider', label: '运营' },
    { path: '/agents', label: '代理', iconComponent: () => <MenuIcon icon={HiUserGroup} /> },
    { path: '/activities', label: '活动', iconComponent: () => <MenuIcon icon={HiCalendar} /> },
    { path: '/rebate', label: '推广', iconComponent: () => <MenuIcon icon={HiTrendingUp} /> },
    { path: '/withdraw-keys', label: '提卡', iconComponent: () => <MenuIcon icon={HiKey} /> },
    { type: 'divider', label: '拓展' },
    { path: '/email-config', label: '邮箱', iconComponent: () => <MenuIcon icon={HiMail} /> },
    { path: '/jikepan', label: '网盘', iconComponent: () => <MenuIcon icon={HiCloud} /> },
    { path: '/tools', label: '维护工具', iconComponent: () => <MenuIcon icon={HiCog} /> },
    { path: '/openapi-keys', label: '密钥管理', iconComponent: () => <MenuIcon icon={HiKey} /> },
    { path: '/clientapi-debug', label: 'API调试', iconComponent: () => <MenuIcon icon={HiDocumentReport} /> },
    { path: '/sdk-logs', label: '接口日志', iconComponent: () => <MenuIcon icon={HiDocumentReport} /> },
    { type: 'divider', label: '其他' },
    { path: '/packages', label: '商店', iconComponent: () => <MenuIcon icon={HiShoppingBag} /> },
    { path: '/recharge', label: '充值', iconComponent: () => <MenuIcon icon={HiCash} /> },
    { path: '/checkin', label: '签到', iconComponent: () => <MenuIcon icon={HiClipboardCheck} /> },
    { path: '/tickets', label: '工单', iconComponent: () => <MenuIcon icon={HiSupport} /> },
  ]

  // 桌面端分类折叠状态 - 从 localStorage 读取
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('collapsedCategories')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  
  // 分类图标映射
  const categoryIcons: Record<string, any> = {
    '项目': () => <MenuIcon icon={HiCube} />,
    '运营': () => <MenuIcon icon={HiChartPie} />,
    '安全': () => <MenuIcon icon={HiShieldCheck} />,
    '拓展': () => <MenuIcon icon={HiPuzzle} />,
    '其他': () => <MenuIcon icon={HiDotsHorizontal} />,
  }
  
  // 切换分类折叠状态并保存到 localStorage
  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories)
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category)
    } else {
      newCollapsed.add(category)
    }
    setCollapsedCategories(newCollapsed)
    // 保存到 localStorage
    try {
      localStorage.setItem('collapsedCategories', JSON.stringify(Array.from(newCollapsed)))
    } catch (e) {
      console.error('Failed to save collapsed categories:', e)
    }
  }
  
  const isActive = (path: string) => location.pathname === path

  const menuColors: Record<string, { icon: string; accent: string }> = {
    '/': { icon: 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.35)]', accent: 'bg-red-500' },
    '/apps': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/app-versions': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/app-users': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/card-types': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/cards': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/licenses': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/online': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/data-pools': { icon: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.35)]', accent: 'bg-green-500' },
    '/firewall': { icon: 'text-sky-500 drop-shadow-[0_0_8px_rgba(14,165,233,0.35)]', accent: 'bg-sky-500' },
    '/blacklist': { icon: 'text-sky-500 drop-shadow-[0_0_8px_rgba(14,165,233,0.35)]', accent: 'bg-sky-500' },
    '/risk-users': { icon: 'text-sky-500 drop-shadow-[0_0_8px_rgba(14,165,233,0.35)]', accent: 'bg-sky-500' },
    '/security-logs': { icon: 'text-sky-500 drop-shadow-[0_0_8px_rgba(14,165,233,0.35)]', accent: 'bg-sky-500' },
    '/client-errors': { icon: 'text-sky-500 drop-shadow-[0_0_8px_rgba(14,165,233,0.35)]', accent: 'bg-sky-500' },
    '/agents': { icon: 'text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]', accent: 'bg-cyan-500' },
    '/activities': { icon: 'text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]', accent: 'bg-cyan-500' },
    '/rebate': { icon: 'text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]', accent: 'bg-cyan-500' },
    '/withdraw-keys': { icon: 'text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.35)]', accent: 'bg-cyan-500' },
    '/email-config': { icon: 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.35)]', accent: 'bg-pink-500' },
    '/jikepan': { icon: 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.35)]', accent: 'bg-pink-500' },
    '/tools': { icon: 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.35)]', accent: 'bg-pink-500' },
    '/openapi-keys': { icon: 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.35)]', accent: 'bg-pink-500' },
    '/packages': { icon: 'text-violet-500 drop-shadow-[0_0_8px_rgba(139,92,246,0.35)]', accent: 'bg-violet-500' },
    '/recharge': { icon: 'text-violet-500 drop-shadow-[0_0_8px_rgba(139,92,246,0.35)]', accent: 'bg-violet-500' },
    '/checkin': { icon: 'text-violet-500 drop-shadow-[0_0_8px_rgba(139,92,246,0.35)]', accent: 'bg-violet-500' },
    '/tickets': { icon: 'text-violet-500 drop-shadow-[0_0_8px_rgba(139,92,246,0.35)]', accent: 'bg-violet-500' },
  }

  const projectMenuPaths = new Set(['/apps', '/app-versions', '/app-users', '/card-types', '/cards', '/licenses', '/online', '/data-pools'])
  const securityMenuPaths = new Set(['/firewall', '/blacklist', '/risk-users', '/security-logs', '/client-errors'])
  const operationMenuPaths = new Set(['/agents', '/activities', '/rebate', '/withdraw-keys'])
   const extensionMenuPaths = new Set(['/email-config', '/jikepan', '/tools', '/openapi-keys', '/clientapi-debug', '/sdk-logs'])
  const otherMenuPaths = new Set(['/packages', '/recharge', '/checkin', '/tickets'])

  const getMenuIconClass = (path: string) => {
    if (path === '/') return 'text-amber-500 dark:text-amber-400'
    if (projectMenuPaths.has(path)) return 'text-blue-500 dark:text-blue-400'
    if (securityMenuPaths.has(path)) return 'text-green-500 dark:text-green-400'
    if (operationMenuPaths.has(path)) return 'text-cyan-500 dark:text-cyan-400'
    if (extensionMenuPaths.has(path)) return 'text-violet-500 dark:text-violet-400'
    if (otherMenuPaths.has(path)) return 'text-pink-400 dark:text-pink-300'
    return 'text-gray-500 dark:text-gray-400'
  }

  const getMenuAccentClass = (path: string) => {
    if (path === '/') return 'bg-amber-400 dark:bg-amber-400'
    if (projectMenuPaths.has(path)) return 'bg-blue-400 dark:bg-blue-400'
    if (securityMenuPaths.has(path)) return 'bg-green-400 dark:bg-green-400'
    if (operationMenuPaths.has(path)) return 'bg-cyan-400 dark:bg-cyan-400'
    if (extensionMenuPaths.has(path)) return 'bg-violet-400 dark:bg-violet-400'
    if (otherMenuPaths.has(path)) return 'bg-pink-300 dark:bg-pink-300'
    return 'bg-gray-400 dark:bg-gray-400'
  }

  const menuIconBoxClass = 'flex items-center justify-center rounded-md bg-gray-50/35 ring-1 ring-gray-200/35 dark:bg-white/5 dark:ring-white/8'
  const activeMenuClass = 'bg-gray-100/70 text-gray-900 font-semibold ring-1 ring-gray-200/70 dark:bg-white/8 dark:text-white dark:ring-white/10'

  return (
    <div className="min-h-screen bg-white dark:bg-background dark:text-foreground">
      {/* 顶部栏 */}
      <header
        className={[
          'fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-4',
          'border-b border-gray-200/70 dark:border-gray-700/50',
          'bg-white/90 dark:bg-content1/90',
          'backdrop-blur-xl backdrop-saturate-150',
          'shadow-[0_4px_16px_-12px_rgba(15,23,42,0.28)]',
          'dark:shadow-[0_4px_16px_-12px_rgba(0,0,0,0.65)]',
        ].join(' ')}
      >
        <div className="flex flex-1 items-center gap-4">
          <Link
            to="/"
            className="font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
          >
            {theme === 'dark' && siteConfig.site_logo_dark ? (
              <img src={siteConfig.site_logo_dark} alt="Logo" className="h-8 flex-shrink-0" />
            ) : siteConfig.site_logo ? (
              <img src={siteConfig.site_logo} alt="Logo" className="h-8 flex-shrink-0" />
            ) : (
              <span className="text-2xl flex-shrink-0">☁️</span>
            )}
            <div className="flex flex-col min-w-0">
              <span className={`text-xl leading-tight truncate ${brandTextClass}`}>{siteConfig.site_name}</span>
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
            <button 
              onClick={toggleTheme}
              className="p-2.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-600 dark:text-gray-200"
            >
              {theme === 'light' ? <HiMoon className="w-5 h-5" /> : <HiSun className="w-5 h-5 text-yellow-400" />}
            </button>
          </Tooltip>
          <Tooltip content="通知中心">
            <button
              onClick={() => navigate('/notifications')}
              className={`relative p-2.5 rounded-lg transition-colors ${isActive('/notifications') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-content2'}`}
              aria-label="通知中心"
            >
              <HiBell className="w-5 h-5" />
              {badgeCounts['/notifications'] > 0 && (
                <span className="absolute right-1 top-1 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white dark:ring-content1">
                  {badgeCounts['/notifications'] > 99 ? '99+' : badgeCounts['/notifications']}
                </span>
              )}
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
              <DropdownItem key="profile" startContent={<HiUser className="w-4 h-4" />} onPress={() => navigate('/profile')}>个人中心</DropdownItem>
              {user?.role === 1 ? (
                <DropdownItem key="admin" startContent={<HiCog className="w-4 h-4" />} onPress={() => navigate('/admin')}>后台管理</DropdownItem>
              ) : null}
              <DropdownItem key="logout" startContent={<HiLogout className="w-4 h-4" />} color="danger" onPress={handleLogout}>退出登录</DropdownItem>
            </DropdownMenu>
          </Dropdown>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-2.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-600 dark:text-gray-200"
            aria-label="打开菜单"
          >
            <HiMenu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 侧边栏 */}
      <aside
        className={`hidden md:flex fixed left-0 top-14 bottom-0 z-50 flex-col overflow-hidden responsive-transition transition-all duration-300 border-r border-gray-200/80 dark:border-gray-700/60 bg-white/95 dark:bg-content1/95 backdrop-blur-xl backdrop-saturate-150 shadow-[6px_0_22px_-20px_rgba(15,23,42,0.35)] dark:shadow-[6px_0_22px_-20px_rgba(0,0,0,0.55)] ${sidebarCollapsed ? 'w-20' : 'w-56'}`}
      >
          {/* 折叠按钮 */}
          <div className="flex justify-end p-2 border-b border-gray-100 dark:border-divider">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-500 dark:text-gray-300"
              title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            >
              {sidebarCollapsed ? <HiChevronRight className="w-4 h-4" /> : <HiChevronLeft className="w-4 h-4" />}
            </button>
          </div>
          <nav ref={navRef} className="flex-1 p-3 overflow-y-auto scrollbar-thin">
            {navItems.map((item, index) => {
              if ('type' in item) {
                // 获取该分组下的所有菜单项
                const groupItems: NavItem[] = []
                const sortedItems = navItems
                for (let i = index + 1; i < sortedItems.length; i++) {
                  const nextItem = sortedItems[i]
                  if ('type' in nextItem) break
                  if ('path' in nextItem) {
                    groupItems.push(nextItem)
                  }
                }
                
                return (
                  <div key={`divider-${index}`}>
                    {!sidebarCollapsed && (
                      <div className="px-3 pt-4 pb-1.5 first:pt-2">
                        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                          {item.label}
                        </span>
                      </div>
                    )}
                     
                    <div>
                      {groupItems.map((groupItem) => (
                        <Tooltip
                          key={groupItem.path}
                          content={groupItem.label}
                          placement="right"
                          isDisabled={!sidebarCollapsed}
                          delay={200}
                        >
                          <Link
                            to={groupItem.path}
                            draggable={false}
                            className={`relative h-[40px] flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} mb-1 transition-colors duration-200 rounded-lg group cursor-pointer ${
                              isActive(groupItem.path) 
                                ? activeMenuClass 
                                : 'text-gray-600 dark:text-default-500 hover:bg-gray-100/80 dark:hover:bg-content2/60 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            {/* 激活状态左侧彩色边框 */}
                            {isActive(groupItem.path) && (
                              <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full ${getMenuAccentClass(groupItem.path)}`} />
                            )}
                            <div className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${menuIconBoxClass} ${isActive(groupItem.path) ? 'bg-white/70 ring-gray-200 dark:bg-white/10 dark:ring-white/15' : ''} ${sidebarCollapsed ? 'w-8 h-8' : 'w-6.5 h-6.5'}`}>
                              <div className={`${getMenuIconClass(groupItem.path)} ${sidebarCollapsed ? 'w-4.5 h-4.5' : 'w-4 h-4'}`}>
                                <groupItem.iconComponent />
                              </div>
                            </div>
                            {!sidebarCollapsed && (
                              <>
                                <span className="flex-1 text-sm whitespace-nowrap overflow-hidden truncate">{groupItem.label}</span>
                                {badgeCounts[groupItem.path] > 0 && (
                                  <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                                    {badgeCounts[groupItem.path]}
                                  </span>
                                )}
                              </>
                            )}
                          </Link>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )
              } else {
                // 独立菜单项（如首页，在第一个分组之前）
                // 检查是否在任何分组之前
                let isBeforeFirstDivider = true
                const sortedItems = navItems
                for (let i = 0; i < index; i++) {
                  if ('type' in sortedItems[i]) {
                    isBeforeFirstDivider = false
                    break
                  }
                }
                
                // 如果在第一个分组之前，正常渲染
                if (isBeforeFirstDivider) {
                  return (
                    <Tooltip
                      key={item.path}
                      content={item.label}
                      placement="right"
                      isDisabled={!sidebarCollapsed}
                      delay={200}
                    >
                      <Link
                        to={item.path}
                        draggable={false}
                        className={`relative h-[40px] flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} mb-1 transition-colors duration-200 rounded-lg group cursor-pointer ${
                            isActive(item.path) 
                            ? activeMenuClass 
                            : 'text-gray-600 dark:text-default-500 hover:bg-gray-100/80 dark:hover:bg-content2/60 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {/* 激活状态左侧彩色边框 */}
                        {isActive(item.path) && (
                          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full ${getMenuAccentClass(item.path)}`} />
                        )}
                        <div className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${menuIconBoxClass} ${isActive(item.path) ? 'bg-white/70 ring-gray-200 dark:bg-white/10 dark:ring-white/15' : ''} ${sidebarCollapsed ? 'w-8 h-8' : 'w-6.5 h-6.5'}`}>
                          <div className={`${getMenuIconClass(item.path)} ${sidebarCollapsed ? 'w-4.5 h-4.5' : 'w-4 h-4'}`}>
                            <item.iconComponent />
                          </div>
                        </div>
                        {!sidebarCollapsed && (
                          <>
                            <span className="flex-1 text-sm whitespace-nowrap overflow-hidden truncate">{item.label}</span>
                            {badgeCounts[item.path] > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                                {badgeCounts[item.path]}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </Tooltip>
                  )
                }
                
                // 否则跳过（已经在分组内渲染）
                return null
              }
            })}
          </nav>
      </aside>

      {/* 主内容区 */}
      <main className={`transition-all duration-300 pt-[70px] pb-4 min-h-screen flex flex-col responsive-transition ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-56'}`}>
        <div className={`px-3 md:px-5 flex-1 ${pageAnimation !== 'none' ? `animate-${pageAnimation}` : ''}`}>
          <Outlet />
        </div>
      </main>

      {/* 移动端左侧抽屉菜单 */}
      <div className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${mobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
        <aside
          className={`absolute left-0 top-0 bottom-0 w-[248px] max-w-[76vw] flex flex-col overflow-hidden border-r border-gray-200/80 dark:border-gray-700/60 bg-white/95 dark:bg-content1/95 backdrop-blur-xl backdrop-saturate-150 shadow-[10px_0_30px_-18px_rgba(15,23,42,0.45)] dark:shadow-[10px_0_30px_-18px_rgba(0,0,0,0.65)] transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100 dark:border-divider">
            <Link
              to="/"
              onClick={() => setMobileSidebarOpen(false)}
              className="font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
            >
              {theme === 'dark' && siteConfig.site_logo_dark ? (
                <img src={siteConfig.site_logo_dark} alt="Logo" className="h-8 flex-shrink-0" />
              ) : siteConfig.site_logo ? (
                <img src={siteConfig.site_logo} alt="Logo" className="h-8 flex-shrink-0" />
              ) : (
                <span className="text-2xl flex-shrink-0">☁️</span>
              )}
              <span className={`text-lg leading-tight truncate ${brandTextClass}`}>{siteConfig.site_name}</span>
            </Link>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-content2 rounded-lg transition-colors text-gray-600 dark:text-gray-200"
              aria-label="关闭菜单"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin">
            {navItems.map((item, index) => {
              if ('type' in item) {
                return (
                  <div key={`mobile-divider-${index}`} className="px-3 pt-4 pb-1.5 first:pt-2">
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{item.label}</span>
                  </div>
                )
              }

              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMobileSidebarOpen(false) }}
                  className={`relative w-full h-[40px] flex items-center gap-3 px-3 mb-1 transition-colors duration-200 rounded-lg text-left ${
                    isActive(item.path)
                      ? activeMenuClass
                      : 'text-gray-600 dark:text-default-500 hover:bg-gray-100/80 dark:hover:bg-content2/60 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {isActive(item.path) && (
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full ${getMenuAccentClass(item.path)}`} />
                  )}
                  <div className={`w-7 h-7 flex-shrink-0 ${menuIconBoxClass}`}>
                    <div className={`w-4 h-4 ${getMenuIconClass(item.path)}`}>
                      <item.iconComponent />
                    </div>
                  </div>
                  <span className="flex-1 text-sm whitespace-nowrap overflow-hidden truncate">{item.label}</span>
                  {badgeCounts[item.path] > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                      {badgeCounts[item.path]}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </aside>
      </div>

      {/* 公告弹窗 */}
      <Modal isOpen={announcementModal} onClose={() => setAnnouncementModal(false)} size="lg" placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <span>📢</span>
            <span>系统公告</span>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {popupAnnouncements.map((announcement) => (
              <div key={announcement.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Chip color={announcement.color as any} size="sm">{announcement.title}</Chip>
                </div>
                <div 
                  className="text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: announcement.content }}
                />
              </div>
            ))}
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={() => setAnnouncementModal(false)}>
              我知道了
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
