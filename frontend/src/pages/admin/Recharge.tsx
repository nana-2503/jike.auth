import { useState, useEffect } from 'react'
import {
  Card, CardBody, Tabs, Tab, Input, Button,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure, Pagination, Select, SelectItem, Spinner,
} from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'

interface RechargeConfig {
  epay_url: string; epay_pid: string; epay_key: string
  notify_url: string; return_url: string
}
interface Pkg {
  id: number; name: string; amount: number; balance_amount: number
  bonus: string; sort: number; status: number
}
interface Order {
  id: number; order_no: string; amount: number; balance_amount: number
  pay_type: string; status: number; paid_at: string | null; created_at: string
  user?: { id: number; username: string; nickname: string }
  package?: { name: string }
}

export default function AdminRecharge() {
  const [tab, setTab] = useState('config')
  const [config, setConfig] = useState<RechargeConfig>({ epay_url: '', epay_pid: '', epay_key: '', notify_url: '', return_url: '' })
  const [saving, setSaving] = useState(false)
  const [packages, setPackages] = useState<Pkg[]>([])
  const [editPkg, setEditPkg] = useState<Partial<Pkg>>({})
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersStatus, setOrdersStatus] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)

  useEffect(() => {
    if (tab === 'config') loadConfig()
    else if (tab === 'packages') loadPackages()
    else if (tab === 'orders') loadOrders()
  }, [tab, ordersPage, ordersStatus])

  const loadConfig = async () => {
    try {
      const res: any = await adminApi.getRechargeConfig()
      if (res.data) setConfig({ ...config, ...res.data })
    } catch {}
  }
  const loadPackages = async () => {
    try {
      const res: any = await adminApi.getRechargePackages()
      setPackages(res.data || [])
    } catch {}
  }
  const loadOrders = async () => {
    setLoadingOrders(true)
    try {
      const res: any = await adminApi.getRechargeOrders(ordersPage, 20, ordersStatus || undefined)
      setOrders(res.data.list || [])
      setOrdersTotal(res.data.total || 0)
    } catch {}
    finally { setLoadingOrders(false) }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await adminApi.saveRechargeConfig(config)
      toast.success('保存成功')
    } catch { toast.error('保存失败') }
    finally { setSaving(false) }
  }

  const handleSavePkg = async () => {
    try {
      if (editPkg.id) {
        await adminApi.updateRechargePackage(editPkg.id, editPkg)
      } else {
        await adminApi.createRechargePackage(editPkg)
      }
      toast.success('保存成功')
      onClose()
      loadPackages()
    } catch { toast.error('保存失败') }
  }

  const handleDeletePkg = async (id: number) => {
    if (!await confirm('确定删除该套餐？')) return
    try {
      await adminApi.deleteRechargePackage(id)
      toast.success('删除成功')
      loadPackages()
    } catch { toast.error('删除失败') }
  }

  const handleComplete = async (id: number) => {
    if (!await confirm('确定手动补单？将直接为用户充值余额。')) return
    try {
      await adminApi.completeRechargeOrder(id)
      toast.success('补单成功')
      loadOrders()
    } catch { toast.error('补单失败') }
  }

  return (
    <div className="space-y-4">
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as string)} classNames={{ panel: 'pt-0' }}>
        <Tab key="config" title="支付配置">
          <Card>
            <CardBody className="space-y-4 p-6">
              <Input label="易支付API地址" placeholder="https://pay.example.com" value={config.epay_url} onChange={(e) => setConfig({ ...config, epay_url: e.target.value })} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="商户ID" value={config.epay_pid} onChange={(e) => setConfig({ ...config, epay_pid: e.target.value })} />
                <Input label="商户密钥" type="password" value={config.epay_key} onChange={(e) => setConfig({ ...config, epay_key: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="异步回调地址" placeholder="https://yourdomain.com/api/recharge/notify" value={config.notify_url} onChange={(e) => setConfig({ ...config, notify_url: e.target.value })} />
                <Input label="同步回调地址" placeholder="https://yourdomain.com/api/recharge/return" value={config.return_url} onChange={(e) => setConfig({ ...config, return_url: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button color="primary" onPress={handleSaveConfig} isLoading={saving}>保存配置</Button>
              </div>
            </CardBody>
          </Card>
        </Tab>

        <Tab key="packages" title="充值套餐">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button color="primary" size="sm" onPress={() => { setEditPkg({ name: '', amount: 0, balance_amount: 0, bonus: '', sort: 0, status: 1 }); onOpen() }}>新增套餐</Button>
            </div>
            {packages.length === 0 ? (
              <Card><CardBody className="text-center py-12 text-gray-500">暂无套餐</CardBody></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {packages.map(p => (
                  <Card key={p.id} className={p.status !== 1 ? 'opacity-60' : ''}>
                    <CardBody className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-lg">{p.name}</span>
                        <Chip size="sm" color={p.status === 1 ? 'success' : 'default'} variant="flat">{p.status === 1 ? '启用' : '禁用'}</Chip>
                      </div>
                      <div className="text-center py-2">
                        <p className="text-3xl font-bold text-primary">¥{p.amount}</p>
                        <p className="text-sm text-gray-500 mt-1">到账余额: <span className="text-primary font-medium">{p.balance_amount}</span></p>
                      </div>
                      {p.bonus && <p className="text-xs text-center text-warning-600">{p.bonus}</p>}
                      <div className="text-xs text-gray-400 text-center">排序: {p.sort}</div>
                      <div className="flex gap-2 justify-end pt-1">
                        <Button size="sm" variant="flat" onPress={() => { setEditPkg(p); onOpen() }}>编辑</Button>
                        <Button size="sm" variant="flat" color="danger" onPress={() => handleDeletePkg(p.id)}>删除</Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Tab>

        <Tab key="orders" title="充值订单">
          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <Select placeholder="全部状态" selectedKeys={ordersStatus ? [ordersStatus] : []} onChange={(e) => { setOrdersStatus(e.target.value); setOrdersPage(1) }} className="w-36" size="sm">
                <SelectItem key="0">待支付</SelectItem>
                <SelectItem key="1">已支付</SelectItem>
                <SelectItem key="2">已取消</SelectItem>
              </Select>
              <Button size="sm" variant="flat" onPress={loadOrders}>刷新</Button>
            </div>
            {loadingOrders ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : orders.length === 0 ? (
              <Card><CardBody className="text-center py-12 text-gray-500">暂无订单</CardBody></Card>
            ) : (
              <>
                <Table aria-label="充值订单">
                  <TableHeader>
                    <TableColumn>订单号</TableColumn>
                    <TableColumn>用户</TableColumn>
                    <TableColumn>套餐</TableColumn>
                    <TableColumn>金额</TableColumn>
                    <TableColumn>到账</TableColumn>
                    <TableColumn>支付方式</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>时间</TableColumn>
                    <TableColumn>操作</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {orders.map(o => (
                      <TableRow key={o.id}>
                        <TableCell><span className="text-xs font-mono">{o.order_no}</span></TableCell>
                        <TableCell>{o.user?.nickname || o.user?.username || '-'}</TableCell>
                        <TableCell>{o.package?.name || '-'}</TableCell>
                        <TableCell>¥{o.amount}</TableCell>
                        <TableCell>{o.balance_amount}</TableCell>
                        <TableCell>{o.pay_type === 'alipay' ? '支付宝' : '微信'}</TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat" color={o.status === 1 ? 'success' : o.status === 0 ? 'warning' : 'default'}>
                            {o.status === 0 ? '待支付' : o.status === 1 ? '已支付' : '已取消'}
                          </Chip>
                        </TableCell>
                        <TableCell>{new Date(o.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          {o.status === 0 && <Button size="sm" variant="flat" color="primary" onPress={() => handleComplete(o.id)}>补单</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {ordersTotal > 20 && <div className="flex justify-center"><Pagination total={Math.ceil(ordersTotal / 20)} page={ordersPage} onChange={setOrdersPage} /></div>}
              </>
            )}
          </div>
        </Tab>
      </Tabs>

      <Modal isOpen={isOpen} onClose={onClose} placement="center">
        <ModalContent>
          <ModalHeader>{editPkg.id ? '编辑套餐' : '新增套餐'}</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="套餐名称" value={editPkg.name || ''} onChange={(e) => setEditPkg({ ...editPkg, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="金额(元)" type="number" value={String(editPkg.amount || '')} onChange={(e) => setEditPkg({ ...editPkg, amount: Number(e.target.value) })} />
              <Input label="到账余额" type="number" value={String(editPkg.balance_amount || '')} onChange={(e) => setEditPkg({ ...editPkg, balance_amount: Number(e.target.value) })} />
            </div>
            <Input label="赠送说明" placeholder="可选" value={editPkg.bonus || ''} onChange={(e) => setEditPkg({ ...editPkg, bonus: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="排序" type="number" value={String(editPkg.sort || 0)} onChange={(e) => setEditPkg({ ...editPkg, sort: Number(e.target.value) })} />
              <Select label="状态" selectedKeys={[String(editPkg.status ?? 1)]} onChange={(e) => setEditPkg({ ...editPkg, status: Number(e.target.value) })}>
                <SelectItem key="1">启用</SelectItem>
                <SelectItem key="0">禁用</SelectItem>
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="primary" onPress={handleSavePkg}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
