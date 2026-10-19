import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Tooltip, Progress,
  Input, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Textarea,
  Checkbox, Drawer, DrawerContent, DrawerHeader, DrawerBody,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { RBtn } from '../components/ResponsiveButton'
import { HiTrash, HiPlus, HiSearch, HiClipboardCopy, HiDownload, HiBan, HiCheck, HiEye, HiDocumentDownload, HiClock, HiCheckCircle } from 'react-icons/hi'

interface CardType {
  id: number
  category: number
  name: string
  prefix: string
  points: number
  rebate_points: number
  duration: number
  gen_rule: number
  card_length: number
  max_use: number
  max_user_use: number
  channels: number
  features: number
  withdraw_price: number
  stock_warn: number
  remark: string
}

interface CardItem {
  id: number
  app_id: number
  card_type_id: number
  card_no: string
  batch_no: string
  status: number
  used_count: number
  used_by: string
  remark: string
  card_type?: CardType
  app?: { id: number; app_name: string; user?: { id: number; username: string; nickname: string } }
  agent?: { id: number; username: string; nickname: string }
  used_at: string | null
  created_at: string
  updated_at: string
}

interface App {
  id: number
  app_name: string
}

interface CardBatch {
  batch_no: string
  count: number
  unused_count: number
  using_count: number
  used_count: number
  disabled_count: number
  created_at: string
}

const STATUS_MAP: Record<number, { label: string; color: 'success' | 'default' | 'danger' | 'warning' }> = {
  1: { label: '未使用', color: 'success' },
  2: { label: '已使用', color: 'default' },
  3: { label: '已禁用', color: 'danger' },
  4: { label: '使用中', color: 'warning' },
}

const GEN_RULE_MAP: Record<number, string> = {
  1: '小写字母', 2: '大写字母', 3: '大小写字母',
  4: '小写+数字', 5: '大写+数字', 6: '大小写+数字',
}

const CATEGORY_MAP: Record<number, string> = { 1: '充值卡', 2: '登录卡' }

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '-'

const formatDuration = (minutes: number) => {
  if (minutes === -1) return '永久'
  if (minutes === 0) return '不充值'
  if (minutes < 60) return `${minutes}分钟`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
  if (minutes < 43200) return `${Math.floor(minutes / 1440)}天`
  return `${Math.floor(minutes / 43200)}个月`
}

export default function Cards() {
  const [cards, setCards] = useState<CardItem[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(0) // 0 表示全部应用
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [appsLoading, setAppsLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCardType, setFilterCardType] = useState<string>('')

  // 制卡弹窗
  const { isOpen: isGenOpen, onOpen: onGenOpen, onClose: onGenClose } = useDisclosure()
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure()
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null)
  const [genCardTypeId, setGenCardTypeId] = useState<string>('')
  const [genCount, setGenCount] = useState(10)
  const [genRemark, setGenRemark] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedCards, setGeneratedCards] = useState<string[]>([])
  const [generatedBatchNo, setGeneratedBatchNo] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batches, setBatches] = useState<CardBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [isBatchOpen, setIsBatchOpen] = useState(false)

  // 使用记录
  const { isOpen: isUsageOpen, onOpen: onUsageOpen, onClose: onUsageClose } = useDisclosure()
  const [usageRecords, setUsageRecords] = useState<any[]>([])
  const [usageCardNo, setUsageCardNo] = useState('')
  const [usageLoading, setUsageLoading] = useState(false)
  const isAllApps = selectedAppId === 0 || selectedAppId === null

  useEffect(() => {
    setAppsLoading(true)
    userApi.listApps(1, 100).then((res: any) => {
      const list = res.data.list || []
      setApps(list)
    }).finally(() => setAppsLoading(false))
  }, [])

  useEffect(() => {
    if (selectedAppId && selectedAppId !== 0) {
      userApi.listCardTypes(selectedAppId, 1, 100).then((res: any) => {
        setCardTypes(res.data.list || [])
      })
    } else {
      setCardTypes([])
    }
  }, [selectedAppId])

  const fetchCards = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (filterStatus) params.status = Number(filterStatus)
      if (filterCardType) params.card_type_id = Number(filterCardType)
      if (keyword) params.keyword = keyword
      const res: any = await userApi.listCards(isAllApps ? null : selectedAppId, page, 10, params)
      setCards(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCards() }, [page, selectedAppId, filterStatus, filterCardType])
  const handleSearch = () => { setPage(1); fetchCards() }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这张卡吗？')) return
    try {
      await userApi.deleteCard(id)
      toast.success('删除成功')
      fetchCards()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleToggleStatus = async (card: CardItem) => {
    const newStatus = card.status === 3 ? 1 : 3
    try {
      await userApi.updateCardStatus(card.id, newStatus)
      toast.success(newStatus === 3 ? '已禁用' : '已启用')
      fetchCards()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const handleGenerate = async () => {
    if (!genCardTypeId) { toast.error('请选择卡种'); return }
    if (genCount < 1 || genCount > 1000) { toast.error('生成数量1-1000'); return }
    setGenerating(true)
    try {
      const res: any = await userApi.generateCards({
        card_type_id: Number(genCardTypeId),
        count: genCount,
        remark: genRemark,
      })
      setGeneratedCards(res.data.cards || [])
      setGeneratedBatchNo(res.data.batch_no || '')
      toast.success(`成功生成 ${res.data.count} 张卡`)
      fetchCards()
    } catch (e: any) { toast.error(e.message || '生成失败') }
    finally { setGenerating(false) }
  }

  const handleCopyCards = () => {
    navigator.clipboard.writeText(generatedCards.join('\n'))
    toast.success('已复制到剪贴板')
  }

  const handleExportCards = () => {
    const blob = new Blob([generatedCards.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cards_${generatedBatchNo}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetGenForm = () => {
    setGenCardTypeId('')
    setGenCount(10)
    setGenRemark('')
    setGeneratedCards([])
    setGeneratedBatchNo('')
  }

  const showDetail = (card: CardItem) => {
    setSelectedCard(card)
    onDetailOpen()
  }

  const showUsage = async (card: CardItem) => {
    setUsageCardNo(card.card_no)
    setUsageRecords([])
    setUsageLoading(true)
    onUsageOpen()
    try {
      const res: any = await userApi.getCardUsage(card.id)
      setUsageRecords(res.data.records || [])
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setUsageLoading(false) }
  }

  const selectedCardType = cardTypes.find(ct => String(ct.id) === genCardTypeId)

  // 批量操作
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(cards.map(c => c.id))
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
    if (selectedIds.length === 0) { toast.error('请先选择卡号'); return }
    if (!await confirm(`确定要删除选中的 ${selectedIds.length} 张卡吗？`)) return
    try {
      await userApi.batchDeleteCards(selectedIds)
      toast.success('批量删除成功')
      setSelectedIds([])
      fetchCards()
    } catch (e: any) { toast.error(e.message || '批量删除失败') }
  }

  const handleBatchDisable = async () => {
    if (selectedIds.length === 0) { toast.error('请先选择卡号'); return }
    if (!await confirm(`确定要禁用选中的 ${selectedIds.length} 张卡吗？`)) return
    try {
      await userApi.batchUpdateCardStatus(selectedIds, 3)
      toast.success('批量禁用成功')
      setSelectedIds([])
      fetchCards()
    } catch (e: any) { toast.error(e.message || '批量禁用失败') }
  }

  const handleBatchEnable = async () => {
    if (selectedIds.length === 0) { toast.error('请先选择卡号'); return }
    if (!await confirm(`确定要启用选中的 ${selectedIds.length} 张卡吗？`)) return
    try {
      await userApi.batchUpdateCardStatus(selectedIds, 1)
      toast.success('批量启用成功')
      setSelectedIds([])
      fetchCards()
    } catch (e: any) { toast.error(e.message || '批量启用失败') }
  }

  const handleExportExcel = async () => {
    const params: any = {}
    if (!isAllApps && selectedAppId) params.app_id = selectedAppId
    if (filterCardType) params.card_type_id = Number(filterCardType)
    if (filterStatus) params.status = Number(filterStatus)
    
    const url = userApi.exportCardsExcel(params)
    const token = localStorage.getItem('token')
    
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `cards_${new Date().toISOString().slice(0,10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (e: any) {
      toast.error(e.message || '导出失败')
    }
  }

  const loadBatches = async () => {
    if (!selectedAppId || selectedAppId === 0) return
    setBatchesLoading(true)
    try {
      const res: any = await userApi.listCardBatches(selectedAppId)
      setBatches(res.data || [])
    } catch (e: any) { toast.error(e.message || '加载批次失败') }
    finally { setBatchesLoading(false) }
  }

  const openBatchDrawer = () => {
    if (!selectedAppId || selectedAppId === 0) { toast.error('请先选择应用'); return }
    setIsBatchOpen(true)
    loadBatches()
  }

  const handleBatchStatus = async (batchNo: string, status: number) => {
    if (!selectedAppId || selectedAppId === 0) return
    if (!await confirm(`确定${status === 3 ? '禁用该批次未使用卡号' : '启用该批次已禁用卡号'}吗？`)) return
    try {
      await userApi.updateCardsByBatchStatus(selectedAppId, batchNo, status)
      toast.success('操作成功')
      loadBatches()
      fetchCards()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const handleDeleteBatch = async (batchNo: string) => {
    if (!selectedAppId || selectedAppId === 0) return
    if (!await confirm('确定删除该批次全部卡号吗？')) return
    try {
      await userApi.deleteCardsByBatch(selectedAppId, batchNo)
      toast.success('删除成功')
      loadBatches()
      fetchCards()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleExportBatch = async (batchNo: string, unusedOnly = false) => {
    if (!selectedAppId || selectedAppId === 0) return
    try {
      const res: any = await userApi.exportCardsByBatch(selectedAppId, batchNo, unusedOnly ? 1 : undefined)
      const list = res.data || []
      const blob = new Blob([list.join('\n')], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${unusedOnly ? 'unused_' : ''}cards_${batchNo}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('导出成功')
    } catch (e: any) { toast.error(e.message || '导出失败') }
  }

  return (
    <div className="space-y-4">
      {/* 顶部筛选栏 */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select 
          placeholder="全部应用" 
          selectedKeys={selectedAppId !== null && selectedAppId !== 0 ? [String(selectedAppId)] : []}
          onChange={(e) => { setSelectedAppId(e.target.value === '' ? 0 : Number(e.target.value)); setPage(1); setKeyword(''); setFilterStatus(''); setFilterCardType('') }}
          className="w-full md:w-40" 
          size="sm"
          isLoading={appsLoading}
        >
          {apps.map(app => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <Input placeholder="搜索卡号" value={keyword} onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          startContent={<HiSearch className="w-4 h-4 text-gray-400" />} className="flex-1 md:w-48" size="sm" />
        {!isAllApps && (
          <Select placeholder="卡种" selectedKeys={filterCardType ? [filterCardType] : []}
            onChange={(e) => { setFilterCardType(e.target.value); setPage(1) }} className="w-32" size="sm">
            {cardTypes.map(ct => <SelectItem key={String(ct.id)}>{ct.name}</SelectItem>)}
          </Select>
        )}
        <Select placeholder="状态" selectedKeys={filterStatus ? [filterStatus] : []}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }} className="w-28" size="sm">
          <SelectItem key="1">未使用</SelectItem>
          <SelectItem key="4">使用中</SelectItem>
          <SelectItem key="2">已使用</SelectItem>
          <SelectItem key="3">已禁用</SelectItem>
        </Select>
        <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
        <div className="flex-1" />
        {selectedIds.length > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-500">已选 {selectedIds.length}</span>
            <Button color="success" size="sm" variant="flat" isIconOnly onPress={handleBatchEnable}><HiCheck className="w-4 h-4" /></Button>
            <Button color="warning" size="sm" variant="flat" isIconOnly onPress={handleBatchDisable}><HiBan className="w-4 h-4" /></Button>
            <Button color="danger" size="sm" variant="flat" isIconOnly onPress={handleBatchDelete}><HiTrash className="w-4 h-4" /></Button>
          </div>
        )}
        <Button color="secondary" size="sm" variant="flat" isIconOnly onPress={handleExportExcel}><HiDocumentDownload className="w-4 h-4" /></Button>
        {!isAllApps && (
          <>
            <Button color="secondary" size="sm" variant="flat" onPress={openBatchDrawer}>批次管理</Button>
            <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />}
              onPress={() => { resetGenForm(); onGenOpen() }}>制卡</Button>
          </>
        )}
      </div>

      {/* 卡号列表 */}
      {renderCardList()}

      {/* 制卡弹窗 */}
      <Modal isOpen={isGenOpen} onClose={onGenClose} size="2xl" placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{generatedCards.length > 0 ? '制卡成功' : '制卡'}</ModalHeader>
          <ModalBody>
            {generatedCards.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>批次号: {generatedBatchNo}</span>
                  <span>数量: {generatedCards.length}</span>
                </div>
                <Textarea value={generatedCards.join('\n')} readOnly minRows={10} maxRows={20}
                  classNames={{ input: 'font-mono text-sm' }} />
                <div className="flex gap-2">
                  <Button color="primary" startContent={<HiClipboardCopy className="w-4 h-4" />} onPress={handleCopyCards}>复制</Button>
                  <Button color="secondary" startContent={<HiDownload className="w-4 h-4" />} onPress={handleExportCards}>导出</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Select label="选择卡种" selectedKeys={genCardTypeId ? [genCardTypeId] : []}
                  onChange={(e) => setGenCardTypeId(e.target.value)} isRequired>
                  {cardTypes.map(ct => <SelectItem key={String(ct.id)}>{ct.name}</SelectItem>)}
                </Select>
                {selectedCardType && (
                  <Card className="bg-gray-50 dark:bg-content2">
                    <CardBody className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div><span className="text-gray-400">卡头:</span> {selectedCardType.prefix || '无'}</div>
                        <div><span className="text-gray-400">充值点数:</span> {selectedCardType.points}</div>
                        <div><span className="text-gray-400">充值时间:</span> {formatDuration(selectedCardType.duration)}</div>
                        <div><span className="text-gray-400">制卡规则:</span> {GEN_RULE_MAP[selectedCardType.gen_rule]}</div>
                        <div><span className="text-gray-400">卡号长度:</span> {selectedCardType.card_length}位</div>
                      </div>
                    </CardBody>
                  </Card>
                )}
                <Input label="生成数量" type="number" min={1} max={1000} value={String(genCount)}
                  onChange={(e) => setGenCount(Number(e.target.value))} description="1-1000张" />
                <Input label="备注" value={genRemark} onChange={(e) => setGenRemark(e.target.value)}
                  placeholder="可选，用于标记本批次卡号" />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            {generatedCards.length > 0 ? (
              <>
                <Button variant="flat" onPress={() => { resetGenForm() }}>继续制卡</Button>
                <Button color="primary" onPress={onGenClose}>完成</Button>
              </>
            ) : (
              <>
                <Button variant="flat" onPress={onGenClose}>取消</Button>
                <Button color="primary" onPress={handleGenerate} isLoading={generating}>生成</Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 详情弹窗 */}
      <Drawer isOpen={isDetailOpen} onClose={onDetailClose} placement="right" size="lg" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>卡号详情</span>
            <div className="flex gap-2">
              <Button variant="flat" size="sm" onPress={onDetailClose}>关闭</Button>
              <Button color="secondary" variant="flat" size="sm" onPress={() => { onDetailClose(); if (selectedCard) showUsage(selectedCard) }}>
                使用记录
              </Button>
              <Button color="primary" size="sm" onPress={() => { navigator.clipboard.writeText(selectedCard?.card_no || ''); toast.success('已复制') }}>
                复制卡号
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            {selectedCard && (
              <div className="space-y-5 py-5">
                {(() => {
                  const cardType = selectedCard.card_type
                  const maxUse = cardType?.max_use || 0
                  const usePercent = maxUse > 0 ? Math.min(100, Math.round((selectedCard.used_count / maxUse) * 100)) : 0
                  const remainingUse = maxUse > 0 ? Math.max(0, maxUse - selectedCard.used_count) : null

                  return (
                    <>
                      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 via-white to-transparent p-4 dark:via-content1 dark:to-content1">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          <Chip color={STATUS_MAP[selectedCard.status]?.color || 'default'} size="sm" variant="flat">{STATUS_MAP[selectedCard.status]?.label || '未知'}</Chip>
                          {cardType && <Chip size="sm" variant="flat" color="secondary">{cardType.name}</Chip>}
                          {selectedCard.app && <Chip size="sm" variant="flat" color="primary">{selectedCard.app.app_name}</Chip>}
                        </div>
                        <p className="text-xs text-gray-400">卡号</p>
                        <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-900 dark:text-white">{selectedCard.card_no}</p>
                      </div>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">使用情况</h3>
                        <div className="rounded-xl bg-gray-50/80 p-3 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
                          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                            <span className="text-gray-400">使用次数</span>
                            <span className="font-medium">{maxUse > 0 ? `${selectedCard.used_count}/${maxUse}` : `${selectedCard.used_count} / 不限`}</span>
                          </div>
                          <Progress value={maxUse > 0 ? usePercent : 0} color={selectedCard.status === 3 ? 'danger' : usePercent >= 100 ? 'default' : 'primary'} size="sm" aria-label="卡号使用进度" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Info label="剩余次数" value={remainingUse === null ? '不限' : remainingUse} />
                          <Info label="最后使用" value={formatDateTime(selectedCard.used_at)} />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">基础信息</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <Info label="所属应用" value={selectedCard.app?.app_name || '-'} />
                          <Info label="批次号" value={selectedCard.batch_no || '-'} mono />
                          <Info label="卡种" value={cardType?.name || '-'} />
                          <Info label="卡种类型" value={CATEGORY_MAP[cardType?.category || 0] || '-'} />
                        </div>
                      </section>

                      {cardType && (
                        <section className="space-y-3">
                          <h3 className="text-sm font-semibold">卡种配置</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <Info label="充值点数" value={cardType.points} />
                            <Info label="充值时间" value={formatDuration(cardType.duration)} />
                            <Info label="消费返利" value={cardType.rebate_points || 0} />
                            <Info label="每用户可用" value={`${cardType.max_user_use} 次`} />
                            <Info label="通道数量" value={cardType.channels} />
                            <Info label="特征数量" value={cardType.features} />
                            <Info label="卡号长度" value={`${cardType.card_length} 位`} />
                            <Info label="制卡规则" value={GEN_RULE_MAP[cardType.gen_rule] || '未知'} />
                            <Info label="卡头" value={cardType.prefix || '-'} />
                            <Info label="提卡单价" value={`¥${Number(cardType.withdraw_price || 0).toFixed(2)}`} />
                          </div>
                          {cardType.remark && <Info label="卡种备注" value={cardType.remark} />}
                        </section>
                      )}

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">时间与备注</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <Info label="创建时间" value={formatDateTime(selectedCard.created_at)} />
                          <Info label="更新时间" value={formatDateTime(selectedCard.updated_at)} />
                        </div>
                        <Info label="备注" value={selectedCard.remark || '-'} />
                      </section>
                    </>
                  )
                })()}
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 使用记录抽屉 */}
      <Drawer isOpen={isUsageOpen} onClose={onUsageClose} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>使用记录</span>
            <Button variant="flat" size="sm" onPress={onUsageClose}>关闭</Button>
          </DrawerHeader>
          <DrawerBody>
            <div className="space-y-3 mt-4">
              <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                <span className="text-xs text-gray-400">卡号</span>
                <p className="font-mono text-sm break-all">{usageCardNo}</p>
              </div>
              {usageLoading ? (
                <div className="flex justify-center py-6"><Spinner size="sm" /></div>
              ) : usageRecords.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">暂无使用记录</div>
              ) : (
                <div className="space-y-3">
                  {usageRecords.map((r: any, i: number) => (
                    <div key={i} className="bg-gray-50 dark:bg-content2 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.username}</span>
                        <Chip size="sm" variant="flat" color={r.action === 'login' ? 'secondary' : 'primary'}>
                          {r.action === 'login' ? '卡号登录' : '充值'}
                        </Chip>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <div>IP: {r.ip || '-'}</div>
                        <div>特征码: {r.feature ? (r.feature.length > 15 ? r.feature.slice(0, 15) + '...' : r.feature) : '-'}</div>
                        <div>客户端: {r.client_id ? (r.client_id.length > 15 ? r.client_id.slice(0, 15) + '...' : r.client_id) : '-'}</div>
                        <div>系统: {r.client_os || '-'}</div>
                      </div>
                      <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer isOpen={isBatchOpen} onClose={() => setIsBatchOpen(false)} placement="right" size="2xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>批次管理</span>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" onPress={loadBatches}>刷新</Button>
              <Button size="sm" variant="flat" onPress={() => setIsBatchOpen(false)}>关闭</Button>
            </div>
          </DrawerHeader>
          <DrawerBody>
            {batchesLoading ? <div className="flex justify-center py-8"><Spinner /></div> : batches.length === 0 ? (
              <div className="text-center text-gray-400 py-8">暂无批次</div>
            ) : (
              <div className="space-y-3 py-3">
                {batches.map(batch => {
                  const usedRate = batch.count > 0 ? Math.round(((batch.using_count + batch.used_count) / batch.count) * 100) : 0
                  return (
                    <Card key={batch.batch_no} className="border border-gray-100 dark:border-gray-800">
                      <CardBody className="space-y-3">
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className="font-mono text-sm font-semibold">{batch.batch_no}</div>
                            <div className="text-xs text-gray-400">{batch.created_at ? new Date(batch.created_at).toLocaleString() : '-'}</div>
                          </div>
                          <Chip color="primary" variant="flat">使用率 {usedRate}%</Chip>
                        </div>
                        <div className="grid grid-cols-5 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{batch.count}</div><div className="text-gray-400">总数</div></div>
                          <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold text-success">{batch.unused_count}</div><div className="text-gray-400">未用</div></div>
                          <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold text-warning">{batch.using_count}</div><div className="text-gray-400">使用中</div></div>
                          <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold">{batch.used_count}</div><div className="text-gray-400">已用完</div></div>
                          <div className="rounded-lg bg-default-100 p-2"><div className="font-semibold text-danger">{batch.disabled_count}</div><div className="text-gray-400">禁用</div></div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="flat" onPress={() => handleExportBatch(batch.batch_no)}>导出全部</Button>
                          <Button size="sm" variant="flat" color="success" onPress={() => handleExportBatch(batch.batch_no, true)}>导出未用</Button>
                          <Button size="sm" variant="flat" color="warning" onPress={() => handleBatchStatus(batch.batch_no, 3)}>禁用未用</Button>
                          <Button size="sm" variant="flat" color="success" onPress={() => handleBatchStatus(batch.batch_no, 1)}>启用禁用</Button>
                          <Button size="sm" variant="flat" color="danger" onPress={() => handleDeleteBatch(batch.batch_no)}>删除批次</Button>
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

  function renderCardList() {
    if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
    if (cards.length === 0) return <Card><CardBody className="text-center py-12 text-gray-500">暂无卡号</CardBody></Card>

    const getAppName = (card: CardItem) => card.app?.app_name || apps.find(a => a.id === card.app_id)?.app_name
    const formatCreator = (username?: string, nickname?: string) => {
      if (!username) return '-'
      return nickname ? `${username}(${nickname})` : username
    }
    const getCreatorText = (card: CardItem) => card.agent
      ? formatCreator(card.agent.username, card.agent.nickname)
      : formatCreator(card.app?.user?.username, card.app?.user?.nickname)

    return (
      <>
        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            isSelected={cards.length > 0 && selectedIds.length === cards.length}
            isIndeterminate={selectedIds.length > 0 && selectedIds.length < cards.length}
            onValueChange={handleSelectAll}
          >
            全选
          </Checkbox>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((card) => {
            const selected = selectedIds.includes(card.id)
            return (
            <Card key={card.id} className={`relative hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border ${selected ? 'border-primary/70' : 'border-transparent'}`}>
              <CardBody className="p-4">
                <button
                  type="button"
                  onClick={() => handleSelectOne(card.id, !selected)}
                  className={`absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition-all ${selected ? 'border-primary bg-primary text-white shadow-sm' : 'border-gray-200 bg-white/90 text-gray-300 hover:border-primary hover:text-primary dark:border-gray-700 dark:bg-content1/90 dark:text-gray-500 dark:hover:border-primary dark:hover:text-primary'}`}
                  aria-label={selected ? '取消选择卡号' : '选择卡号'}
                >
                  {selected ? <HiCheck className="w-3.5 h-3.5" /> : <HiCheckCircle className="w-3.5 h-3.5" />}
                </button>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0 pr-8">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm truncate mb-1">{card.card_no}</p>
                      <div className="flex gap-1 flex-wrap">
                        <Chip size="sm" variant="flat" color={STATUS_MAP[card.status]?.color || 'default'}>
                          {STATUS_MAP[card.status]?.label || '未知'}
                        </Chip>
                        {card.card_type && <Chip size="sm" variant="flat">{card.card_type.name}</Chip>}
                        {isAllApps && <Chip size="sm" variant="flat" color="primary">{getAppName(card)}</Chip>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">批次号</span>
                    <p className="truncate">{card.batch_no}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                    <span className="text-xs text-gray-400">使用次数</span>
                    <p>{card.used_count}/{card.card_type?.max_use || '-'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded p-2 col-span-2">
                    <span className="text-xs text-gray-400">制卡人</span>
                    <p className="truncate">{getCreatorText(card)}</p>
                  </div>
                </div>
                {card.remark && (
                  <p className="text-xs text-gray-400 mt-2 truncate">备注: {card.remark}</p>
                )}
                <div className="flex gap-2 mt-3 justify-end rbtn-group">
                  <RBtn icon={<HiEye className="w-4 h-4" />} label="详情" variant="flat" onPress={() => showDetail(card)} />
                  <RBtn icon={<HiClock className="w-4 h-4" />} label="记录" variant="flat" color="secondary" onPress={() => showUsage(card)} />
                  <RBtn icon={<HiClipboardCopy className="w-4 h-4" />} label="复制" variant="flat" onPress={() => { navigator.clipboard.writeText(card.card_no); toast.success('已复制') }} />
                  <RBtn icon={card.status === 3 ? <HiCheck className="w-4 h-4" /> : <HiBan className="w-4 h-4" />} label={card.status === 3 ? '启用' : '禁用'} variant="flat" color={card.status === 3 ? 'success' : 'warning'} onPress={() => handleToggleStatus(card)} />
                  <RBtn icon={<HiTrash className="w-4 h-4" />} label="删除" variant="flat" color="danger" onPress={() => handleDelete(card.id)} />
                </div>
              </CardBody>
            </Card>
            )
          })}
        </div>
        {total > 10 && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / 10)} page={page} onChange={setPage} /></div>}
      </>
    )
  }
}

function Info({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50/80 p-3 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`break-words text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
