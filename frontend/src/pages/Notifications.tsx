import { useEffect, useState } from 'react'
import { Button, Card, CardBody, Chip, Pagination, Spinner } from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiBell, HiCheck, HiSparkles, HiTrash } from 'react-icons/hi'

interface NotificationItem {
  id: number
  type: string
  level: string
  title: string
  content: string
  ref_type: string
  ref_id: number
  read_at: string | null
  created_at: string
}

const levelColor = (level: string) => {
  if (level === 'warning') return 'warning'
  if (level === 'danger') return 'danger'
  if (level === 'success') return 'success'
  return 'primary'
}

export default function Notifications() {
  const [list, setList] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [unread, setUnread] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const fetchList = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listNotifications(page, 12)
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
      setUnread(res.data?.unread || 0)
    } catch (e: any) {
      toast.error(e.message || '获取通知失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchList() }, [page])

  const markRead = async (id: number) => {
    try {
      await userApi.markNotificationRead(id)
      fetchList()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const markAllRead = async () => {
    try {
      await userApi.markAllNotificationsRead()
      toast.success('已全部标记已读')
      fetchList()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const remove = async (id: number) => {
    try {
      await userApi.deleteNotification(id)
      toast.success('删除成功')
      fetchList()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const clearAll = async () => {
    if (!await confirm('确定要清理全部通知吗？此操作不可撤销。')) return
    try {
      const res: any = await userApi.clearNotifications()
      toast.success(`已清理 ${res.data?.count || 0} 条通知`)
      setPage(1)
      fetchList()
    } catch (e: any) { toast.error(e.message || '清理失败') }
  }

  return (
    <div className="space-y-4">
      <Card className="border border-primary/10 bg-gradient-to-br from-primary/10 via-white to-white dark:via-content1 dark:to-content1 shadow-sm">
        <CardBody className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center shadow-inner flex-shrink-0">
                <HiBell className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold">通知中心</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">系统消息、工单提醒和业务通知会集中显示在这里</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Chip color={unread > 0 ? 'warning' : 'success'} variant="flat" className="px-2">
                未读 {unread} 条
              </Chip>
              <Button size="sm" color="primary" variant="flat" className="h-7 min-w-0 px-2 text-xs" onPress={markAllRead} startContent={<HiCheck className="w-3.5 h-3.5" />}>已读</Button>
              <Button size="sm" color="secondary" variant="flat" className="h-7 min-w-0 px-2 text-xs" onPress={clearAll} startContent={<HiSparkles className="w-3.5 h-3.5" />}>清空</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : list.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无通知</CardBody></Card>
      ) : (
        <div className="space-y-3">
          {list.map(item => (
            <Card key={item.id} className={item.read_at ? '' : 'border border-primary/30 bg-primary/5'}>
              <CardBody className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{item.title}</h3>
                      <Chip size="sm" color={levelColor(item.level) as any} variant="flat">{item.level || 'info'}</Chip>
                      {!item.read_at && <Chip size="sm" color="primary" variant="solid" classNames={{ content: 'text-white' }}>未读</Chip>}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{item.content}</p>
                    <p className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!item.read_at && <Button isIconOnly size="sm" variant="flat" color="primary" onPress={() => markRead(item.id)}><HiCheck className="w-4 h-4" /></Button>}
                    <Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => remove(item.id)}><HiTrash className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {total > 12 && <div className="flex justify-center"><Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} /></div>}
    </div>
  )
}
