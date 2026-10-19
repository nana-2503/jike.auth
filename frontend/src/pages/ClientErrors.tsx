import { useEffect, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Drawer, DrawerBody, DrawerContent, DrawerHeader,
  Input, Pagination, Select, SelectItem, Spinner,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiExclamationCircle, HiRefresh, HiSearch, HiTrash } from 'react-icons/hi'

interface App { id: number; app_name: string }

interface ClientErrorLog {
  id: number
  app_id: number
  app?: { app_name: string }
  app_user?: { username: string }
  username: string
  severity: string
  error_type: string
  message: string
  stack: string
  context: string
  version: string
  client_id: string
  client_os: string
  client_ip: string
  feature: string
  occurred_at: string | null
  created_at: string
}

const severityMap: Record<string, { label: string; color: 'default' | 'primary' | 'warning' | 'danger' }> = {
  info: { label: '信息', color: 'primary' },
  warning: { label: '警告', color: 'warning' },
  error: { label: '错误', color: 'danger' },
  fatal: { label: '崩溃', color: 'danger' },
}

export default function ClientErrors() {
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | undefined>()
  const [severity, setSeverity] = useState('')
  const [keyword, setKeyword] = useState('')
  const [logs, setLogs] = useState<ClientErrorLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<ClientErrorLog | null>(null)
  const pageSize = 20

  useEffect(() => {
    userApi.listApps(1, 100).then((res: any) => setApps(res.data?.list || [])).catch(() => {})
  }, [])

  useEffect(() => { fetchLogs() }, [page, selectedAppId, severity])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listClientErrors(page, pageSize, {
        app_id: selectedAppId,
        severity: severity || undefined,
        keyword: keyword || undefined,
      })
      setLogs(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载异常日志失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchLogs()
  }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定删除这条异常日志吗？')) return
    try {
      await userApi.deleteClientError(id)
      toast.success('已删除')
      fetchLogs()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const handleClear = async () => {
    if (!await confirm(selectedAppId ? '确定清空当前应用的异常日志吗？' : '确定清空所有应用的异常日志吗？')) return
    try {
      await userApi.clearClientErrors(selectedAppId)
      toast.success('已清空')
      setPage(1)
      fetchLogs()
    } catch (e: any) {
      toast.error(e.message || '清空失败')
    }
  }

  const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '-'
  const getSeverity = (value: string) => severityMap[value] || { label: value || '错误', color: 'default' as const }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[220px_160px_1fr_auto_auto] gap-2 items-center">
            <Select placeholder="全部应用" selectedKeys={selectedAppId ? [String(selectedAppId)] : []} onChange={(e) => { setSelectedAppId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }} size="sm">
              {apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}
            </Select>
            <Select placeholder="全部级别" selectedKeys={severity ? [severity] : []} onChange={(e) => { setSeverity(e.target.value); setPage(1) }} size="sm">
              <SelectItem key="info">信息</SelectItem>
              <SelectItem key="warning">警告</SelectItem>
              <SelectItem key="error">错误</SelectItem>
              <SelectItem key="fatal">崩溃</SelectItem>
            </Select>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="搜索用户、错误类型、消息、IP、客户端ID" startContent={<HiSearch className="w-4 h-4 text-gray-400" />} size="sm" />
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
        <Card><CardBody className="text-center py-12 text-gray-500">暂无异常日志</CardBody></Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">时间</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">级别</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">应用/用户</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">类型</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">消息</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">环境</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const level = getSeverity(log.severity)
                    return (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-xs text-gray-500">{formatTime(log.occurred_at || log.created_at)}</td>
                        <td className="px-4 py-3"><Chip size="sm" color={level.color} variant="flat">{level.label}</Chip></td>
                        <td className="px-4 py-3 text-sm"><span>{log.app?.app_name || '-'}</span><span className="mx-1 text-gray-300">/</span><span className="text-gray-500">{log.app_user?.username || log.username || '-'}</span></td>
                        <td className="px-4 py-3"><span className="font-mono text-xs">{log.error_type || '-'}</span></td>
                        <td className="px-4 py-3"><button className="block max-w-sm truncate text-left text-sm hover:text-primary" onClick={() => setSelectedLog(log)}>{log.message || log.stack || '-'}</button></td>
                        <td className="px-4 py-3 text-xs text-gray-500"><span>v{log.version || '-'}</span><span className="mx-1 text-gray-300">/</span><span>{log.client_os || '-'}</span><span className="mx-1 text-gray-300">/</span><span>{log.client_ip || '-'}</span></td>
                        <td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="flat" onPress={() => setSelectedLog(log)}>详情</Button><Button size="sm" color="danger" variant="flat" onPress={() => handleDelete(log.id)}>删除</Button></div></td>
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
            <span>异常详情</span>
            <Button size="sm" variant="flat" onPress={() => setSelectedLog(null)}>关闭</Button>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto">
            {selectedLog && <div className="space-y-3 text-sm py-2">
              <Info label="应用" value={selectedLog.app?.app_name || '-'} />
              <Info label="用户" value={selectedLog.app_user?.username || selectedLog.username || '-'} />
              <Info label="级别" value={getSeverity(selectedLog.severity).label} />
              <Info label="错误类型" value={selectedLog.error_type || '-'} />
              <Info label="消息" value={selectedLog.message || '-'} />
              <Info label="版本" value={selectedLog.version || '-'} />
              <Info label="客户端系统" value={selectedLog.client_os || '-'} />
              <Info label="客户端 IP" value={selectedLog.client_ip || '-'} />
              <Info label="客户端 ID" value={selectedLog.client_id || '-'} mono />
              <Info label="特征码" value={selectedLog.feature || '-'} mono />
              <Info label="发生时间" value={formatTime(selectedLog.occurred_at)} />
              <Info label="上报时间" value={formatTime(selectedLog.created_at)} />
              <Block label="堆栈" value={selectedLog.stack} />
              <Block label="上下文" value={selectedLog.context} />
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

function Block({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return <div className="rounded-lg bg-gray-950 text-gray-100 p-3"><p className="text-xs text-gray-400 mb-2">{label}</p><pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">{value}</pre></div>
}
