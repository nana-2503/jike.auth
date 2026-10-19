import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Input, Drawer, DrawerContent, DrawerHeader, DrawerBody, Select, SelectItem, Tooltip,
} from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiDotsVertical, HiSearch, HiLogout, HiEye, HiRefresh, HiStatusOnline } from 'react-icons/hi'

interface OnlineSession {
  id: number
  app_id: number
  app_user_id: number
  app_user?: { id: number; username: string; expire_at: string | null; points: number }
  app?: { id: number; app_name: string }
  token: string
  version: string
  client_id: string
  client_os: string
  client_ip: string
  feature: string
  login_at: string
  heartbeat_at: string
  expire_at: string | null
  points: number
}

interface App {
  id: number
  app_name: string
}

export default function OnlineSessions() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<OnlineSession[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(0) // 0 表示全部应用
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [appsLoading, setAppsLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [onlineCount, setOnlineCount] = useState(0)

  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<OnlineSession | null>(null)

  const isAllApps = selectedAppId === 0 || selectedAppId === null

  useEffect(() => {
    setAppsLoading(true)
    userApi.listApps(1, 100).then((res: any) => {
      const list = res.data.list || []
      setApps(list)
    }).finally(() => setAppsLoading(false))
  }, [])

  const fetchSessions = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listOnlineSessions(isAllApps ? null : selectedAppId, page, 12, keyword || undefined)
      setSessions(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  const fetchStats = async () => {
    try {
      const res: any = await userApi.getOnlineStats(isAllApps ? null : selectedAppId)
      setOnlineCount(res.data.online_count || 0)
    } catch { }
  }

  useEffect(() => { fetchSessions(); fetchStats() }, [page, selectedAppId])
  const handleSearch = () => { setPage(1); fetchSessions() }
  const handleRefresh = () => { fetchSessions(); fetchStats() }

  const handleKick = async (id: number) => {
    if (!await confirm('确定要踢此用户下线吗？')) return
    try {
      await userApi.kickOnlineSession(id)
      toast.success('已踢下线')
      fetchSessions()
      fetchStats()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const handleKickUser = async (appUserId: number) => {
    if (!selectedAppId) return
    if (!await confirm('确定要踢此用户的所有会话下线吗？')) return
    try {
      await userApi.kickOnlineSessionsByUser(selectedAppId, appUserId)
      toast.success('已踢下线')
      fetchSessions()
      fetchStats()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const showDetail = (s: OnlineSession) => {
    setSelectedSession(s)
    setIsDetailOpen(true)
  }

  const formatTime = (t: string) => new Date(t).toLocaleString()
  const formatExpire = (t: string | null) => {
    if (!t) return <span style={{ color: '#FFA2A2' }}>已到期</span>
    const d = new Date(t)
    if (d.getFullYear() >= 2099) return <span style={{ color: '#A684FF' }}>无限制</span>
    const full = d.toLocaleString()
    const color = d < new Date() ? '#FFA2A2' : '#2AA63E'
    return <Tooltip content={full}><span style={{ color }} className="cursor-default">{full}</span></Tooltip>
  }

  return (
    <div className="space-y-4">
      {/* 顶部筛选栏 */}
      <div className="space-y-2">
        {/* 第一行：应用选择 */}
        <div className="flex gap-2 items-center">
          <Select 
            placeholder="全部应用" 
            selectedKeys={selectedAppId !== null && selectedAppId !== 0 ? [String(selectedAppId)] : []}
            onChange={(e) => { setSelectedAppId(e.target.value === '' ? 0 : Number(e.target.value)); setPage(1); setKeyword('') }}
            className="w-full md:w-40" 
            size="sm"
            isLoading={appsLoading}
          >
            {apps.map(app => (
              <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
            ))}
          </Select>
          <Chip size="sm" color="success" variant="flat" className="md:hidden">{onlineCount}人在线</Chip>
        </div>
        
        {/* 第二行：搜索和操作按钮 */}
        <div className="flex gap-2 items-center">
          <Input placeholder="搜索" value={keyword} onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            startContent={<HiSearch className="w-4 h-4 text-gray-400" />} className="flex-1 md:w-64" size="sm" />
          <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
          <Button size="sm" variant="flat" isIconOnly onPress={handleRefresh}><HiRefresh className="w-4 h-4" /></Button>
          <Button size="sm" variant="flat" isIconOnly onPress={() => navigate('/ws-connections')}><HiStatusOnline className="w-4 h-4" /></Button>
          <div className="flex-1 hidden md:block" />
          <Chip size="sm" color="success" variant="flat" className="hidden md:flex">{onlineCount}人在线</Chip>
        </div>
      </div>

      {/* 在线列表 */}
      {renderSessionList()}

      {/* 详情抽屉 */}
      <Drawer isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} placement="right" size="lg" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">{selectedSession?.app_user?.username || '用户详情'}</span>
            <div className="flex gap-2">
              {selectedSession && (
                <Button size="sm" color="danger" variant="flat" onPress={() => { handleKick(selectedSession.id); setIsDetailOpen(false) }}>踢下线</Button>
              )}
              <Button size="sm" variant="flat" onPress={() => setIsDetailOpen(false)}>关闭</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-4">
            {selectedSession && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">用户名</span>
                  <p className="font-medium">{selectedSession.app_user?.username || '-'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">所属应用</span>
                  <p className="font-medium">{selectedSession.app?.app_name || '-'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">版本</span>
                  <p>{selectedSession.version || '-'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">操作系统</span>
                  <p>{selectedSession.client_os || '-'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">客户端IP</span>
                  <p>{selectedSession.client_ip || '-'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">点数余额</span>
                  <p>{selectedSession.points}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">登录时间</span>
                  <p>{formatTime(selectedSession.login_at)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">心跳时间</span>
                  <p>{formatTime(selectedSession.heartbeat_at)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">到期时间</span>
                  <p>{formatExpire(selectedSession.expire_at)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">客户端ID</span>
                  <p className="truncate">{selectedSession.client_id || '-'}</p>
                </div>
                <div className="col-span-2 bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">特征码</span>
                  <p className="break-all text-xs mt-1">{selectedSession.feature || '-'}</p>
                </div>
                <div className="col-span-2 bg-gray-50 dark:bg-content2 rounded-lg p-3">
                  <span className="text-xs text-gray-400">Token</span>
                  <p className="break-all text-xs mt-1 font-mono">{selectedSession.token || '-'}</p>
                </div>
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )

  function renderSessionList() {
    if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
    if (sessions.length === 0) return <Card><CardBody className="text-center py-12 text-gray-500">暂无在线用户</CardBody></Card>

    const getAppName = (s: OnlineSession) => s.app?.app_name || apps.find(a => a.id === s.app_id)?.app_name

    return (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((s) => (
            <Card key={s.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => showDetail(s)}>
                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-success font-bold text-lg">{s.app_user?.username?.charAt(0).toUpperCase() || '?'}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{s.app_user?.username || '未知用户'}</h3>
                      <div className="flex gap-1 flex-wrap">
                        <span className="text-xs text-gray-400">v{s.version || '-'} · {s.client_os || '-'}</span>
                        {isAllApps && <Chip size="sm" variant="flat" color="primary">{getAppName(s)}</Chip>}
                      </div>
                    </div>
                  </div>
                  <Dropdown>
                    <DropdownTrigger><Button isIconOnly size="sm" variant="light"><HiDotsVertical className="w-5 h-5" /></Button></DropdownTrigger>
                    <DropdownMenu>
                      <DropdownItem key="detail" onPress={() => showDetail(s)}>查看详情</DropdownItem>
                      <DropdownItem key="kick" className="text-danger" color="danger" onPress={() => handleKick(s.id)}>踢下线</DropdownItem>
                      <DropdownItem key="kickall" className="text-danger" color="danger" onPress={() => handleKickUser(s.app_user_id)}>踢此用户全部下线</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">客户端IP</span>
                    <p className="truncate">{s.client_ip || '-'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">心跳时间</span>
                    <p className="truncate">{new Date(s.heartbeat_at).toLocaleTimeString()}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">到期时间</span>
                    <p className="truncate">{formatExpire(s.expire_at)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">点数余额</span>
                    <p>{s.points}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="flat" startContent={<HiEye className="w-4 h-4" />} onPress={() => showDetail(s)}>详情</Button>
                  <Button size="sm" variant="flat" color="danger" startContent={<HiLogout className="w-4 h-4" />}
                    onPress={() => handleKick(s.id)}>踢下线</Button>
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
