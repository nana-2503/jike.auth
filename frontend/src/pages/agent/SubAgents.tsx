import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Avatar,
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
  Checkbox,
  useDisclosure,
} from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'
import { qqAvatarUrl } from '../../utils/qqAvatar'
import { HiCurrencyDollar, HiPencil, HiPlus, HiSearch, HiTicket, HiTrash } from 'react-icons/hi'

interface SubAgent {
  id: number
  username: string
  nickname: string
  balance: number
  qq: string
  phone: string
  status: number
  remark: string
  created_at: string
}

interface AgentCardType {
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

const statusMap: Record<number, { label: string; color: 'success' | 'danger' }> = {
  1: { label: '正常', color: 'success' },
  2: { label: '禁用', color: 'danger' },
}

const emptyForm = {
  username: '',
  password: '',
  nickname: '',
  qq: '',
  phone: '',
  status: 1,
  remark: '',
}

export default function AgentSubAgents() {
  const { refreshProfile } = useOutletContext<{ agentInfo: any; refreshProfile: () => void }>()
  const [agents, setAgents] = useState<SubAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [saving, setSaving] = useState(false)

  const { isOpen: editOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const [editingAgent, setEditingAgent] = useState<SubAgent | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { isOpen: transferOpen, onOpen: onTransferOpen, onClose: onTransferClose } = useDisclosure()
  const [transferAgent, setTransferAgent] = useState<SubAgent | null>(null)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferRemark, setTransferRemark] = useState('')
  const [transferring, setTransferring] = useState(false)

  const { isOpen: cardTypesOpen, onOpen: onCardTypesOpen, onClose: onCardTypesClose } = useDisclosure()
  const [cardTypesAgent, setCardTypesAgent] = useState<SubAgent | null>(null)
  const [parentCardTypes, setParentCardTypes] = useState<AgentCardType[]>([])
  const [cardTypePerms, setCardTypePerms] = useState<Map<number, { enabled: boolean; price: number }>>(new Map())
  const [cardTypesLoading, setCardTypesLoading] = useState(false)
  const [savingCardTypes, setSavingCardTypes] = useState(false)

  const loadAgents = async (targetPage = page) => {
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listSubAgents(targetPage, 12, keyword || undefined)
      setAgents(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [page])

  const handleSearch = () => {
    if (page !== 1) {
      setPage(1)
    } else {
      loadAgents(1)
    }
  }

  const openCreate = () => {
    setEditingAgent(null)
    setForm(emptyForm)
    onEditOpen()
  }

  const openEdit = (agent: SubAgent) => {
    setEditingAgent(agent)
    setForm({
      username: agent.username,
      password: '',
      nickname: agent.nickname || '',
      qq: agent.qq || '',
      phone: agent.phone || '',
      status: agent.status,
      remark: agent.remark || '',
    })
    onEditOpen()
  }

  const saveAgent = async () => {
    if (!editingAgent && !form.username.trim()) {
      toast.error('请输入代理账号')
      return
    }
    if (!editingAgent && !form.password) {
      toast.error('请输入密码')
      return
    }
    setSaving(true)
    try {
      if (editingAgent) {
        const data: any = {
          nickname: form.nickname,
          qq: form.qq,
          phone: form.phone,
          status: form.status,
          remark: form.remark,
        }
        if (form.password) data.password = form.password
        await agentCenterApi.updateSubAgent(editingAgent.id, data)
        toast.success('更新成功')
      } else {
        await agentCenterApi.createSubAgent({
          username: form.username,
          password: form.password,
          nickname: form.nickname,
          qq: form.qq,
          phone: form.phone,
          remark: form.remark,
        })
        toast.success('添加成功')
      }
      onEditClose()
      loadAgents()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteAgent = async (agent: SubAgent) => {
    const ok = await confirm(`确定删除下级代理 "${agent.username}"？`, '删除下级代理')
    if (!ok) return
    try {
      await agentCenterApi.deleteSubAgent(agent.id)
      toast.success('删除成功')
      loadAgents()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const openTransfer = (agent: SubAgent) => {
    setTransferAgent(agent)
    setTransferAmount('')
    setTransferRemark('')
    onTransferOpen()
  }

  const transfer = async () => {
    if (!transferAgent) return
    const amount = Number(transferAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('请输入大于 0 的转账金额')
      return
    }
    setTransferring(true)
    try {
      await agentCenterApi.transferToSubAgent(transferAgent.id, amount, transferRemark || undefined)
      toast.success('转账成功')
      onTransferClose()
      refreshProfile()
      loadAgents()
    } catch (e: any) {
      toast.error(e.message || '转账失败')
    } finally {
      setTransferring(false)
    }
  }

  const openCardTypes = async (agent: SubAgent) => {
    setCardTypesAgent(agent)
    setParentCardTypes([])
    setCardTypePerms(new Map())
    setCardTypesLoading(true)
    onCardTypesOpen()
    try {
      const [parentRes, childRes]: any[] = await Promise.all([
        agentCenterApi.listCardTypes(),
        agentCenterApi.listSubAgentCardTypes(agent.id),
      ])
      const parentList = parentRes.data || []
      const childList = childRes.data || []
      const permMap = new Map<number, { enabled: boolean; price: number }>()
      for (const item of parentList) {
        permMap.set(item.card_type_id, { enabled: false, price: item.price || 0 })
      }
      for (const item of childList) {
        if (permMap.has(item.card_type_id)) {
          permMap.set(item.card_type_id, { enabled: true, price: item.price || 0 })
        }
      }
      setParentCardTypes(parentList)
      setCardTypePerms(permMap)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setCardTypesLoading(false)
    }
  }

  const toggleCardType = (cardTypeId: number, enabled: boolean) => {
    const next = new Map(cardTypePerms)
    const current = next.get(cardTypeId) || { enabled: false, price: 0 }
    next.set(cardTypeId, { ...current, enabled })
    setCardTypePerms(next)
  }

  const updateCardTypePrice = (cardTypeId: number, price: string) => {
    const next = new Map(cardTypePerms)
    const current = next.get(cardTypeId) || { enabled: false, price: 0 }
    next.set(cardTypeId, { ...current, price: Number(price) || 0 })
    setCardTypePerms(next)
  }

  const saveCardTypes = async () => {
    if (!cardTypesAgent) return
    setSavingCardTypes(true)
    try {
      const cardTypes: { card_type_id: number; price: number }[] = []
      cardTypePerms.forEach((value, key) => {
        if (value.enabled) cardTypes.push({ card_type_id: key, price: value.price })
      })
      await agentCenterApi.setSubAgentCardTypes(cardTypesAgent.id, cardTypes)
      toast.success('授权已保存')
      onCardTypesClose()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSavingCardTypes(false)
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes === -1) return '永久'
    if (minutes === 0) return '不充值'
    if (minutes < 60) return `${minutes}分钟`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
    return `${Math.floor(minutes / 1440)}天`
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Input
          placeholder="搜索账号/昵称/QQ/手机"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          startContent={<HiSearch className="w-4 h-4 text-gray-400" />}
          className="flex-1 min-w-[220px]"
          size="sm"
        />
        <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
        <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />} onPress={openCreate}>
          添加下级
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : agents.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无下级代理</CardBody></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Card key={agent.id} className="border border-transparent hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        classNames={{ base: 'w-10 h-10 rounded-lg' }}
                        src={qqAvatarUrl(agent.qq)}
                        name={agent.nickname || agent.username}
                        size="md"
                        imgProps={{ referrerPolicy: 'no-referrer' }}
                      />
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{agent.username}</h3>
                        <Chip size="sm" variant="flat" color={statusMap[agent.status]?.color || 'danger'}>
                          {statusMap[agent.status]?.label || '未知'}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                      <span className="text-xs text-gray-400">昵称</span>
                      <p className="truncate">{agent.nickname || '-'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                      <span className="text-xs text-gray-400">余额</span>
                      <p className="text-primary font-medium">¥{agent.balance.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button size="sm" variant="flat" color="primary" startContent={<HiPencil className="w-4 h-4" />} onPress={() => openEdit(agent)}>编辑</Button>
                    <Button size="sm" variant="flat" color="secondary" startContent={<HiTicket className="w-4 h-4" />} onPress={() => openCardTypes(agent)}>卡种</Button>
                    <Button size="sm" variant="flat" color="success" startContent={<HiCurrencyDollar className="w-4 h-4" />} onPress={() => openTransfer(agent)}>转账</Button>
                    <Button size="sm" variant="flat" color="danger" startContent={<HiTrash className="w-4 h-4" />} onPress={() => deleteAgent(agent)}>删除</Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
          {total > 12 && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} /></div>}
        </>
      )}

      <Drawer isOpen={editOpen} onClose={onEditClose} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">{editingAgent ? '编辑下级代理' : '添加下级代理'}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onEditClose}>取消</Button>
              <Button size="sm" color="primary" onPress={saveAgent} isLoading={saving}>保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto">
            <div className="space-y-4">
              <Input
                label="代理账号"
                size="sm"
                variant="bordered"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                isRequired
                isDisabled={!!editingAgent}
              />
              <Input
                label={editingAgent ? '新密码' : '密码'}
                type="password"
                size="sm"
                variant="bordered"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                isRequired={!editingAgent}
                placeholder={editingAgent ? '留空则不修改' : ''}
              />
              <Input label="昵称" size="sm" variant="bordered" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="QQ" size="sm" variant="bordered" value={form.qq} onChange={(e) => setForm({ ...form, qq: e.target.value })} />
                <Input label="手机" size="sm" variant="bordered" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              {editingAgent && (
                <Select label="状态" size="sm" variant="bordered" selectedKeys={[String(form.status)]} onChange={(e) => setForm({ ...form, status: Number(e.target.value) })}>
                  <SelectItem key="1">正常</SelectItem>
                  <SelectItem key="2">禁用</SelectItem>
                </Select>
              )}
              <Textarea label="备注" size="sm" variant="bordered" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer isOpen={transferOpen} onClose={onTransferClose} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">转账给下级</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onTransferClose}>取消</Button>
              <Button size="sm" color="primary" onPress={transfer} isLoading={transferring}>确认</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto">
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">下级代理</p>
                <p className="font-medium">{transferAgent?.username} ({transferAgent?.nickname || '-'})</p>
              </div>
              <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">下级余额</p>
                <p className="text-2xl font-bold text-primary">¥{transferAgent?.balance.toFixed(2)}</p>
              </div>
              <Input
                label="转账金额"
                type="number"
                size="sm"
                variant="bordered"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                startContent="¥"
              />
              <Textarea label="备注" size="sm" variant="bordered" value={transferRemark} onChange={(e) => setTransferRemark(e.target.value)} />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer isOpen={cardTypesOpen} onClose={onCardTypesClose} placement="right" size="lg" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">卡种授权 - {cardTypesAgent?.username}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="bordered" onPress={onCardTypesClose}>取消</Button>
              <Button size="sm" color="primary" onPress={saveCardTypes} isLoading={savingCardTypes}>保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto">
            {cardTypesLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : parentCardTypes.length === 0 ? (
              <div className="text-center text-gray-500 py-12">暂无可授权卡种</div>
            ) : (
              <div className="space-y-3">
                {parentCardTypes.map((item) => {
                  const ct = item.card_type
                  const perm = cardTypePerms.get(item.card_type_id) || { enabled: false, price: item.price || 0 }
                  return (
                    <Card key={item.card_type_id} shadow="sm" className={perm.enabled ? 'border border-success' : ''}>
                      <CardBody className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            isSelected={perm.enabled}
                            onValueChange={(v) => toggleCardType(item.card_type_id, v)}
                            className="mt-1"
                            color="success"
                            classNames={{ icon: 'text-white' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-base">{ct?.name || `卡种 ${item.card_type_id}`}</span>
                              {ct?.prefix && (
                                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                                  {ct.prefix}
                                </span>
                              )}
                            </div>
                            {ct && (
                              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                <div className="text-gray-600 dark:text-gray-400">
                                  充值点数: <span className="text-gray-900 dark:text-white font-medium">{ct.points}</span>
                                </div>
                                <div className="text-gray-600 dark:text-gray-400">
                                  充值时间: <span className="text-gray-900 dark:text-white font-medium">{formatDuration(ct.duration)}</span>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">下级单价:</span>
                              <Input
                                type="number"
                                size="sm"
                                variant="bordered"
                                value={String(perm.price)}
                                onChange={(e) => updateCardTypePrice(item.card_type_id, e.target.value)}
                                isDisabled={!perm.enabled}
                                startContent="¥"
                                className="max-w-[120px]"
                                min={item.price}
                                title={`下级代理单价不得低于您的拿货价 ¥${Number(item.price || 0).toFixed(2)}`}
                              />
                              <span className="text-xs text-gray-400">我的单价 ¥{item.price.toFixed(2)}</span>
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
}
