import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useAuthStore, useSiteStore, useThemeStore } from './store'
import { authApi, configApi, userApi } from './api'
import { Spinner } from '@heroui/react'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Setup from './pages/Setup'
import BindSocial from './pages/BindSocial'
import Dashboard from './pages/Dashboard'
import Apps from './pages/Apps'
import AppEdit from './pages/AppEdit'
import AppUsers from './pages/AppUsers'
import AppUserEdit from './pages/AppUserEdit'
import AppUserDevices from './pages/AppUserDevices'
import AdminUsers from './pages/admin/Users'
import AdminDashboard from './pages/admin/Dashboard'
import AdminSystemStatus from './pages/admin/SystemStatus'
import AdminLicenseStatus from './pages/admin/LicenseStatus'
import AdminTasks from './pages/admin/Tasks'
import AdminAnnouncements from './pages/admin/Announcements'
import AdminSite from './pages/admin/Site'
import AdminEmail from './pages/admin/Email'
import AdminRegister from './pages/admin/Register'
import AdminTelegram from './pages/admin/Telegram'
import AdminCheckin from './pages/admin/Checkin'
import AdminSecurity from './pages/admin/Security'
import AdminSDKCrypto from './pages/admin/SDKCrypto'
import AdminTheme from './pages/admin/Theme'
import AdminSocialLogin from './pages/admin/SocialLogin'
import AdminTickets from './pages/admin/Tickets'
import AdminTicketDetail from './pages/admin/TicketDetail'
import AdminPackages from './pages/admin/Packages'
import AdminApps from './pages/admin/Apps'
import AdminAppEdit from './pages/admin/AppEdit'
import AdminAppUsers from './pages/admin/AppUsers'
import CardTypes from './pages/CardTypes'
import CardTypeEdit from './pages/CardTypeEdit'
import Cards from './pages/Cards'
import WithdrawKeys from './pages/WithdrawKeys'
import WithdrawLogs from './pages/WithdrawLogs'
import AppVersions from './pages/AppVersions'
import AppVersionEdit from './pages/AppVersionEdit'
import OnlineSessions from './pages/OnlineSessions'
import WSConnections from './pages/WSConnections'
import AdminCardTypes from './pages/admin/CardTypes'
import AdminCardTypeEdit from './pages/admin/CardTypeEdit'
import AdminLogs from './pages/admin/Logs'
import AdminRecharge from './pages/admin/Recharge'
import Agents from './pages/Agents'
import DataPools from './pages/DataPools'
import DataPoolEdit from './pages/DataPoolEdit'
import DataItems from './pages/DataItems'
import DataItemEdit from './pages/DataItemEdit'
import Packages from './pages/Packages'
import MyPackages from './pages/MyPackages'
import Licenses from './pages/Licenses'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import Activities from './pages/Activities'
import ActivityEdit from './pages/ActivityEdit'
import ActivityRecords from './pages/ActivityRecords'
import ActivityList from './pages/public/ActivityList'
import ActivityDetail from './pages/public/ActivityDetail'
import ActivityUser from './pages/public/ActivityUser'
import Checkin from './pages/Checkin'
import Profile from './pages/Profile'
import EmailConfig from './pages/EmailConfig'
import Promotion from './pages/Promotion'
import Blacklist from './pages/Blacklist'
import Firewall from './pages/Firewall'
import SecurityLogs from './pages/SecurityLogs'
import Backup from './pages/Backup'
import Recharge from './pages/Recharge'
import RechargeResult from './pages/RechargeResult'
import Tools from './pages/Tools'
import JikePan from './pages/JikePan'
import OpenApiKeys from './pages/OpenApiKeys'
import ClientApiDebug from './pages/ClientApiDebug'
import SDKLogs from './pages/SDKLogs'
import RiskUsers from './pages/RiskUsers'
import Notifications from './pages/Notifications'
import ClientErrors from './pages/ClientErrors'
import AgentLogin from './pages/agent/Login'
import AgentDashboard from './pages/agent/Dashboard'
import AgentHome from './pages/agent/Home'
import AgentGenerateCards from './pages/agent/GenerateCards'
import AgentCards from './pages/agent/Cards'
import AgentCardLogs from './pages/agent/CardLogs'
import AgentUsers from './pages/agent/Users'
import AgentBalanceLogs from './pages/agent/BalanceLogs'
import AgentSubAgents from './pages/agent/SubAgents'
import AgentStockPackages from './pages/agent/StockPackages'
import AgentSettings from './pages/agent/Settings'
import Home from './pages/Home'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import ToastContainer from './components/Toast'
import ConfirmModal from './components/ConfirmModal'

// 将hex颜色转换为HSL格式
function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '212 100% 47%'
  
  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  // 作者后台的简单路由守卫：只判断 token 是否存在，具体有效性由接口 401 拦截器处理。
  const token = useAuthStore((state) => state.token)
  return token ? <>{children}</> : <Navigate to="/home" />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  // 管理员路由需要先拿到用户资料，因为刷新页面后 store 里只有 token、没有 user。
  const { user, token } = useAuthStore()
  const [loading, setLoading] = useState(!user && !!token)
  const setUser = useAuthStore((state) => state.setUser)

  useEffect(() => {
    if (token && !user) {
      userApi.getProfile().then((res: any) => {
        setUser(res.data)
      }).catch(() => {}).finally(() => {
        setLoading(false)
      })
    }
  }, [token, user, setUser])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return user?.role === 1 ? <>{children}</> : <Navigate to="/" />
}

export default function App() {
  const setConfig = useSiteStore((state) => state.setConfig)
  const [isDark, setIsDark] = useState(false)
  const pixel = useThemeStore((state) => state.pixel)
  const [setupChecking, setSetupChecking] = useState(true)
  const [needSetup, setNeedSetup] = useState(false)

  // 监听 html.dark class 变化，并同步给 Ant Design 的主题算法。
  useEffect(() => {
    const checkDarkMode = () => {
      const isDarkMode = document.documentElement.classList.contains('dark')
      setIsDark(isDarkMode)
    }
    
    checkDarkMode()
    
    // 使用 MutationObserver 监听 class 变化
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // 启动时加载公共站点配置：页面标题、favicon、Logo、客服信息都来自这里。
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
      if (data.site_name) {
        document.title = data.site_name
      }
      if (data.site_favicon) {
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link')
        link.type = 'image/x-icon'
        link.rel = 'shortcut icon'
        link.href = data.site_favicon
        document.head.appendChild(link)
      }
    }).catch(() => {})

    // 加载公共安全配置中的主题色，同步给 HeroUI CSS 变量和站点配置 store。
    configApi.getSecurityConfig().then((res: any) => {
      const data = res.data || {}
      if (data.primary_color) {
        setConfig({ primary_color: data.primary_color })
        // 应用主题色
        document.documentElement.style.setProperty('--heroui-primary', hexToHsl(data.primary_color))
        document.documentElement.style.setProperty('--heroui-primary-500', data.primary_color)
      }
    }).catch(() => {})
  }, [setConfig])

  useEffect(() => {
    // 每次进入前端先确认系统是否完成安装，未安装时只允许访问 /setup。
    authApi.getSetupStatus()
      .then((res: any) => {
        setNeedSetup(Boolean(res.data?.need_setup))
      })
      .catch(() => {})
      .finally(() => setSetupChecking(false))
  }, [])

  if (setupChecking) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: useSiteStore.getState().config.primary_color || '#0070f3',
          borderRadius: pixel ? 0 : undefined,
          fontFamily: pixel
            ? '"Fusion Pixel 12px Proportional SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace'
            : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
        },
      }}
    >
      <ToastContainer />
      <ConfirmModal />
      <Routes>
        {needSetup && (
          <>
            <Route path="/setup" element={<Setup onSetupComplete={() => setNeedSetup(false)} />} />
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </>
        )}
        {!needSetup && (
          <>
        <Route path="/setup" element={<Navigate to="/login" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/bind-social" element={<BindSocial />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="apps" element={<Apps />} />
          <Route path="apps/:id" element={<AppEdit />} />
          <Route path="app-users" element={<AppUsers />} />
          <Route path="app-users/:id" element={<AppUserEdit />} />
          <Route path="app-users/:id/devices" element={<AppUserDevices />} />
          <Route path="card-types" element={<CardTypes />} />
          <Route path="card-types/:id" element={<CardTypeEdit />} />
          <Route path="cards" element={<Cards />} />
          <Route path="withdraw-keys" element={<WithdrawKeys />} />
          <Route path="withdraw-logs" element={<WithdrawLogs />} />
          <Route path="app-versions" element={<AppVersions />} />
          <Route path="app-versions/:id" element={<AppVersionEdit />} />
          <Route path="online" element={<OnlineSessions />} />
          <Route path="risk-users" element={<RiskUsers />} />
          <Route path="ws-connections" element={<WSConnections />} />
          <Route path="agents" element={<Agents />} />
          <Route path="data-pools" element={<DataPools />} />
          <Route path="data-pools/new" element={<DataPoolEdit />} />
          <Route path="data-pools/:id" element={<DataPoolEdit />} />
          <Route path="data-pools/:poolId/items" element={<DataItems />} />
          <Route path="data-pools/:poolId/items/new" element={<DataItemEdit />} />
          <Route path="data-pools/:poolId/items/:itemId" element={<DataItemEdit />} />
          <Route path="packages" element={<Packages />} />
          <Route path="my-packages" element={<MyPackages />} />
          <Route path="licenses" element={<Licenses />} />
          <Route path="activities" element={<Activities />} />
          <Route path="activities/:id" element={<ActivityEdit />} />
          <Route path="activities/:id/records" element={<ActivityRecords />} />
          <Route path="client-errors" element={<ClientErrors />} />
          <Route path="rebate" element={<Promotion />} />
          <Route path="point-shop" element={<Promotion />} />
          <Route path="blacklist" element={<Blacklist />} />
          <Route path="firewall" element={<Firewall />} />
          <Route path="security-logs" element={<SecurityLogs />} />
          <Route path="tools" element={<Tools />} />
          <Route path="jikepan" element={<JikePan />} />
          <Route path="openapi-keys" element={<OpenApiKeys />} />
          <Route path="clientapi-debug" element={<ClientApiDebug />} />
          <Route path="sdk-logs" element={<SDKLogs />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="checkin" element={<Checkin />} />
          <Route path="profile" element={<Profile />} />
          <Route path="email-config" element={<EmailConfig />} />
          <Route path="recharge" element={<Recharge />} />
          <Route path="recharge/result" element={<RechargeResult />} />
        </Route>
        <Route path="/admin" element={<PrivateRoute><AdminRoute><AdminLayout /></AdminRoute></PrivateRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="system-status" element={<AdminSystemStatus />} />
          <Route path="license-status" element={<AdminLicenseStatus />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="site" element={<AdminSite />} />
          <Route path="email" element={<AdminEmail />} />
          <Route path="register" element={<AdminRegister />} />
          <Route path="telegram" element={<AdminTelegram />} />
          <Route path="checkin" element={<AdminCheckin />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="sdk-crypto" element={<AdminSDKCrypto />} />
          <Route path="theme" element={<AdminTheme />} />
          <Route path="social-login" element={<AdminSocialLogin />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="tickets/:id" element={<AdminTicketDetail />} />
          <Route path="packages" element={<AdminPackages />} />
          <Route path="apps" element={<AdminApps />} />
          <Route path="apps/:id" element={<AdminAppEdit />} />
          <Route path="appusers" element={<AdminAppUsers />} />
          <Route path="cardtypes" element={<AdminCardTypes />} />
          <Route path="cardtypes/:id" element={<AdminCardTypeEdit />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="recharge" element={<AdminRecharge />} />
          <Route path="backup" element={<Backup />} />
        </Route>
        <Route path="/agent/login" element={<AgentLogin />} />
        <Route path="/agent" element={<AgentDashboard />}>
          <Route index element={<AgentHome />} />
          <Route path="generate" element={<AgentGenerateCards />} />
          <Route path="cards" element={<AgentCards />} />
          <Route path="logs" element={<AgentCardLogs />} />
          <Route path="users" element={<AgentUsers />} />
          <Route path="sub-agents" element={<AgentSubAgents />} />
          <Route path="stock-packages" element={<AgentStockPackages />} />
          <Route path="balance" element={<AgentBalanceLogs />} />
          <Route path="settings" element={<AgentSettings />} />
        </Route>
        {/* 公开活动页面 */}
        <Route path="/activity" element={<ActivityList />} />
        <Route path="/activity/:id" element={<ActivityDetail />} />
        <Route path="/activity/user" element={<ActivityUser />} />
          </>
        )}
      </Routes>
    </ConfigProvider>
  )
}
