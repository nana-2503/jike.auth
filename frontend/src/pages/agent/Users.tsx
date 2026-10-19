import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Input, Spinner, Chip, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
} from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'
import { HiSearch, HiKey, HiServer } from 'react-icons/hi'

const statusMap: Record<number, { label: string; color: 'success' | 'warning' | 'danger' | 'default' }> = {
  1: { label: '正常', color: 'success' },
  2: { label: '封停', color: 'danger' },
  3: { label: '冻结', color: 'warning' },
}

export default function AgentUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')

  const { isOpen, onOpen, onClose } = useDisclosure()
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [devices, setDevices] = useState<any[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)

  const { isOpen: onlineOpen, onOpen: onOnlineOpen, onClose: onOnlineClose } = useDisclosure()
  const [onlineUser, setOnlineUser] = useState<any>(null)
  const [onlineSessions, setOnlineSessions] = useState<any[]>([])
  const [onlineLoading, setOnlineLoading] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listUsers(page, 20, keyword || undefined)
      setUsers(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [page])

  const handleSearch = async () => {
    setPage(1)
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listUsers(1, 20, keyword || undefined)
      setUsers(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSetStatus = async (user: any, newStatus: number) => {
    const label = statusMap[newStatus]?.label || String(newStatus)
    const confirmed = await confirm(`将用户 "${user.username}" 设为「${label}」？`, '更新状态')
    if (!confirmed) return
    try {
      await agentCenterApi.updateUserStatus(user.id, newStatus)
      toast.success('已更新')
      loadUsers()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const handleViewDevices = async (user: any) => {
    setSelectedUser(user)
    setDevicesLoading(true)
    onOpen()
    try {
      const res: any = await agentCenterApi.listUserDevices(user.id)
      setDevices(res.data.list || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setDevicesLoading(false)
    }
  }

  const handleUnbindDevice = async (deviceId: number) => {
    const ok = await confirm('确定要解绑此特征码吗？', '解绑特征码')
    if (!ok) return
    try {
      await agentCenterApi.unbindUserDevice(selectedUser.id, deviceId)
      toast.success('解绑成功')
      setDevices(devices.filter(d => d.id !== deviceId))
    } catch (e: any) {
      toast.error(e.message || '解绑失败')
    }
  }

  const openOnlineModal = async (user: any) => {
    setOnlineUser(user)
    onOnlineOpen()
    setOnlineLoading(true)
    try {
      const res: any = await agentCenterApi.listOnlineSessions(1, 50, { app_user_id: user.id })
      setOnlineSessions(res.data.list || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setOnlineLoading(false)
    }
  }

  const kickSession = async (id: number) => {
    try {
      await agentCenterApi.kickOnlineSession(id)
      toast.success('已踢下线')
      setOnlineSessions(onlineSessions.filter(s => s.id !== id))
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const kickAllForUser = async () => {
    if (!onlineUser) return
    const ok = await confirm('确定将该用户所有会话踢下线？', '踢下线')
    if (!ok) return
    try {
      await agentCenterApi.kickOnlineByUser(onlineUser.id)
      toast.success('已踢下线')
      setOnlineSessions([])
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const formatTime = (time: string) => {
    if (!time) return '-'
    return new Date(time).toLocaleString('zh-CN')
  }

  const formatExpire = (time: string) => {
    if (!time || time === '0001-01-01T00:00:00Z') return '永久'
    const d = new Date(time)
    if (d.getFullYear() > 2099) return '永久'
    return d.toLocaleString('zh-CN')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-4">
          <div className="flex gap-3">
            <Input placeholder="用户名/QQ/手机" value={keyword} onChange={(e) => setKeyword(e.target.value)}
              className="flex-1 md:w-64 md:flex-none" size="sm" startContent={<HiSearch className="text-gray-400" />}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : users.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无用户数据</CardBody></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{user.username}</span>
                  <Chip size="sm" color={statusMap[user.status]?.color || 'default'}>
                    {statusMap[user.status]?.label || '未知'}
                  </Chip>
                </div>
                <div className="text-xs text-gray-500 space-y-1 mb-3">
                  {user.qq && <div>QQ: {user.qq}</div>}
                  {user.phone && <div>手机: {user.phone}</div>}
                  <div>点数: {user.points}</div>
                  <div>到期: {formatExpire(user.expire_at)}</div>
                  <div>注册: {formatTime(user.created_at)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="flat" startContent={<HiKey className="w-4 h-4" />}
                    onPress={() => handleViewDevices(user)}>特征码</Button>
                  <Button size="sm" variant="flat" startContent={<HiServer className="w-4 h-4" />}
                    onPress={() => openOnlineModal(user)}>在线</Button>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button size="sm" variant="flat" color="primary">改状态</Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="状态"
                      onAction={(key) => handleSetStatus(user, Number(key))}
                    >
                      <DropdownItem key="1">正常</DropdownItem>
                      <DropdownItem key="2">封停</DropdownItem>
                      <DropdownItem key="3">冻结</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="flex justify-center">
          <Pagination total={Math.ceil(total / 20)} page={page} onChange={setPage} />
        </div>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg" placement="center">
        <ModalContent>
          <ModalHeader>特征码管理 - {selectedUser?.username}</ModalHeader>
          <ModalBody>
            {devicesLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : devices.length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无特征码</p>
            ) : (
              <div className="space-y-2">
                {devices.map((device) => (
                  <Card key={device.id}>
                    <CardBody className="p-3">
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm break-all">{device.feature}</p>
                          {device.remark && <p className="text-xs text-gray-500">{device.remark}</p>}
                          <p className="text-xs text-gray-500">{formatTime(device.created_at)}</p>
                        </div>
                        <Button size="sm" color="danger" variant="flat" onPress={() => handleUnbindDevice(device.id)}>
                          解绑
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onPress={onClose}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={onlineOpen} onClose={onOnlineClose} size="lg" placement="center">
        <ModalContent>
          <ModalHeader className="flex flex-wrap gap-2 justify-between">
            <span>在线会话 - {onlineUser?.username}</span>
            {onlineSessions.length > 0 && (
              <Button size="sm" color="danger" variant="flat" onPress={kickAllForUser}>全部踢下线</Button>
            )}
          </ModalHeader>
          <ModalBody>
            {onlineLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : onlineSessions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">当前无在线会话</p>
            ) : (
              <div className="space-y-2">
                {onlineSessions.map((s) => (
                  <Card key={s.id}>
                    <CardBody className="p-3 flex flex-row justify-between items-center gap-2">
                      <div className="text-xs space-y-1 min-w-0">
                        <div className="font-mono truncate" title={s.token}>Token: {s.token?.slice(0, 12)}…</div>
                        <div>IP: {s.client_ip} · {s.client_os || '-'}</div>
                        <div>心跳: {formatTime(s.heartbeat_at)}</div>
                      </div>
                      <Button size="sm" color="warning" variant="flat" onPress={() => kickSession(s.id)}>踢下线</Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onPress={onOnlineClose}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
