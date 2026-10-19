import { useEffect, useState } from 'react'
import { Button, Card, CardBody, Chip, Select, SelectItem, Spinner } from '@heroui/react'
import { HiCheckCircle, HiChip, HiClock, HiDatabase, HiExclamationCircle, HiMinusCircle, HiRefresh, HiServer, HiStatusOnline } from 'react-icons/hi'
import { adminApi } from '../../api'

interface HealthItem {
  key: string
  name: string
  status: 'ok' | 'warning' | 'error' | 'disabled'
  message: string
  latency_ms?: number
}

interface HealthStatus {
  overall: 'ok' | 'warning' | 'error'
  items: HealthItem[]
  checked_at: string
  uptime_seconds: number
  go_version: string
  os: string
  arch: string
  metrics?: any
}

function formatTime(dateStr?: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatUptime(seconds?: number) {
  if (!seconds) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分钟`
  return `${minutes}分钟`
}

function healthMeta(status: HealthItem['status'] | HealthStatus['overall']) {
  if (status === 'ok') return { label: '正常', color: 'success' as const, icon: HiCheckCircle, className: 'text-success bg-success/10' }
  if (status === 'error') return { label: '异常', color: 'danger' as const, icon: HiExclamationCircle, className: 'text-danger bg-danger/10' }
  if (status === 'warning') return { label: '需注意', color: 'warning' as const, icon: HiExclamationCircle, className: 'text-warning bg-warning/10' }
  return { label: '未启用', color: 'default' as const, icon: HiMinusCircle, className: 'text-gray-500 bg-gray-100 dark:bg-content2' }
}

function formatBytes(value?: number) {
  if (!value) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function MetricCard({ icon: Icon, title, value, desc }: { icon: any; title: string; value: string; desc?: string }) {
  return (
    <Card>
      <CardBody className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</p>
            {desc && <p className="mt-2 text-xs leading-5 text-gray-400">{desc}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

export default function AdminSystemStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState('10')

  const loadHealth = (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    return adminApi.getHealthStatus()
      .then((res: any) => setHealth(res.data))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => {
    loadHealth()
  }, [])

  useEffect(() => {
    const seconds = Number(autoRefresh)
    if (!seconds) return
    const timer = window.setInterval(() => loadHealth(true), seconds * 1000)
    return () => window.clearInterval(timer)
  }, [autoRefresh])

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  if (!health) return null

  const overall = healthMeta(health.overall)
  const metrics = health.metrics || {}
  const process = metrics.process || {}
  const cpu = metrics.cpu || {}
  const memory = metrics.memory || {}
  const database = metrics.database || {}
  const storage = metrics.storage || {}
  const online = metrics.online || {}
  const websocket = metrics.websocket || {}
  const redis = metrics.redis || {}

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">系统状态</h2>
                <Chip size="sm" color={overall.color} variant="flat">{overall.label}</Chip>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                运行 {formatUptime(health.uptime_seconds)} · {health.go_version} · {health.os}/{health.arch}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex items-center gap-2">
                <Select size="sm" selectedKeys={[autoRefresh]} onChange={(e) => setAutoRefresh(e.target.value)} className="w-32" aria-label="自动刷新">
                  <SelectItem key="0">不自动</SelectItem>
                  <SelectItem key="5">5秒刷新</SelectItem>
                  <SelectItem key="10">10秒刷新</SelectItem>
                  <SelectItem key="30">30秒刷新</SelectItem>
                </Select>
                <Button size="sm" variant="flat" startContent={<HiRefresh className="h-4 w-4" />} isLoading={refreshing} onPress={() => loadHealth(true)}>
                  刷新
                </Button>
              </div>
              <p className="text-xs text-gray-400">检查时间 {formatTime(health.checked_at)}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">运行指标</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            icon={HiChip}
            title="CPU使用率"
            value={`${cpu.system_percent ?? '-'}%`}
            desc={`进程 ${cpu.process_percent ?? '-'}% · ${cpu.cpu_count || process.cpu_count || '-'} 核心`}
          />
          <MetricCard
            icon={HiServer}
            title="系统内存"
            value={`${memory.used_percent ?? '-'}%`}
            desc={`已用 ${formatBytes(memory.used)} / 总计 ${formatBytes(memory.total)}`}
          />
          <MetricCard
            icon={HiServer}
            title="Go进程内存"
            value={formatBytes(process.memory_alloc)}
            desc={`堆 ${formatBytes(process.heap_alloc)} · 栈 ${formatBytes(process.stack_inuse)}`}
          />
          <MetricCard
            icon={HiDatabase}
            title="数据库连接池"
            value={`${database.open_connections ?? 0}`}
            desc={`使用中 ${database.in_use ?? 0} · 空闲 ${database.idle ?? 0} · 等待 ${database.wait_count ?? 0}`}
          />
          <MetricCard
            icon={HiServer}
            title="磁盘空间"
            value={`${storage.used_percent ?? '-'}%`}
            desc={`已用 ${formatBytes(storage.used)} / 总计 ${formatBytes(storage.total)}`}
          />
          <MetricCard
            icon={HiClock}
            title="进程运行"
            value={`${process.goroutines ?? '-'} 协程`}
            desc={`PID ${process.pid ?? '-'} · GC ${process.gc_count ?? 0} 次`}
          />
          <MetricCard
            icon={HiStatusOnline}
            title="在线会话"
            value={`${online.online ?? 0}`}
            desc={`总会话 ${online.total ?? 0} · 过期待清理 ${online.expired ?? 0}`}
          />
          <MetricCard
            icon={HiStatusOnline}
            title="WebSocket连接"
            value={`${websocket.total ?? 0}`}
            desc={`已认证 ${websocket.authed ?? 0} · 公开连接 ${websocket.public ?? 0}`}
          />
          <MetricCard
            icon={HiDatabase}
            title="Redis详情"
            value={redis.enabled ? `${redis.db_size ?? 0} keys` : '未启用'}
            desc={redis.enabled ? `版本 ${redis.redis_version || '-'} · 客户端 ${redis.connected_clients || '-'}` : '当前使用内存缓存'}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">服务状态</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {health.items.map((item) => {
            const meta = healthMeta(item.status)
            const Icon = meta.icon
            return (
              <Card key={item.key}>
                <CardBody className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.className}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                        <Chip size="sm" color={meta.color} variant="flat">{meta.label}</Chip>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.message}</p>
                      {item.latency_ms !== undefined && <p className="mt-2 text-xs text-gray-400">响应延迟 {item.latency_ms}ms</p>}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
