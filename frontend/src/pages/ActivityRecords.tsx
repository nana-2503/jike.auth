import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardBody, Button, Chip, Spinner, Pagination } from '@heroui/react'
import { HiArrowLeft } from 'react-icons/hi'
import { userApi } from '../api'
import { toast } from '../components/Toast'

interface ActivityRecord {
  id: number
  activity_user?: { id: number; username: string }
  prize_name: string
  prize_content: string
  status: number
  ip: string
  created_at: string
}

const statusMap: Record<number, { label: string; color: 'warning' | 'success' | 'default' }> = {
  1: { label: '已参与', color: 'warning' },
  2: { label: '已中奖', color: 'success' },
  3: { label: '未中奖', color: 'default' },
}

export default function ActivityRecords() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 15

  useEffect(() => { fetchRecords() }, [id, page])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listActivityRecords(parseInt(id!), page, pageSize)
      setRecords(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="light" startContent={<HiArrowLeft />} onPress={() => navigate('/activities')}>返回</Button>
        <h2 className="text-xl font-bold">参与记录</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : records.length === 0 ? (
        <Card><CardBody className="py-12 text-center text-gray-500">暂无参与记录</CardBody></Card>
      ) : (
        <>
          <div className="grid gap-2">
            {records.map(r => {
              const s = statusMap[r.status] || statusMap[1]
              return (
                <Card key={r.id} className="w-full">
                  <CardBody className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                          {(r.activity_user?.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{r.activity_user?.username || '-'}</span>
                        <span className="text-xs text-gray-400">{r.ip}</span>
                      </div>
                      <Chip size="sm" color={s.color} variant="flat">{s.label}</Chip>
                    </div>
                    <div className="flex items-center justify-between pl-9">
                      <div>
                        <span className="text-sm">{r.prize_name}</span>
                        {r.status === 2 && r.prize_content && (
                          <code className="ml-2 text-xs font-mono text-primary">{r.prize_content}</code>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
          {total > pageSize && (
            <div className="flex justify-center">
              <Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
