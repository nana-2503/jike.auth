import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Card, CardBody, Button, Input, Select, SelectItem, Textarea, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Tabs, Tab,
} from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiClipboardCopy, HiDownload } from 'react-icons/hi'

interface CardTypePermission {
  card_type_id: number
  price: number
  card_type: {
    id: number
    name: string
    prefix: string
    points: number
    duration: number
    card_length: number
  }
}

interface StockPackage {
  id: number
  name: string
  items?: Array<CardTypePermission & { total_count: number; used_count: number }>
}

const formatDuration = (minutes: number) => {
  if (minutes === -1) return '永久'
  if (minutes === 0) return '不充值'
  if (minutes < 60) return `${minutes}分钟`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
  return `${Math.floor(minutes / 1440)}天`
}

export default function AgentGenerateCards() {
  const { agentInfo, refreshProfile } = useOutletContext<{ agentInfo: any; refreshProfile: () => void }>()
  const [cardTypes, setCardTypes] = useState<CardTypePermission[]>([])
  const [stockPackages, setStockPackages] = useState<StockPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const [mode, setMode] = useState('balance')
  const [selectedCardType, setSelectedCardType] = useState<string>('')
  const [selectedPackage, setSelectedPackage] = useState<string>('')
  const [count, setCount] = useState(10)
  const [remark, setRemark] = useState('')

  const { isOpen, onOpen, onClose } = useDisclosure()
  const [generatedCards, setGeneratedCards] = useState<string[]>([])
  const [generatedBatchNo, setGeneratedBatchNo] = useState('')
  const [totalCost, setTotalCost] = useState(0)

  useEffect(() => {
    Promise.all([
      agentCenterApi.listCardTypes(),
      agentCenterApi.listUsableStockPackages(),
    ]).then(([cardTypesRes, packagesRes]: any[]) => {
      setCardTypes(cardTypesRes.data || [])
      setStockPackages(packagesRes.data || [])
    }).catch(() => toast.error('获取卡种失败')).finally(() => setLoading(false))
  }, [])

  const currentPackage = stockPackages.find(pkg => String(pkg.id) === selectedPackage)
  const packageItems = currentPackage?.items || []
  const selectableCardTypes = mode === 'stock' ? packageItems : cardTypes
  const selectedCT = selectableCardTypes.find(ct => String(ct.card_type_id) === selectedCardType)
  const packageRemaining = selectedCT && 'total_count' in selectedCT ? ((selectedCT as any).total_count || 0) - ((selectedCT as any).used_count || 0) : 0
  const estimatedCost = mode === 'balance' && selectedCT ? selectedCT.price * count : 0

  const handleGenerate = async () => {
    if (!selectedCardType) { toast.error('请选择卡种'); return }
    if (count < 1 || count > 1000) { toast.error('数量1-1000'); return }
    if (mode === 'balance' && estimatedCost > agentInfo.balance) { toast.error('余额不足'); return }
    if (mode === 'stock') {
      if (!selectedPackage) { toast.error('请选择库存卡包'); return }
      if (count > packageRemaining) { toast.error('卡包剩余次数不足'); return }
    }

    setGenerating(true)
    try {
      const payload = { card_type_id: Number(selectedCardType), count, remark }
      const res: any = mode === 'stock'
        ? await agentCenterApi.generateCardsFromStockPackage(Number(selectedPackage), payload)
        : await agentCenterApi.generateCards(payload)
      setGeneratedCards(res.data.cards || [])
      setGeneratedBatchNo(res.data.batch_no || '')
      setTotalCost(res.data.total_cost || 0)
      refreshProfile()
      if (mode === 'stock') {
        agentCenterApi.listUsableStockPackages().then((r: any) => setStockPackages(r.data || [])).catch(() => {})
      }
      onOpen()
    } catch (e: any) {
      toast.error(e.message || '制卡失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCards.join('\n'))
    toast.success('已复制到剪贴板')
  }

  const handleExport = () => {
    const blob = new Blob([generatedCards.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cards_${generatedBatchNo}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardBody className="p-6">
          <h2 className="text-xl font-bold mb-6">制卡</h2>

          {cardTypes.length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无可用卡种，请联系管理员开通权限</p>
          ) : (
            <div className="space-y-4">
              <Tabs selectedKey={mode} onSelectionChange={(key) => { setMode(String(key)); setSelectedCardType(''); setSelectedPackage('') }}>
                <Tab key="balance" title="余额制卡" />
                <Tab key="stock" title="卡包制卡" />
              </Tabs>

              {mode === 'stock' && (
                <Select label="选择库存卡包" selectedKeys={selectedPackage ? [selectedPackage] : []}
                  onChange={(e) => { setSelectedPackage(e.target.value); setSelectedCardType('') }} isRequired>
                  {stockPackages.map(pkg => (
                    <SelectItem key={String(pkg.id)} textValue={pkg.name}>{pkg.name}</SelectItem>
                  ))}
                </Select>
              )}

              <Select label="选择卡种" selectedKeys={selectedCardType ? [selectedCardType] : []}
                onChange={(e) => setSelectedCardType(e.target.value)} isRequired isDisabled={mode === 'stock' && !selectedPackage}>
                {selectableCardTypes.map(ct => (
                  <SelectItem key={String(ct.card_type_id)} textValue={mode === 'balance' ? `${ct.card_type.name} - ¥${ct.price}/张` : `${ct.card_type.name} - 剩余 ${((ct as any).total_count || 0) - ((ct as any).used_count || 0)} 次`}>
                    {ct.card_type.name}{mode === 'balance' ? ` - ¥${ct.price}/张` : ` - 剩余 ${((ct as any).total_count || 0) - ((ct as any).used_count || 0)} 次`}
                  </SelectItem>
                ))}
              </Select>

              {selectedCT && (
                <Card className="bg-gray-50 dark:bg-content2">
                  <CardBody className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><span className="text-gray-400">卡头:</span> {selectedCT.card_type.prefix || '无'}</div>
                      <div><span className="text-gray-400">充值点数:</span> {selectedCT.card_type.points}</div>
                      <div><span className="text-gray-400">充值时间:</span> {formatDuration(selectedCT.card_type.duration)}</div>
                      {mode === 'balance' ? (
                        <div><span className="text-gray-400">单价:</span> <span className="text-primary font-medium">¥{selectedCT.price}</span></div>
                      ) : (
                        <div><span className="text-gray-400">卡包剩余:</span> <span className="text-primary font-medium">{packageRemaining} 次</span></div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )}

              <Input label="生成数量" type="number" min={1} max={mode === 'stock' ? Math.min(1000, packageRemaining || 1000) : 1000} value={String(count)}
                onChange={(e) => setCount(Number(e.target.value))} description={mode === 'stock' ? `最多 ${Math.min(1000, packageRemaining || 0)} 张` : '1-1000张'} />

              <Input label="备注" value={remark} onChange={(e) => setRemark(e.target.value)}
                placeholder="可选，用于标记本批次卡号" />

              {mode === 'balance' ? (
                <Card className="bg-primary/5">
                  <CardBody className="p-4">
                    <div className="flex justify-between items-center">
                      <span>预计花费:</span>
                      <span className="text-xl font-bold text-primary">¥{estimatedCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                      <span>当前余额:</span>
                      <span>¥{agentInfo.balance?.toFixed(2)}</span>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <Card className="bg-primary/5">
                  <CardBody className="p-4">
                    <div className="flex justify-between items-center">
                      <span>本次消耗卡包次数:</span>
                      <span className="text-xl font-bold text-primary">{count} 次</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                      <span>不扣账户余额</span>
                      <span>剩余 {Math.max(0, packageRemaining - count)} 次</span>
                    </div>
                  </CardBody>
                </Card>
              )}

              <Button color="primary" className="w-full" size="lg" onPress={handleGenerate}
                isLoading={generating} isDisabled={!selectedCardType || (mode === 'balance' && estimatedCost > agentInfo.balance) || (mode === 'stock' && count > packageRemaining)}>
                立即制卡
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 制卡成功弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>制卡成功</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>批次号: {generatedBatchNo}</span>
                <span>数量: {generatedCards.length}</span>
                <span>花费: ¥{totalCost.toFixed(2)}</span>
              </div>
              <Textarea value={generatedCards.join('\n')} readOnly minRows={10} maxRows={20}
                classNames={{ input: 'font-mono text-sm' }} />
              <div className="flex gap-2">
                <Button color="primary" startContent={<HiClipboardCopy className="w-4 h-4" />} onPress={handleCopy}>复制</Button>
                <Button color="secondary" startContent={<HiDownload className="w-4 h-4" />} onPress={handleExport}>导出</Button>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={onClose}>完成</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
