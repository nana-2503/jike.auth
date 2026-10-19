import { useState, useEffect } from 'react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerBody,
  Button, Input, Textarea, Switch, Chip, Pagination, Spinner,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiPlus, HiPencil, HiTrash, HiSave, HiArrowLeft } from 'react-icons/hi'

interface Props {
  isOpen: boolean
  onClose: () => void
  appId: number | null
  api?: typeof userApi
}

interface Announcement {
  id: number
  title: string
  content: string
  status: number
  sort: number
  created_at: string
}

export default function AppAnnouncementDrawer({ isOpen, onClose, appId, api = userApi }: Props) {
  const [list, setList] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // 编辑状态
  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', status: 1, sort: 0 })

  const fetchList = async () => {
    if (!appId) return
    setLoading(true)
    try {
      const res: any = await api.listAppAnnouncements(appId, page, 10)
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch { toast.error('获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isOpen && appId) { fetchList() } }, [isOpen, appId, page])

  const handleNew = () => {
    setEditingId(null)
    setForm({ title: '', content: '', status: 1, sort: 0 })
    setEditing(true)
  }

  const handleEdit = (ann: Announcement) => {
    setEditingId(ann.id)
    setForm({ title: ann.title, content: ann.content, status: ann.status, sort: ann.sort })
    setEditing(true)
  }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定删除这条公告吗？')) return
    try {
      await api.deleteAppAnnouncement(id)
      toast.success('删除成功')
      fetchList()
    } catch { toast.error('删除失败') }
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('请输入标题'); return }
    setSaving(true)
    try {
      if (editingId) {
        await api.updateAppAnnouncement(editingId, form)
        toast.success('保存成功')
      } else {
        await api.createAppAnnouncement({ ...form, app_id: appId })
        toast.success('创建成功')
      }
      setEditing(false)
      fetchList()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleClose = () => {
    setEditing(false)
    onClose()
  }

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} placement="right" size="xl" hideCloseButton>
      <DrawerContent className="rounded-none">
        <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
          {editing ? (
            <>
              <div className="flex items-center gap-2">
                <Button isIconOnly size="sm" variant="light" onPress={() => setEditing(false)}><HiArrowLeft className="w-4 h-4" /></Button>
                <span>{editingId ? '编辑公告' : '添加公告'}</span>
              </div>
              <Button color="primary" size="sm" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
                {editingId ? '保存' : '创建'}
              </Button>
            </>
          ) : (
            <>
              <span>应用公告</span>
              <div className="flex gap-2">
                <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />} onPress={handleNew}>添加</Button>
                <Button variant="flat" size="sm" onPress={handleClose}>关闭</Button>
              </div>
            </>
          )}
        </DrawerHeader>
        <DrawerBody className="overflow-y-auto">
          {editing ? (
            <div className="space-y-4 mt-4">
              <Input label="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} isRequired size="sm" variant="bordered" />
              <Textarea label="内容" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} minRows={4} size="sm" variant="bordered" />
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                <span className="text-sm">启用</span>
                <Switch size="sm" isSelected={form.status === 1} onValueChange={(v) => setForm({ ...form, status: v ? 1 : 0 })} />
              </div>
              <Input label="排序" type="number" value={String(form.sort)} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} description="数字越大越靠前" size="sm" variant="bordered" />
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-gray-400">暂无公告</div>
          ) : (
            <div className="space-y-3 mt-4">
              {list.map((ann) => (
                <div key={ann.id} className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{ann.title}</h4>
                      <Chip size="sm" variant="flat" color={ann.status === 1 ? 'success' : 'default'}>
                        {ann.status === 1 ? '启用' : '禁用'}
                      </Chip>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button isIconOnly size="sm" variant="light" color="primary" onPress={() => handleEdit(ann)}><HiPencil className="w-3.5 h-3.5" /></Button>
                      <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => handleDelete(ann.id)}><HiTrash className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  {ann.content && <p className="text-xs text-gray-500 line-clamp-2">{ann.content}</p>}
                  <div className="text-xs text-gray-400 mt-2">{new Date(ann.created_at).toLocaleString()}</div>
                </div>
              ))}
              {total > 10 && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / 10)} page={page} onChange={setPage} size="sm" /></div>}
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
