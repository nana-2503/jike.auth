import { useEffect, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Drawer, DrawerBody, DrawerContent, DrawerHeader,
  Input, Pagination, Select, SelectItem, Spinner,
} from '@heroui/react'
import { HiRefresh, HiSearch, HiTrash } from 'react-icons/hi'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'

interface App { id: number; app_name: string }

interface SecurityLog {
  id: number
  app_id: number
  type: string
  ip: string
  feature: string
  username: string
  action: string
  detail: string
  created_at: string
}

const logTypeMap: Record<string, { label: string; color: 'danger' | 'warning' | 'primary' | 'default' }> = {
  ip_block: { label: 'IP拦截', color: 'danger' },
  rate_limit: { label: '频率限制', color: 'warning' },
  login_fail: { label: '登录失败', color: 'warning' },
  blacklist: { label: '黑名单命中', color: 'danger' },
  replay: { label: '重放攻击', color: 'danger' },
  auto_ban: { label: '自动封禁', color: 'danger' },
}

export default function SecurityLogs() {
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | undefined>()
  const [logType, setLogType] = useState('')
  const [keyword, setKeyword] = useState('')
  const [logs, setLogs] = useState<SecurityLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<SecurityLog | null>(null)
  const pageSize = 20

  useEffect(() => {
    userApi.listApps(1, 100).then((res: any) => setApps(res.data?.list || [])).catch(() => {})
  }, [])

  useEffect(() => { fetchLogs() }, [page, selectedAppId, logType])

  const fetchLogs = async () => {
    if (!selectedAppId) {
      setLogs([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const res: any = await userApi.listFirewallLogs(page, pageSize, {
        app_id: selectedAppId,
        type: logType || undefined,
        keyword: keyword || undefined,
      })
      setLogs(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载安全日志失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchLogs()
  }

  const handleClear = async () => {
    if (!selectedAppId) {
      toast.error('请先选择应用')
      return
    }
    if (!await confirm('确定清空当前应用的安全日志吗？')) return
    try {
      await userApi.clearFirewallLogs(selectedAppId)
      toast.success('已清空')
      setPage(1)
      fetchLogs()
    } catch (e: any) {
      toast.error(e.message || '清空失败')
    }
  }

  const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '-'
  const getLogType = (value: string) => logTypeMap[value] || { label: value || '未知', color: 'default' as const }
  const getAppName = (appId: number) => apps.find(app => app.id === appId)?.app_name || '-'

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[220px_160px_1fr_auto_auto] gap-2 items-center">
            <Select placeholder="选择应用" selectedKeys={selectedAppId ? [String(selectedAppId)] : []} onChange={(e) => { setSelectedAppId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }} size="sm">
              {apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}
            </Select>
            <Select placeholder="全部类型" selectedKeys={logType ? [logType] : []} onChange={(e) => { setLogType(e.target.value); setPage(1) }} size="sm">
              <SelectItem key="ip_block">IP拦截</SelectItem>
              <SelectItem key="rate_limit">频率限制</SelectItem>
              <SelectItem key="login_fail">登录失败</SelectItem>
              <SelectItem key="blacklist">黑名单命中</SelectItem>
              <SelectItem key="replay">重放攻击</SelectItem>
              <SelectItem key="auto_ban">自动封禁</SelectItem>
            </Select>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="搜索用户名、IP、特征码、详情" startContent={<HiSearch className="w-4 h-4 text-gray-400" />} size="sm" />
            <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" isIconOnly onPress={fetchLogs}><HiRefresh className="w-4 h-4" /></Button>
              <Button size="sm" color="danger" variant="flat" isIconOnly onPress={handleClear}><HiTrash className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无安全日志</CardBody></Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">时间</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">类型</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">应用/用户</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">IP</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">特征码</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">详情</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const type = getLogType(log.type)
                    return (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-xs text-gray-500">{formatTime(log.created_at)}</td>
                        <td className="px-4 py-3"><Chip size="sm" color={type.color} variant="flat">{type.label}</Chip></td>
                        <td className="px-4 py-3 text-sm"><span>{getAppName(log.app_id)}</span><span className="mx-1 text-gray-300">/</span><span className="text-gray-500">{log.username || '-'}</span></td>
                        <td className="px-4 py-3"><span className="font-mono text-xs">{log.ip || '-'}</span></td>
                        <td className="px-4 py-3"><span className="block max-w-[260px] truncate font-mono text-xs" title={log.feature || ''}>{log.feature || '-'}</span></td>
                        <td className="px-4 py-3"><button className="block max-w-sm truncate text-left text-sm hover:text-primary" onClick={() => setSelectedLog(log)}>{log.detail || log.action || '-'}</button></td>
                        <td className="px-4 py-3"><Button size="sm" variant="flat" onPress={() => setSelectedLog(log)}>详情</Button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {total > pageSize && <div className="flex justify-center"><Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} /></div>}

      <Drawer isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
            <span>安全日志详情</span>
            <Button size="sm" variant="flat" onPress={() => setSelectedLog(null)}>关闭</Button>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto">
            {selectedLog && <div className="space-y-3 text-sm py-2">
              <Info label="应用" value={getAppName(selectedLog.app_id)} />
              <Info label="用户" value={selectedLog.username || '-'} />
              <Info label="类型" value={getLogType(selectedLog.type).label} />
              <Info label="动作" value={selectedLog.action || '-'} />
              <Info label="详情" value={selectedLog.detail || '-'} />
              <Info label="IP" value={selectedLog.ip || '-'} mono />
              <Info label="特征码" value={selectedLog.feature || '-'} mono />
              <Info label="时间" value={formatTime(selectedLog.created_at)} />
            </div>}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-lg bg-gray-50 dark:bg-content2 p-3"><p className="text-xs text-gray-400 mb-1">{label}</p><p className={mono ? 'break-all font-mono text-xs' : 'break-all'}>{value}</p></div>
}
