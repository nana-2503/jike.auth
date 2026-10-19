import { useEffect, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Drawer, DrawerBody, DrawerContent, DrawerHeader, Spinner,
} from '@heroui/react'
import { toast } from '../components/Toast'
import { HiStatusOnline, HiFingerPrint, HiClock, HiLocationMarker } from 'react-icons/hi'
import RiskRulesButton from './RiskRulesButton'

interface ProfileApi {
  getAppUserProfile: (id: number) => Promise<any>
  kickOnlineSession: (id: number) => Promise<any>
  kickOnlineSessionsByUser: (appId: number, appUserId: number) => Promise<any>
}

interface Props {
  isOpen: boolean
  onClose: () => void
  userId: number | null
  username?: string
  api: ProfileApi
  onChanged?: () => void
}

const actionLabel: Record<string, string> = {
  login: '登录',
  card_login: '卡号登录',
  register: '注册',
  bind: '绑定',
  unbind: '解绑',
  recharge: '充值',
  register_recharge: '注册充值',
  recharge_offline: '离线充值',
  deduct: '扣除',
  logout: '退出',
  changepwd: '改密',
  change_password: '改密',
}

const fmt = (value?: string | null) => value ? new Date(value).toLocaleString() : '-'

export default function AppUserProfileDrawer({ isOpen, onClose, userId, username, api, onChanged }: Props) {
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  const loadProfile = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res: any = await api.getAppUserProfile(userId)
      setProfile(res.data)
    } catch (e: any) {
      toast.error(e.message || '加载画像失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && userId) loadProfile()
  }, [isOpen, userId])

  const kickSession = async (id: number) => {
    try {
      await api.kickOnlineSession(id)
      toast.success('已踢下线')
      loadProfile()
      onChanged?.()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const kickAllSessions = async () => {
    if (!profile?.user?.app_id || !userId) return
    try {
      const res: any = await api.kickOnlineSessionsByUser(profile.user.app_id, userId)
      toast.success(`已踢下线 ${res.data?.count || 0} 个会话`)
      loadProfile()
      onChanged?.()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const summary = profile?.summary || {}
  const sessions = profile?.online_sessions || []
  const devices = profile?.devices || []
  const logs = profile?.recent_logs || []
  const ips = profile?.recent_ips || []
  const lastLogin = profile?.last_login
  const risks = [
    ips.length >= 5 ? `最近出现 ${ips.length} 个登录 IP` : '',
    (summary.device_count || 0) > (profile?.user?.features || 1) ? '绑定设备数超过用户特征数' : '',
    (summary.online_count || 0) > (profile?.user?.channels || 1) ? '在线会话数超过用户通道数' : '',
    sessions.some((s: any) => s.heartbeat_at && Date.now() - new Date(s.heartbeat_at).getTime() > 10 * 60 * 1000) ? '存在超过10分钟未心跳的会话' : '',
  ].filter(Boolean)

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="2xl" hideCloseButton>
      <DrawerContent className="rounded-none">
        <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
          <span>用户画像 {username && `- ${username}`}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={loadProfile}>刷新</Button>
            <Button size="sm" variant="flat" onPress={onClose}>关闭</Button>
          </div>
        </DrawerHeader>
        <DrawerBody className="py-4 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : !profile ? (
            <div className="text-center py-12 text-gray-500">暂无画像数据</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card><CardBody className="p-3"><div className="text-xl font-bold text-success">{summary.online_count || 0}</div><div className="text-xs text-gray-500">在线会话</div></CardBody></Card>
                <Card><CardBody className="p-3"><div className="text-xl font-bold text-primary">{summary.device_count || 0}</div><div className="text-xs text-gray-500">绑定设备</div></CardBody></Card>
                <Card><CardBody className="p-3"><div className="text-xl font-bold text-secondary">{summary.login_count || 0}</div><div className="text-xs text-gray-500">登录次数</div></CardBody></Card>
                <Card><CardBody className="p-3"><div className="text-xl font-bold text-warning">{summary.recharge_count || 0}</div><div className="text-xs text-gray-500">充值次数</div></CardBody></Card>
                <Card><CardBody className="p-3"><div className="text-xl font-bold text-danger">{summary.card_use_count || 0}</div><div className="text-xs text-gray-500">卡密使用</div></CardBody></Card>
              </div>

              <Card>
                <CardBody className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-medium"><HiClock className="w-4 h-4" />最近登录</div>
                  <div className="grid md:grid-cols-3 gap-2 text-gray-600 dark:text-gray-300">
                    <div>时间：{fmt(lastLogin?.created_at)}</div>
                    <div>IP：{lastLogin?.ip || '-'}</div>
                    <div className="break-all">详情：{lastLogin?.detail || '-'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {ips.length === 0 ? <span className="text-gray-400">暂无登录IP</span> : ips.map((ip: string) => (
                      <Chip key={ip} size="sm" variant="flat" startContent={<HiLocationMarker className="w-3 h-3" />}>{ip}</Chip>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">风险提示</div>
                    <RiskRulesButton />
                  </div>
                  {risks.length === 0 ? (
                    <div className="text-gray-400">暂未发现明显异常</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {risks.map((risk: string) => <Chip key={risk} color="warning" variant="flat" size="sm">{risk}</Chip>)}
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium"><HiStatusOnline className="w-4 h-4 text-success" />在线会话</div>
                    <Button size="sm" color="danger" variant="flat" isDisabled={sessions.length === 0} onPress={kickAllSessions}>全部踢下线</Button>
                  </div>
                  {sessions.length === 0 ? <div className="text-sm text-gray-400">当前无在线会话</div> : sessions.map((s: any) => (
                    <div key={s.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 text-sm space-y-1">
                      <div className="flex justify-between gap-3"><span className="text-gray-400">IP</span><span>{s.client_ip || '-'}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-gray-400">版本/系统</span><span>{s.version || '-'} / {s.client_os || '-'}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-gray-400">登录/心跳</span><span>{fmt(s.login_at)} / {fmt(s.heartbeat_at)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-gray-400">特征码</span><span className="truncate max-w-[320px]">{s.feature || '-'}</span></div>
                      <div className="flex justify-end"><Button size="sm" color="danger" variant="flat" onPress={() => kickSession(s.id)}>踢下线</Button></div>
                    </div>
                  ))}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-2 font-medium"><HiFingerPrint className="w-4 h-4 text-primary" />绑定设备</div>
                  {devices.length === 0 ? <div className="text-sm text-gray-400">暂无绑定设备</div> : devices.map((d: any) => (
                    <div key={d.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 text-sm">
                      <div className="break-all">{d.feature}</div>
                      <div className="text-xs text-gray-400 mt-1">{d.remark || '无备注'} · {fmt(d.created_at)}</div>
                    </div>
                  ))}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-3">
                  <div className="font-medium">最近操作</div>
                  {logs.length === 0 ? <div className="text-sm text-gray-400">暂无操作日志</div> : logs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 text-sm">
                      <Chip size="sm" variant="flat">{actionLabel[log.action] || log.action}</Chip>
                      <div className="min-w-0 flex-1">
                        <div className="break-all">{log.detail || '-'}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{log.ip || '-'} · {fmt(log.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
