import { useState, useEffect } from 'react'
import { Card, CardBody, Spinner, Pagination, Chip } from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'

const kindLabel: Record<string, string> = {
  recharge: '充值',
  generate_card: '制卡扣款',
  transfer_out: '转账给下级',
  transfer_in: '上级转入',
  stock_package: '卡包扣款',
  stock_package_refund: '卡包退款',
}

export default function AgentBalanceLogs() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await agentCenterApi.listBalanceLogs(page, pageSize)
      setLogs(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page])

  const formatTime = (time: string) => {
    if (!time) return '-'
    return new Date(time).toLocaleString('zh-CN')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold px-1">余额流水</h2>
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无流水</CardBody></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {logs.map((row) => (
            <Card key={row.id}>
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <Chip size="sm" variant="flat">{kindLabel[row.kind] || row.kind}</Chip>
                  <span className={`font-medium ${row.amount >= 0 ? 'text-green-600' : 'text-danger'}`}>
                    {row.amount >= 0 ? '+' : ''}{row.amount?.toFixed?.(2) ?? row.amount}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>余额后: ¥{Number(row.balance_after).toFixed(2)}</div>
                  {row.ref && <div>关联: {row.ref}</div>}
                  {row.remark && <div>{row.remark}</div>}
                  <div>{formatTime(row.created_at)}</div>
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
