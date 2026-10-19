import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, Button, Chip, Spinner, Drawer, DrawerContent, DrawerHeader, DrawerBody, Input, Textarea, Select, SelectItem } from '@heroui/react'
import { HiPlus, HiChat } from 'react-icons/hi'
import { userApi } from '../api'
import { toast } from '../components/Toast'

interface Ticket {
  id: number
  title: string
  category: string
  status: number
  priority: number
  created_at: string
  updated_at: string
}

const statusMap: Record<number, { label: string; color: 'warning' | 'primary' | 'success' | 'default' }> = {
  1: { label: '待处理', color: 'warning' },
  2: { label: '处理中', color: 'primary' },
  3: { label: '已解决', color: 'success' },
  4: { label: '已关闭', color: 'default' },
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

export default function Tickets() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    category: 'question',
    content: '',
    priority: 1,
  })

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async () => {
    try {
      const res: any = await userApi.listTickets(1, 100)
      setTickets(res.data.list || [])
    } catch (e: any) {
      toast.error(e.message || '获取工单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('请填写标题和内容')
      return
    }
    setCreating(true)
    try {
      const res: any = await userApi.createTicket(form)
      toast.success('工单创建成功')
      setShowCreate(false)
      setForm({ title: '', category: 'question', content: '', priority: 1 })
      navigate(`/tickets/${res.data.id}`)
    } catch (e: any) {
      toast.error(e.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button size="sm" color="primary" startContent={<HiPlus className="w-4 h-4" />} onPress={() => setShowCreate(true)}>
          创建工单
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <HiChat className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无工单，点击上方按钮创建</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <Card
              key={ticket.id}
              isPressable
              onPress={() => navigate(`/tickets/${ticket.id}`)}
              className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent"
            >
              <CardBody className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{categoryMap[ticket.category]?.split(' ')[0]}</span>
                      <h3 className="font-medium truncate">{ticket.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>#{ticket.id}</span>
                      <span>·</span>
                      <span>{new Date(ticket.updated_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip size="sm" color={priorityMap[ticket.priority]?.color} variant="flat">
                      {priorityMap[ticket.priority]?.label}
                    </Chip>
                    <Chip size="sm" color={statusMap[ticket.status]?.color} variant="flat">
                      {statusMap[ticket.status]?.label}
                    </Chip>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 创建工单抽屉 */}
      <Drawer isOpen={showCreate} onClose={() => setShowCreate(false)} placement="right" size="lg" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">创建工单</span>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" onPress={() => setShowCreate(false)}>取消</Button>
              <Button size="sm" color="primary" onPress={handleCreate} isLoading={creating}>创建</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4">
              <Input
                label="标题"
                placeholder="简要描述您的问题"
                size="sm"
                variant="bordered"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="分类"
                  size="sm"
                  variant="bordered"
                  selectedKeys={[form.category]}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <SelectItem key="bug">🐛 Bug反馈</SelectItem>
                  <SelectItem key="feature">✨ 功能建议</SelectItem>
                  <SelectItem key="question">❓ 使用问题</SelectItem>
                  <SelectItem key="other">📝 其他</SelectItem>
                </Select>
                <Select
                  label="优先级"
                  size="sm"
                  variant="bordered"
                  selectedKeys={[String(form.priority)]}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                >
                  <SelectItem key="1">低</SelectItem>
                  <SelectItem key="2">中</SelectItem>
                  <SelectItem key="3">高</SelectItem>
                </Select>
              </div>
              <Textarea
                label="详细描述"
                placeholder="请详细描述您的问题，支持Markdown格式"
                size="sm"
                variant="bordered"
                minRows={6}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
