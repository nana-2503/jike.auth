import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Spinner, Tabs, Tab,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Input, Textarea, DatePicker,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { currentZonedDateTime } from '../utils/datePicker'
import { HiArrowLeft, HiPlus, HiPencil, HiTrash, HiLink } from 'react-icons/hi'

export default function AppUserExtra() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [featuresLimit, setFeaturesLimit] = useState(1)

  // 特征码
  const [devices, setDevices] = useState<any[]>([])
  const [devicesTotal, setDevicesTotal] = useState(0)
  const [devicesPage, setDevicesPage] = useState(1)
  const [devicesLoading, setDevicesLoading] = useState(false)
  const { isOpen: isUnbindOpen, onOpen: onUnbindOpen, onClose: onUnbindClose } = useDisclosure()
  const [unbindDevice, setUnbindDevice] = useState<any>(null)

  // 标识数据
  const [dataList, setDataList] = useState<any[]>([])
  const [dataTotal, setDataTotal] = useState(0)
  const [dataPage, setDataPage] = useState(1)
  const [dataLoading, setDataLoading] = useState(false)
  const { isOpen: isDataEditOpen, onOpen: onDataEditOpen, onClose: onDataEditClose } = useDisclosure()
  const { isOpen: isDataDeleteOpen, onOpen: onDataDeleteOpen, onClose: onDataDeleteClose } = useDisclosure()
  const [editingData, setEditingData] = useState<any>(null)
  const [deletingData, setDeletingData] = useState<any>(null)
  const [dataForm, setDataForm] = useState({ key: '', value: '', remark: '' })
  const [dataExpireDate, setDataExpireDate] = useState<any>(null)
  const [dataSaving, setDataSaving] = useState(false)

  useEffect(() => {
    if (id) {
      userApi.getAppUser(Number(id)).then((res: any) => {
        setUsername(res.data.username || '')
        setFeaturesLimit(res.data.features || 1)
      }).catch(() => toast.error('获取用户信息失败')).finally(() => setLoading(false))
    }
  }, [id])

  // 加载特征码
  const loadDevices = async (pg: number) => {
    if (!id) return
    setDevicesLoading(true)
    try {
      const res: any = await userApi.listAppUserDevices(Number(id), pg, 10)
      setDevices(res.data?.list || [])
      setDevicesTotal(res.data?.total || 0)
      if (res.data?.features) setFeaturesLimit(res.data.features)
    } catch { }
    finally { setDevicesLoading(false) }
  }

  useEffect(() => { loadDevices(devicesPage) }, [devicesPage, id])

  const handleUnbind = async () => {
    if (!unbindDevice || !id) return
    try {
      await userApi.deleteAppUserDevice(Number(id), unbindDevice.id)
      toast.success('解绑成功')
      onUnbindClose()
      loadDevices(devicesPage)
    } catch (e: any) { toast.error(e.message || '解绑失败') }
  }

  // 加载标识数据
  const loadData = async (pg: number) => {
    if (!id) return
    setDataLoading(true)
    try {
      const res: any = await userApi.listAppUserData(Number(id), pg, 10)
      setDataList(res.data?.list || [])
      setDataTotal(res.data?.total || 0)
    } catch { }
    finally { setDataLoading(false) }
  }

  useEffect(() => { loadData(dataPage) }, [dataPage, id])

  const handleAddData = () => {
    setEditingData(null)
    setDataForm({ key: '', value: '', remark: '' })
    setDataExpireDate(null)
    onDataEditOpen()
  }

  const handleEditData = (item: any) => {
    setEditingData(item)
    setDataForm({ key: item.key, value: item.value || '', remark: item.remark || '' })
    if (item.expire_at) {
      try { setDataExpireDate(parseAbsoluteToLocal(item.expire_at)) } catch { setDataExpireDate(null) }
    } else { setDataExpireDate(null) }
    onDataEditOpen()
  }

  const handleSaveData = async () => {
    if (!dataForm.key.trim() || !id) { toast.error('请输入键名'); return }
    setDataSaving(true)
    try {
      const submitData = { ...dataForm, expire_at: dataExpireDate ? dataExpireDate.toDate().toISOString() : '' }
      if (editingData) {
        await userApi.updateAppUserData(Number(id), editingData.id, submitData)
        toast.success('更新成功')
      } else {
        await userApi.createAppUserData(Number(id), submitData)
        toast.success('添加成功')
      }
      onDataEditClose()
      loadData(1)
      setDataPage(1)
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setDataSaving(false) }
  }

  const handleDeleteData = async () => {
    if (!deletingData || !id) return
    try {
      await userApi.deleteAppUserData(Number(id), deletingData.id)
      toast.success('删除成功')
      onDataDeleteClose()
      loadData(dataPage)
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/app-users')}><HiArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-xl font-bold">{username}</h2>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardBody className="p-6">
          <Tabs aria-label="数据管理" className="w-full">
            <Tab key="devices" title="特征码">
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <Chip variant="flat">特征码上限：{featuresLimit}个</Chip>
                </div>
                {devicesLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : (
                  <>
                    <Table aria-label="特征码列表" isStriped>
                      <TableHeader>
                        <TableColumn>特征信息</TableColumn>
                        <TableColumn>绑定时间</TableColumn>
                        <TableColumn width={100}>操作</TableColumn>
                      </TableHeader>
                      <TableBody emptyContent="暂无特征码">
                        {devices.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell><span className="font-mono text-sm">{item.feature}</span></TableCell>
                            <TableCell><span className="text-gray-500 text-sm">{new Date(item.created_at).toLocaleString()}</span></TableCell>
                            <TableCell>
                              <Button size="sm" color="primary" variant="light" startContent={<HiLink className="w-4 h-4" />}
                                onPress={() => { setUnbindDevice(item); onUnbindOpen() }}>解绑</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {devicesTotal > 10 && (
                      <div className="flex justify-center">
                        <Pagination total={Math.ceil(devicesTotal / 10)} page={devicesPage} onChange={setDevicesPage} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </Tab>
            <Tab key="userdata" title="标识数据">
              <div className="space-y-4 pt-4">
                <div className="flex justify-end">
                  <Button size="sm" color="primary" startContent={<HiPlus className="w-4 h-4" />} onPress={handleAddData}>添加</Button>
                </div>
                {dataLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : (
                  <>
                    <Table aria-label="标识数据列表" isStriped>
                      <TableHeader>
                        <TableColumn>键名</TableColumn>
                        <TableColumn>值</TableColumn>
                        <TableColumn>过期时间</TableColumn>
                        <TableColumn>备注</TableColumn>
                        <TableColumn width={120}>操作</TableColumn>
                      </TableHeader>
                      <TableBody emptyContent="暂无数据">
                        {dataList.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell><span className="font-mono">{item.key}</span></TableCell>
                            <TableCell><span className="line-clamp-1">{item.value}</span></TableCell>
                            <TableCell><span className="text-gray-500 text-sm">{item.expire_at ? new Date(item.expire_at).toLocaleString() : '永久'}</span></TableCell>
                            <TableCell><span className="text-gray-500 line-clamp-1">{item.remark || '-'}</span></TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button isIconOnly size="sm" variant="light" onPress={() => handleEditData(item)}><HiPencil className="w-4 h-4" /></Button>
                                <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => { setDeletingData(item); onDataDeleteOpen() }}><HiTrash className="w-4 h-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {dataTotal > 10 && (
                      <div className="flex justify-center">
                        <Pagination total={Math.ceil(dataTotal / 10)} page={dataPage} onChange={setDataPage} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>


      {/* 解绑确认弹窗 */}
      <Modal isOpen={isUnbindOpen} onClose={onUnbindClose} placement="center">
        <ModalContent>
          <ModalHeader>确认解绑</ModalHeader>
          <ModalBody>
            <p>确定要解绑此特征码吗？</p>
            {unbindDevice && <p className="font-mono text-sm text-gray-500 mt-2">{unbindDevice.feature}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onUnbindClose}>取消</Button>
            <Button color="danger" onPress={handleUnbind}>解绑</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 标识数据编辑弹窗 */}
      <Modal isOpen={isDataEditOpen} onClose={onDataEditClose} placement="center">
        <ModalContent>
          <ModalHeader>{editingData ? '编辑数据' : '添加数据'}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input label="键名" value={dataForm.key} onChange={(e) => setDataForm({ ...dataForm, key: e.target.value })} isRequired />
              <Textarea label="值" value={dataForm.value} onChange={(e) => setDataForm({ ...dataForm, value: e.target.value })} />
              <div className="space-y-2">
                <DatePicker label="过期时间" value={dataExpireDate} onChange={setDataExpireDate} granularity="second" hourCycle={24} hideTimeZone />
                <Button size="sm" variant="flat" onPress={() => setDataExpireDate(currentZonedDateTime())}>设为当前时间</Button>
              </div>
              <Input label="备注" value={dataForm.remark} onChange={(e) => setDataForm({ ...dataForm, remark: e.target.value })} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDataEditClose}>取消</Button>
            <Button color="primary" onPress={handleSaveData} isLoading={dataSaving}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal isOpen={isDataDeleteOpen} onClose={onDataDeleteClose} placement="center">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定要删除此数据吗？</p>
            {deletingData && <p className="font-mono text-sm text-gray-500 mt-2">{deletingData.key}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDataDeleteClose}>取消</Button>
            <Button color="danger" onPress={handleDeleteData}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
