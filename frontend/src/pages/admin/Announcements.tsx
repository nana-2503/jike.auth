import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Input, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem, Textarea, Spinner, Switch } from '@heroui/react'
import { HiPlus, HiPencil, HiTrash } from 'react-icons/hi'
import { toast } from '../../components/Toast'
import { adminApi } from '../../api'

interface Announcement {
  id: number
  title: string
  content: string
  color: string
  popup: number
  status: number
  sort: number
  created_at: string
}

const colorOptions = [
  { key: 'default', label: '默认' },
  { key: 'primary', label: '主色' },
  { key: 'secondary', label: '次要' },
  { key: 'success', label: '成功' },
  { key: 'warning', label: '警告' },
  { key: 'danger', label: '危险' },
]

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  
  const [editModal, setEditModal] = useState(false)
  const [editItem, setEditItem] = useState<Announcement | null>(null)
  const [form, setForm] = useState({ title: '', content: '', color: 'primary', popup: 0, status: 1, sort: 0 })
  const [saving, setSaving] = useState(false)
  
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; item: Announcement | null }>({ show: false, item: null })

  const loadData = async () => {
    setLoading(true)
    try {
      const res: any = await adminApi.listAnnouncements()
      setAnnouncements(res.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAdd = () => {
    setEditItem(null)
    setForm({ title: '', content: '', color: 'primary', popup: 0, status: 1, sort: 0 })
    setEditModal(true)
  }

  const handleEdit = (item: Announcement) => {
    setEditItem(item)
    setForm({
      title: item.title,
      content: item.content,
      color: item.color,
      popup: item.popup,
      status: item.status,
      sort: item.sort,
    })
    setEditModal(true)
  }

  const handleSave = async () => {
    if (!form.content.trim()) {
      toast.error('请填写公告内容')
      return
    }
    setSaving(true)
    try {
      const data = {
        title: form.title || '公告',
        content: form.content,
        color: form.color,
        popup: form.popup,
        status: form.status,
        sort: form.sort,
      }
      if (editItem) {
        await adminApi.updateAnnouncement(editItem.id, data)
        toast.success('更新成功')
      } else {
        await adminApi.createAnnouncement(data)
        toast.success('创建成功')
      }
      setEditModal(false)
      loadData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.item) return
    try {
      await adminApi.deleteAnnouncement(deleteConfirm.item.id)
      toast.success('删除成功')
      setDeleteConfirm({ show: false, item: null })
      loadData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">公告管理</h2>
        <Button size="sm" color="primary" startContent={<HiPlus className="w-4 h-4" />} onPress={handleAdd}>
          添加公告
        </Button>
      </div>

      {/* 移动端卡片列表 */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">暂无公告</div>
        ) : (
          announcements.map((item) => (
            <Card key={item.id}>
              <CardBody className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">#{item.id}</span>
                    <span className="font-medium text-sm">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Chip color={item.color as any} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1' }}>
                      {item.color}
                    </Chip>
                    {item.popup === 1 && (
                      <Chip color="primary" size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1' }}>
                        弹窗
                      </Chip>
                    )}
                    <Chip color={item.status === 1 ? 'success' : 'default'} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1 text-white' }}>
                      {item.status === 1 ? '启用' : '禁用'}
                    </Chip>
                  </div>
                </div>
                <div className="text-xs text-gray-500 line-clamp-2">{item.content.replace(/<[^>]+>/g, '')}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">排序: </span>
                    <span>{item.sort}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">创建: </span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <Button size="sm" variant="flat" onPress={() => handleEdit(item)} className="flex-1 h-7 text-xs">编辑</Button>
                  <Button size="sm" color="danger" variant="flat" onPress={() => setDeleteConfirm({ show: true, item })} className="flex-1 h-7 text-xs">删除</Button>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      {/* 桌面端表格 */}
      <Card className="hidden md:block">
        <CardBody className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : announcements.length === 0 ? (
            <div className="text-center text-gray-500 py-12">暂无公告</div>
          ) : (
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">ID</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">标题</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">颜色</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">弹窗</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">排序</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">状态</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">创建时间</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((item) => (
                  <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{item.id}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{item.title}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Chip color={item.color as any} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1' }}>
                        {item.color}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Chip color={item.popup === 1 ? 'primary' : 'default'} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1' }}>
                        {item.popup === 1 ? '是' : '否'}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{item.sort}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Chip color={item.status === 1 ? 'success' : 'default'} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1 text-white' }}>
                        {item.status === 1 ? '启用' : '禁用'}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button isIconOnly size="sm" variant="light" onPress={() => handleEdit(item)}>
                          <HiPencil className="w-4 h-4" />
                        </Button>
                        <Button isIconOnly size="sm" color="danger" variant="light" onPress={() => setDeleteConfirm({ show: true, item })}>
                          <HiTrash className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* 编辑/添加 Modal */}
      <Modal isOpen={editModal} onClose={() => setEditModal(false)} size="lg" placement="center">
        <ModalContent>
          <ModalHeader>{editItem ? '编辑公告' : '添加公告'}</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="标题"
              placeholder="公告标题"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Textarea
              label="内容"
              placeholder="公告内容（支持HTML）"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              minRows={3}
            />
            <div className="grid grid-cols-3 gap-4">
              <Select
                label="颜色"
                selectedKeys={[form.color]}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              >
                {colorOptions.map((opt) => (
                  <SelectItem key={opt.key}>{opt.label}</SelectItem>
                ))}
              </Select>
              <Select
                label="状态"
                selectedKeys={[form.status.toString()]}
                onChange={(e) => setForm({ ...form, status: parseInt(e.target.value) })}
              >
                <SelectItem key="1">启用</SelectItem>
                <SelectItem key="0">禁用</SelectItem>
              </Select>
              <Input
                label="排序"
                type="number"
                value={form.sort.toString()}
                onChange={(e) => setForm({ ...form, sort: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                isSelected={form.popup === 1}
                onValueChange={(v) => setForm({ ...form, popup: v ? 1 : 0 })}
              />
              <span className="text-sm">弹窗显示（用户登录后弹窗提示，每天只显示一次）</span>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setEditModal(false)}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认 Modal */}
      <Modal isOpen={deleteConfirm.show} onClose={() => setDeleteConfirm({ show: false, item: null })} placement="center">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定要删除公告 "{deleteConfirm.item?.title}" 吗？</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteConfirm({ show: false, item: null })}>取消</Button>
            <Button color="danger" onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
