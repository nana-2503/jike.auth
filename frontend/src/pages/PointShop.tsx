import { useEffect, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader, Pagination, Select, SelectItem, Spinner, Switch, Tab, Tabs, Textarea,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiGift, HiPencil, HiPlus, HiRefresh, HiTrash } from 'react-icons/hi'

interface App { id: number; app_name: string }
interface CardType { id: number; name: string; category: number }

interface ShopItem {
  id: number
  app_id: number
  app?: { app_name: string }
  name: string
  description: string
  cost: number
  reward_type: number
  reward_points: number
  reward_duration: number
  card_type_id?: number | null
  card_type?: CardType
  stock: number
  exchanged_count: number
  status: number
  sort: number
}

interface ExchangeLog {
  id: number
  app?: { app_name: string }
  app_user?: { username: string }
  item_name: string
  cost: number
  reward_type: number
  reward_value: string
  card_no: string
  ip: string
  created_at: string
}

const emptyForm = {
  app_id: 0,
  name: '',
  description: '',
  cost: 10,
  reward_type: 1,
  reward_points: 100,
  reward_duration: 1440,
  card_type_id: undefined as number | undefined,
  stock: -1,
  status: 1,
  sort: 0,
}

export default function PointShop() {
  const [apps, setApps] = useState<App[]>([])
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | undefined>()
  const [items, setItems] = useState<ShopItem[]>([])
  const [logs, setLogs] = useState<ExchangeLog[]>([])
  const [itemsTotal, setItemsTotal] = useState(0)
  const [logsTotal, setLogsTotal] = useState(0)
  const [itemsPage, setItemsPage] = useState(1)
  const [logsPage, setLogsPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ShopItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const pageSize = 20

  useEffect(() => {
    userApi.listApps(1, 100).then((res: any) => setApps(res.data?.list || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetchItems()
    fetchLogs()
  }, [selectedAppId, itemsPage, logsPage])

  useEffect(() => {
    const appId = form.app_id || selectedAppId
    if (!appId) {
      setCardTypes([])
      return
    }
    userApi.listCardTypes(appId, 1, 100).then((res: any) => setCardTypes(res.data?.list || [])).catch(() => setCardTypes([]))
  }, [form.app_id, selectedAppId])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listPointShopItems(itemsPage, pageSize, selectedAppId)
      setItems(res.data?.list || [])
      setItemsTotal(res.data?.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载商品失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    try {
      const res: any = await userApi.listPointShopExchanges(logsPage, pageSize, selectedAppId)
      setLogs(res.data?.list || [])
      setLogsTotal(res.data?.total || 0)
    } catch {}
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, app_id: selectedAppId || apps[0]?.id || 0 })
    setModalOpen(true)
  }

  const openEdit = (item: ShopItem) => {
    setEditing(item)
    setForm({
      app_id: item.app_id,
      name: item.name,
      description: item.description || '',
      cost: item.cost,
      reward_type: item.reward_type,
      reward_points: item.reward_points,
      reward_duration: item.reward_duration,
      card_type_id: item.card_type_id || undefined,
      stock: item.stock,
      status: item.status,
      sort: item.sort,
    })
    setModalOpen(true)
  }

  const saveItem = async () => {
    try {
      if (editing) await userApi.updatePointShopItem(editing.id, form)
      else await userApi.createPointShopItem(form)
      toast.success(editing ? '已更新' : '已创建')
      setModalOpen(false)
      fetchItems()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    }
  }

  const deleteItem = async (id: number) => {
    if (!await confirm('确定删除这个兑换商品吗？')) return
    try {
      await userApi.deletePointShopItem(id)
      toast.success('已删除')
      fetchItems()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const rewardLabel = (item: ShopItem | ExchangeLog) => {
    if (item.reward_type === 1) return '点数'
    if (item.reward_type === 2) return '时长'
    return '卡密'
  }

  const rewardDetail = (item: ShopItem) => {
    if (item.reward_type === 1) return `${item.reward_points} 点`
    if (item.reward_type === 2) return item.reward_duration === -1 ? '永久' : `${item.reward_duration} 分钟`
    return item.card_type?.name || '未选择卡种'
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" color="primary" startContent={<HiPlus />} onPress={openCreate}>新增商品</Button>
      </div>

      <Card><CardBody className="p-4"><div className="flex gap-2 items-center"><Select placeholder="全部应用" selectedKeys={selectedAppId ? [String(selectedAppId)] : []} onChange={(e) => { setSelectedAppId(e.target.value ? Number(e.target.value) : undefined); setItemsPage(1); setLogsPage(1) }} className="w-full md:w-64" size="sm">{apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}</Select><Button size="sm" variant="flat" isIconOnly onPress={() => { fetchItems(); fetchLogs() }}><HiRefresh className="w-4 h-4" /></Button></div></CardBody></Card>

      <Tabs aria-label="积分商城" classNames={{ base: 'gap-0', panel: '!mt-0 !pt-1 !px-0 !pb-0' }}>
        <Tab key="items" title="商品管理">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : items.length === 0 ? <Card><CardBody className="text-center py-12 text-gray-500">暂无商品</CardBody></Card> : <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {items.map(item => (
                <Card key={item.id} className="border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 transition-all">
                  <CardBody className="p-4 flex flex-col gap-4 h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{item.name}</h3>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{item.app?.app_name || '-'}</p>
                      </div>
                      <Chip size="sm" color={item.status === 1 ? 'success' : 'default'} variant="flat" className="flex-shrink-0">{item.status === 1 ? '上架' : '下架'}</Chip>
                    </div>

                    <p className="text-sm text-gray-500 line-clamp-2 min-h-10">{item.description || '暂无描述'}</p>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-content2">
                        <p className="text-xs text-gray-400">消耗</p>
                        <p className="font-semibold">{item.cost} 积分</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-content2">
                        <p className="text-xs text-gray-400">库存</p>
                        <p className="font-semibold">{item.stock === -1 ? '不限' : `${item.exchanged_count}/${item.stock}`}</p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-content2">
                      <p className="text-xs text-gray-400 mb-1">奖励</p>
                      <Chip size="sm" variant="flat" color="primary">{rewardLabel(item)}: {rewardDetail(item)}</Chip>
                    </div>

                    <div className="flex justify-end gap-2 mt-auto">
                      <Button size="sm" variant="flat" color="primary" startContent={<HiPencil className="w-4 h-4" />} onPress={() => openEdit(item)}>编辑</Button>
                      <Button size="sm" color="danger" variant="flat" startContent={<HiTrash className="w-4 h-4" />} onPress={() => deleteItem(item.id)}>删除</Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
            {itemsTotal > pageSize && <div className="flex justify-center py-4"><Pagination total={Math.ceil(itemsTotal / pageSize)} page={itemsPage} onChange={setItemsPage} /></div>}
          </>}
        </Tab>
        <Tab key="logs" title="兑换记录">
          {logs.length === 0 ? <Card><CardBody className="text-center py-12 text-gray-500">暂无兑换记录</CardBody></Card> : <Card><CardBody className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] whitespace-nowrap"><thead><tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50"><th className="px-4 py-3 text-left text-sm font-medium">时间</th><th className="px-4 py-3 text-left text-sm font-medium">应用</th><th className="px-4 py-3 text-left text-sm font-medium">用户</th><th className="px-4 py-3 text-left text-sm font-medium">商品</th><th className="px-4 py-3 text-left text-sm font-medium">消耗</th><th className="px-4 py-3 text-left text-sm font-medium">奖励</th><th className="px-4 py-3 text-left text-sm font-medium">IP</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"><td className="px-4 py-3 text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</td><td className="px-4 py-3 text-sm">{log.app?.app_name || '-'}</td><td className="px-4 py-3 text-sm">{log.app_user?.username || '-'}</td><td className="px-4 py-3 text-sm font-medium">{log.item_name}</td><td className="px-4 py-3 text-sm">{log.cost} 积分</td><td className="px-4 py-3 text-sm">{rewardLabel(log)}: {log.reward_value || log.card_no || '-'}</td><td className="px-4 py-3 text-sm text-gray-500">{log.ip || '-'}</td></tr>)}</tbody></table></div>{logsTotal > pageSize && <div className="flex justify-center py-4"><Pagination total={Math.ceil(logsTotal / pageSize)} page={logsPage} onChange={setLogsPage} /></div>}</CardBody></Card>}
        </Tab>
      </Tabs>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} placement="center" size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editing ? '编辑商品' : '新增商品'}</ModalHeader>
          <ModalBody className="space-y-3">
            <Select label="所属应用" selectedKeys={form.app_id ? [String(form.app_id)] : []} onChange={(e) => setForm({ ...form, app_id: Number(e.target.value), card_type_id: undefined })}>{apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}</Select>
            <Input label="商品名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Textarea label="商品描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input type="number" label="消耗积分" value={String(form.cost)} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
              <Select label="奖励类型" selectedKeys={[String(form.reward_type)]} onChange={(e) => setForm({ ...form, reward_type: Number(e.target.value) })}><SelectItem key="1">点数</SelectItem><SelectItem key="2">时长</SelectItem><SelectItem key="3">卡密</SelectItem></Select>
            </div>
            {form.reward_type === 1 && <Input type="number" label="奖励点数" value={String(form.reward_points)} onChange={(e) => setForm({ ...form, reward_points: Number(e.target.value) })} />}
            {form.reward_type === 2 && <Input type="number" label="奖励时长(分钟，-1为永久)" value={String(form.reward_duration)} onChange={(e) => setForm({ ...form, reward_duration: Number(e.target.value) })} />}
            {form.reward_type === 3 && <Select label="兑换发放卡种" selectedKeys={form.card_type_id ? [String(form.card_type_id)] : []} onChange={(e) => setForm({ ...form, card_type_id: Number(e.target.value) })}>{cardTypes.map(ct => <SelectItem key={String(ct.id)}>{ct.name}</SelectItem>)}</Select>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Input type="number" label="库存(-1不限)" value={String(form.stock)} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
              <Input type="number" label="排序" value={String(form.sort)} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} />
              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-3"><span>上架</span><Switch isSelected={form.status === 1} onValueChange={(v) => setForm({ ...form, status: v ? 1 : 0 })} /></div>
            </div>
          </ModalBody>
          <ModalFooter><Button variant="light" onPress={() => setModalOpen(false)}>取消</Button><Button color="primary" onPress={saveItem}>保存</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
