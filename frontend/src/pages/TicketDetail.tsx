import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardBody, Button, Chip, Spinner, Avatar, Popover, PopoverTrigger, PopoverContent } from '@heroui/react'
import { HiArrowLeft, HiLockClosed, HiEmojiHappy } from 'react-icons/hi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { avatarOrDefault } from '../utils/avatar'
import { confirm } from '../components/ConfirmModal'

interface Ticket {
  id: number
  title: string
  category: string
  status: number
  priority: number
  created_at: string
}

interface Message {
  id: number
  content: string
  is_admin: number
  created_at: string
  user?: {
    id: number
    username: string
    nickname: string
    avatar: string
  }
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

// 常用emoji列表
const emojis = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅', '😢', '😭', '😤', '😡', '🥺', '👍', '👎', '👏', '🙏', '💪', '❤️', '💔', '🔥', '⭐', '✨', '🎉', '🎊', '💯', '✅', '❌', '⚠️', '❓', '❗', '💡', '📝', '🐛', '🔧', '🚀', '💻', '📱']

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchTicket()
    fetchMessages()
  }, [id])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchTicket = async () => {
    try {
      const res: any = await userApi.getTicket(Number(id))
      setTicket(res.data)
    } catch (e: any) {
      toast.error(e.message || '获取工单失败')
      navigate('/tickets')
    }
  }

  const fetchMessages = async () => {
    try {
      const res: any = await userApi.getTicketMessages(Number(id))
      setMessages(res.data || [])
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!content.trim()) return
    setSending(true)
    try {
      const res: any = await userApi.sendTicketMessage(Number(id), content)
      setMessages([...messages, res.data])
      setContent('')
    } catch (e: any) {
      toast.error(e.message || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleClose = async () => {
    const ok = await confirm('确定要关闭此工单吗？关闭后将无法继续回复。', '关闭工单')
    if (!ok) return
    try {
      await userApi.closeTicket(Number(id))
      toast.success('工单已关闭')
      fetchTicket()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const insertEmoji = (emoji: string) => {
    setContent(content + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  if (!ticket) return null

  const isClosed = ticket.status === 4

  return (
    <div className="md:h-[calc(100vh-140px)] flex flex-col">
      {/* 顶部信息栏 */}
      <Card className="mb-4 flex-shrink-0">
        <CardBody className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button isIconOnly variant="light" onPress={() => navigate('/tickets')}>
                <HiArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{categoryMap[ticket.category]?.split(' ')[0]}</span>
                  <h2 className="font-bold">{ticket.title}</h2>
                  <Chip size="sm" color={statusMap[ticket.status]?.color} variant="flat">
                    {statusMap[ticket.status]?.label}
                  </Chip>
                </div>
                <p className="text-sm text-gray-500">
                  #{ticket.id} · 创建于 {new Date(ticket.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>
            {!isClosed && (
              <Button color="danger" variant="flat" startContent={<HiLockClosed />} onPress={handleClose}>
                关闭工单
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 消息列表 - QQ风格 */}
      <Card className="flex-1 overflow-hidden">
        <CardBody className="p-0 flex flex-col h-full">
          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50">
            {messages.map((msg) => {
              const isMe = msg.is_admin === 0 // 作者发的消息在右边
              const displayName = msg.user?.nickname || msg.user?.username || '未知'

              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {/* 头像 */}
                  <Avatar
                    src={avatarOrDefault(msg.user?.avatar)}
                    name={displayName}
                    size="sm"
                    className={`flex-shrink-0 ${msg.is_admin === 1 ? 'ring-2 ring-primary' : ''}`}
                  />
                  {/* 消息内容 */}
                  <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* 名称和时间 */}
                    <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <span className={`text-sm font-medium ${msg.is_admin === 1 ? 'text-primary' : ''}`}>
                        {displayName}
                        {msg.is_admin === 1 && <span className="ml-1 text-xs text-primary">[客服]</span>}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {/* 气泡 */}
                    <div
                      className={`relative px-4 py-2 rounded-2xl ${
                        isMe
                          ? 'bg-primary text-white rounded-tr-sm'
                          : 'bg-white dark:bg-content2 rounded-tl-sm shadow-sm'
                      }`}
                    >
                      <div className={`prose prose-sm max-w-none ${isMe ? 'prose-invert' : 'dark:prose-invert'}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          {!isClosed ? (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-content1">
              <div className="flex gap-2">
                <Popover isOpen={showEmoji} onOpenChange={setShowEmoji} placement="top-start">
                  <PopoverTrigger>
                    <Button isIconOnly variant="flat" className="flex-shrink-0">
                      <HiEmojiHappy className="w-5 h-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2">
                    <div className="grid grid-cols-8 gap-1 max-w-[280px]">
                      {emojis.map(emoji => (
                        <button
                          key={emoji}
                          className="w-8 h-8 flex items-center justify-center hover:bg-default-100 rounded text-lg"
                          onClick={() => insertEmoji(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (Enter发送，Shift+Enter换行)"
                    className="w-full px-4 py-3 rounded-xl bg-default-100 dark:bg-default-50 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    rows={1}
                    style={{ minHeight: '48px', maxHeight: '120px' }}
                  />
                </div>
                <Button
                  color="primary"
                  onPress={handleSend}
                  isLoading={sending}
                  isDisabled={!content.trim()}
                  className="flex-shrink-0"
                >
                  发送
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-center text-gray-500">
              <HiLockClosed className="w-5 h-5 inline mr-2" />
              工单已关闭，无法继续回复
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
