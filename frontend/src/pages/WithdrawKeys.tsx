import { useState, useEffect } from 'react'
import { Card, CardBody, Button, Input, Select, SelectItem, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Textarea, Tooltip, Pagination } from '@heroui/react'
import { FiPlus, FiEdit2, FiTrash2, FiRefreshCw, FiCopy, FiEye, FiEyeOff, FiList } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api'
import { toast } from '../components/Toast'

interface App {
  id: number
  app_name: string
}

interface WithdrawKey {
  id: number
  app_id: number
  app?: App
  name: string
  secret_key: string
  quota: number
  used_quota: number
  status: number
  remark: string
  created_at: string
}

export default function WithdrawKeys() {
  const navigate = useNavigate()
  const [keys, setKeys] = useState<WithdrawKey[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [showKeys, setShowKeys] = useState<{ [key: number]: boolean }>({})
  
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure()
  const { isOpen: isResetOpen, onOpen: onResetOpen, onClose: onResetClose } = useDisclosure()
  
  const [formData, setFormData] = useState({
    app_id: 0,
    name: '',
    quota: 0,
    remark: ''
  })
  
  const [editData, setEditData] = useState<WithdrawKey | null>(null)
  const [deleteKeyId, setDeleteKeyId] = useState<number>(0)
  const [resetKeyId, setResetKeyId] = useState<number>(0)

  useEffect(() => {
    loadApps()
    loadKeys()
  }, [selectedAppId])

  const loadApps = async () => {
    try {
      const res = await userApi.listApps(1, 100)
      setApps(res.data?.list || [])
    } catch (error: any) {
      toast.error(error.message || '加载应用失败')
    }
  }

  const loadKeys = async () => {
    setLoading(true)
    try {
      const res = await userApi.listWithdrawKeys(selectedAppId)
      setKeys(res.data || [])
    } catch (error: any) {
      toast.error(error.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.app_id || !formData.name) {
      toast.error('请填写完整信息')
      return
    }

    // 允许 -1 作为无限额度
    if (formData.quota !== -1 && formData.quota <= 0) {
      toast.error('额度必须大于0或设置为-1（无限额度）')
      return
    }

    try {
      await userApi.createWithdrawKey(formData)
      toast.success('创建成功')
      onClose()
      loadKeys()
      setFormData({ app_id: 0, name: '', quota: 0, remark: '' })
    } catch (error: any) {
      toast.error(error.message || '创建失败')
    }
  }

  const handleUpdate = async () => {
    if (!editData) return

    try {
      await userApi.updateWithdrawKey(editData.id, {
        name: editData.name,
        quota: editData.quota,
        status: editData.status,
        remark: editData.remark
      })
      toast.success('更新成功')
      onEditClose()
      loadKeys()
    } catch (error: any) {
      toast.error(error.message || '更新失败')
    }
  }

  const handleDelete = async (id: number) => {
    setDeleteKeyId(id)
    onDeleteOpen()
  }

  const confirmDelete = async () => {
    try {
      await userApi.deleteWithdrawKey(deleteKeyId)
      toast.success('删除成功')
      loadKeys()
      onDeleteClose()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  const handleReset = async (id: number) => {
    setResetKeyId(id)
    onResetOpen()
  }

  const confirmReset = async () => {
    try {
      const res = await userApi.resetWithdrawKey(resetKeyId)
      toast.success('重置成功')
      loadKeys()
      onResetClose()
    } catch (error: any) {
      toast.error(error.message || '重置失败')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  const toggleShowKey = (id: number) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const openLogs = async (keyId: number) => {
    navigate(`/withdraw-logs?key_id=${keyId}`)
  }

  const maskKey = (key: string) => {
    if (key.length <= 8) return '****'
    return key.substring(0, 4) + '****' + key.substring(key.length - 4)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Select
          placeholder="选择应用"
          selectedKeys={selectedAppId ? [selectedAppId] : []}
          onChange={(e) => setSelectedAppId(e.target.value)}
          className="w-48"
          size="sm"
        >
          {[{ id: '', app_name: '全部应用' }, ...apps].map((app) => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button color="default" variant="flat" size="sm" startContent={<FiList />} onPress={() => navigate('/withdraw-logs')}>
            查看所有记录
          </Button>
          <Button color="primary" size="sm" startContent={<FiPlus />} onPress={onOpen}>
            创建密钥
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="text-gray-500">加载中...</div>
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>暂无密钥，点击上方按钮创建</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {keys.map((item) => (
            <Card key={item.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate mb-1">{item.name}</h3>
                  <div className="flex gap-2 flex-wrap">
                    <Chip color={item.status === 1 ? 'success' : 'default'} size="sm" classNames={{ content: 'text-white' }}>
                      {item.status === 1 ? '启用' : '禁用'}
                    </Chip>
                    <Chip size="sm" variant="flat">{item.app?.app_name}</Chip>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-3">
                <div className="bg-gray-50 dark:bg-content2 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-gray-400">密钥</span>
                      <p className="font-mono text-sm truncate">
                        {showKeys[item.id] ? item.secret_key : maskKey(item.secret_key)}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => toggleShowKey(item.id)}
                      >
                        {showKeys[item.id] ? <FiEyeOff /> : <FiEye />}
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => copyToClipboard(item.secret_key)}
                      >
                        <FiCopy />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg px-2 py-2">
                    <span className="text-xs text-gray-400 block">额度</span>
                    <p className="font-medium text-sm">{item.quota === -1 ? '无限' : item.quota.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg px-2 py-2">
                    <span className="text-xs text-gray-400 block">已用</span>
                    <p className="font-medium text-sm">{item.used_quota.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg px-2 py-2">
                    <span className="text-xs text-gray-400 block">剩余</span>
                    <p className="font-medium text-sm">{item.quota === -1 ? '无限' : (item.quota - item.used_quota).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-3">
                创建于 {new Date(item.created_at).toLocaleString()}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Tooltip content="查看日志">
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    isIconOnly
                    onPress={() => openLogs(item.id)}
                  >
                    <FiEye />
                  </Button>
                </Tooltip>
                <Tooltip content="编辑">
                  <Button
                    size="sm"
                    variant="flat"
                    isIconOnly
                    onPress={() => {
                      setEditData(item)
                      onEditOpen()
                    }}
                  >
                    <FiEdit2 />
                  </Button>
                </Tooltip>
                <Tooltip content="重置密钥">
                  <Button
                    size="sm"
                    variant="flat"
                    color="warning"
                    isIconOnly
                    onPress={() => handleReset(item.id)}
                  >
                    <FiRefreshCw />
                  </Button>
                </Tooltip>
                <Tooltip content="删除">
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    isIconOnly
                    onPress={() => handleDelete(item.id)}
                  >
                    <FiTrash2 />
                  </Button>
                </Tooltip>
              </div>
            </CardBody>
          </Card>
          ))}
        </div>
      )}

      {/* 创建Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>创建密钥</ModalHeader>
          <ModalBody>
            <Select
              label="选择应用"
              placeholder="请选择应用"
              selectedKeys={formData.app_id ? [formData.app_id.toString()] : []}
              onChange={(e) => setFormData({ ...formData, app_id: parseInt(e.target.value) })}
            >
              {apps.map((app) => (
                <SelectItem key={app.id.toString()} value={app.id.toString()}>
                  {app.app_name}
                </SelectItem>
              ))}
            </Select>
            <Input
              label="密钥名称"
              placeholder="请输入密钥名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <Input
              label="提卡额度"
              type="number"
              placeholder="请输入额度（-1表示无限额度）"
              value={formData.quota.toString()}
              onChange={(e) => setFormData({ ...formData, quota: parseFloat(e.target.value) || 0 })}
              description="设置为 -1 表示无限额度"
            />
            <Textarea
              label="备注"
              placeholder="请输入备注"
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>取消</Button>
            <Button color="primary" onPress={handleCreate}>创建</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 编辑Modal */}
      <Modal isOpen={isEditOpen} onClose={onEditClose}>
        <ModalContent>
          <ModalHeader>编辑密钥</ModalHeader>
          <ModalBody>
            {editData && (
              <>
                <Input
                  label="密钥名称"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                />
                <Input
                  label="提卡额度"
                  type="number"
                  value={editData.quota.toString()}
                  onChange={(e) => setEditData({ ...editData, quota: parseFloat(e.target.value) || 0 })}
                  description="设置为 -1 表示无限额度"
                />
                <Select
                  label="状态"
                  selectedKeys={[editData.status.toString()]}
                  onChange={(e) => setEditData({ ...editData, status: parseInt(e.target.value) })}
                >
                  <SelectItem key="1" value="1">启用</SelectItem>
                  <SelectItem key="0" value="0">禁用</SelectItem>
                </Select>
                <Textarea
                  label="备注"
                  value={editData.remark}
                  onChange={(e) => setEditData({ ...editData, remark: e.target.value })}
                />
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onEditClose}>取消</Button>
            <Button color="primary" onPress={handleUpdate}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定要删除这个提卡密钥吗？此操作无法撤销。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onDeleteClose}>取消</Button>
            <Button color="danger" onPress={confirmDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 重置确认Modal */}
      <Modal isOpen={isResetOpen} onClose={onResetClose}>
        <ModalContent>
          <ModalHeader>确认重置</ModalHeader>
          <ModalBody>
            <p>确定要重置这个提卡密钥吗？</p>
            <p className="text-warning mt-2">⚠️ 重置后旧密钥将立即失效，请谨慎操作。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onResetClose}>取消</Button>
            <Button color="warning" onPress={confirmReset}>重置</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
