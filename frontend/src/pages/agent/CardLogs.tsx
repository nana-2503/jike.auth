import { useState, useEffect } from 'react'
import { Card, CardBody, Spinner, Pagination, Button, Select, SelectItem, DatePicker } from '@heroui/react'
import { parseDate } from '@internationalized/date'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiDownload } from 'react-icons/hi'

const formatDuration = (minutes: number) => {
  if (minutes === -1) return '永久'
  if (minutes === 0) return '不充值'
  if (minutes < 60) return `${minutes}分钟`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`
  return `${Math.floor(minutes / 1440)}天`
}

export default function AgentCardLogs() {
  const [logs, setLogs] = useState<any[]>([])
  const [cardTypes, setCardTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [cardTypeId, setCardTypeId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const pageSize = 20

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listCardLogs(page, pageSize, {
        card_type_id: cardTypeId ? Number(cardTypeId) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      setLogs(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    agentCenterApi.listCardTypes().then((res: any) => setCardTypes(res.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    loadLogs()
  }, [page])

  const handleSearch = () => {
    setPage(1)
    setLoading(true)
    agentCenterApi
      .listCardLogs(1, pageSize, {
        card_type_id: cardTypeId ? Number(cardTypeId) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      .then((res: any) => {
        setLogs(res.data.list || [])
        setTotal(res.data.total || 0)
      })
      .catch((e: any) => toast.error(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const text = await agentCenterApi.exportCardLogs({
        card_type_id: cardTypeId ? Number(cardTypeId) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      const blob = new Blob(['\ufeff', text as string], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `card_logs_${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出')
    } catch (e: any) {
      toast.error(e.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const formatTime = (time: string) => {
    if (!time) return '-'
    return new Date(time).toLocaleString('zh-CN')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col md:flex-row gap-3 flex-wrap items-end">
            <Select
              label="卡种"
              placeholder="全部"
              className="md:w-48"
              size="sm"
              selectedKeys={cardTypeId ? [cardTypeId] : []}
              onChange={(e) => setCardTypeId(e.target.value)}
            >
              {cardTypes.map((ct: any) => (
                <SelectItem key={String(ct.card_type_id)}>{ct.card_type?.name}</SelectItem>
              ))}
            </Select>
            <DatePicker
              label="开始日期"
              size="sm"
              className="md:w-40"
              value={dateFrom ? parseDate(dateFrom) : null}
              onChange={(value) => setDateFrom(value ? value.toString() : '')}
              showMonthAndYearPickers
            />
            <DatePicker
              label="结束日期"
              size="sm"
              className="md:w-40"
              value={dateTo ? parseDate(dateTo) : null}
              onChange={(value) => setDateTo(value ? value.toString() : '')}
              showMonthAndYearPickers
            />
            <Button color="primary" size="sm" onPress={handleSearch}>筛选</Button>
            <Button
              size="sm"
              variant="flat"
              startContent={<HiDownload className="w-4 h-4" />}
              onPress={handleExport}
              isLoading={exporting}
            >
              导出 CSV
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无制卡记录</CardBody></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{log.card_type?.name || '未知卡种'}</span>
                  <span className="text-primary font-medium">-¥{log.total_cost?.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>批次号: {log.batch_no}</span>
                    <span>数量: {log.count}张</span>
                  </div>
                  <div className="flex justify-between">
                    <span>单价: ¥{log.price?.toFixed(2)}</span>
                    {log.card_type && (
                      <span>时长: {formatDuration(log.card_type.duration)}</span>
                    )}
                  </div>
                  <div>时间: {formatTime(log.created_at)}</div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {total > pageSize && (
        <div className="flex justify-center">
          <Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
