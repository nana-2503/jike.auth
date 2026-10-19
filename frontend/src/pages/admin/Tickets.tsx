import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, Button, Chip, Spinner, Input, Select, SelectItem, Pagination } from '@heroui/react'
import { HiSearch, HiChat, HiTrash } from 'react-icons/hi'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'

interface Ticket {
  id: number
  title: string
  category: string
  status: number
  priority: number
  created_at: string
  updated_at: string
  user?: {
    id: number
    username: string
    nickname: string
  }
}

const categoryMap: Record<string, string> = {
  bug: '🐛 Bug反馈',
  feature: '✨ 功能建议',
  question: '❓ 使用问题',
  other: '📝 其他',
}

const priorityMap: Record<number, { label: string; color: 'default' | 'warning' | 'danger' }> = {
  1: { label: '低', color: 'default' },
  2: { label: '中', color: 'warning' },
  3: { label: '高', color: 'danger' },
}

export default function AdminTickets() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const pageSize = 10

  useEffect(() => {
    fetchTickets()
  }, [page, status])

  const fetchTickets = async () => {
    setLoading(true)
    try {
      const res: any = await adminApi.listTickets(page, pageSize, status ? Number(status) : undefined, keyword || undefined)
      setTickets(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '获取工单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchTickets()
  }

  const handleDelete = async (id: number) => {
    const ok = await confirm('确定要删除此工单吗？此操作不可恢复。', '删除工单')
    if (!ok) return
    try {
      await adminApi.deleteTicket(id)
      toast.success('删除成功')
      fetchTickets()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const handleStatusChange = async (id: number, newStatus: number) => {
    try {
      await adminApi.updateTicketStatus(id, newStatus)
      toast.success('状态更新成功')
      fetchTickets()
    } catch (e: any) {
      toast.error(e.message || '更新失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <h2 className="text-xl font-bold">工单管理</h2>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="搜索标题"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            startContent={<HiSearch className="text-gray-400" />}
            className="w-48"
            size="sm"
          />
          <Select
            placeholder="状态筛选"
            selectedKeys={status ? [status] : []}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="w-32"
            size="sm"
          >
            <SelectItem key="">全部</SelectItem>
            <SelectItem key="1">待处理</SelectItem>
            <SelectItem key="2">处理中</SelectItem>
            <SelectItem key="3">已解决</SelectItem>
            <SelectItem key="4">已关闭</SelectItem>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <HiChat className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无工单</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {tickets.map(ticket => (
              <Card key={ticket.id} className="hover:bg-default-50 transition-colors">
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{categoryMap[ticket.category]?.split(' ')[0]}</span>
                        <h3 className="font-medium truncate">{ticket.title}</h3>
                        <Chip size="sm" color={priorityMap[ticket.priority]?.color} variant="flat">
                          {priorityMap[ticket.priority]?.label}
                        </Chip>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>#{ticket.id}</span>
                        <span>·</span>
                        <span>{ticket.user?.nickname || ticket.user?.username}</span>
                        <span>·</span>
                        <span>{new Date(ticket.updated_at).toLocaleString('zh-CN')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        size="sm"
                        selectedKeys={[String(ticket.status)]}
                        onChange={(e) => handleStatusChange(ticket.id, Number(e.target.value))}
                        className="w-28"
                        aria-label="状态"
                      >
                        <SelectItem key="1">待处理</SelectItem>
                        <SelectItem key="2">处理中</SelectItem>
                        <SelectItem key="3">已解决</SelectItem>
                        <SelectItem key="4">已关闭</SelectItem>
                      </Select>
                      <Button
                        isIconOnly
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={() => handleDelete(ticket.id)}
                      >
                        <HiTrash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {total > pageSize && (
            <div className="flex justify-center mt-4">
              <Pagination
                total={Math.ceil(total / pageSize)}
                page={page}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
