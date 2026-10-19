import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Input,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Drawer, DrawerContent, DrawerHeader, DrawerBody, Textarea, Switch, DatePicker,
  useDisclosure,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { currentZonedDateTime } from '../utils/datePicker'
import { HiPlus, HiPencil, HiTrash, HiDotsVertical, HiArrowLeft, HiSearch, HiSave } from 'react-icons/hi'

export default function DataItems() {
  const navigate = useNavigate()
  const { poolId } = useParams()
  const [pool, setPool] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  
  // 编辑表单状态
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    code: '',
    content: '',
    modify_count: -1,
    expire_at: null as any,
    require_login: false,
    require_paid: false,
    allow_delete: false,
    allow_modify: false,
    allow_expire: false,
    remark: '',
  })
  
  const isNewItem = editingId === null

  const loadPool = async () => {
    try {
      const res: any = await userApi.getDataPool(Number(poolId))
      setPool(res.data)
    } catch (e: any) {
      toast.error(e.message || '数据池不存在')
      navigate('/data-pools')
    }
  }

  const loadItems = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listDataItems(Number(poolId), page, 20, keyword || undefined)
      setItems(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPool()
  }, [poolId])

  useEffect(() => {
    if (poolId) loadItems()
  }, [poolId, page])

  const handleSearch = () => {
    setPage(1)
    loadItems()
  }

  const handleDelete = async (item: any) => {
    const confirmed = await confirm(`确定要删除数据项 "${item.name}" 吗？`, '删除数据项')
    if (!confirmed) return

    try {
      await userApi.deleteDataItem(Number(poolId), item.id)
      toast.success('删除成功')
      loadItems()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const handleEdit = (item: any) => {
    setEditingId(item.id)
    setForm({
      name: item.name || '',
      code: item.code || '',
      content: item.content || '',
      modify_count: item.modify_count ?? -1,
      expire_at: item.expire_at && item.expire_at !== '0001-01-01T00:00:00Z'
        ? parseAbsoluteToLocal(item.expire_at) : null,
      require_login: item.require_login === 1,
      require_paid: item.require_paid === 1,
      allow_delete: item.allow_delete === 1,
      allow_modify: item.allow_modify === 1,
      allow_expire: item.allow_expire === 1,
      remark: item.remark || '',
    })
    onEditOpen()
  }

  const handleNew = () => {
    setEditingId(null)
    setForm({
      name: '',
      code: '',
      content: '',
      modify_count: -1,
      expire_at: null,
      require_login: false,
      require_paid: false,
      allow_delete: false,
      allow_modify: false,
      allow_expire: false,
      remark: '',
    })
    onEditOpen()
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('请输入数据名称'); return }
    if (!form.code.trim()) { toast.error('请输入数据编号'); return }

    setSaving(true)
    try {
      let expireAtStr = ''
      if (form.expire_at) {
        const d = form.expire_at as any
        if (d.toAbsoluteString) {
          expireAtStr = d.toAbsoluteString()
        } else if (d.toDate) {
          expireAtStr = d.toDate().toISOString()
        }
      }

      const data = {
        name: form.name,
        code: form.code,
        content: form.content,
        modify_count: form.modify_count,
        expire_at: expireAtStr,
        require_login: form.require_login ? 1 : 0,
        require_paid: form.require_paid ? 1 : 0,
        allow_delete: form.allow_delete ? 1 : 0,
        allow_modify: form.allow_modify ? 1 : 0,
        allow_expire: form.allow_expire ? 1 : 0,
        remark: form.remark,
      }

      if (isNewItem) {
        await userApi.createDataItem(Number(poolId), data)
        toast.success('创建成功')
      } else {
        await userApi.updateDataItem(Number(poolId), editingId!, data)
        toast.success('更新成功')
      }
      onEditClose()
      loadItems()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (time: string) => {
    if (!time || time === '0001-01-01T00:00:00Z') return '-'
    return new Date(time).toLocaleString('zh-CN')
  }

  const isExpired = (time: string) => {
    if (!time || time === '0001-01-01T00:00:00Z') return false
    return new Date(time) < new Date()
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/data-pools')}>
          <HiArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{pool?.name || '数据池'}</h1>
          <p className="text-sm text-gray-500">编码: {pool?.code} · 应用: {pool?.app?.app_name}</p>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2">
          <Input
            placeholder="搜索名称/编号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full sm:w-64"
            size="sm"
            startContent={<HiSearch className="text-gray-400" />}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button size="sm" onPress={handleSearch}>搜索</Button>
        </div>
        <Button color="primary" startContent={<HiPlus />} onPress={handleNew}>
          新建数据项
        </Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无数据项</CardBody></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <p className="text-xs text-gray-500">编号: {item.code}</p>
                  </div>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button isIconOnly size="sm" variant="light">
                        <HiDotsVertical />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu>
                      <DropdownItem key="edit" startContent={<HiPencil />}
                        onPress={() => handleEdit(item)}>编辑</DropdownItem>
                      <DropdownItem key="delete" startContent={<HiTrash />} color="danger"
                        onPress={() => handleDelete(item)}>删除</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="line-clamp-2 bg-gray-50 dark:bg-content2 p-2 rounded text-xs font-mono">
                    {item.content?.substring(0, 100) || '(空)'}
                    {item.content?.length > 100 && '...'}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Chip size="sm" variant="flat">
                      修改: {item.modified_count}/{item.modify_count === -1 ? '∞' : item.modify_count}
                    </Chip>
                    {item.require_login === 1 && <Chip size="sm" color="warning" variant="solid" classNames={{ content: "text-white" }}>需登录</Chip>}
                    {item.require_paid === 1 && <Chip size="sm" color="success" variant="solid" classNames={{ content: "text-white" }}>需付费</Chip>}
                    {item.allow_delete === 1 && <Chip size="sm" color="danger" variant="solid" classNames={{ content: "text-white" }}>可删除</Chip>}
                    {item.allow_modify === 1 && <Chip size="sm" color="primary" variant="flat">可修改</Chip>}
                    {item.allow_expire === 1 && <Chip size="sm" color="secondary" variant="flat">过期可改</Chip>}
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>过期: {formatTime(item.expire_at)}</span>
                    {isExpired(item.expire_at) && <Chip size="sm" color="danger">已过期</Chip>}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 20 && (
        <div className="flex justify-center">
          <Pagination total={Math.ceil(total / 20)} page={page} onChange={setPage} />
        </div>
      )}

      {/* 编辑抽屉 */}
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <div>
              <span>{isNewItem ? '新建数据项' : '编辑数据项'}</span>
              <p className="text-sm text-gray-500 font-normal">数据池: {pool?.name}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">
                {isNewItem ? '创建' : '保存'}
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4 mt-6">
              <Input
                label="数据名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                isRequired
                size="sm"
                variant="bordered"
              />

              <Input
                label="数据编号"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                description="唯一标识，用于API调用"
                isRequired
                size="sm"
                variant="bordered"
              />

              <Textarea
                label="数据内容"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                minRows={5}
                maxRows={15}
                description="支持长文本数据"
                size="sm"
                variant="bordered"
              />

              <Input
                label="可修改次数"
                type="number"
                value={String(form.modify_count)}
                onChange={(e) => setForm({ ...form, modify_count: Number(e.target.value) })}
                description="-1 表示无限次"
                size="sm"
                variant="bordered"
              />

              <div className="space-y-2">
                <DatePicker
                  label="过期时间"
                  value={form.expire_at}
                  onChange={(v) => setForm({ ...form, expire_at: v })}
                  granularity="second"
                  hourCycle={24}
                  hideTimeZone
                  size="sm"
                />
                <Button size="sm" variant="flat" onPress={() => setForm({ ...form, expire_at: currentZonedDateTime() })}>设为当前时间</Button>
              </div>

              <div className="space-y-3 pt-2">
                <p className="font-medium text-sm">客户端接口权限</p>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                  <div>
                    <p className="text-sm">验证登录</p>
                    <p className="text-xs text-gray-500">客户端访问此数据需要先登录</p>
                  </div>
                  <Switch
                    size="sm"
                    isSelected={form.require_login}
                    onValueChange={(v) => setForm({ ...form, require_login: v })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                  <div>
                    <p className="text-sm">需要付费</p>
                    <p className="text-xs text-gray-500">仅付费用户可访问此数据（自动要求登录）</p>
                  </div>
                  <Switch
                    size="sm"
                    isSelected={form.require_paid}
                    onValueChange={(v) => setForm({ ...form, require_paid: v })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                  <div>
                    <p className="text-sm">允许删除</p>
                    <p className="text-xs text-gray-500">客户端可以删除此数据</p>
                  </div>
                  <Switch
                    size="sm"
                    isSelected={form.allow_delete}
                    onValueChange={(v) => setForm({ ...form, allow_delete: v })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                  <div>
                    <p className="text-sm">允许修改</p>
                    <p className="text-xs text-gray-500">客户端可以修改此数据内容</p>
                  </div>
                  <Switch
                    size="sm"
                    isSelected={form.allow_modify}
                    onValueChange={(v) => setForm({ ...form, allow_modify: v })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                  <div>
                    <p className="text-sm">允许过期修改</p>
                    <p className="text-xs text-gray-500">客户端可以修改此数据的过期时间</p>
                  </div>
                  <Switch
                    size="sm"
                    isSelected={form.allow_expire}
                    onValueChange={(v) => setForm({ ...form, allow_expire: v })}
                  />
                </div>
              </div>

              <Textarea
                label="备注"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                size="sm"
                variant="bordered"
              />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
