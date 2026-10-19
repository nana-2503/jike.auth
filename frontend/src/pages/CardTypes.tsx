import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Select, SelectItem, Tooltip,
  Drawer, DrawerContent, DrawerHeader, DrawerBody, Input, Textarea,
  useDisclosure,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { RBtn } from '../components/ResponsiveButton'
import { HiCreditCard, HiPencil, HiTrash, HiPlus, HiSave } from 'react-icons/hi'
import { FiCopy } from 'react-icons/fi'

interface CardType {
  id: number
  app_id: number
  app?: { id: number; app_name: string }
  category: number
  name: string
  prefix: string
  points: number
  rebate_points: number
  duration: number
  gen_rule: number
  max_use: number
  max_user_use: number
  channels: number
  features: number
  card_length: number
  stock_warn: number
  remark: string
  created_at: string
}

interface App {
  id: number
  app_name: string
}

const GEN_RULE_MAP: Record<number, string> = {
  1: '小写字母', 2: '大写字母', 3: '大小写字母',
  4: '小写+数字', 5: '大写+数字', 6: '大小写+数字',
}

const GEN_RULES = [
  { key: '1', label: '小写字母' },
  { key: '2', label: '大写字母' },
  { key: '3', label: '大小写字母' },
  { key: '4', label: '小写字母+数字' },
  { key: '5', label: '大写字母+数字' },
  { key: '6', label: '大小写字母+数字' },
]

const DURATION_PRESETS = [
  { label: '不充值', value: 0 },
  { label: '1天', value: 1440 },
  { label: '3天', value: 4320 },
  { label: '7天', value: 10080 },
  { label: '15天', value: 21600 },
  { label: '1个月', value: 43200 },
  { label: '3个月', value: 129600 },
  { label: '6个月', value: 259200 },
  { label: '1年', value: 525600 },
  { label: '永久', value: -1 },
]

const formatDuration = (minutes: number) => {
  if (minutes === -1) return '永久'
  if (minutes === 0) return '不充值'
  if (minutes < 60) return `${minutes}分钟`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
  if (minutes < 43200) return `${Math.floor(minutes / 1440)}天`
  if (minutes < 525600) return `${Math.floor(minutes / 43200)}个月`
  return `${Math.floor(minutes / 525600)}年`
}

export default function CardTypes() {
  const navigate = useNavigate()
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(0) // 0 表示全部应用
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [appsLoading, setAppsLoading] = useState(true)
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  
  // 编辑表单状态
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '', prefix: '', points: 0, rebate_points: 0, duration: 0, gen_rule: 6, category: 1,
    max_use: 1, max_user_use: 1, channels: 1, features: 1,
    unbind_day: -1, unbind_week: -1, unbind_month: -1, unbind_quarter: -1, unbind_halfy: -1, unbind_year: -1, unbind_total: -1,
    card_length: 16, stock_warn: 0, extra_data: '', remark: '', withdraw_price: 0
  })
  
  const isNewCardType = editingId === null

  useEffect(() => {
    setAppsLoading(true)
    userApi.listApps(1, 100).then((res: any) => {
      const list = res.data.list || []
      setApps(list)
    }).finally(() => setAppsLoading(false))
  }, [])

  const fetchCardTypes = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listCardTypes(selectedAppId === 0 ? null : selectedAppId, page, 12)
      setCardTypes(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCardTypes() }, [page, selectedAppId])

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这个卡种吗？')) return
    try {
      await userApi.deleteCardType(id)
      toast.success('删除成功')
      fetchCardTypes()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const copyToClipboard = (text: string | number) => {
    navigator.clipboard.writeText(String(text))
    toast.success('已复制到剪贴板')
  }

  const handleEdit = (id: number) => {
    setEditingId(id)
    userApi.getCardType(id).then((res: any) => {
      const c = res.data
      setFormData({
        name: c.name || '', prefix: c.prefix || '', points: c.points || 0, rebate_points: c.rebate_points || 0,
        duration: c.duration || 0, gen_rule: c.gen_rule || 6, category: c.category || 1,
        max_use: c.max_use || 1, max_user_use: c.max_user_use || 1,
        channels: c.channels || 1, features: c.features || 1,
        unbind_day: c.unbind_day ?? -1, unbind_week: c.unbind_week ?? -1,
        unbind_month: c.unbind_month ?? -1, unbind_quarter: c.unbind_quarter ?? -1, unbind_halfy: c.unbind_halfy ?? -1,
        unbind_year: c.unbind_year ?? -1, unbind_total: c.unbind_total ?? -1,
        card_length: c.card_length || 16, stock_warn: c.stock_warn || 0, extra_data: c.extra_data || '', remark: c.remark || '',
        withdraw_price: c.withdraw_price || 0
      })
      onEditOpen()
    }).catch(() => toast.error('获取卡种信息失败'))
  }

  const handleNew = () => {
    if (isAllApps) {
      toast.error('请先选择一个应用')
      return
    }
    setEditingId(null)
    setFormData({
      name: '', prefix: '', points: 0, rebate_points: 0, duration: 0, gen_rule: 6, category: 1,
      max_use: 1, max_user_use: 1, channels: 1, features: 1,
      unbind_day: -1, unbind_week: -1, unbind_month: -1, unbind_quarter: -1, unbind_halfy: -1, unbind_year: -1, unbind_total: -1,
      card_length: 16, stock_warn: 0, extra_data: '', remark: '', withdraw_price: 0
    })
    onEditOpen()
  }

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('请输入卡种名称'); return }
    if (formData.card_length < 5) { toast.error('卡号长度最少5位'); return }
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (isNewCardType) data.app_id = selectedAppId
      
      if (isNewCardType) {
        await userApi.createCardType(data)
        toast.success('创建成功')
      } else {
        await userApi.updateCardType(editingId!, data)
        toast.success('保存成功')
      }
      onEditClose()
      fetchCardTypes()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const isAllApps = selectedAppId === 0 || selectedAppId === null

  return (
    <div className="space-y-4">
      {/* 顶部筛选栏 */}
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <Select 
          placeholder="全部应用" 
          selectedKeys={selectedAppId !== null && selectedAppId !== 0 ? [String(selectedAppId)] : []}
          onChange={(e) => { setSelectedAppId(e.target.value === '' ? 0 : Number(e.target.value)); setPage(1) }}
          className="w-full md:w-64" 
          size="sm"
          isLoading={appsLoading}
        >
          {apps.map(app => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        {!isAllApps && (
          <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />}
            onPress={handleNew}>添加卡种</Button>
        )}
      </div>

      {/* 卡种列表 */}
      {renderCardTypeList()}

      {/* 编辑卡种 Drawer */}
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>{isNewCardType ? '添加卡种' : '编辑卡种'}</span>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">
                {isNewCardType ? '创建' : '保存'}
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-sm font-semibold mb-3">基本信息</h3>
                <div className="space-y-4">
                  <Select label="卡种分类" selectedKeys={[String(formData.category)]}
                    onChange={(e) => {
                      const cat = Number(e.target.value)
                      setFormData({ ...formData, category: cat, ...(cat === 2 ? { max_use: 1, max_user_use: 1 } : {}) })
                    }} size="sm" variant="bordered">
                    <SelectItem key="1">充值卡</SelectItem>
                    <SelectItem key="2">登录卡</SelectItem>
                  </Select>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="卡种名称" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} isRequired size="sm" variant="bordered" />
                    <Input label="附加卡头" value={formData.prefix} onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                      placeholder="生成卡号时的前缀" size="sm" variant="bordered" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="充值点数" type="number" value={String(formData.points)}
                      onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })} size="sm" variant="bordered" />
                    <div>
                      <Input label="充值时间(分钟)" type="number" value={String(formData.duration)}
                        onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                        description="0=不充值时间, -1=永久" size="sm" variant="bordered" />
                      <div className="flex flex-wrap gap-1 mt-2">
                        {DURATION_PRESETS.map(p => (
                          <Button key={p.value} size="sm" variant={formData.duration === p.value ? 'solid' : 'flat'}
                            color={formData.duration === p.value ? 'primary' : 'default'}
                            onPress={() => setFormData({ ...formData, duration: p.value })}>{p.label}</Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select label="制卡规则" selectedKeys={[String(formData.gen_rule)]}
                      onChange={(e) => setFormData({ ...formData, gen_rule: Number(e.target.value) })} size="sm" variant="bordered">
                      {GEN_RULES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
                    </Select>
                    <Input label="卡号长度" type="number" min={5} value={String(formData.card_length)}
                      onChange={(e) => setFormData({ ...formData, card_length: Math.max(5, Number(e.target.value)) })}
                      description="最少5位" size="sm" variant="bordered" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="可充值次数" type="number" min={1} value={String(formData.max_use)}
                      onChange={(e) => setFormData({ ...formData, max_use: Number(e.target.value) })} size="sm" variant="bordered"
                      className={formData.category === 2 ? 'hidden' : ''} />
                    <Input label="每用户可充值次数" type="number" min={1} value={String(formData.max_user_use)}
                      onChange={(e) => setFormData({ ...formData, max_user_use: Number(e.target.value) })} size="sm" variant="bordered"
                      className={formData.category === 2 ? 'hidden' : ''} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="通道数量" type="number" min={1} value={String(formData.channels)}
                      onChange={(e) => setFormData({ ...formData, channels: Number(e.target.value) })} size="sm" variant="bordered" />
                    <Input label="特征数量" type="number" min={1} value={String(formData.features)}
                      onChange={(e) => setFormData({ ...formData, features: Number(e.target.value) })} size="sm" variant="bordered" />
                  </div>
                </div>
              </div>

              {/* 解绑设置 */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-sm font-semibold mb-3">解绑设置</h3>
                <p className="text-sm text-gray-500 mb-3">-1 表示无限次数，充值后覆盖用户的解绑设置</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

              {/* 拓展数据 */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-sm font-semibold mb-3">拓展数据</h3>
                <div className="space-y-4">
                  <Input label="消费返利积分" type="number" min={0} value={String(formData.rebate_points)}
                    onChange={(e) => setFormData({ ...formData, rebate_points: Math.max(0, Number(e.target.value)) })}
                    description="该卡充值成功后，直接上级获得的固定返利积分，0=不返利" size="sm" variant="bordered" />
                  <Input label="提卡单价" type="number" value={formData.withdraw_price?.toString() || '0'}
                    onChange={(e) => setFormData({ ...formData, withdraw_price: Number(e.target.value) })}
                    placeholder="设置提卡接口的单价，0表示不允许提卡"
                    description="提卡接口使用此单价计算额度消耗" size="sm" variant="bordered" />
                  <Input label="库存预警阈值" type="number" min={0} value={String(formData.stock_warn)}
                    onChange={(e) => setFormData({ ...formData, stock_warn: Math.max(0, Number(e.target.value)) })}
                    placeholder="0表示关闭预警" description="未使用卡密库存低于或等于该值时触发通知" size="sm" variant="bordered" />
                  <Textarea label="附加数据" value={formData.extra_data}
                    onChange={(e) => setFormData({ ...formData, extra_data: e.target.value })}
                    placeholder="充值后覆盖用户的附加数据" minRows={3} size="sm" variant="bordered" />
                  <Textarea label="卡种备注" value={formData.remark}
                    onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                    placeholder="仅管理员可见" minRows={2} size="sm" variant="bordered" />
                </div>
              </div>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )

  function renderCardTypeList() {
    if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
    if (cardTypes.length === 0) return <Card><CardBody className="text-center py-12 text-gray-500">暂无卡种</CardBody></Card>

    const getAppId = (item: CardType) => isAllApps ? item.app_id : selectedAppId
    const getAppName = (item: CardType) => item.app?.app_name || apps.find(a => a.id === item.app_id)?.app_name

    return (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {cardTypes.map((item) => (
            <Card key={item.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4">
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning ring-1 ring-warning/10">
                    <HiCreditCard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold leading-5 text-gray-900 dark:text-white">{item.name}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex items-center gap-1 rounded bg-gray-50/80 px-1.5 py-0.5 text-[11px] leading-4 text-gray-600 ring-1 ring-gray-100 dark:bg-content2 dark:text-gray-300 dark:ring-gray-800">
                        <span className="text-gray-400">ID</span>
                        <span className="font-mono font-medium">{item.id}</span>
                        <Tooltip content="复制ID">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              copyToClipboard(item.id)
                            }}
                            className="text-gray-400 transition-colors hover:text-primary"
                          >
                            <FiCopy className="h-3 w-3" />
                          </button>
                        </Tooltip>
                      </div>
                      {item.prefix && (
                        <span className="inline-flex max-w-full rounded bg-gray-50/80 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-gray-600 ring-1 ring-gray-100 dark:bg-content2 dark:text-gray-300 dark:ring-gray-800">
                          <span className="truncate">卡头 {item.prefix}</span>
                        </span>
                      )}
                      {isAllApps && (
                        <span className="inline-flex max-w-full rounded bg-gray-50/80 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-gray-600 ring-1 ring-gray-100 dark:bg-content2 dark:text-gray-300 dark:ring-gray-800">
                          <span className="truncate">{getAppName(item)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="rounded-lg bg-gray-50/80 px-2.5 py-2 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
                    <span className="text-xs text-gray-400">充值时间</span>
                    <p className="truncate font-semibold">{formatDuration(item.duration)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50/80 px-2.5 py-2 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
                    <span className="text-xs text-gray-400">充值点数</span>
                    <p className="font-semibold">{item.points}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50/80 px-2.5 py-2 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
                    <span className="text-xs text-gray-400">制卡规则</span>
                    <p className="truncate">{GEN_RULE_MAP[item.gen_rule] || '未知'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50/80 px-2.5 py-2 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
                    <span className="text-xs text-gray-400">卡号长度</span>
                    <p>{item.card_length}位</p>
                  </div>
                  <div className="rounded-lg bg-gray-50/80 px-2.5 py-2 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
                    <span className="text-xs text-gray-400">消费返利</span>
                    <p>{item.rebate_points || 0}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  <Chip size="sm" variant="flat" color={item.category === 2 ? 'secondary' : 'default'}>{item.category === 2 ? '登录卡' : '充值卡'}</Chip>
                  <Chip size="sm" variant="flat" color="primary">{item.channels}通道</Chip>
                  <Chip size="sm" variant="flat" color="secondary">{item.features}特征</Chip>
                  {item.stock_warn > 0 && <Chip size="sm" variant="flat" color="warning">库存预警≤{item.stock_warn}</Chip>}
                </div>
                <div className="flex gap-2 justify-end rbtn-group">
                  <RBtn icon={<HiPencil className="w-4 h-4" />} label="编辑" variant="flat" color="primary" onPress={() => handleEdit(item.id)} />
                  <RBtn icon={<HiTrash className="w-4 h-4" />} label="删除" variant="flat" color="danger" onPress={() => handleDelete(item.id)} />
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
