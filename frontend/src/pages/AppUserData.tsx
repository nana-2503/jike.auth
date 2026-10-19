import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Spinner, Input, Textarea,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure, Pagination, Drawer, DrawerContent, DrawerHeader, DrawerBody,
  DatePicker,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { currentZonedDateTime } from '../utils/datePicker'
import { HiPlus, HiPencil, HiTrash, HiClock } from 'react-icons/hi'

interface AppUserDataDrawerProps {
  isOpen: boolean
  onClose: () => void
  userId: number | null
}

export default function AppUserDataDrawer({ isOpen, onClose, userId }: AppUserDataDrawerProps) {
  const [loading, setLoading] = useState(true)
  const [dataList, setDataList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure()
  const [editingData, setEditingData] = useState<any>(null)
  const [deletingData, setDeletingData] = useState<any>(null)
  const [dataForm, setDataForm] = useState({ key: '', value: '', remark: '' })
  const [expireDate, setExpireDate] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && userId) {
      setPage(1)
    }
  }, [isOpen, userId])

  useEffect(() => {
    if (isOpen && userId) {
      loadData()
    }
  }, [userId, page, isOpen])

  const loadData = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res: any = await userApi.listAppUserData(userId, page, 12)
      setDataList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch { toast.error('加载失败') }
    finally { setLoading(false) }
  }

  const handleAdd = () => {
    setEditingData(null)
    setDataForm({ key: '', value: '', remark: '' })
    setExpireDate(null)
    onEditOpen()
  }

  const handleEdit = (item: any) => {
    setEditingData(item)
    setDataForm({ key: item.key, value: item.value || '', remark: item.remark || '' })
    if (item.expire_at) {
      try { setExpireDate(parseAbsoluteToLocal(item.expire_at)) } catch { setExpireDate(null) }
    } else {
      setExpireDate(null)
    }
    onEditOpen()
  }

  const handleSave = async () => {
    if (!dataForm.key.trim()) { toast.error('请输入键名'); return }
    setSaving(true)
    try {
      const payload: any = { ...dataForm, expire_at: expireDate ? expireDate.toDate().toISOString() : '' }
      if (editingData) {
        await userApi.updateAppUserData(userId!, editingData.id, payload)
        toast.success('更新成功')
      } else {
        await userApi.createAppUserData(userId!, payload)
        toast.success('添加成功')
      }
      onEditClose()
      setPage(1)
      loadData()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deletingData) return
    try {
      await userApi.deleteAppUserData(userId!, deletingData.id)
      toast.success('删除成功')
      onDeleteClose()
      loadData()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>标识数据</span>
            <div className="flex gap-2">
              <Button size="sm" color="primary" startContent={<HiPlus className="w-4 h-4" />} onPress={handleAdd}>添加</Button>
              <Button variant="flat" size="sm" onPress={onClose}>关闭</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : dataList.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无标识数据</div>
            ) : (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dataList.map((item) => (
                    <Card key={item.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
                      <CardBody className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-warning font-bold text-sm">K</span>
                            </div>
                            <span className="font-mono font-semibold text-lg">{item.key}</span>
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3 mb-3">
                          <p className="text-sm break-all line-clamp-3">{item.value || <span className="text-gray-400">（空值）</span>}</p>
                        </div>
                        {item.remark && (
                          <p className="text-sm text-gray-500 mb-2 line-clamp-1">备注: {item.remark}</p>
                        )}
                        <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                          <HiClock className="w-4 h-4" />
                          <span>过期: {item.expire_at ? new Date(item.expire_at).toLocaleString() : '永不'}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="flat" color="primary" startContent={<HiPencil className="w-4 h-4" />} onPress={() => handleEdit(item)}>编辑</Button>
                          <Button size="sm" variant="flat" color="danger" isIconOnly onPress={() => { setDeletingData(item); onDeleteOpen() }}><HiTrash className="w-4 h-4" /></Button>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
                {total > 12 && (
                  <div className="flex justify-center mt-4">
                    <Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} />
                  </div>
                )}
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 添加/编辑 Modal */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} placement="center">
        <ModalContent>
          <ModalHeader>{editingData ? '编辑标识' : '添加标识'}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input label="键名" value={dataForm.key} onChange={(e) => setDataForm({ ...dataForm, key: e.target.value })} isRequired />
              <Textarea label="值" value={dataForm.value} onChange={(e) => setDataForm({ ...dataForm, value: e.target.value })} minRows={2} />
              <Input label="备注" value={dataForm.remark} onChange={(e) => setDataForm({ ...dataForm, remark: e.target.value })} />
              <div className="space-y-2">
                <DatePicker label="过期时间" value={expireDate} onChange={setExpireDate}
                  granularity="second" hourCycle={24} hideTimeZone description="留空表示永不过期" showMonthAndYearPickers size="sm" />
                <Button size="sm" variant="flat" onPress={() => setExpireDate(currentZonedDateTime())}>设为当前时间</Button>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onEditClose}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认 Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} placement="center">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            确定要删除标识 "{deletingData?.key}" 吗？
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDeleteClose}>取消</Button>
            <Button color="danger" onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
