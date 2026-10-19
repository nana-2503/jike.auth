import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Input, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure, Switch, Checkbox, CheckboxGroup,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiPlus, HiPencil, HiTrash, HiRefresh, HiClipboardCopy } from 'react-icons/hi'

interface OpenApiKey {
  id: number
  name: string
  secret_key: string
  permissions: string
  status: number
  last_used_at: string | null
  created_at: string
}

export default function OpenApiKeys() {
  const [keys, setKeys] = useState<OpenApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [editingKey, setEditingKey] = useState<OpenApiKey | null>(null)
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [permissionLabels, setPermissionLabels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const fetchPermissions = async () => {
    try {
      const res: any = await userApi.getOpenApiPermissions()
      setPermissionLabels(res.data || {})
    } catch {
      // 失败时不阻塞页面，仅提示；编辑弹窗仍可显示已选权限 key
      toast.error('加载权限列表失败')
    }
  }

  const fetchKeys = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listOpenApiKeys()
      setKeys(res.data || [])
    } catch { toast.error('加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchPermissions()
    fetchKeys()
  }, [])

  const handleNew = () => {
    setEditingKey(null)
    setName('')
    setPermissions([])
    onOpen()
  }

  const handleEdit = (key: OpenApiKey) => {
    setEditingKey(key)
    setName(key.name)
    setPermissions(key.permissions ? key.permissions.split(',') : [])
    onOpen()
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('请输入密钥名称'); return }
    if (permissions.length === 0) { toast.error('请至少选择一个权限'); return }
    setSaving(true)
    try {
      if (editingKey) {
        await userApi.updateOpenApiKey(editingKey.id, { name, permissions })
      } else {
        await userApi.createOpenApiKey({ name, permissions })
      }
      toast.success(editingKey ? '更新成功' : '创建成功')
      onClose()
      fetchKeys()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这个密钥吗？')) return
    try {
      await userApi.deleteOpenApiKey(id)
      toast.success('删除成功')
      fetchKeys()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleToggleStatus = async (key: OpenApiKey) => {
    try {
      await userApi.updateOpenApiKey(key.id, { status: key.status === 1 ? 0 : 1 })
      toast.success(key.status === 1 ? '已禁用' : '已启用')
      fetchKeys()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const handleReset = async (id: number) => {
    if (!await confirm('重置后旧密钥将立即失效，确定要重置吗？')) return
    try {
      const res: any = await userApi.resetOpenApiKey(id)
      toast.success('密钥已重置')
      fetchKeys()
      navigator.clipboard.writeText(res.data.secret_key)
      toast.success('新密钥已复制到剪贴板')
    } catch (e: any) { toast.error(e.message || '重置失败') }
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    toast.success('已复制')
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">密钥管理</h2>
          <p className="text-sm text-gray-500 hidden sm:block">管理开放API密钥，通过密钥可以查询应用、卡种、卡号、用户等数据</p>
        </div>
        <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />} onPress={handleNew}>创建密钥</Button>
      </div>

      {keys.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无密钥，点击右上角创建</CardBody></Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id} className="hover:shadow-lg transition-shadow">
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{key.name}</h3>
                      <Chip size="sm" color={key.status === 1 ? 'success' : 'default'} variant="flat">
                        {key.status === 1 ? '启用' : '禁用'}
                      </Chip>
                    </div>
                    <div className="flex items-center gap-2 mt-1 min-w-0">
                      <code className="text-xs bg-gray-100 dark:bg-content2 px-2 py-1 rounded font-mono break-all max-w-full overflow-hidden">
                        {key.secret_key}
                      </code>
                      <Button isIconOnly size="sm" variant="light" onPress={() => copyKey(key.secret_key)}>
                        <HiClipboardCopy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Switch size="sm" isSelected={key.status === 1} onValueChange={() => handleToggleStatus(key)} />
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {key.permissions.split(',').filter(Boolean).map((p) => (
                    <Chip key={p} size="sm" variant="flat" color="primary" className="text-xs">{permissionLabels[p] || p}</Chip>
                  ))}
                </div>
                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span>创建于 {new Date(key.created_at).toLocaleString()}</span>
                  <span>{key.last_used_at ? `最后使用 ${new Date(key.last_used_at).toLocaleString()}` : '从未使用'}</span>
                </div>
                <div className="flex gap-2 mt-3 justify-end">
                  <Button size="sm" variant="flat" color="primary" startContent={<HiPencil className="w-4 h-4" />} onPress={() => handleEdit(key)}>编辑</Button>
                  <Button size="sm" variant="flat" color="warning" startContent={<HiRefresh className="w-4 h-4" />} onPress={() => handleReset(key.id)}>重置</Button>
                  <Button size="sm" variant="flat" color="danger" startContent={<HiTrash className="w-4 h-4" />} onPress={() => handleDelete(key.id)}>删除</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={onClose} placement="center">
        <ModalContent>
          <ModalHeader>{editingKey ? '编辑密钥' : '创建密钥'}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input label="密钥名称" value={name} onChange={(e) => setName(e.target.value)} isRequired placeholder="例如：网站查询接口" />
              <div>
                <p className="text-sm font-medium mb-2">接口权限</p>
                <CheckboxGroup value={permissions} onChange={(v) => setPermissions(v as string[])}>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(permissionLabels).map(([key, label]) => (
                      <Checkbox key={key} value={key} size="sm">{label}</Checkbox>
                    ))}
                  </div>
                </CheckboxGroup>
                {Object.keys(permissionLabels).length === 0 && (
                  <p className="text-xs text-gray-500 mt-2">权限列表加载失败或为空，可稍后刷新页面重试。</p>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving}>{editingKey ? '保存' : '创建'}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
