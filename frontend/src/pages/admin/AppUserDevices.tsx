import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Spinner, Chip,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure, Pagination,
} from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiArrowLeft, HiLink } from 'react-icons/hi'

export default function AdminAppUserDevices() {
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
      const res: any = await adminApi.listAppUserDevices(Number(id), page, 10)
      setDevices(res.data?.list || [])
      setTotal(res.data?.total || 0)
      setFeatures(res.data?.features || 1)
    } catch { toast.error('加载失败') }
    finally { setLoading(false) }
  }

  const handleUnbind = async () => {
    if (!deletingDevice) return
    try {
      await adminApi.deleteAppUserDevice(Number(id), deletingDevice.id)
      toast.success('解绑成功')
      onClose()
      loadDevices()
    } catch (e: any) { toast.error(e.message || '解绑失败') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/admin/appusers')}>
          <HiArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-bold">特征码管理</h2>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardBody className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Chip variant="flat">特征码上限：{features}个</Chip>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <>
              <Table aria-label="特征码列表" isStriped>
                <TableHeader>
                  <TableColumn>特征信息</TableColumn>
                  <TableColumn>备注</TableColumn>
                  <TableColumn>绑定时间</TableColumn>
                  <TableColumn width={100}>操作</TableColumn>
                </TableHeader>
                <TableBody emptyContent="暂无特征码">
                  {devices.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="font-mono text-sm">{item.feature}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-500">{item.remark || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-500 text-sm">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          color="primary"
                          variant="light"
                          startContent={<HiLink className="w-4 h-4" />}
                          onPress={() => { setDeletingDevice(item); onOpen() }}
                        >
                          解绑
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {total > 10 && (
                <div className="flex justify-center mt-4">
                  <Pagination total={Math.ceil(total / 10)} page={page} onChange={setPage} />
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={isOpen} onClose={onClose} placement="center">
        <ModalContent>
          <ModalHeader>确认解绑</ModalHeader>
          <ModalBody>
            确定要解绑特征码 "{deletingDevice?.feature}" 吗？
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
