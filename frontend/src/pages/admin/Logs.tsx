import { useState, useEffect } from 'react'
import {
  Card, CardBody, Select, SelectItem, Spinner, Pagination, Chip,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

interface OperationLog {
  id: number
  user_id: number
  user?: { username: string; nickname: string }
  action: string
  module: string
  target_id: number
  detail: string
  ip: string
  user_agent: string
  created_at: string
}

const ACTION_MAP: Record<string, { label: string; color: 'primary' | 'success' | 'warning' | 'danger' | 'default' }> = {
  login: { label: '登录', color: 'primary' },
  logout: { label: '登出', color: 'default' },
  create: { label: '创建', color: 'success' },
  update: { label: '更新', color: 'warning' },
  delete: { label: '删除', color: 'danger' },
  recharge: { label: '充值', color: 'success' },
  export: { label: '导出', color: 'primary' },
  import: { label: '导入', color: 'primary' },
}

const MODULE_MAP: Record<string, string> = {
  app: '应用',
  appuser: '软件用户',
  card: '卡号',
  cardtype: '卡种',
  agent: '代理',
  version: '版本',
  datapool: '数据池',
  license: '证书',
  activity: '活动',
  blacklist: '黑名单',
  firewall: '防火墙',
  webhook: 'Webhook',
  user: '用户',
  ticket: '工单',
  package: '套餐',
  config: '配置',
  backup: '备份',
}

export default function AdminLogs() {
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [module, setModule] = useState('')

  useEffect(() => {
    fetchLogs()
  }, [page, action, module])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (action) params.action = action
      if (module) params.module = module
      const res: any = await adminApi.listLogs(page, 20, params)
      setLogs(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '获取日志失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">操作日志</h1>

      <Card>
        <CardBody>
          <div className="flex gap-4 flex-wrap">
            <Select
              placeholder="操作类型"
              selectedKeys={action ? [action] : []}
              onChange={(e) => { setAction(e.target.value); setPage(1) }}
              className="w-32"
              size="sm"
              listboxProps={{ className: "max-h-[200px] overflow-y-auto" }}
            >
              <SelectItem key="login">登录</SelectItem>
              <SelectItem key="logout">登出</SelectItem>
              <SelectItem key="create">创建</SelectItem>
              <SelectItem key="update">更新</SelectItem>
              <SelectItem key="delete">删除</SelectItem>
              <SelectItem key="recharge">充值</SelectItem>
              <SelectItem key="export">导出</SelectItem>
              <SelectItem key="import">导入</SelectItem>
            </Select>
            <Select
              placeholder="模块"
              selectedKeys={module ? [module] : []}
              onChange={(e) => { setModule(e.target.value); setPage(1) }}
              className="w-32"
              size="sm"
              listboxProps={{ className: "max-h-[200px] overflow-y-auto" }}
            >
              <SelectItem key="app">应用</SelectItem>
              <SelectItem key="appuser">软件用户</SelectItem>
              <SelectItem key="card">卡号</SelectItem>
              <SelectItem key="cardtype">卡种</SelectItem>
              <SelectItem key="agent">代理</SelectItem>
              <SelectItem key="version">版本</SelectItem>
              <SelectItem key="datapool">数据池</SelectItem>
              <SelectItem key="license">证书</SelectItem>
              <SelectItem key="activity">活动</SelectItem>
              <SelectItem key="blacklist">黑名单</SelectItem>
              <SelectItem key="firewall">防火墙</SelectItem>
              <SelectItem key="webhook">Webhook</SelectItem>
              <SelectItem key="user">用户</SelectItem>
              <SelectItem key="ticket">工单</SelectItem>
              <SelectItem key="package">套餐</SelectItem>
              <SelectItem key="config">配置</SelectItem>
              <SelectItem key="backup">备份</SelectItem>
            </Select>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无日志</CardBody></Card>
      ) : (
        <>
          <Table aria-label="操作日志">
            <TableHeader>
              <TableColumn>时间</TableColumn>
              <TableColumn>用户</TableColumn>
              <TableColumn>操作</TableColumn>
              <TableColumn>模块</TableColumn>
              <TableColumn>详情</TableColumn>
              <TableColumn>IP</TableColumn>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <span className="text-sm">{new Date(log.created_at).toLocaleString()}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{log.user?.nickname || log.user?.username || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" color={ACTION_MAP[log.action]?.color || 'default'} variant="flat">
                      {ACTION_MAP[log.action]?.label || log.action}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{MODULE_MAP[log.module] || log.module}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500 max-w-xs truncate block" title={log.detail}>
                      {log.detail || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{log.ip || '-'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {total > 20 && (
            <div className="flex justify-center">
              <Pagination total={Math.ceil(total / 20)} page={page} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
