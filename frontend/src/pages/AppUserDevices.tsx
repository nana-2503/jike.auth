import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Spinner, Chip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure, Pagination,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiArrowLeft, HiLink, HiClock, HiFingerPrint } from 'react-icons/hi'

export default function AppUserDevices() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [features, setFeatures] = useState(1)
  const [page, setPage] = useState(1)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [deletingDevice, setDeletingDevice] = useState<any>(null)

  useEffect(() => {
    loadDevices()
  }, [id, page])

  const loadDevices = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res: any = await userApi.listAppUserDevices(Number(id), page, 12)
      setDevices(res.data?.list || [])
      setTotal(res.data?.total || 0)
      setFeatures(res.data?.features || 1)
    } catch { toast.error('加载失败') }
    finally { setLoading(false) }
  }

  const handleUnbind = async () => {
    if (!deletingDevice) return
    try {
      await userApi.deleteAppUserDevice(Number(id), deletingDevice.id)
      toast.success('解绑成功')
      onClose()
      loadDevices()
    } catch (e: any) { toast.error(e.message || '解绑失败') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button isIconOnly variant="light" onPress={() => navigate('/app-users')}>
            <HiArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-bold">特征码管理</h2>
        </div>
        <Chip variant="flat" color="primary">上限：{features}个</Chip>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : devices.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无特征码</CardBody></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((item) => (
              <Card key={item.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
                <CardBody className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                        <HiFingerPrint className="w-5 h-5 text-secondary" />
                      </div>
                      <div>
                        <Chip size="sm" variant="flat" color="success">已绑定</Chip>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3 mb-3">
                    <p className="font-mono text-sm break-all">{item.feature}</p>
                  </div>
                  {item.remark && (
                    <p className="text-sm text-gray-500 mb-2">备注: {item.remark}</p>
                  )}
                  <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                    <HiClock className="w-4 h-4" />
                    <span>绑定于: {new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="flat" color="danger" startContent={<HiLink className="w-4 h-4" />} onPress={() => { setDeletingDevice(item); onOpen() }}>解绑</Button>
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
        </>
      )}

      <Modal isOpen={isOpen} onClose={onClose} placement="center">
        <ModalContent>
          <ModalHeader>确认解绑</ModalHeader>
          <ModalBody>
            <p>确定要解绑此特征码吗？</p>
            <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3 mt-2">
              <p className="font-mono text-sm break-all">{deletingDevice?.feature}</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="danger" onPress={handleUnbind}>解绑</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
