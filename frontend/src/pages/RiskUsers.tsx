import { useEffect, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Input, Pagination, Select, SelectItem, Spinner,
} from '@heroui/react'
import { HiSearch, HiStatusOnline } from 'react-icons/hi'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { adminApi, userApi } from '../api'
import AppUserProfileDrawer from './AppUserProfileDrawer'
import RiskRulesButton from './RiskRulesButton'

interface Props {
  admin?: boolean
}

const levelMap: Record<string, { label: string; color: 'warning' | 'danger' | 'secondary' }> = {
  low: { label: '低风险', color: 'secondary' },
  medium: { label: '中风险', color: 'warning' },
  high: { label: '高风险', color: 'danger' },
}

export default function RiskUsers({ admin = false }: Props) {
  const api = admin ? adminApi : userApi
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileUser, setProfileUser] = useState<any>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const pageSize = 12

  const loadData = async () => {
    setLoading(true)
    try {
      const res: any = await api.listRiskAppUsers(page, pageSize, level, keyword)
      setItems(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [page, level])

  const handleSearch = () => {
    setPage(1)
    loadData()
  }

  const freezeUser = async (item: any) => {
    if (!await confirm(`确定冻结用户 ${item.username}？`)) return
    try {
      await api.updateAppUser(item.id, { status: 3 })
      toast.success('已冻结')
      loadData()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const kickUser = async (item: any) => {
    if (!await confirm(`确定踢下线用户 ${item.username} 的所有会话？`)) return
    try {
      const res: any = await api.kickOnlineSessionsByUser(item.app_id, item.id)
      toast.success(`已踢下线 ${res.data?.count || 0} 个会话`)
      loadData()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const disposeUser = async (item: any, action: string, label: string) => {
    if (!await confirm(`确定对用户 ${item.username} 执行“${label}”？`)) return
    try {
      const res: any = await api.disposeRiskAppUser(item.id, action)
      const data = res.data || {}
      const summary = [
        data.sessions !== undefined ? `会话${data.sessions}` : '',
        data.devices !== undefined ? `设备${data.devices}` : '',
        data.ips !== undefined ? `IP${data.ips}` : '',
        data.features !== undefined ? `特征${data.features}` : '',
      ].filter(Boolean).join('，')
      toast.success(summary ? `处置完成：${summary}` : '处置完成')
      loadData()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 w-full sm:grid-cols-[auto_8rem_1fr_auto] lg:w-auto lg:grid-cols-[auto_8rem_13rem_auto]">
          <RiskRulesButton />
          <Select size="sm" placeholder="全部等级" selectedKeys={level ? [level] : []} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
            <SelectItem key="">全部等级</SelectItem>
            <SelectItem key="high">高风险</SelectItem>
            <SelectItem key="medium">中风险</SelectItem>
            <SelectItem key="low">低风险</SelectItem>
          </Select>
          <Button size="sm" color="primary" onPress={handleSearch}>搜索</Button>
          <Input size="sm" placeholder="搜索用户/手机/邮箱" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} startContent={<HiSearch className="w-4 h-4" />} className="col-span-3 sm:col-span-1 sm:col-start-3 sm:row-start-1" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无风险用户</CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const levelInfo = levelMap[item.risk_level] || levelMap.low
            return (
              <Card key={item.id} className="border border-gray-100 dark:border-gray-800">
                <CardBody className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{item.username}</div>
                      <div className="text-xs text-gray-400 truncate">{item.app?.app_name || '未知应用'}</div>
                    </div>
                    <Chip color={levelInfo.color} variant="flat" className="w-fit">{levelInfo.label} {item.risk_score}</Chip>
                  </div>

                  <div className="grid grid-cols-5 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{item.recent_ip_count}</div><div className="text-gray-400">IP</div></div>
                    <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{item.device_count}</div><div className="text-gray-400">设备</div></div>
                    <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{item.online_count}</div><div className="text-gray-400">在线</div></div>
                    <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{item.login_1h_count}</div><div className="text-gray-400">1h登录</div></div>
                    <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{item.unbind_24h_count}</div><div className="text-gray-400">解绑</div></div>
                  </div>

                  <div className="space-y-1">
                    {item.reasons?.map((reason: any) => (
                      <div key={`${reason.type}-${reason.message}`} className="text-xs text-gray-600 dark:text-gray-300 flex justify-between gap-2">
                        <span className="break-all">{reason.message}</span>
                        <span className="text-warning flex-shrink-0">+{reason.score}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="flat" color="primary" onPress={() => { setProfileUser(item); setProfileOpen(true) }}>画像</Button>
                    <Button size="sm" variant="flat" color="warning" startContent={<HiStatusOnline className="w-4 h-4" />} onPress={() => kickUser(item)}>踢下线</Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => freezeUser(item)}>冻结</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button size="sm" variant="flat" onPress={() => disposeUser(item, 'unbind_devices', '解绑全部设备')}>解绑全部设备</Button>
                    <Button size="sm" variant="flat" onPress={() => disposeUser(item, 'blacklist_ips', '拉黑最近IP')}>拉黑最近IP</Button>
                    <Button size="sm" variant="flat" onPress={() => disposeUser(item, 'blacklist_features', '拉黑全部特征')}>拉黑全部特征</Button>
                    <Button size="sm" color="danger" variant="flat" onPress={() => disposeUser(item, 'full', '一键处置')}>一键处置</Button>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {total > pageSize && (
        <div className="flex justify-center">
          <Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} />
        </div>
      )}

      <AppUserProfileDrawer
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        userId={profileUser?.id || null}
        username={profileUser?.username}
        api={api}
        onChanged={loadData}
      />
    </div>
  )
}
