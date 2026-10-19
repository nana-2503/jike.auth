import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Spinner, Chip, Pagination,
  Drawer, DrawerContent, DrawerHeader, DrawerBody,
  Select, SelectItem,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'

const ACTION_MAP: Record<string, { label: string; color: 'success' | 'danger' | 'warning' | 'primary' | 'secondary' | 'default' }> = {
  login: { label: '登录', color: 'success' },
  card_login: { label: '卡号登录', color: 'success' },
  register: { label: '注册', color: 'primary' },
  bind: { label: '绑定', color: 'primary' },
  unbind: { label: '解绑', color: 'danger' },
  recharge: { label: '充值', color: 'warning' },
  register_recharge: { label: '注册充值', color: 'warning' },
  recharge_offline: { label: '离线充值', color: 'warning' },
  deduct: { label: '扣除', color: 'warning' },
  logout: { label: '退出', color: 'default' },
  changepwd: { label: '改密', color: 'secondary' },
  change_password: { label: '改密', color: 'secondary' },
}

interface LogsApi {
  listAppUserLogs: (appUserId: number, page: number, size: number, action?: string) => Promise<any>
  clearAppUserLogs: (appUserId: number) => Promise<any>
}

interface AppUserLogsDrawerProps {
  isOpen: boolean
  onClose: () => void
  userId: number | null
  username?: string
  api?: LogsApi
}

export default function AppUserLogsDrawer({ isOpen, onClose, userId, username, api }: AppUserLogsDrawerProps) {
  const logsApi = api || userApi
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const pageSize = 20

  useEffect(() => {
    if (isOpen && userId) {
      setPage(1)
      setActionFilter('')
    }
  }, [isOpen, userId])

  useEffect(() => {
    if (isOpen && userId) loadLogs()
  }, [userId, page, actionFilter, isOpen])

  const loadLogs = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res: any = await logsApi.listAppUserLogs(userId, page, pageSize, actionFilter)
      setLogs(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch { toast.error('加载失败') }
    finally { setLoading(false) }
  }

  const handleClear = async () => {
    if (!userId) return
    if (!await confirm('确定要清空该用户的所有操作日志吗？')) return
    try {
      await logsApi.clearAppUserLogs(userId)
      toast.success('已清空')
      setPage(1)
      loadLogs()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="xl" hideCloseButton>
      <DrawerContent className="rounded-none">
        <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
          <span>日志记录 {username && `- ${username}`}</span>
          <div className="flex gap-2">
            <Button size="sm" color="warning" variant="flat" onPress={handleClear}>清空</Button>
            <Button variant="flat" size="sm" onPress={onClose}>关闭</Button>
          </div>
        </DrawerHeader>
        <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="mt-4 mb-3">
            <Select
              placeholder="全部类型"
              selectedKeys={actionFilter ? [actionFilter] : []}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
              size="sm"
              className="w-40"
            >
              <SelectItem key="">全部类型</SelectItem>
              <SelectItem key="login">登录</SelectItem>
              <SelectItem key="bind">绑定</SelectItem>
              <SelectItem key="unbind">解绑</SelectItem>
              <SelectItem key="recharge">充值</SelectItem>
              <SelectItem key="deduct">扣除</SelectItem>
            </Select>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">暂无操作日志</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log: any) => {
                const actionInfo = ACTION_MAP[log.action] || { label: log.action, color: 'default' as const }
                return (
                  <Card key={log.id} className="border border-gray-100 dark:border-gray-800">
                    <CardBody className="p-3 text-sm">
                      <div className="flex items-start gap-3">
                        <Chip color={actionInfo.color} size="sm" variant="flat" className="flex-shrink-0 mt-0.5">
                          {actionInfo.label}
                        </Chip>
                        <div className="flex-1 min-w-0">
                          <p className="break-all text-gray-700 dark:text-gray-300">{log.detail}</p>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                            <span>{log.ip}</span>
                            <span>{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )
              })}
              {total > pageSize && (
                <div className="flex justify-center mt-4 pb-4">
                  <Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} />
                </div>
              )}
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
