import { useState, useEffect, useRef } from 'react'
import {
  Avatar, Card, CardBody, Button,
  Chip, Pagination, useDisclosure, Spinner, Input,
  Checkbox, Select, SelectItem, Drawer, DrawerContent, DrawerHeader, DrawerBody, Tooltip,
  DatePicker, Switch, Textarea, Progress, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'
import { RBtn } from '../../components/ResponsiveButton'
import { avatarOrDefault } from '../../utils/avatar'
import { HiPencil, HiTrash, HiPlus, HiSearch, HiBan, HiCheck, HiClipboardCopy, HiKey, HiFingerPrint, HiSave, HiRefresh, HiStatusOnline, HiDotsVertical, HiUserCircle, HiClipboardList, HiClock, HiCash, HiTicket, HiAdjustments, HiSparkles, HiCheckCircle } from 'react-icons/hi'
import AdminAppUserDataDrawer from './AppUserData'
import AppUserLogsDrawer from '../AppUserLogs'
import AppUserProfileDrawer from '../AppUserProfileDrawer'
import AppUserDetailContent from '../AppUserDetailContent'

interface App {
  id: number
  app_name: string
  user?: { id: number; username: string; nickname: string; avatar?: string }
}

interface AppUser {
  id: number
  app_id: number
  app?: App
  username: string
  avatar: string
  status: number
  is_paid: number
  is_tester: number
  is_card_user: number
  is_trial: number
  expire_at: string | null
  points: number
  rebate_points: number
  channels: number
  features: number
  online_count: number
  last_recharge_at: string | null
  qq: string
  phone: string
  email: string
  created_at: string
}

const STATUS_MAP: Record<number, { label: string; color: 'success' | 'danger' | 'warning' }> = {
  1: { label: '正常', color: 'success' },
  2: { label: '封停', color: 'danger' },
  3: { label: '冻结', color: 'warning' },
}

export default function AppUsers() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const getPageSize = () => {
    const w = window.innerWidth
    if (w >= 1536) return 20  // 2xl: 5列 × 4行
    if (w >= 1280) return 20  // xl: 4列 × 5行
    if (w >= 1024) return 21  // lg: 3列 × 7行
    if (w >= 768) return 20   // md: 2列 × 10行
    return 10                 // 移动端: 1列 × 10行
  }
  const [pageSize, setPageSize] = useState(getPageSize)

  useEffect(() => {
    const onResize = () => {
      const newSize = getPageSize()
      setPageSize(prev => { if (prev !== newSize) { setPage(1); return newSize } return prev })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [selectedAppId, setSelectedAppId] = useState<string>('')
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set())
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  
  // 编辑表单状态
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    app_id: 0,
    username: '',
    avatar: '',
    password: '',
    status: 1,
    is_paid: 0,
    is_tester: 0,
    points: 0,
    channels: 1,
    features: 1,
    unbind_day: -1,
    unbind_week: -1,
    unbind_month: -1,
    unbind_quarter: -1,
    unbind_halfy: -1,
    unbind_year: -1,
    unbind_total: -1,
    extra_data: '',
    cloud_data: '',
    qq: '',
    wechat: '',
    phone: '',
    email: '',
  })
  const [expireDate, setExpireDate] = useState<any>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [resettingInviteCode, setResettingInviteCode] = useState(false)
  const [editAppName, setEditAppName] = useState('')
  
  // 标识数据抽屉
  const [dataDrawerUserId, setDataDrawerUserId] = useState<number | null>(null)
  const [isDataDrawerOpen, setIsDataDrawerOpen] = useState(false)

  // 操作日志抽屉
  const [logDrawerUser, setLogDrawerUser] = useState<AppUser | null>(null)
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false)

  const [profileDrawerUser, setProfileDrawerUser] = useState<AppUser | null>(null)
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false)

  // 在线列表抽屉
  const [onlineDrawerUser, setOnlineDrawerUser] = useState<AppUser | null>(null)
  const [isOnlineDrawerOpen, setIsOnlineDrawerOpen] = useState(false)
  const [onlineSessions, setOnlineSessions] = useState<any[]>([])
  const [onlineLoading, setOnlineLoading] = useState(false)

  // 特征码抽屉
  const [deviceDrawerUser, setDeviceDrawerUser] = useState<AppUser | null>(null)
  const [isDeviceDrawerOpen, setIsDeviceDrawerOpen] = useState(false)
  const [devices, setDevices] = useState<any[]>([])
  const [deviceLoading, setDeviceLoading] = useState(false)

  const isNewUser = editingId === null

  const fetchOnlineSessions = async (user: AppUser) => {
    setOnlineLoading(true)
    try {
      const res = await adminApi.listOnlineSessions(1, 100, user.app_id, undefined, user.id)
      const data = res.data?.data || res.data
      setOnlineSessions(data?.list || [])
    } catch { setOnlineSessions([]) }
    setOnlineLoading(false)
  }

  const openOnlineDrawer = (user: AppUser) => {
    setOnlineDrawerUser(user)
    setIsOnlineDrawerOpen(true)
    fetchOnlineSessions(user)
  }

  const fetchDevices = async (user: AppUser) => {
    setDeviceLoading(true)
    try {
      const res: any = await adminApi.listAppUserDevices(user.id, 1, 100)
      const data = res.data?.data || res.data
      setDevices(data?.list || [])
    } catch { setDevices([]) }
    setDeviceLoading(false)
  }

  const openDeviceDrawer = (user: AppUser) => {
    setDeviceDrawerUser(user)
    setIsDeviceDrawerOpen(true)
    fetchDevices(user)
  }

  // 获取应用列表
  const fetchApps = async () => {
    try {
      const res: any = await adminApi.listApps(1, 100)
      setApps(res.data.list || [])
    } catch (e: any) { console.error(e) }
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const filterStr = selectedFilters.size > 0 ? Array.from(selectedFilters).join(',') : ''
      const res: any = await adminApi.listAppUsers(page, pageSize, undefined, keyword, selectedAppId, filterStr)
      setUsers(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchApps() }, [])
  useEffect(() => { fetchUsers() }, [page, pageSize, selectedAppId, selectedFilters])
  const handleSearch = () => { setPage(1); fetchUsers() }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这个用户吗？')) return
    try {
      await adminApi.deleteAppUser(id)
      toast.success('删除成功')
      fetchUsers()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const showDetail = (user: AppUser) => { setSelectedUser(user); onDetailOpen() }

  const handleEdit = (id: number) => {
    setEditingId(id)
    adminApi.getAppUser(id).then((res: any) => {
      const u = res.data
      setFormData({
        app_id: u.app_id || 0,
        username: u.username || '',
        avatar: u.avatar || '',
        password: '',
        status: u.status || 1,
        is_paid: u.is_paid || 0,
        is_tester: u.is_tester || 0,
        points: u.points || 0,
        channels: u.channels || 1,
        features: u.features || 1,
        unbind_day: u.unbind_day ?? -1,
        unbind_week: u.unbind_week ?? -1,
        unbind_month: u.unbind_month ?? -1,
        unbind_quarter: u.unbind_quarter ?? -1,
        unbind_halfy: u.unbind_halfy ?? -1,
        unbind_year: u.unbind_year ?? -1,
        unbind_total: u.unbind_total ?? -1,
        extra_data: u.extra_data || '',
        cloud_data: u.cloud_data || '',
        qq: u.qq || '',
        wechat: u.wechat || '',
        phone: u.phone || '',
        email: u.email || '',
      })
      if (u.expire_at) {
        try { setExpireDate(parseAbsoluteToLocal(u.expire_at)) } catch { setExpireDate(null) }
      } else {
        setExpireDate(null)
      }
      setInviteCode(u.invite_code || '')
      setEditAppName(u.app?.app_name || '')
      onEditOpen()
    }).catch(() => toast.error('获取用户信息失败'))
  }

  const handleNew = () => {
    setEditingId(null)
    setFormData({
      app_id: 0,
      username: '',
      avatar: '',
      password: '',
      status: 1,
      is_paid: 0,
      is_tester: 0,
      points: 0,
      channels: 1,
      features: 1,
      unbind_day: -1,
      unbind_week: -1,
      unbind_month: -1,
      unbind_quarter: -1,
      unbind_halfy: -1,
      unbind_year: -1,
      unbind_total: -1,
      extra_data: '',
      cloud_data: '',
      qq: '',
      wechat: '',
      phone: '',
      email: '',
    })
    setExpireDate(null)
    setInviteCode('')
    setEditAppName('')
    onEditOpen()
  }

  const handleResetInviteCode = async () => {
    if (!editingId) return
    setResettingInviteCode(true)
    try {
      const res: any = await adminApi.resetAppUserInviteCode(editingId)
      setInviteCode(res.data?.invite_code || '')
      toast.success('推广码已重置')
    } catch (e: any) { toast.error(e.message || '重置失败') }
    finally { setResettingInviteCode(false) }
  }

  const handleSave = async () => {
    if (isNewUser && !formData.app_id) { toast.error('请选择应用'); return }
    if (!formData.username.trim()) { toast.error('请输入用户名'); return }
    if (isNewUser && !formData.password.trim()) { toast.error('请输入密码'); return }
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (!isNewUser && !data.password) delete data.password
      data.expire_at = expireDate ? expireDate.toDate().toISOString() : ''
      
      if (isNewUser) {
        await adminApi.createAppUser(data)
        toast.success('创建成功')
      } else {
        await adminApi.updateAppUser(editingId!, data)
        toast.success('保存成功')
      }
      onEditClose()
      fetchUsers()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || isNewUser || !editingId) return
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res: any = await adminApi.uploadAppUserAvatar(editingId, form)
      setFormData({ ...formData, avatar: res.data?.avatar || '' })
      toast.success('头像已上传')
      fetchUsers()
    } catch (err: any) {
      toast.error(err.message || '上传失败')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(users.map(u => u.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id])
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id))
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) { toast.error('请先选择用户'); return }
    if (!await confirm(`确定要删除选中的 ${selectedIds.length} 个用户吗？`)) return
    try {
      await adminApi.batchDeleteAppUsers(selectedIds)
      toast.success('批量删除成功')
      setSelectedIds([])
      fetchUsers()
    } catch (e: any) { toast.error(e.message || '批量删除失败') }
  }

  const handleBatchDisable = async () => {
    if (selectedIds.length === 0) { toast.error('请先选择用户'); return }
    if (!await confirm(`确定要封停选中的 ${selectedIds.length} 个用户吗？`)) return
    try {
      await adminApi.batchUpdateAppUserStatus(selectedIds, 2)
      toast.success('批量封停成功')
      setSelectedIds([])
      fetchUsers()
    } catch (e: any) { toast.error(e.message || '批量封停失败') }
  }

  const handleBatchEnable = async () => {
    if (selectedIds.length === 0) { toast.error('请先选择用户'); return }
    if (!await confirm(`确定要启用选中的 ${selectedIds.length} 个用户吗？`)) return
    try {
      await adminApi.batchUpdateAppUserStatus(selectedIds, 1)
      toast.success('批量启用成功')
      setSelectedIds([])
      fetchUsers()
    } catch (e: any) { toast.error(e.message || '批量启用失败') }
  }

  const formatExpireAt = (expireAt: string | null) => {
    if (!expireAt) return <span style={{ color: '#FFA2A2' }}>已到期</span>
    const date = new Date(expireAt)
    if (date.getFullYear() >= 2099) return <span style={{ color: '#A684FF' }}>无限制</span>
    const full = date.toLocaleString()
    const color = date < new Date() ? '#FFA2A2' : '#2AA63E'
    return <Tooltip content={full}><span style={{ color }} className="cursor-default">{full}</span></Tooltip>
  }

  const getExpireProgress = (_createdAt: string, expireAt: string | null, lastRechargeAt?: string | null) => {
    if (!expireAt) return { pct: 0, color: 'danger' as const }
    const expire = new Date(expireAt)
    if (expire.getFullYear() >= 2099) return { pct: 100, color: 'secondary' as const }
    const start = lastRechargeAt ? new Date(lastRechargeAt) : new Date(_createdAt)
    const now = new Date()
    const total = expire.getTime() - start.getTime()
    if (total <= 0) return { pct: 0, color: 'danger' as const }
    const remaining = expire.getTime() - now.getTime()
    if (remaining <= 0) return { pct: 0, color: 'danger' as const }
    const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
    let color: 'success' | 'primary' | 'warning' = 'warning'
    if (pct >= 70) color = 'success'
    else if (pct >= 30) color = 'primary'
    return { pct, color }
  }

  return (
    <div className="space-y-4">
      {/* 搜索和操作栏 */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select
          placeholder="选择应用"
          selectedKeys={selectedAppId ? [selectedAppId] : []}
          onChange={(e) => { setSelectedAppId(e.target.value); setPage(1) }}
          className="w-48"
          size="sm"
        >
          {[{ id: '', app_name: '全部应用' }, ...apps].map((app) => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <Input placeholder="搜索用户名/QQ/手机/邮箱" value={keyword} onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          startContent={<HiSearch className="w-4 h-4 text-gray-400" />} className="w-64" size="sm" />
        <Select
          placeholder="筛选条件"
          selectionMode="multiple"
          selectedKeys={selectedFilters}
          onSelectionChange={(keys) => { setSelectedFilters(keys as Set<string>); setPage(1) }}
          className="w-48"
          size="sm"
        >
          <SelectItem key="trial">试用用户</SelectItem>
          <SelectItem key="free">免费用户</SelectItem>
          <SelectItem key="paid">付费用户</SelectItem>
          <SelectItem key="tester">内测用户</SelectItem>
          <SelectItem key="expired">已到期</SelectItem>
          <SelectItem key="unexpired">未到期</SelectItem>
          <SelectItem key="unlimited">无限制</SelectItem>
        </Select>
        <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
        <div className="flex-1" />
        {selectedIds.length > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-500">已选 {selectedIds.length} 项</span>
            <Button color="success" size="sm" variant="flat" startContent={<HiCheck className="w-4 h-4" />} onPress={handleBatchEnable}>启用</Button>
            <Button color="danger" size="sm" variant="flat" startContent={<HiBan className="w-4 h-4" />} onPress={handleBatchDisable}>封停</Button>
            <Button color="danger" size="sm" variant="flat" startContent={<HiTrash className="w-4 h-4" />} onPress={handleBatchDelete}>删除</Button>
          </div>
        )}
        <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />} 
          onPress={handleNew}>添加用户</Button>
      </div>

      {/* 用户列表 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : users.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无用户</CardBody></Card>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Checkbox
              isSelected={users.length > 0 && selectedIds.length === users.length}
              isIndeterminate={selectedIds.length > 0 && selectedIds.length < users.length}
              onValueChange={handleSelectAll}
            >
              全选
            </Checkbox>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {users.map((user) => {
              const selected = selectedIds.includes(user.id)
              return (
              <Card key={user.id} className={`relative hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border ${selected ? 'border-primary/70' : 'border-transparent'}`}>
                <CardBody className="p-4 flex flex-col h-full">
                  <button
                    type="button"
                    onClick={() => handleSelectOne(user.id, !selected)}
                    className={`absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition-all ${selected ? 'border-primary bg-primary text-white shadow-sm' : 'border-gray-200 bg-white/90 text-gray-300 hover:border-primary hover:text-primary dark:border-gray-700 dark:bg-content1/90 dark:text-gray-500 dark:hover:border-primary dark:hover:text-primary'}`}
                    aria-label={selected ? '取消选择用户' : '选择用户'}
                  >
                    {selected ? <HiCheck className="w-3.5 h-3.5" /> : <HiCheckCircle className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer pr-8" onClick={() => showDetail(user)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <Avatar src={avatarOrDefault(user.avatar)} name={user.username} className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary font-bold text-lg" />
                            {(user.online_count || 0) > 0 && <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-success border-2 border-white dark:border-content1" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="font-semibold truncate">{user.username}</h3>
                            </div>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{user.app?.app_name || '未知应用'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-wrap mt-3">
                    <Chip color={STATUS_MAP[user.status]?.color || 'default'} size="sm" variant="flat" className="text-[10px] h-5 px-1">
                      {STATUS_MAP[user.status]?.label || '未知'}
                    </Chip>
                    {user.is_paid === 1 && <Chip size="sm" variant="flat" color="warning" className="text-[10px] h-5 px-1">付费</Chip>}
                    {user.is_tester === 1 && <Chip size="sm" variant="flat" color="secondary" className="text-[10px] h-5 px-1">内测</Chip>}
                    {user.is_card_user === 1 && <Chip size="sm" variant="flat" color="primary" className="text-[10px] h-5 px-1">卡号</Chip>}
                    {user.is_trial === 1 && <Chip size="sm" variant="flat" color="default" className="text-[10px] h-5 px-1">试用</Chip>}
                  </div>

                  <div className="text-xs mt-4 space-y-3">
                    <div className="rounded-xl bg-gray-50/80 dark:bg-content2 px-3 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-400">所属作者</span>
                        <span className="font-medium text-right truncate">{user.app?.user?.nickname || user.app?.user?.username || '-'}</span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50/80 dark:bg-content2 px-3 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-gray-400"><HiClock className="w-3.5 h-3.5" />到期时间</div>
                        <div className="font-medium text-right truncate">{formatExpireAt(user.expire_at)}</div>
                      </div>
                      {(() => {
                        const p = getExpireProgress(user.created_at, user.expire_at, user.last_recharge_at)
                        const customColors: Record<string, string> = {
                          secondary: '!bg-purple-300',
                          primary: '!bg-blue-300',
                        }
                        return <Progress value={p.pct} color={p.color} size="sm" className="mt-2"
                          classNames={customColors[p.color] ? { indicator: customColors[p.color] } : undefined} />
                      })()}
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 rounded-xl bg-gray-50/80 dark:bg-content2 ring-1 ring-gray-100 dark:ring-gray-800 overflow-hidden">
                      <div className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><HiCash className="w-3.5 h-3.5" />点数</div>
                        <div className="font-semibold">{user.points}</div>
                      </div>
                      <div className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><HiTicket className="w-3.5 h-3.5" />积分</div>
                        <div className="font-semibold">{user.rebate_points || 0}</div>
                      </div>
                      <div className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5"><HiStatusOnline className="w-3.5 h-3.5" />在线</div>
                        <div className="font-semibold text-success">{user.online_count || 0}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-gray-400 px-1">
                      <span className="flex items-center gap-1"><HiAdjustments className="w-3.5 h-3.5" />通道 {user.channels}</span>
                      <span className="flex items-center gap-1"><HiSparkles className="w-3.5 h-3.5" />特征 {user.features}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto pt-4 justify-end">
                    <RBtn icon={<HiPencil className="w-4 h-4" />} label="编辑" variant="flat" color="primary" onPress={() => handleEdit(user.id)} />
                    <RBtn icon={<HiStatusOnline className="w-4 h-4" />} label="在线" variant="flat" color="success" onPress={() => openOnlineDrawer(user)} />
                    <Dropdown>
                      <DropdownTrigger>
                        <Button size="sm" variant="flat" isIconOnly className="rbtn rbtn-default min-w-8 w-8 h-8"><HiDotsVertical className="w-4 h-4" /></Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="用户操作">
                        <DropdownItem key="data" startContent={<HiKey className="w-4 h-4" />} onPress={() => { setDataDrawerUserId(user.id); setIsDataDrawerOpen(true) }}>标识数据</DropdownItem>
                        <DropdownItem key="device" startContent={<HiFingerPrint className="w-4 h-4" />} onPress={() => openDeviceDrawer(user)}>特征码</DropdownItem>
                        <DropdownItem key="logs" startContent={<HiClipboardList className="w-4 h-4" />} onPress={() => { setLogDrawerUser(user); setIsLogDrawerOpen(true) }}>日志</DropdownItem>
                        <DropdownItem key="profile" startContent={<HiUserCircle className="w-4 h-4" />} onPress={() => { setProfileDrawerUser(user); setIsProfileDrawerOpen(true) }}>用户画像</DropdownItem>
                        <DropdownItem key="delete" color="danger" className="text-danger" startContent={<HiTrash className="w-4 h-4" />} onPress={() => handleDelete(user.id)}>删除</DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </CardBody>
              </Card>
              )
            })}
          </div>
          {total > pageSize && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} /></div>}
        </>
      )}

      {/* 详情弹窗 */}
      <Drawer isOpen={isDetailOpen} onClose={onDetailClose} placement="right" size="lg" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>{selectedUser?.username || '用户详情'}</span>
            <Button variant="flat" size="sm" onPress={onDetailClose}>关闭</Button>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="py-5">
            {selectedUser && (
              <AppUserDetailContent user={selectedUser} statusMap={STATUS_MAP} formatExpireAt={formatExpireAt} getExpireProgress={getExpireProgress} ownerName={selectedUser.app?.user?.nickname || selectedUser.app?.user?.username || '-'} />
            )}
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 编辑用户 Drawer */}
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span className="truncate flex-1 min-w-0">
              {isNewUser ? '添加用户' : (
                <>
                  <span>编辑用户: {formData.username}</span>
                  {!isNewUser && editAppName && <span className="text-gray-500 text-sm ml-2">({editAppName})</span>}
                </>
              )}
            </span>
            <div className="flex gap-2 flex-shrink-0 ml-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">
                {isNewUser ? '创建' : '保存'}
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4 mt-6">
              {/* 基本信息 */}
              {isNewUser ? (
                <Select
                  label="所属应用"
                  selectedKeys={formData.app_id ? [String(formData.app_id)] : []}
                  onChange={(e) => setFormData({ ...formData, app_id: Number(e.target.value) })}
                  isRequired
                  size="sm"
                  variant="bordered"
                >
                  {apps.map((app) => (
                    <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                  ))}
                </Select>
              ) : (
                <Input label="所属应用" value={editAppName} isReadOnly size="sm" variant="bordered" />
              )}
              {!isNewUser && (
                <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-content2">
                  <div className="flex items-center gap-3">
                    <Avatar src={avatarOrDefault(formData.avatar)} name={formData.username} className="h-14 w-14 text-lg" />
                    <div>
                      <p className="font-medium">用户头像</p>
                      <p className="text-xs text-gray-400">支持 JPG/PNG/GIF/WebP，最大 2MB</p>
                    </div>
                  </div>
                  <Button size="sm" variant="flat" color="primary" isLoading={uploadingAvatar} onPress={() => avatarInputRef.current?.click()}>上传头像</Button>
                  <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="用户名" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} isRequired size="sm" variant="bordered" />
                <Input label={isNewUser ? '密码' : '新密码'} type="password" value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={isNewUser ? '' : '留空则不修改'} isRequired={isNewUser} size="sm" variant="bordered" />
              </div>
              <Select label="账户状态" selectedKeys={[String(formData.status)]} onChange={(e) => setFormData({ ...formData, status: Number(e.target.value) })} size="sm" variant="bordered">
                <SelectItem key="1">正常</SelectItem>
                <SelectItem key="2">封停</SelectItem>
                <SelectItem key="3">冻结</SelectItem>
              </Select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
                  <span>收费账户</span>
                  <Switch size="sm" isSelected={formData.is_paid === 1} onValueChange={(v) => setFormData({ ...formData, is_paid: v ? 1 : 0 })} />
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
                  <span>内测账户</span>
                  <Switch size="sm" isSelected={formData.is_tester === 1} onValueChange={(v) => setFormData({ ...formData, is_tester: v ? 1 : 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DatePicker label="到期时间" value={expireDate} onChange={setExpireDate}
                  granularity="second" hourCycle={24} hideTimeZone showMonthAndYearPickers size="sm" />
                <Input label="点数余额" type="number" value={String(formData.points)}
                  onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })} size="sm" variant="bordered" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="通道数量" type="number" min={1} value={String(formData.channels)}
                  onChange={(e) => setFormData({ ...formData, channels: Number(e.target.value) })} size="sm" variant="bordered" />
                <Input label="特征数量" type="number" min={1} value={String(formData.features)}
                  onChange={(e) => setFormData({ ...formData, features: Number(e.target.value) })} size="sm" variant="bordered" />
              </div>
              {!isNewUser && (
                <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-500">推广码</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-lg">{inviteCode || '未生成'}</span>
                        {inviteCode && (
                          <Button isIconOnly size="sm" variant="light"
                            onPress={() => { navigator.clipboard.writeText(inviteCode); toast.success('已复制') }}>
                            <HiClipboardCopy className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="flat" color="primary" startContent={<HiRefresh className="w-4 h-4" />}
                      onPress={handleResetInviteCode} isLoading={resettingInviteCode}>
                      重置
                    </Button>
                  </div>
                </div>
              )}

              {/* 联系方式 */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">联系方式</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="QQ号" value={formData.qq} onChange={(e) => setFormData({ ...formData, qq: e.target.value })} size="sm" variant="bordered" />
                  <Input label="微信号" value={formData.wechat} onChange={(e) => setFormData({ ...formData, wechat: e.target.value })} size="sm" variant="bordered" />
                  <Input label="手机号" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} size="sm" variant="bordered" />
                  <Input label="邮箱" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} size="sm" variant="bordered" />
                </div>
              </div>

              {/* 解绑设置 */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">解绑设置</h3>
                <p className="text-sm text-gray-500 mb-3">-1 表示无限次数</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="每天解绑次数" type="number" value={String(formData.unbind_day)}
                    onChange={(e) => setFormData({ ...formData, unbind_day: Number(e.target.value) })} size="sm" variant="bordered" />
                  <Input label="每周解绑次数" type="number" value={String(formData.unbind_week)}
                    onChange={(e) => setFormData({ ...formData, unbind_week: Number(e.target.value) })} size="sm" variant="bordered" />
                  <Input label="每月解绑次数" type="number" value={String(formData.unbind_month)}
                    onChange={(e) => setFormData({ ...formData, unbind_month: Number(e.target.value) })} size="sm" variant="bordered" />
                  <Input label="每季解绑次数" type="number" value={String(formData.unbind_quarter)}
                    onChange={(e) => setFormData({ ...formData, unbind_quarter: Number(e.target.value) })} size="sm" variant="bordered" />
                  <Input label="每半年解绑次数" type="number" value={String(formData.unbind_halfy)}
                    onChange={(e) => setFormData({ ...formData, unbind_halfy: Number(e.target.value) })} size="sm" variant="bordered" />
                  <Input label="每年解绑次数" type="number" value={String(formData.unbind_year)}
                    onChange={(e) => setFormData({ ...formData, unbind_year: Number(e.target.value) })} size="sm" variant="bordered" />
                  <Input label="总解绑次数" type="number" value={String(formData.unbind_total)}
                    onChange={(e) => setFormData({ ...formData, unbind_total: Number(e.target.value) })} size="sm" variant="bordered" />
                </div>
              </div>

              {/* 附加数据 */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">附加数据</h3>
                <div className="space-y-4">
                  <Textarea label="附加数据" value={formData.extra_data}
                    onChange={(e) => setFormData({ ...formData, extra_data: e.target.value })}
                    placeholder="任意格式的附加数据" minRows={3} size="sm" variant="bordered" />
                  <Textarea label="云端数据" value={formData.cloud_data}
                    onChange={(e) => setFormData({ ...formData, cloud_data: e.target.value })}
                    placeholder="通过客户端接口读写的数据" minRows={3} size="sm" variant="bordered" />
                </div>
              </div>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 标识数据抽屉 */}
      <AdminAppUserDataDrawer isOpen={isDataDrawerOpen} onClose={() => setIsDataDrawerOpen(false)} userId={dataDrawerUserId} />

      {/* 操作日志抽屉 */}
      <AppUserLogsDrawer isOpen={isLogDrawerOpen} onClose={() => setIsLogDrawerOpen(false)} userId={logDrawerUser?.id || null} username={logDrawerUser?.username} api={adminApi} />

      <AppUserProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
        userId={profileDrawerUser?.id || null}
        username={profileDrawerUser?.username}
        api={adminApi}
        onChanged={fetchUsers}
      />

      {/* 在线列表抽屉 */}
      <Drawer isOpen={isOnlineDrawerOpen} onClose={() => setIsOnlineDrawerOpen(false)} size="lg" classNames={{ base: "rounded-l-none" }}>
        <DrawerContent>
          <DrawerHeader>
            {onlineDrawerUser?.username} 的在线列表
          </DrawerHeader>
          <DrawerBody>
            {onlineLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : onlineSessions.length === 0 ? (
              <div className="text-center text-gray-400 py-8">当前无在线会话</div>
            ) : (
              <div className="space-y-3">
                {onlineSessions.map((s: any) => (
                  <Card key={s.id} className="border border-gray-100 dark:border-gray-800">
                    <CardBody className="p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">IP</span>
                        <span>{s.client_ip}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">特征码</span>
                        <span className="truncate ml-4 max-w-[200px]">{s.feature}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">版本</span>
                        <span>{s.version}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">系统</span>
                        <span>{s.client_os}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">登录时间</span>
                        <span>{new Date(s.login_at).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">最后心跳</span>
                        <span>{new Date(s.heartbeat_at).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button size="sm" color="danger" variant="flat" onPress={async () => {
                          try {
                            await adminApi.kickOnlineSession(s.id)
                            toast.success('已踢下线')
                            fetchOnlineSessions(onlineDrawerUser!)
                            fetchUsers()
                          } catch { toast.error('操作失败') }
                        }}>踢下线</Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 特征码抽屉 */}
      <Drawer isOpen={isDeviceDrawerOpen} onClose={() => setIsDeviceDrawerOpen(false)} size="lg" classNames={{ base: "rounded-l-none" }}>
        <DrawerContent>
          <DrawerHeader>
            {deviceDrawerUser?.username} 的特征码列表
          </DrawerHeader>
          <DrawerBody>
            {deviceLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : devices.length === 0 ? (
              <div className="text-center text-gray-400 py-8">暂无绑定特征码</div>
            ) : (
              <div className="space-y-3">
                {devices.map((d: any) => (
                  <Card key={d.id} className="border border-gray-100 dark:border-gray-800">
                    <CardBody className="p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">特征码</span>
                        <span className="truncate ml-4 max-w-[300px]">{d.feature}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">备注</span>
                        <span>{d.remark || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">绑定时间</span>
                        <span>{new Date(d.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button size="sm" color="danger" variant="flat" onPress={async () => {
                          try {
                            await adminApi.deleteAppUserDevice(deviceDrawerUser!.id, d.id)
                            toast.success('已解绑')
                            fetchDevices(deviceDrawerUser!)
                          } catch { toast.error('操作失败') }
                        }}>解绑</Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
