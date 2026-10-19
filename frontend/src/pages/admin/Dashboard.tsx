import { useEffect, useState } from 'react'
import { Card, CardBody, Spinner, Chip } from '@heroui/react'
import { HiUsers, HiCube, HiUserGroup, HiCreditCard, HiStatusOnline, HiSupport, HiTrendingUp, HiTrendingDown, HiCalendar, HiStar } from 'react-icons/hi'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { adminApi } from '../../api'

interface DashboardStats {
  total_users: number
  today_users: number
  yesterday_users: number
  today_login_users: number
  total_apps: number
  total_app_users: number
  today_app_users: number
  yesterday_app_users: number
  online_count: number
  total_cards: number
  used_cards: number
  today_used_cards: number
  total_agents: number
  pending_tickets: number
  resolved_tickets: number
  today_checkins: number
  total_checkins: number
  active_activities: number
  total_activity_records: number
  today_activity_records: number
  user_trend: { date: string; count: number }[]
  app_user_trend: { date: string; count: number }[]
  card_trend: { date: string; count: number }[]
  online_trend: { date: string; count: number }[]
  login_trend: { date: string; count: number }[]
  recent_users: { id: number; username: string; email: string; nickname: string; status: number; created_at: string }[]
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getDashboardStats()
      .then((res: any) => setStats(res.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!stats) return null

  const TrendBadge = ({ today, yesterday }: { today: number; yesterday: number }) => {
    if (yesterday === 0 && today === 0) return null
    const diff = today - yesterday
    if (diff > 0) return <span className="flex items-center text-xs text-green-500"><HiTrendingUp className="w-3 h-3 mr-0.5" />+{diff}</span>
    if (diff < 0) return <span className="flex items-center text-xs text-red-500"><HiTrendingDown className="w-3 h-3 mr-0.5" />{diff}</span>
    return <span className="text-xs text-gray-400">持平</span>
  }

  const statCards = [
    { title: '平台用户', value: stats.total_users, sub: `今日 +${stats.today_users}`, icon: HiUsers, color: 'bg-blue-500', today: stats.today_users, yesterday: stats.yesterday_users },
    { title: '软件用户', value: stats.total_app_users, sub: `今日 +${stats.today_app_users}`, icon: HiUserGroup, color: 'bg-green-500', today: stats.today_app_users, yesterday: stats.yesterday_app_users },
    { title: '当前在线', value: stats.online_count, icon: HiStatusOnline, color: 'bg-cyan-500' },
    { title: '应用总数', value: stats.total_apps, icon: HiCube, color: 'bg-purple-500' },
    { title: '卡号总数', value: stats.total_cards, sub: `已使用 ${stats.used_cards}`, icon: HiCreditCard, color: 'bg-orange-500' },
    { title: '今日签到', value: stats.today_checkins, sub: `累计 ${stats.total_checkins}`, icon: HiCalendar, color: 'bg-amber-500' },
    { title: '进行中活动', value: stats.active_activities, sub: `今日参与 ${stats.today_activity_records}`, icon: HiStar, color: 'bg-rose-500' },
    { title: '待处理工单', value: stats.pending_tickets, sub: `已处理 ${stats.resolved_tickets}`, icon: HiSupport, color: stats.pending_tickets > 0 ? 'bg-red-500' : 'bg-gray-400' },
  ]

  const chartConfig = [
    { title: '近7天平台用户注册', data: stats.user_trend, color: '#3b82f6', id: 'adminUser' },
    { title: '近7天软件用户注册', data: stats.app_user_trend, color: '#22c55e', id: 'adminAppUser' },
    { title: '近7天卡号充值', data: stats.card_trend, color: '#f97316', id: 'adminCard' },
    { title: '近7天在线用户', data: stats.online_trend, color: '#06b6d4', id: 'adminOnline' },
    { title: '近7天平台登录', data: stats.login_trend, color: '#8b5cf6', id: 'adminLogin' },
  ]

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((item, index) => (
          <Card key={index}>
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.color}`}>
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.title}</p>
                  <p className="text-xl font-bold">{item.value.toLocaleString()}</p>
                  <div className="flex items-center gap-2">
                    {item.sub && <span className="text-xs text-gray-400">{item.sub}</span>}
                    {item.today !== undefined && item.yesterday !== undefined && (
                      <TrendBadge today={item.today} yesterday={item.yesterday} />
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* 趋势图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {chartConfig.map((chart) => (
          <Card key={chart.id}>
            <CardBody className="p-4">
              <h3 className="font-semibold text-sm mb-4">{chart.title}</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart.data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id={chart.id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chart.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                      formatter={(value: any) => [value, '数量']}
                    />
                    <Area type="monotone" dataKey="count" stroke={chart.color} strokeWidth={2} fillOpacity={1} fill={`url(#${chart.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* 最近注册用户 */}
      <Card>
        <CardBody className="p-4">
          <h3 className="font-semibold text-sm mb-4">最近注册用户</h3>
          {/* 桌面端表格 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2 font-medium">ID</th>
                  <th className="pb-2 font-medium">用户名</th>
                  <th className="pb-2 font-medium">邮箱</th>
                  <th className="pb-2 font-medium">昵称</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                    <td className="py-2.5 text-gray-600 dark:text-gray-300">{user.id}</td>
                    <td className="py-2.5 font-medium">{user.username}</td>
                    <td className="py-2.5 text-gray-500">{user.email}</td>
                    <td className="py-2.5 text-gray-500">{user.nickname || '-'}</td>
                    <td className="py-2.5">
                      <Chip size="sm" color={user.status === 1 ? 'success' : 'danger'} variant="flat">
                        {user.status === 1 ? '正常' : '禁用'}
                      </Chip>
                    </td>
                    <td className="py-2.5 text-gray-400 text-xs">{formatTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 移动端卡片列表 */}
          <div className="md:hidden space-y-2">
            {stats.recent_users.map((user) => (
              <div key={user.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-content2/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{user.username}</span>
                    <Chip size="sm" color={user.status === 1 ? 'success' : 'danger'} variant="flat" className="flex-shrink-0">
                      {user.status === 1 ? '正常' : '禁用'}
                    </Chip>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(user.created_at)}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
