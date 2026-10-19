import { useEffect, useState } from 'react'
import { Card, CardBody, CardHeader, Spinner } from '@heroui/react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiCash, HiChartBar, HiCreditCard, HiUsers } from 'react-icons/hi'

interface AgentStats {
  total_cards: number
  total_spent: number
  user_count: number
  today_batch_count: number
  online_count: number
  balance: number
  trend?: Array<{ date: string; card_count: number; total_cost: number }>
  card_type_stats?: Array<{ card_type_id: number; name: string; count: number; total_cost: number }>
}

const chartTooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)',
}

const chartTooltipLabelStyle = {
  color: '#374151',
  fontWeight: 600,
}

export default function AgentHome() {
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    agentCenterApi.getStats()
      .then((res: any) => setStats(res.data))
      .catch((e: any) => toast.error(e.message || '获取统计失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  const trend = stats?.trend || []
  const cardTypeStats = stats?.card_type_stats || []
  const statCards = [
    { title: '账户余额', value: `¥${(stats?.balance || 0).toFixed(2)}`, sub: '可用制卡余额', icon: HiCash, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { title: '累计制卡', value: stats?.total_cards || 0, sub: `今日批次 ${stats?.today_batch_count || 0}`, icon: HiCreditCard, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { title: '累计消费', value: `¥${(stats?.total_spent || 0).toFixed(2)}`, sub: '余额制卡扣费', icon: HiChartBar, color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
    { title: '名下用户', value: stats?.user_count || 0, sub: `当前在线 ${stats?.online_count || 0}`, icon: HiUsers, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.title} shadow="sm">
              <CardBody className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.title}</p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{item.value}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{item.sub}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" shadow="sm">
          <CardHeader className="px-4 pb-0">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">近 14 天制卡趋势</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">统计制卡数量和扣费金额</p>
            </div>
          </CardHeader>
          <CardBody className="p-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="agentCards" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="agentCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-white/10" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    formatter={(value: any, name: string) => [name === 'card_count' ? value : `¥${Number(value).toFixed(2)}`, name === 'card_count' ? '制卡数量' : '消费金额']}
                  />
                  <Area type="monotone" dataKey="card_count" stroke="#3b82f6" fill="url(#agentCards)" strokeWidth={2} />
                  <Area type="monotone" dataKey="total_cost" stroke="#f97316" fill="url(#agentCost)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card shadow="sm">
          <CardHeader className="px-4 pb-0">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">卡种制卡排行</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">按累计制卡数量排序</p>
            </div>
          </CardHeader>
          <CardBody className="p-4">
            {cardTypeStats.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cardTypeStats} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-gray-100 dark:text-white/10" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={chartTooltipLabelStyle}
                      formatter={(value: any) => [value, '制卡数量']}
                    />
                    <Bar dataKey="count" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400 dark:bg-white/5">
                暂无制卡数据
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
