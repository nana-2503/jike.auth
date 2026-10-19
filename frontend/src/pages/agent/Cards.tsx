import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Input, Select, SelectItem, Spinner, Chip, Pagination,
} from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiSearch, HiClipboardCopy, HiDownload } from 'react-icons/hi'

const statusMap: Record<number, { label: string; color: 'success' | 'warning' | 'danger' | 'default' | 'primary' }> = {
  1: { label: '未使用', color: 'success' },
  2: { label: '已用完', color: 'default' },
  3: { label: '已禁用', color: 'danger' },
  4: { label: '使用中', color: 'warning' },
}

// 根据使用次数判断实际显示状态
const getCardStatus = (card: any) => {
  if (card.status === 3) return { label: '已禁用', color: 'danger' as const }
  if (card.status === 4) return statusMap[4]
  const maxUse = card.card_type?.max_use || 1
  if (card.used_count >= maxUse) return { label: '已用完', color: 'default' as const }
  if (card.used_count > 0) return { label: '使用中', color: 'warning' as const }
  return { label: '未使用', color: 'success' as const }
}

// 判断是否移动端
const isMobile = () => window.innerWidth < 768

export default function AgentCards() {
  const [cards, setCards] = useState<any[]>([])
  const [cardTypes, setCardTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [cardTypeId, setCardTypeId] = useState('')
  const [status, setStatus] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [selectedCards, setSelectedCards] = useState<string[]>([])
  const [pageSize, setPageSize] = useState(isMobile() ? 10 : 18)
  const [exportingAll, setExportingAll] = useState(false)

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setPageSize(isMobile() ? 10 : 18)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const loadCards = async () => {
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listCards(page, pageSize, {
        card_type_id: cardTypeId ? Number(cardTypeId) : undefined,
        batch_no: batchNo || undefined,
        status: status ? Number(status) : undefined,
        keyword: keyword || undefined,
      })
      setCards(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    agentCenterApi.listCardTypes().then((res: any) => {
      setCardTypes(res.data || [])
    })
  }, [])

  useEffect(() => {
    loadCards()
  }, [page, pageSize])

  const handleSearch = () => {
    setPage(1)
    loadCards()
  }

  const handleCopySelected = () => {
    if (selectedCards.length === 0) {
      const allCards = cards.map(c => c.card_no)
      navigator.clipboard.writeText(allCards.join('\n'))
      toast.success(`已复制 ${allCards.length} 张卡号`)
    } else {
      navigator.clipboard.writeText(selectedCards.join('\n'))
      toast.success(`已复制 ${selectedCards.length} 张卡号`)
    }
  }

  const handleExport = () => {
    const exportCards = selectedCards.length > 0 ? selectedCards : cards.map(c => c.card_no)
    const blob = new Blob([exportCards.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cards_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportFiltered = async () => {
    setExportingAll(true)
    try {
      const text = await agentCenterApi.exportCards({
        card_type_id: cardTypeId ? Number(cardTypeId) : undefined,
        batch_no: batchNo || undefined,
        status: status ? Number(status) : undefined,
        keyword: keyword || undefined,
      })
      const blob = new Blob([text as string], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cards_export_${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已按当前条件导出（最多5000条）')
    } catch (e: any) {
      toast.error(e.message || '导出失败')
    } finally {
      setExportingAll(false)
    }
  }

  const toggleSelect = (cardNo: string) => {
    setSelectedCards(prev =>
      prev.includes(cardNo) ? prev.filter(c => c !== cardNo) : [...prev, cardNo]
    )
  }

  const toggleSelectAll = () => {
    if (selectedCards.length === cards.length) {
      setSelectedCards([])
    } else {
      setSelectedCards(cards.map(c => c.card_no))
    }
  }

  return (
    <div className="space-y-4">
      {/* 搜索栏 */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input placeholder="卡号" value={keyword} onChange={(e) => setKeyword(e.target.value)}
              className="md:w-48" size="sm" startContent={<HiSearch className="text-gray-400" />} />
            <Select placeholder="卡种" selectedKeys={cardTypeId ? [cardTypeId] : []}
              onChange={(e) => setCardTypeId(e.target.value)} className="md:w-40" size="sm">
              {cardTypes.map((ct: any) => (
                <SelectItem key={String(ct.card_type_id)}>{ct.card_type.name}</SelectItem>
              ))}
            </Select>
            <Select placeholder="状态" selectedKeys={status ? [status] : []}
              onChange={(e) => setStatus(e.target.value)} className="md:w-32" size="sm">
              <SelectItem key="1">未使用</SelectItem>
              <SelectItem key="4">使用中</SelectItem>
              <SelectItem key="2">已使用</SelectItem>
              <SelectItem key="3">已禁用</SelectItem>
            </Select>
            <Input placeholder="批次号" value={batchNo} onChange={(e) => setBatchNo(e.target.value)}
              className="md:w-48" size="sm" />
            <div className="flex gap-2">
              <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
              <Button variant="flat" size="sm" onPress={() => { setKeyword(''); setCardTypeId(''); setStatus(''); setBatchNo(''); setPage(1); loadCards() }}>重置</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 操作栏 */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button size="sm" variant="flat" onPress={toggleSelectAll}>
            {selectedCards.length === cards.length && cards.length > 0 ? '取消全选' : '全选'}
          </Button>
          <Button size="sm" variant="flat" startContent={<HiClipboardCopy />} onPress={handleCopySelected}>
            复制{selectedCards.length > 0 ? `(${selectedCards.length})` : '全部'}
          </Button>
          <Button size="sm" variant="flat" startContent={<HiDownload />} onPress={handleExport}>
            导出{selectedCards.length > 0 ? `(${selectedCards.length})` : '本页'}
          </Button>
          <Button size="sm" variant="flat" color="primary" onPress={handleExportFiltered} isLoading={exportingAll}>
            条件导出
          </Button>
        </div>
        <span className="text-sm text-gray-500">共 {total} 条</span>
      </div>

      {/* 卡号列表 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : cards.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无数据</CardBody></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.id} isPressable onPress={() => toggleSelect(card.card_no)}
              className={selectedCards.includes(card.card_no) ? 'ring-2 ring-primary' : ''}>
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-sm font-medium">{card.card_no}</span>
                  <Chip size="sm" color={getCardStatus(card).color} variant="solid"
                    classNames={{ content: 'text-white' }}>
                    {getCardStatus(card).label}
                  </Chip>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>卡种: {card.card_type?.name || '-'}</span>
                    <span>使用: {card.used_count}/{card.card_type?.max_use || 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>批次: {card.batch_no}</span>
                  </div>
                  {card.used_by && <div>使用者: {card.used_by}</div>}
                  {card.remark && <div>备注: {card.remark}</div>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex justify-center">
          <Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
