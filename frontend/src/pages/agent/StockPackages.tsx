import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Input,
  Pagination,
  Select,
  SelectItem,
  Spinner,
  Textarea,
  useDisclosure,
} from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'
import { HiPlus } from 'react-icons/hi'

interface SubAgent {
  id: number
  username: string
  nickname: string
}

interface CardTypePermission {
  card_type_id: number
  price: number
  card_type?: {
    id: number
    name: string
    prefix: string
    points: number
    duration: number
  }
}

interface StockPackage {
  id: number
  name: string
  total_cost: number
  status: number
  remark: string
  assigned_agent?: SubAgent
  items?: Array<CardTypePermission & { total_count: number; used_count: number }>
  created_at: string
}

const formatDuration = (minutes?: number) => {
  if (minutes === -1) return '永久'
  if (!minutes) return '不充值'
  if (minutes < 60) return `${minutes}分钟`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
  return `${Math.floor(minutes / 1440)}天`
}

export default function AgentStockPackages() {
  const [packages, setPackages] = useState<StockPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const [subAgents, setSubAgents] = useState<SubAgent[]>([])
  const [cardTypes, setCardTypes] = useState<CardTypePermission[]>([])
  const [name, setName] = useState('')
  const [assignedAgentId, setAssignedAgentId] = useState('')
  const [remark, setRemark] = useState('')
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [assignPackage, setAssignPackage] = useState<StockPackage | null>(null)

  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: assignOpen, onOpen: onAssignOpen, onClose: onAssignClose } = useDisclosure()

  const loadPackages = async () => {
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listStockPackages(page, 10)
      setPackages(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPackages()
  }, [page])

  const openCreate = async () => {
    setName('')
    setAssignedAgentId('')
    setRemark('')
    setCounts({})
    onOpen()
    try {
      const cardTypesRes: any = await agentCenterApi.listCardTypes()
      setCardTypes(cardTypesRes.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    }
  }

  const selectedItems = useMemo(() => {
    return cardTypes
      .map((ct) => ({ ...ct, count: counts[ct.card_type_id] || 0 }))
      .filter((ct) => ct.count > 0)
  }, [cardTypes, counts])

  const totalCost = selectedItems.reduce((sum, item) => sum + item.price * item.count, 0)

  const savePackage = async () => {
    if (!name.trim()) {
      toast.error('请输入卡包名称')
      return
    }
    if (selectedItems.length === 0) {
      toast.error('请至少设置一个卡种次数')
      return
    }

    setSaving(true)
    try {
      await agentCenterApi.createStockPackage({
        name,
        remark,
        items: selectedItems.map((item) => ({ card_type_id: item.card_type_id, count: item.count })),
      })
      toast.success('库存卡包已创建')
      onClose()
      loadPackages()
    } catch (e: any) {
      toast.error(e.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const openAssign = async (pkg: StockPackage) => {
    setAssignPackage(pkg)
    setAssignedAgentId('')
    onAssignOpen()
    try {
      const res: any = await agentCenterApi.listSubAgents(1, 100)
      setSubAgents(res.data.list || [])
    } catch (e: any) {
      toast.error(e.message || '加载下级代理失败')
    }
  }

  const assign = async () => {
    if (!assignPackage) return
    if (!assignedAgentId) {
      toast.error('请选择下级代理')
      return
    }
    setAssigning(true)
    try {
      await agentCenterApi.assignStockPackage(assignPackage.id, Number(assignedAgentId))
      toast.success('发放成功')
      onAssignClose()
      loadPackages()
    } catch (e: any) {
      toast.error(e.message || '发放失败')
    } finally {
      setAssigning(false)
    }
  }

  const getRefundAmount = (pkg: StockPackage) => {
    return (pkg.items || []).reduce((sum, item) => {
      const remaining = Math.max(0, (item.total_count || 0) - (item.used_count || 0))
      return sum + remaining * (item.price || 0)
    }, 0)
  }

  const recycle = async (pkg: StockPackage) => {
    const ok = await confirm(`确定回收库存卡包 "${pkg.name}"？回收后下级代理将无法继续使用。`, '回收库存卡包')
    if (!ok) return
    try {
      await agentCenterApi.recycleStockPackage(pkg.id)
      toast.success('回收成功')
      loadPackages()
    } catch (e: any) {
      toast.error(e.message || '回收失败')
    }
  }

  const deletePackage = async (pkg: StockPackage) => {
    const refund = getRefundAmount(pkg)
    const ok = await confirm(`确定删除库存卡包 "${pkg.name}"？将按剩余次数退回 ¥${refund.toFixed(2)}。`, '删除库存卡包')
    if (!ok) return
    try {
      const res: any = await agentCenterApi.deleteStockPackage(pkg.id)
      toast.success(`删除成功，已退回 ¥${Number(res.data?.refund || 0).toFixed(2)}`)
      loadPackages()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const toggleStatus = async (pkg: StockPackage) => {
    const nextLabel = pkg.status === 1 ? '禁用' : '启用'
    const ok = await confirm(`确定${nextLabel}库存卡包 "${pkg.name}"？`, `${nextLabel}库存卡包`)
    if (!ok) return
    try {
      const res: any = await agentCenterApi.toggleStockPackageStatus(pkg.id)
      const nextStatus = res.data?.status || (pkg.status === 1 ? 2 : 1)
      setPackages((prev) => prev.map((item) => item.id === pkg.id ? { ...item, status: nextStatus } : item))
      toast.success(`${nextLabel}成功`)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />} onPress={openCreate}>
          创建库存卡包
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : packages.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无库存卡包</CardBody></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className="border border-transparent hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                <CardBody className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{pkg.name}</h3>
                      <p className="text-xs text-gray-400 truncate">
                        {pkg.assigned_agent ? `已发放给: ${pkg.assigned_agent.username}` : '未发放'}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      <Chip size="sm" color={pkg.status === 1 ? 'success' : 'danger'} variant="flat">
                        {pkg.status === 1 ? '启用' : '禁用'}
                      </Chip>
                      <Chip size="sm" color={pkg.assigned_agent ? 'primary' : 'warning'} variant="flat">
                        {pkg.assigned_agent ? '已发放' : '未发放'}
                      </Chip>
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-content2 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">预扣金额</span>
                      <span className="font-semibold text-primary">¥{Number(pkg.total_cost || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(pkg.items || []).map((item) => {
                      const remain = (item.total_count || 0) - (item.used_count || 0)
                      return (
                        <div key={item.card_type_id} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-content3 px-3 py-2 text-sm">
                          <span className="truncate">{item.card_type?.name || `卡种 ${item.card_type_id}`}</span>
                          <span className="text-gray-500">剩余 {remain}/{item.total_count}</span>
                        </div>
                      )
                    })}
                  </div>
                  {pkg.remark && <p className="text-xs text-gray-400 line-clamp-2">{pkg.remark}</p>}
                  <div className="flex justify-end gap-2">
                    <Button size="sm" color={pkg.status === 1 ? 'warning' : 'success'} variant="flat" onPress={() => toggleStatus(pkg)}>
                      {pkg.status === 1 ? '禁用' : '启用'}
                    </Button>
                    {pkg.assigned_agent ? (
                      <Button size="sm" color="warning" variant="flat" onPress={() => recycle(pkg)}>回收</Button>
                    ) : (
                      <>
                      <Button size="sm" color="primary" variant="flat" onPress={() => openAssign(pkg)}>发放</Button>
                        <Button size="sm" color="danger" variant="flat" onPress={() => deletePackage(pkg)}>删除</Button>
                      </>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
          {total > 10 && <div className="flex justify-center"><Pagination page={page} total={Math.ceil(total / 10)} onChange={setPage} /></div>}
        </>
      )}

      <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="lg" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">创建库存卡包</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onClose}>取消</Button>
              <Button size="sm" color="primary" onPress={savePackage} isLoading={saving}>创建</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto">
            <div className="space-y-4">
              <Input label="卡包名称" size="sm" variant="bordered" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="space-y-3">
                {cardTypes.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">暂无可用卡种</div>
                ) : cardTypes.map((ct) => (
                  <Card key={ct.card_type_id} shadow="sm">
                    <CardBody className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{ct.card_type?.name || `卡种 ${ct.card_type_id}`}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            单价 ¥{ct.price.toFixed(2)} · {ct.card_type?.prefix || '无卡头'} · {formatDuration(ct.card_type?.duration)}
                          </div>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          size="sm"
                          label="次数"
                          value={String(counts[ct.card_type_id] || 0)}
                          onChange={(e) => setCounts({ ...counts, [ct.card_type_id]: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-28 flex-shrink-0"
                        />
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
              <Card className="bg-primary/5">
                <CardBody className="p-4">
                  <div className="flex justify-between items-center">
                    <span>预计扣除代理余额</span>
                    <span className="text-xl font-bold text-primary">¥{totalCost.toFixed(2)}</span>
                  </div>
                </CardBody>
              </Card>
              <Textarea label="备注" size="sm" variant="bordered" value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer isOpen={assignOpen} onClose={onAssignClose} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">发放库存卡包</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onAssignClose}>取消</Button>
              <Button size="sm" color="primary" onPress={assign} isLoading={assigning}>发放</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto">
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">卡包</p>
                <p className="font-medium">{assignPackage?.name}</p>
              </div>
              <Select label="下级代理" size="sm" variant="bordered" selectedKeys={assignedAgentId ? [assignedAgentId] : []} onChange={(e) => setAssignedAgentId(e.target.value)}>
                {subAgents.map((agent) => {
                  const label = `${agent.username}${agent.nickname ? ` (${agent.nickname})` : ''}`
                  return <SelectItem key={String(agent.id)} textValue={label}>{label}</SelectItem>
                })}
              </Select>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
