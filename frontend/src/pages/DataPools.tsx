import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Select, SelectItem,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Drawer, DrawerContent, DrawerHeader, DrawerBody, Input, Textarea, Switch,
  useDisclosure,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiPlus, HiPencil, HiTrash, HiDotsVertical, HiDatabase, HiSave } from 'react-icons/hi'

export default function DataPools() {
  const navigate = useNavigate()
  const [pools, setPools] = useState<any[]>([])
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedApp, setSelectedApp] = useState<string>('')
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  
  // 编辑表单状态
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    app_id: '',
    name: '',
    code: '',
    sort: 0,
    require_login: false,
    remark: '',
  })
  
  const isNewPool = editingId === null

  const loadApps = async () => {
    try {
      const res: any = await userApi.listApps(1, 100)
      setApps(res.data.list || [])
    } catch {}
  }

  const loadPools = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listDataPools(
        selectedApp ? Number(selectedApp) : null,
        page, 20
      )
      setPools(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApps()
  }, [])

  useEffect(() => {
    loadPools()
  }, [page, selectedApp])

  const handleDelete = async (pool: any) => {
    const confirmed = await confirm(`确定要删除数据池 "${pool.name}" 吗？删除后其中的数据项也会被删除。`, '删除数据池')
    if (!confirmed) return

    try {
      await userApi.deleteDataPool(pool.id)
      toast.success('删除成功')
      loadPools()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const handleEdit = (pool: any) => {
    setEditingId(pool.id)
    setForm({
      app_id: String(pool.app_id),
      name: pool.name || '',
      code: pool.code || '',
      sort: pool.sort || 0,
      require_login: pool.require_login === 1,
      remark: pool.remark || '',
    })
    onEditOpen()
  }

  const handleNew = () => {
    setEditingId(null)
    setForm({
      app_id: apps[0]?.id?.toString() || '',
      name: '',
      code: '',
      sort: 0,
      require_login: false,
      remark: '',
    })
    onEditOpen()
  }

  const handleSave = async () => {
    if (!form.app_id) { toast.error('请选择应用'); return }
    if (!form.name.trim()) { toast.error('请输入数据池名称'); return }
    if (!form.code.trim()) { toast.error('请输入数据池编码'); return }

    setSaving(true)
    try {
      const data = {
        app_id: Number(form.app_id),
        name: form.name,
        code: form.code,
        sort: form.sort,
        require_login: form.require_login ? 1 : 0,
        remark: form.remark,
      }

      if (isNewPool) {
        await userApi.createDataPool(data)
        toast.success('创建成功')
      } else {
        await userApi.updateDataPool(editingId!, data)
        toast.success('更新成功')
      }
      onEditClose()
      loadPools()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <Select
          placeholder="全部应用"
          selectedKeys={selectedApp ? [selectedApp] : []}
          onChange={(e) => { setSelectedApp(e.target.value); setPage(1) }}
          className="w-full sm:w-48"
          size="sm"
        >
          {[{ id: '', app_name: '全部应用' }, ...apps].map((app: any) => (
            <SelectItem key={String(app.id || '')}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <Button size="sm" color="primary" startContent={<HiPlus />} onPress={handleNew}>
          新建数据池
        </Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : pools.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无数据池</CardBody></Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {pools.map((pool) => (
            <Card key={pool.id} isPressable onPress={() => navigate(`/data-pools/${pool.id}/items`)} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <HiDatabase className="w-5 h-5 text-primary" />
                    <span className="font-medium">{pool.name}</span>
                  </div>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button isIconOnly size="sm" variant="light">
                        <HiDotsVertical />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu>
                      <DropdownItem key="edit" startContent={<HiPencil />}
                        onPress={() => handleEdit(pool)}>编辑</DropdownItem>
                      <DropdownItem key="delete" startContent={<HiTrash />} color="danger"
                        onPress={() => handleDelete(pool)}>删除</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>编码: {pool.code}</span>
                    <span>排序: {pool.sort}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>应用: {pool.app?.app_name || '-'}</span>
                    <Chip size="sm" color={pool.require_login ? 'warning' : 'default'} variant="solid" classNames={{ content: pool.require_login ? 'text-white' : '' }}>
                      {pool.require_login ? '需登录添加' : '无需登录'}
                    </Chip>
                  </div>
                  {pool.remark && <div className="truncate">备注: {pool.remark}</div>}
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
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="lg" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>{isNewPool ? '新建数据池' : '编辑数据池'}</span>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">
                {isNewPool ? '创建' : '保存'}
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4 mt-6">
              <Select
                label="所属应用"
                selectedKeys={form.app_id ? [form.app_id] : []}
                onChange={(e) => setForm({ ...form, app_id: e.target.value })}
                isRequired
                isDisabled={!isNewPool}
                size="sm"
                variant="bordered"
              >
                {apps.map((app: any) => (
                  <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                ))}
              </Select>

              <Input
                label="数据池名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                isRequired
                size="sm"
                variant="bordered"
              />

              <Input
                label="数据池编码"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                description="唯一标识，用于API调用"
                isRequired
                size="sm"
                variant="bordered"
              />

              <Input
                label="排序号"
                type="number"
                value={String(form.sort)}
                onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
                description="数字越小越靠前"
                size="sm"
                variant="bordered"
              />

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
                <div>
                  <p className="font-medium">客户端添加数据需登录</p>
                  <p className="text-xs text-gray-500">开启后，客户端接口添加数据需要先登录</p>
                </div>
                <Switch
                  size="sm"
                  isSelected={form.require_login}
                  onValueChange={(v) => setForm({ ...form, require_login: v })}
                />
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
