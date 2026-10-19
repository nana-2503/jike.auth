import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Tooltip, Avatar,
  Input, Select, SelectItem, Drawer, DrawerContent, DrawerHeader, DrawerBody, useDisclosure, Textarea, Checkbox,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { RBtn } from '../components/ResponsiveButton'
import { HiPencil, HiTrash, HiPlus, HiSearch, HiCurrencyDollar, HiTicket, HiExternalLink, HiClipboard, HiChartBar } from 'react-icons/hi'
import { qqAvatarUrl } from '../utils/qqAvatar'

interface Agent {
  id: number
  app_id: number
  app?: { id: number; app_name: string }
  parent_id?: number | null
  parent?: { id: number; username: string; nickname?: string }
  username: string
  nickname: string
  balance: number
  qq: string
  phone: string
  status: number
  remark: string
  created_at: string
}

interface App {
  id: number
  app_name: string
  app_code?: string
}

interface CardType {
  id: number
  name: string
  prefix: string
  points: number
  duration: number
}

interface AgentCardType {
  card_type_id: number
  price: number
}

interface AgentDailyStats {
  agent?: { id: number; username: string; nickname?: string; app_name?: string }
  days: number
  total_count: number
  total_cost: number
  total_batches: number
  list: Array<{ date: string; count: number; total_cost: number; card_cost?: number; package_cost?: number; package_refund?: number; batches: number }>
}

interface AgentDailyLog {
  type?: 'card' | 'balance'
  id: number
  batch_no: string
  count: number
  price: number
  total_cost: number
  kind?: string
  amount?: number
  balance_after?: number
  ref?: string
  remark?: string
  created_at: string
  card_type?: { name: string }
}

const STATUS_MAP: Record<number, { label: string; color: 'success' | 'danger' }> = {
  1: { label: '正常', color: 'success' },
  2: { label: '禁用', color: 'danger' },
}

export default function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [appsLoading, setAppsLoading] = useState(true)
  const [keyword, setKeyword] = useState('')

  const { isOpen: isRechargeOpen, onOpen: onRechargeOpen, onClose: onRechargeClose } = useDisclosure()
  const [rechargeAgent, setRechargeAgent] = useState<Agent | null>(null)
  const [rechargeAmount, setRechargeAmount] = useState('')

  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [editForm, setEditForm] = useState({
    app_id: 0,
    username: '',
    password: '',
    nickname: '',
    balance: 0,
    qq: '',
    phone: '',
    status: 1,
    remark: '',
  })
  const [saving, setSaving] = useState(false)

  const { isOpen: isCardTypesOpen, onOpen: onCardTypesOpen, onClose: onCardTypesClose } = useDisclosure()
  const [cardTypesAgent, setCardTypesAgent] = useState<Agent | null>(null)
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  const [permissions, setPermissions] = useState<Map<number, { enabled: boolean; price: number }>>(new Map())
  const [loadingCardTypes, setLoadingCardTypes] = useState(false)
  const [savingCardTypes, setSavingCardTypes] = useState(false)

  const { isOpen: isStatsOpen, onOpen: onStatsOpen, onClose: onStatsClose } = useDisclosure()
  const [statsAgent, setStatsAgent] = useState<Agent | null>(null)
  const [dailyStats, setDailyStats] = useState<AgentDailyStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsPage, setStatsPage] = useState(1)
  const [selectedStatsDate, setSelectedStatsDate] = useState('')
  const [dailyLogs, setDailyLogs] = useState<AgentDailyLog[]>([])
  const [dailyLogsLoading, setDailyLogsLoading] = useState(false)
  const [dailyLogsPage, setDailyLogsPage] = useState(1)
  const statsPageSize = 10
  const dailyLogsPageSize = 10

  const isAllApps = selectedAppId === 0 || selectedAppId === null
  const selectedApp = apps.find((a) => a.id === selectedAppId)
  const agentLoginLink =
    !isAllApps && selectedApp?.app_code
      ? `${window.location.origin}/agent/login?app_code=${encodeURIComponent(selectedApp.app_code)}`
      : ''

  const copyAgentLoginLink = () => {
    if (!agentLoginLink) return
    navigator.clipboard.writeText(agentLoginLink).then(() => toast.success('链接已复制')).catch(() => toast.error('复制失败'))
  }

  useEffect(() => {
    setAppsLoading(true)
    userApi.listApps(1, 100).then((res: any) => {
      setApps(res.data.list || [])
    }).finally(() => setAppsLoading(false))
  }, [])

  const fetchAgents = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listAgents(isAllApps ? null : selectedAppId, page, 12, keyword)
      setAgents(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAgents() }, [page, selectedAppId])
  const handleSearch = () => { setPage(1); fetchAgents() }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这个代理吗？')) return
    try {
      await userApi.deleteAgent(id)
      toast.success('删除成功')
      fetchAgents()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleRecharge = async () => {
    if (!rechargeAgent || !rechargeAmount) return
    const amount = parseFloat(rechargeAmount)
    if (isNaN(amount)) { toast.error('请输入有效金额'); return }
    try {
      await userApi.rechargeAgent(rechargeAgent.id, amount)
      toast.success('充值成功')
      onRechargeClose()
      setRechargeAmount('')
      fetchAgents()
    } catch (e: any) { toast.error(e.message || '充值失败') }
  }

  const handleOpenEdit = (agent?: Agent) => {
    if (agent) {
      // 编辑现有代理
      setEditingAgent(agent)
      setEditForm({
        app_id: agent.app_id,
        username: agent.username,
        password: '',
        nickname: agent.nickname || '',
        balance: agent.balance || 0,
        qq: agent.qq || '',
        phone: agent.phone || '',
        status: agent.status,
        remark: agent.remark || '',
      })
    } else {
      // 新增代理
      setEditingAgent(null)
      setEditForm({
        app_id: selectedAppId || 0,
        username: '',
        password: '',
        nickname: '',
        balance: 0,
        qq: '',
        phone: '',
        status: 1,
        remark: '',
      })
    }
    onEditOpen()
  }

  const handleSaveAgent = async () => {
    if (!editForm.app_id) { toast.error('请选择应用'); return }
    if (!editForm.username) { toast.error('请输入代理账号'); return }
    if (!editingAgent && !editForm.password) { toast.error('请输入密码'); return }

    setSaving(true)
    try {
      if (editingAgent) {
        // 更新
        const updateData: any = { ...editForm }
        if (!updateData.password) delete updateData.password
        await userApi.updateAgent(editingAgent.id, updateData)
        toast.success('更新成功')
      } else {
        // 创建
        await userApi.createAgent(editForm)
        toast.success('创建成功')
      }
      onEditClose()
      fetchAgents()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleOpenCardTypes = async (agent: Agent) => {
    setCardTypesAgent(agent)
    setLoadingCardTypes(true)
    onCardTypesOpen()
    
    try {
      // 获取应用的所有卡种
      const cardTypesRes: any = await userApi.listCardTypes(agent.app_id, 1, 100)
      setCardTypes(cardTypesRes.data.list || [])

      // 获取代理已有的卡种权限
      const permRes: any = await userApi.listAgentCardTypes(agent.id)
      const permMap = new Map<number, { enabled: boolean; price: number }>()
      
      // 初始化所有卡种为未启用
      for (const ct of cardTypesRes.data.list || []) {
        permMap.set(ct.id, { enabled: false, price: 0 })
      }
      
      // 设置已有权限
      for (const p of permRes.data || []) {
        permMap.set(p.card_type_id, { enabled: true, price: p.price })
      }
      
      setPermissions(permMap)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoadingCardTypes(false)
    }
  }

  const handleToggleCardType = (cardTypeId: number, enabled: boolean) => {
    const newPerms = new Map(permissions)
    const current = newPerms.get(cardTypeId) || { enabled: false, price: 0 }
    newPerms.set(cardTypeId, { ...current, enabled })
    setPermissions(newPerms)
  }

  const handleCardTypePriceChange = (cardTypeId: number, price: string) => {
    const newPerms = new Map(permissions)
    const current = newPerms.get(cardTypeId) || { enabled: false, price: 0 }
    newPerms.set(cardTypeId, { ...current, price: parseFloat(price) || 0 })
    setPermissions(newPerms)
  }

  const handleSaveCardTypes = async () => {
    if (!cardTypesAgent) return
    setSavingCardTypes(true)
    try {
      const cardTypesData: AgentCardType[] = []
      permissions.forEach((value, key) => {
        if (value.enabled) {
          cardTypesData.push({ card_type_id: key, price: value.price })
        }
      })
      await userApi.setAgentCardTypes(cardTypesAgent.id, cardTypesData)
      toast.success('保存成功')
      onCardTypesClose()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSavingCardTypes(false)
    }
  }

  const handleOpenStats = async (agent: Agent) => {
    setStatsAgent(agent)
    setDailyStats(null)
    setStatsPage(1)
    setSelectedStatsDate('')
    setDailyLogs([])
    setDailyLogsPage(1)
    setStatsLoading(true)
    onStatsOpen()
    try {
      const res: any = await userApi.getAgentDailyStats(agent.id, 30)
      setDailyStats(res.data)
    } catch (e: any) {
      toast.error(e.message || '加载统计失败')
    } finally {
      setStatsLoading(false)
    }
  }

  const handleOpenDailyLogs = async (date: string) => {
    if (!statsAgent) return
    if (selectedStatsDate === date) {
      setSelectedStatsDate('')
      setDailyLogs([])
      setDailyLogsPage(1)
      return
    }
    setSelectedStatsDate(date)
    setDailyLogs([])
    setDailyLogsPage(1)
    setDailyLogsLoading(true)
    try {
      const res: any = await userApi.getAgentDailyLogs(statsAgent.id, date)
      const list = res.data?.list || []
      setDailyLogs(list.sort((a: AgentDailyLog, b: AgentDailyLog) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (e: any) {
      toast.error(e.message || '加载明细失败')
    } finally {
      setDailyLogsLoading(false)
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes === -1) return '永久'
    if (minutes === 0) return '不充值'
    if (minutes < 60) return `${minutes}分钟`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
    return `${Math.floor(minutes / 1440)}天`
  }

  const getAppName = (agent: Agent) => agent.app?.app_name || apps.find(a => a.id === agent.app_id)?.app_name
  const formatTime = (time: string) => time ? new Date(time).toLocaleString('zh-CN') : '-'
  const balanceKindLabel: Record<string, string> = {
    stock_package: '卡包扣款',
    stock_package_refund: '卡包退款',
  }

  return (
    <div className="space-y-4">
      {/* 顶部筛选栏 */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select 
          placeholder="全部应用" 
          selectedKeys={selectedAppId !== null && selectedAppId !== 0 ? [String(selectedAppId)] : []}
          onChange={(e) => { setSelectedAppId(e.target.value === '' ? 0 : Number(e.target.value)); setPage(1); setKeyword('') }}
          className="w-full md:w-64" 
          size="sm"
          isLoading={appsLoading}
        >
          {apps.map(app => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <Input 
          placeholder="搜索代理账号/昵称/QQ/手机" 
          value={keyword} 
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          startContent={<HiSearch className="w-4 h-4 text-gray-400" />} 
          className="flex-1 min-w-[200px]" 
          size="sm" 
        />
        <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
        {!isAllApps && (
          <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />}
            onPress={() => handleOpenEdit()}>添加代理</Button>
        )}
      </div>

      {!isAllApps && agentLoginLink && (
        <div className="rounded-xl border border-default-200 bg-default-50/60 dark:bg-default-50/10 px-3 py-3 sm:px-4 space-y-2 text-sm">
          <span className="text-default-600 dark:text-default-400 font-medium block">
            代理登录直达链接
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs break-all flex-1 min-w-0 bg-white dark:bg-content1 px-2.5 py-1.5 rounded-lg border border-default-200 font-mono">
              {agentLoginLink}
            </code>
            <Button size="sm" variant="flat" startContent={<HiClipboard className="w-4 h-4" />} onPress={copyAgentLoginLink}>
              复制
            </Button>
            <a
              href={agentLoginLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <HiExternalLink className="w-4 h-4" />
              打开
            </a>
          </div>
          <p className="text-xs text-default-400">
            发给代理使用：打开后已自动填入应用编码，只需输入账号与密码
          </p>
        </div>
      )}

      {/* 代理列表 */}
      {renderAgentList()}

      {/* 充值抽屉 */}
      <Drawer isOpen={isRechargeOpen} onClose={onRechargeClose} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">充值余额</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onRechargeClose}>取消</Button>
              <Button size="sm" color="primary" onPress={handleRecharge}>确认</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">代理账号</p>
                <p className="font-medium">{rechargeAgent?.username} ({rechargeAgent?.nickname})</p>
              </div>
              <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">当前余额</p>
                <p className="text-2xl font-bold text-primary">¥{rechargeAgent?.balance.toFixed(2)}</p>
              </div>
              <Input 
                label="充值金额" 
                type="number" 
                size="sm"
                variant="bordered"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)} 
                placeholder="输入正数充值，负数扣款" 
                description="输入正数为充值，负数为扣款"
              />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 编辑抽屉 */}
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">{editingAgent ? '编辑代理' : '添加代理'}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onEditClose}>取消</Button>
              <Button size="sm" color="primary" onPress={handleSaveAgent} isLoading={saving}>保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4">
              <Select 
                label="所属应用" 
                size="sm"
                variant="bordered"
                selectedKeys={editForm.app_id ? [String(editForm.app_id)] : []}
                onChange={(e) => setEditForm({ ...editForm, app_id: Number(e.target.value) })}
                isRequired 
                isDisabled={!!editingAgent}
              >
                {apps.map((app: any) => (
                  <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                ))}
              </Select>
              
              <Input 
                label="代理账号" 
                size="sm"
                variant="bordered"
                value={editForm.username} 
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                isRequired 
                isDisabled={!!editingAgent}
              />
              
              <Input 
                label={editingAgent ? '新密码' : '密码'} 
                type="password" 
                size="sm"
                variant="bordered"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                isRequired={!editingAgent} 
                placeholder={editingAgent ? '留空则不修改' : ''}
              />
              
              <Input 
                label="昵称" 
                size="sm"
                variant="bordered"
                value={editForm.nickname} 
                onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="QQ" 
                  size="sm"
                  variant="bordered"
                  value={editForm.qq} 
                  onChange={(e) => setEditForm({ ...editForm, qq: e.target.value })}
                />
                <Input 
                  label="手机" 
                  size="sm"
                  variant="bordered"
                  value={editForm.phone} 
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              
              {editingAgent && (
                <Select 
                  label="状态" 
                  size="sm"
                  variant="bordered"
                  selectedKeys={[String(editForm.status)]}
                  onChange={(e) => setEditForm({ ...editForm, status: Number(e.target.value) })}
                >
                  <SelectItem key="1">正常</SelectItem>
                  <SelectItem key="2">禁用</SelectItem>
                </Select>
              )}
              
              <Textarea 
                label="备注" 
                size="sm"
                variant="bordered"
                value={editForm.remark} 
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
              />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 每日统计抽屉 */}
      <Drawer isOpen={isStatsOpen} onClose={onStatsClose} placement="right" size="lg" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">
              每日统计 - {statsAgent?.username}{statsAgent?.nickname ? ` (${statsAgent.nickname})` : ''}
            </span>
            <Button size="sm" variant="bordered" onPress={onStatsClose}>关闭</Button>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            {statsLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : dailyStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Card shadow="sm">
                    <CardBody className="p-4">
                      <p className="text-xs text-gray-400">30天制卡</p>
                      <p className="mt-1 text-xl font-semibold">{dailyStats.total_count}</p>
                    </CardBody>
                  </Card>
                  <Card shadow="sm">
                    <CardBody className="p-4">
                      <p className="text-xs text-gray-400">30天消费</p>
                      <p className="mt-1 text-xl font-semibold text-primary">¥{dailyStats.total_cost.toFixed(2)}</p>
                    </CardBody>
                  </Card>
                  <Card shadow="sm">
                    <CardBody className="p-4">
                      <p className="text-xs text-gray-400">制卡批次</p>
                      <p className="mt-1 text-xl font-semibold">{dailyStats.total_batches}</p>
                    </CardBody>
                  </Card>
                </div>
                <div className="space-y-2">
                  {dailyStats.list.slice((statsPage - 1) * statsPageSize, statsPage * statsPageSize).map((row) => (
                    <Card key={row.date} shadow="sm">
                      <CardBody className="p-4">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() => handleOpenDailyLogs(row.date)}
                        >
                          <div>
                            <p className="font-medium">{row.date}</p>
                            <p className="text-xs text-gray-400">批次 {row.batches}，点击查看明细</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-right">
                            <div>
                              <p className="text-xs text-gray-400">制卡</p>
                              <p className="font-semibold">{row.count} 张</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">消费</p>
                              <p className="font-semibold text-primary">¥{row.total_cost.toFixed(2)}</p>
                              {(!!row.package_cost || !!row.package_refund) && (
                                <p className="text-[11px] text-gray-400">
                                  卡包扣 ¥{(row.package_cost || 0).toFixed(2)} / 退 ¥{(row.package_refund || 0).toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                        {selectedStatsDate === row.date && (
                          <div className="mt-3 border-t border-default-200 pt-3">
                            {dailyLogsLoading ? (
                              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                            ) : dailyLogs.length > 0 ? (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  {dailyLogs.slice((dailyLogsPage - 1) * dailyLogsPageSize, dailyLogsPage * dailyLogsPageSize).map((log) => (
                                    <div key={log.id} className="rounded-lg bg-default-50 px-3 py-2 text-sm dark:bg-default-100/10">
                                      {log.type === 'balance' ? (
                                        <>
                                          <div className="flex items-center justify-between gap-3">
                                            <span className="font-medium truncate">{balanceKindLabel[log.kind || ''] || log.kind || '余额流水'}</span>
                                            <span className={`font-semibold ${Number(log.amount || 0) >= 0 ? 'text-green-600' : 'text-primary'}`}>
                                              {Number(log.amount || 0) >= 0 ? '+' : '-'}¥{Math.abs(Number(log.amount || 0)).toFixed(2)}
                                            </span>
                                          </div>
                                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
                                            <div>余额后: ¥{Number(log.balance_after || 0).toFixed(2)}</div>
                                            <div className="truncate">{log.remark || '-'}</div>
                                            <div>{formatTime(log.created_at)}</div>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="flex items-center justify-between gap-3">
                                            <span className="font-medium truncate">{log.card_type?.name || '未知卡种'}</span>
                                            <span className="text-primary font-semibold">¥{Number(log.total_cost || 0).toFixed(2)}</span>
                                          </div>
                                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
                                            <div className="truncate">批次: {log.batch_no}</div>
                                            <div>数量: {log.count} 张</div>
                                            <div>单价: ¥{Number(log.price || 0).toFixed(2)}</div>
                                            <div>{formatTime(log.created_at)}</div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {dailyLogs.length > dailyLogsPageSize && (
                                  <div className="flex justify-center">
                                    <Pagination
                                      size="sm"
                                      total={Math.ceil(dailyLogs.length / dailyLogsPageSize)}
                                      page={dailyLogsPage}
                                      onChange={setDailyLogsPage}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center text-xs text-gray-400 py-3">当天暂无明细</div>
                            )}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                </div>
                {dailyStats.list.length > statsPageSize && (
                  <div className="flex justify-center">
                    <Pagination
                      size="sm"
                      total={Math.ceil(dailyStats.list.length / statsPageSize)}
                      page={statsPage}
                      onChange={setStatsPage}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">暂无统计数据</div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 卡种授权抽屉 */}
      <Drawer isOpen={isCardTypesOpen} onClose={onCardTypesClose} placement="right" size="lg" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">卡种授权 - {cardTypesAgent?.username}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onCardTypesClose}>取消</Button>
              <Button size="sm" color="primary" onPress={handleSaveCardTypes} isLoading={savingCardTypes}>保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            {loadingCardTypes ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : cardTypes.length === 0 ? (
              <div className="text-center text-gray-500 py-12">暂无卡种，请先创建卡种</div>
            ) : (
              <div className="space-y-3">
                {cardTypes.map((ct) => {
                  const perm = permissions.get(ct.id) || { enabled: false, price: 0 }
                  return (
                    <Card key={ct.id} shadow="sm" className={`${perm.enabled ? 'border border-success' : ''}`}>
                      <CardBody className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox 
                            isSelected={perm.enabled} 
                            onValueChange={(v) => handleToggleCardType(ct.id, v)}
                            className="mt-1"
                            color="success"
                            classNames={{
                              icon: "text-white"
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-base">{ct.name}</span>
                              {ct.prefix && (
                                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                                  {ct.prefix}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                              <div className="text-gray-600 dark:text-gray-400">
                                充值点数: <span className="text-gray-900 dark:text-white font-medium">{ct.points}</span>
                              </div>
                              <div className="text-gray-600 dark:text-gray-400">
                                充值时间: <span className="text-gray-900 dark:text-white font-medium">{formatDuration(ct.duration)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">制卡单价:</span>
                              <Input 
                                type="number" 
                                size="sm" 
                                variant="bordered"
                                value={String(perm.price)}
                                onChange={(e) => handleCardTypePriceChange(ct.id, e.target.value)}
                                isDisabled={!perm.enabled} 
                                startContent="¥" 
                                className="max-w-[120px]"
                              />
                            </div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  )
                })}
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )

  function renderAgentList() {
    if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
    if (agents.length === 0) return <Card><CardBody className="text-center py-12 text-gray-500">暂无代理</CardBody></Card>

    return (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent h-full">
              <CardBody className="p-4 flex flex-col h-full">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar
                      className="flex-shrink-0"
                      classNames={{ base: 'w-10 h-10 rounded-lg' }}
                      src={agent.avatar || qqAvatarUrl(agent.qq)}
                      name={agent.nickname || agent.username}
                      size="md"
                      imgProps={{ referrerPolicy: 'no-referrer' }}
                    />
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{agent.username}</h3>
                      <div className="flex gap-1 flex-wrap">
                        <Chip color={STATUS_MAP[agent.status]?.color || 'default'} size="sm" variant="flat">
                          {STATUS_MAP[agent.status]?.label || '未知'}
                        </Chip>
                        {isAllApps && <Chip size="sm" variant="flat" color="primary">{getAppName(agent)}</Chip>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3 flex-1 content-start">
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">昵称</span>
                    <p className="truncate">{agent.nickname || '-'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">余额</span>
                    <p className="text-primary font-medium">¥{agent.balance.toFixed(2)}</p>
                  </div>
                  {agent.parent && (
                    <div className="bg-gray-50 dark:bg-content2 rounded p-2 col-span-2">
                      <span className="text-xs text-gray-400">上级代理</span>
                      <p className="truncate">
                        {agent.parent.username}{agent.parent.nickname ? ` (${agent.parent.nickname})` : ''}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end rbtn-group mt-auto pt-1">
                  <RBtn icon={<HiPencil className="w-4 h-4" />} label="编辑" variant="flat" color="primary" onPress={() => handleOpenEdit(agent)} />
                  <RBtn icon={<HiTicket className="w-4 h-4" />} label="卡种" variant="flat" color="secondary" onPress={() => handleOpenCardTypes(agent)} />
                  <RBtn icon={<HiChartBar className="w-4 h-4" />} label="统计" variant="flat" color="warning" onPress={() => handleOpenStats(agent)} />
                  <RBtn icon={<HiCurrencyDollar className="w-4 h-4" />} label="充值" variant="flat" color="success" onPress={() => { setRechargeAgent(agent); setRechargeAmount(''); onRechargeOpen() }} />
                  <RBtn icon={<HiTrash className="w-4 h-4" />} label="删除" variant="flat" color="danger" onPress={() => handleDelete(agent.id)} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
        {total > 12 && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} /></div>}
      </>
    )
  }
}
