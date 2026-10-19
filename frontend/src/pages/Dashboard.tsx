import { useEffect, useState } from 'react'
import { Card, CardBody, Alert, Spinner, Select, SelectItem, Chip } from '@heroui/react'
import { HiSpeakerphone, HiCube, HiUsers, HiTicket, HiCreditCard, HiUserGroup, HiStatusOnline, HiChartBar, HiExclamation } from 'react-icons/hi'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { configApi, userApi } from '../api'

interface Announcement {
  content: string
  color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
}

interface Stats {
  app_count: number
  user_count: number
  card_type_count: number
  card_count: number
  online_count: number
  max_apps: number
  max_users: number
  max_card_types: number
  max_cards: number
  base_max_apps: number
  base_max_users: number
  base_max_card_types: number
  base_max_cards: number
  extra_apps: number
  extra_users: number
  extra_card_types: number
  extra_cards: number
  package_name: string
  package_expire_at: string | null
}

interface ChartData {
  date: string
  login_users: number
  online_users: number
  online_devices: number
}

interface UserChartData {
  date: string
  registered: number
  paid: number
}

interface CardChartData {
  date: string
  created: number
  recharged: number
}

interface AgentChartData {
  date: string
  card_count: number
  total_cost: number
}

interface AppOption {
  id: number
  app_name: string
}

export default function Dashboard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [userChartData, setUserChartData] = useState<UserChartData[]>([])
  const [cardChartData, setCardChartData] = useState<CardChartData[]>([])
  const [agentChartData, setAgentChartData] = useState<AgentChartData[]>([])
  const [apps, setApps] = useState<AppOption[]>([])
  const [reportAppId, setReportAppId] = useState<number | undefined>()
  const [reportOverview, setReportOverview] = useState<any>(null)
  const [reportTrend, setReportTrend] = useState<any[]>([])
  const [versionStats, setVersionStats] = useState<any[]>([])
  const [stockWarnings, setStockWarnings] = useState<any[]>([])
  const [reportLoading, setReportLoading] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      configApi.getAnnouncements(),
      userApi.getStats(),
    ]).then(([annRes, statsRes]: any) => {
      setAnnouncements(annRes.data || [])
      setStats(statsRes.data)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    userApi.listApps(1, 100).then((res: any) => setApps(res.data?.list || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setReportLoading(true)
    Promise.all([
      userApi.getReportOverview(reportAppId),
      userApi.getReportTrend(30, reportAppId),
      userApi.getVersionStats(reportAppId),
      userApi.listCardStockWarnings(reportAppId),
      userApi.getOnlineChart(reportAppId),
      userApi.getUserChart(reportAppId),
      userApi.getCardChart(reportAppId),
      userApi.getAgentChart(reportAppId),
    ]).then(([overviewRes, trendRes, versionRes, stockRes, chartRes, userChartRes, cardChartRes, agentChartRes]: any) => {
      setReportOverview(overviewRes.data || {})
      setReportTrend(trendRes.data || [])
      setVersionStats(versionRes.data || [])
      setStockWarnings(stockRes.data || [])
      setChartData(chartRes.data || [])
      setUserChartData(userChartRes.data || [])
      setCardChartData(cardChartRes.data || [])
      setAgentChartData(agentChartRes.data || [])
    }).finally(() => setReportLoading(false))
  }, [reportAppId])

  const formatLimit = (max: number) => max === -1 ? '无限' : max

  const formatPackageExpireAt = (expireAt: string) => new Date(expireAt).toLocaleDateString('zh-CN')

  const statCards = stats ? [
    { 
      title: '应用数量', 
      current: stats.app_count,
      base: stats.base_max_apps,
      extra: stats.extra_apps,
      icon: HiCube,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    },
    { 
      title: '用户数量', 
      current: stats.user_count,
      base: stats.base_max_users,
      extra: stats.extra_users,
      icon: HiUsers,
      color: 'bg-green-500/10 text-green-600 dark:text-green-400'
    },
    { 
      title: '卡种数量', 
      current: stats.card_type_count,
      base: stats.base_max_card_types,
      extra: stats.extra_card_types,
      icon: HiTicket,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
    },
    { 
      title: '卡号数量', 
      current: stats.card_count,
      base: stats.base_max_cards,
      extra: stats.extra_cards,
      icon: HiCreditCard,
      color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
    },
  ] : []

  const reportStatCards = reportOverview ? [
    { title: '软件用户', value: reportOverview.user_count, sub: `今日新增 ${reportOverview.today_new_users || 0}`, icon: HiUsers, color: 'bg-blue-500' },
    { title: '付费用户', value: reportOverview.paid_user_count, sub: `充值次数 ${reportOverview.today_recharges || 0}`, icon: HiUsers, color: 'bg-green-500' },
    { title: '卡密总数', value: reportOverview.card_count, sub: `未用 ${reportOverview.unused_card_count || 0} / 已用 ${reportOverview.used_card_count || 0}`, icon: HiCreditCard, color: 'bg-orange-500' },
    { title: '在线会话', value: reportOverview.online_count, sub: `代理 ${reportOverview.agent_count || 0}`, icon: HiStatusOnline, color: 'bg-purple-500' },
  ] : []

  return (
    <div className="space-y-6 pt-2 md:pt-3">
      {/* 公告 */}
      {announcements.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <HiSpeakerphone className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">公告</h3>
            </div>
            <div className="space-y-2">
              {announcements.map((item, index) => (
                <Alert
                  key={index}
                  color={item.color}
                  variant="faded"
                  hideIcon
                >
                  <div dangerouslySetInnerHTML={{ __html: item.content }} />
                </Alert>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* 统计卡片 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <Card>
            <CardBody className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-semibold">{stats?.package_name || '默认套餐'}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">已用 / 默认额度 + 套餐附加</p>
                </div>
                {stats?.package_expire_at && (
                  <div className="text-right shrink-0 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-content2 px-3 py-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">有效期</p>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-0.5">{formatPackageExpireAt(stats.package_expire_at)}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x-0 md:divide-x divide-gray-100 dark:divide-gray-800 gap-y-4">
                {statCards.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 md:px-4 first:md:pl-0 last:md:pr-0">
                    <div className={`p-2 rounded-lg ${item.color}`}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.title}</p>
                      <p className="text-lg font-bold truncate">
                        <span>{item.current} / {formatLimit(item.base)}</span>
                        {item.base !== -1 && item.extra > 0 && (
                          <span className="ml-1 text-sm font-medium text-green-500 dark:text-green-400">+{item.extra}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <HiChartBar className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">业务报表</h3>
              </div>
              <Select placeholder="全部应用" selectedKeys={reportAppId ? [String(reportAppId)] : ['all']} onChange={(e) => setReportAppId(e.target.value && e.target.value !== 'all' ? Number(e.target.value) : undefined)} className="w-full md:w-64" size="sm">
                <SelectItem key="all">全部应用</SelectItem>
                {apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}
              </Select>
            </div>

            {reportLoading ? (
              <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {reportStatCards.map(item => (
                    <Card key={item.title}>
                      <CardBody className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${item.color}`}><item.icon className="w-5 h-5 text-white" /></div>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">{item.title}</p>
                            <p className="text-xl font-bold truncate">{item.value || 0}</p>
                            <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>

                {stockWarnings.length > 0 && (
                  <Card className="border border-warning/30 bg-warning/5">
                    <CardBody className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <HiExclamation className="w-5 h-5 text-warning" />
                        <h3 className="font-semibold">库存预警</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {stockWarnings.map(item => <Chip key={item.id} color="warning" variant="flat">{item.app_name ? `${item.app_name} / ` : ''}{item.name}: 剩余 {item.unused_count}，阈值 {item.stock_warn}</Chip>)}
                      </div>
                    </CardBody>
                  </Card>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {chartData.length > 0 && (
                    <Card>
                      <CardBody className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <HiStatusOnline className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold">近7天在线统计</h3>
                        </div>
                        <div className="h-48 md:h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorLogin" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorDevices" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' }} labelStyle={{ color: '#374151', fontWeight: 600 }} />
                              <Legend verticalAlign="top" align="right" height={36} formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>} />
                              <Area type="monotone" dataKey="login_users" name="登录用户" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorLogin)" />
                              <Area type="monotone" dataKey="online_users" name="在线用户" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorOnline)" />
                              <Area type="monotone" dataKey="online_devices" name="在线设备" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorDevices)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {userChartData.length > 0 && (
                    <Card>
                      <CardBody className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <HiUsers className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold">近7天用户统计</h3>
                        </div>
                        <div className="h-48 md:h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={userChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorRegistered" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' }} labelStyle={{ color: '#374151', fontWeight: 600 }} />
                              <Legend verticalAlign="top" align="right" height={36} formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>} />
                              <Area type="monotone" dataKey="registered" name="注册用户" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorRegistered)" />
                              <Area type="monotone" dataKey="paid" name="充值用户" stroke="#ec4899" strokeWidth={2} fillOpacity={1} fill="url(#colorPaid)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {cardChartData.length > 0 && (
                    <Card>
                      <CardBody className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <HiCreditCard className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold">近7天充值卡统计</h3>
                        </div>
                        <div className="h-48 md:h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={cardChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorRecharged" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' }} labelStyle={{ color: '#374151', fontWeight: 600 }} />
                              <Legend verticalAlign="top" align="right" height={36} formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>} />
                              <Area type="monotone" dataKey="created" name="当天生成" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorCreated)" />
                              <Area type="monotone" dataKey="recharged" name="当天充值" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRecharged)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {agentChartData.length > 0 && (
                    <Card>
                      <CardBody className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <HiUserGroup className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold">近7天代理统计</h3>
                        </div>
                        <div className="h-48 md:h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={agentChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorAgentCards" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorAgentCost" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' }} labelStyle={{ color: '#374151', fontWeight: 600 }} />
                              <Legend verticalAlign="top" align="right" height={36} formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>} />
                              <Area type="monotone" dataKey="card_count" name="生成卡数" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorAgentCards)" />
                              <Area type="monotone" dataKey="total_cost" name="消费金额" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorAgentCost)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <Card>
                    <CardBody className="p-4">
                      <h3 className="font-semibold mb-4">近30天业务趋势</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={reportTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.96)', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' }} labelStyle={{ color: '#374151', fontWeight: 600 }} />
                            <Legend verticalAlign="top" align="right" height={36} formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>} />
                            <Area type="monotone" dataKey="new_users" name="新增用户" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="recharges" name="充值次数" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="cards" name="制卡数量" stroke="#f97316" fill="#f97316" fillOpacity={0.12} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardBody className="p-4">
                      <h3 className="font-semibold mb-4">版本在线分布</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={versionStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="version" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.96)', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' }} labelStyle={{ color: '#374151', fontWeight: 600 }} />
                            <Legend verticalAlign="top" align="right" height={36} formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>} />
                            <Bar dataKey="online" name="当前在线" fill="#8b5cf6" />
                            <Bar dataKey="logins" name="历史登录" fill="#06b6d4" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
