import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardBody, Button, Chip, Spinner, Pagination } from '@heroui/react'
import { HiArrowLeft, HiGift, HiClipboardCopy } from 'react-icons/hi'
import { publicActivityApi } from '../../api'
import { toast } from '../../components/Toast'

interface ActivityRecord {
  id: number
  activity_id: number
  activity?: { title: string }
  prize_name: string
  prize_content: string
  status: number
  created_at: string
}

const statusMap: Record<number, { label: string; color: 'warning' | 'success' | 'default' }> = {
  1: { label: '已参与', color: 'warning' },
  2: { label: '已中奖', color: 'success' },
  3: { label: '未中奖', color: 'default' },
}

export default function ActivityUser() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ch = searchParams.get('ch') || ''

  const goToActivityList = () => {
    const code = ch.trim()
    if (code) navigate(`/activity?ch=${encodeURIComponent(code)}`)
    else navigate(-1)
  }
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 15

  useEffect(() => {
    fetchAllRecords()
  }, [])

  const fetchAllRecords = async () => {
    // 从 localStorage 收集所有活动的 userId
    const userIds = new Set<number>()
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('activity_uid_')) {
        const uid = parseInt(localStorage.getItem(key) || '0')
        if (uid > 0) userIds.add(uid)
      }
    }

    if (userIds.size === 0) {
      setLoading(false)
      return
    }

    const allRecords: ActivityRecord[] = []
    for (const uid of userIds) {
      try {
        const res: any = await publicActivityApi.getMyRecords(uid, 1, 100)
        const list = res.data?.list || []
        allRecords.push(...list)
      } catch {}
    }

    // 按时间倒序
    allRecords.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setRecords(allRecords)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <Button size="sm" variant="light" startContent={<HiArrowLeft />} onPress={goToActivityList}>返回活动</Button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <HiGift className="text-primary" /> 参与记录
        </h2>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : records.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <p className="text-gray-400 mb-4">暂无参与记录</p>
              <Button color="primary" onPress={goToActivityList}>浏览活动</Button>
            </CardBody>
          </Card>
        ) : (
          <>
          <div className="space-y-3">
            {records.slice((page - 1) * pageSize, page * pageSize).map((r) => {
              const s = statusMap[r.status] || statusMap[1]
              return (
                <Card key={r.id} className="w-full">
                  <CardBody className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{r.activity?.title || '未知活动'}</span>
                        <span className="text-xs text-gray-400">{r.prize_name}</span>
                      </div>
                      <Chip size="sm" color={s.color} variant="flat">{s.label}</Chip>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {r.status === 2 && r.prize_content && (
                          <>
                            <span className="text-sm font-mono text-primary select-all">{r.prize_content}</span>
                            <Button isIconOnly size="sm" variant="light" className="ml-1 min-w-6 w-6 h-6"
                              onPress={() => { navigator.clipboard.writeText(r.prize_content); toast.success('已复制') }}>
                              <HiClipboardCopy className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
          {records.length > pageSize && (
            <div className="flex justify-center mt-4">
              <Pagination total={Math.ceil(records.length / pageSize)} page={page} onChange={setPage} />
            </div>
          )}
          </>
        )}
      </main>
    </div>
  )
}
