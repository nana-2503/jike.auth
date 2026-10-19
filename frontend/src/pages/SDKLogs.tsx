import { useEffect, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Drawer, DrawerBody, DrawerContent, DrawerHeader,
  Input, Pagination, Select, SelectItem, Spinner, Switch, Textarea,
} from '@heroui/react'
import { HiRefresh, HiSearch, HiTrash } from 'react-icons/hi'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'

interface App { id: number; app_name: string; sdk_log_enabled?: number }

interface SDKLog {
  id: number
  app_id: number
  method: string
  path: string
  client_ip: string
  token: string
  request_headers: string
  request_body: string
  request_data: string
  response_status: number
  response_body: string
  response_data: string
  response_code: number
  response_message: string
  duration_ms: number
  decrypt_error: string
  response_error: string
  created_at: string
}

const SDK_PATHS = [
  '/api/sdk/register', '/api/sdk/login', '/api/sdk/card-login', '/api/sdk/trial', '/api/sdk/captcha', '/api/sdk/send-email-code',
  '/api/sdk/app-info', '/api/sdk/custom-field', '/api/sdk/versions', '/api/sdk/version', '/api/sdk/datapools', '/api/sdk/dataitem',
  '/api/sdk/announcements', '/api/sdk/report-error', '/api/sdk/logout', '/api/sdk/heartbeat',
  '/api/sdk/recharge', '/api/sdk/userinfo', '/api/sdk/clouddata/get', '/api/sdk/clouddata/set', '/api/sdk/change-password',
]

export default function SDKLogs() {
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | undefined>()
  const [path, setPath] = useState('')
  const [keyword, setKeyword] = useState('')
  const [logs, setLogs] = useState<SDKLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<SDKLog | null>(null)
  const pageSize = 20

  useEffect(() => { loadApps() }, [])
  useEffect(() => { fetchLogs() }, [page, selectedAppId, path])

  const loadApps = async () => {
    try {
      const res: any = await userApi.listApps(1, 200)
      const list = res.data?.list || []
      setApps(list)
      if (!selectedAppId && list.length > 0) setSelectedAppId(list[0].id)
    } catch {
      // ignore
    }
  }

  const fetchLogs = async () => {
    if (!selectedAppId) {
      setLogs([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const res: any = await userApi.listSDKLogs(page, pageSize, {
        app_id: selectedAppId,
        path: path || undefined,
        keyword: keyword || undefined,
      })
      setLogs(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载接口日志失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchLogs()
  }

  const handleClear = async () => {
    if (!selectedAppId) return toast.error('请先选择应用')
    if (!await confirm('确定清空当前应用的客户端接口日志吗？')) return
    try {
      await userApi.clearSDKLogs(selectedAppId)
      toast.success('已清空')
      setPage(1)
      fetchLogs()
    } catch (e: any) {
      toast.error(e.message || '清空失败')
    }
  }

  const toggleLog = async (enabled: boolean) => {
    if (!selectedAppId) return
    try {
      await userApi.updateApp(selectedAppId, { sdk_log_enabled: enabled ? 1 : 0 })
      setApps(apps.map(app => app.id === selectedAppId ? { ...app, sdk_log_enabled: enabled ? 1 : 0 } : app))
      toast.success(enabled ? '已开启日志记录' : '已关闭日志记录')
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '-'
  const selectedApp = apps.find(app => app.id === selectedAppId)
  const getAppName = (appId: number) => apps.find(app => app.id === appId)?.app_name || '-'

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_240px_1fr_auto_auto] gap-2 items-center">
            <Select placeholder="选择应用" selectedKeys={selectedAppId ? [String(selectedAppId)] : []} onChange={(e) => { setSelectedAppId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }} size="sm">
              {apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}
            </Select>
            <Select placeholder="全部接口" selectedKeys={path ? [path] : ['all']} onChange={(e) => { setPath(e.target.value === 'all' ? '' : e.target.value); setPage(1) }} size="sm">
              <SelectItem key="all">全部接口</SelectItem>
              {SDK_PATHS.map(item => <SelectItem key={item}>{item}</SelectItem>)}
            </Select>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="搜索IP、请求、响应内容" startContent={<HiSearch className="w-4 h-4 text-gray-400" />} size="sm" />
            <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" isIconOnly onPress={fetchLogs}><HiRefresh className="w-4 h-4" /></Button>
              <Button size="sm" color="danger" variant="flat" isIconOnly onPress={handleClear}><HiTrash className="w-4 h-4" /></Button>
            </div>
          </div>
          {selectedApp && (
            <div className="flex items-center justify-between rounded-xl bg-default-50 dark:bg-content2 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{selectedApp.app_name}</p>
                <p className="text-xs text-gray-500">开启后记录全部 SDK HTTP 请求和响应，系统仅保留最近3天。</p>
              </div>
              <Switch size="sm" isSelected={selectedApp.sdk_log_enabled === 1} onValueChange={toggleLog} />
            </div>
          )}
        </CardBody>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无客户端接口日志</CardBody></Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">时间</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">接口</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">应用/IP</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">响应</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">耗时</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">消息</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-xs text-gray-500">{formatTime(log.created_at)}</td>
                      <td className="px-4 py-3"><Chip size="sm" variant="flat">{log.method}</Chip><span className="ml-2 font-mono text-xs">{log.path}</span></td>
                      <td className="px-4 py-3 text-sm"><span>{getAppName(log.app_id)}</span><span className="mx-1 text-gray-300">/</span><span className="font-mono text-xs text-gray-500">{log.client_ip || '-'}</span></td>
                      <td className="px-4 py-3"><Chip size="sm" color={log.response_code === 0 ? 'success' : 'warning'} variant="flat">HTTP {log.response_status} / {log.response_code}</Chip></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{log.duration_ms}ms</td>
                      <td className="px-4 py-3"><button className="block max-w-sm truncate text-left text-sm hover:text-primary" onClick={() => setSelectedLog(log)}>{log.response_message || log.decrypt_error || log.response_error || '-'}</button></td>
                      <td className="px-4 py-3"><Button size="sm" variant="flat" onPress={() => setSelectedLog(log)}>详情</Button></td>
                    </tr>
                  ))}
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
            <span>客户端接口日志详情</span>
            <Button size="sm" variant="flat" onPress={() => setSelectedLog(null)}>关闭</Button>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto">
            {selectedLog && <div className="space-y-3 text-sm py-2">
              <Info label="应用" value={getAppName(selectedLog.app_id)} />
              <Info label="接口" value={`${selectedLog.method} ${selectedLog.path}`} mono />
              <Info label="IP" value={selectedLog.client_ip || '-'} mono />
              <Info label="Token" value={selectedLog.token || '-'} mono />
              <Info label="响应" value={`HTTP ${selectedLog.response_status} / code ${selectedLog.response_code} / ${selectedLog.response_message || '-'}`} />
              <Info label="耗时" value={`${selectedLog.duration_ms}ms`} />
              <Info label="请求头" value={formatJsonText(selectedLog.request_headers)} code />
              <Info label="外层请求" value={formatJsonText(selectedLog.request_body)} code />
              <Info label="解密请求 data" value={formatJsonText(selectedLog.request_data || selectedLog.decrypt_error || '-')} code />
              <Info label="原始响应" value={formatJsonText(selectedLog.response_body)} code />
              <Info label="解密响应 data" value={formatJsonText(selectedLog.response_data || selectedLog.response_error || '-')} code />
              <Info label="时间" value={formatTime(selectedLog.created_at)} />
            </div>}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

function formatJsonText(value: string) {
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value || '-' }
}

function Info({ label, value, mono, code }: { label: string; value: string; mono?: boolean; code?: boolean }) {
  return <div className="rounded-lg bg-gray-50 dark:bg-content2 p-3"><p className="text-xs text-gray-400 mb-1">{label}</p>{code ? <Textarea value={value} isReadOnly minRows={3} classNames={{ input: 'font-mono text-xs' }} /> : <p className={mono ? 'break-all font-mono text-xs' : 'break-all'}>{value}</p>}</div>
}
