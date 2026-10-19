import { useEffect, useState } from 'react'
import { Card, CardBody, Chip, Spinner, Switch } from '@heroui/react'
import { HiClock, HiDatabase, HiStatusOnline } from 'react-icons/hi'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

type TaskStatus = {
  key: string
  name: string
  interval: string
  retention: string
  description: string
  enabled: boolean
  status: string
  last_run_at?: string | null
}

const taskIcons: Record<string, any> = {
  'session-expired-cleaner': HiStatusOnline,
  'session-idle-cleaner': HiClock,
  'sdk-interface-log-cleaner': HiDatabase,
}

function formatTime(value?: string | null) {
  if (!value) return '尚未执行'
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function AdminTasks() {
  const [tasks, setTasks] = useState<TaskStatus[]>([])
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)

  const loadTasks = (silent = false) => {
    if (!silent) setLoading(true)
    return adminApi.listTasks()
      .then((res: any) => {
        setTasks(res.data?.list || [])
        setCheckedAt(res.data?.checked_at || null)
      })
      .catch((e: any) => toast.error(e.message || '加载后台任务失败'))
      .finally(() => setLoading(false))
  }

  const toggleTask = (task: TaskStatus, enabled: boolean) => {
    setUpdatingKey(task.key)
    adminApi.updateTask(task.key, enabled)
      .then((res: any) => {
        const updated = res.data
        setTasks((items) => items.map((item) => item.key === task.key ? { ...item, ...updated } : item))
        toast.success(enabled ? '任务已开启' : '任务已关闭')
      })
      .catch((e: any) => toast.error(e.message || '更新任务状态失败'))
      .finally(() => setUpdatingKey(null))
  }

  useEffect(() => {
    loadTasks()
    const timer = window.setInterval(() => loadTasks(true), 30000)
    return () => window.clearInterval(timer)
  }, [])

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  const enabledCount = tasks.filter((task) => task.enabled).length
  const headerStatus = enabledCount === 0
    ? { label: '已关闭', color: 'default' as const }
    : enabledCount === tasks.length
      ? { label: '运行中', color: 'success' as const }
      : { label: '部分运行', color: 'warning' as const }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">后台任务</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                展示服务启动后自动运行的内置定时任务，每 30 秒自动刷新。
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:items-end">
              <Chip color={headerStatus.color} variant="flat">{headerStatus.label}</Chip>
              <span className="text-xs text-gray-400">刷新时间 {formatTime(checkedAt)}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => {
          const Icon = taskIcons[task.key] || HiClock
          return (
            <Card key={task.key}>
              <CardBody className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{task.name}</h3>
                      <Chip size="sm" color={task.enabled ? 'success' : 'default'} variant="flat">{task.status}</Chip>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{task.description}</p>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-content2">
                        <span className="text-gray-400">任务开关</span>
                        <Switch
                          size="sm"
                          color="success"
                          isSelected={task.enabled}
                          isDisabled={updatingKey === task.key}
                          onValueChange={(checked) => toggleTask(task, checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-content2">
                        <span className="text-gray-400">执行间隔</span>
                        <span className="font-medium">{task.interval}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-content2">
                        <span className="text-gray-400">最后执行</span>
                        <span className={`font-medium text-right ${task.last_run_at ? 'text-success' : 'text-gray-400'}`}>{formatTime(task.last_run_at)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-content2">
                        <span className="text-gray-400">处理范围</span>
                        <span className="font-medium text-right">{task.retention}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
