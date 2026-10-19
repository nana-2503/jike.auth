import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiRefresh, HiLogout, HiEye, HiArrowLeft } from 'react-icons/hi'

interface WSConnection {
  id: number
  app_id: number
  app_name: string
  app_user_id: number
  username: string
  token: string
  client_ip: string
  feature: string
  encrypted: boolean
}

export default function WSConnections() {
  const navigate = useNavigate()
  const [connections, setConnections] = useState<WSConnection[]>([])
  const [loading, setLoading] = useState(false)
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure()
  const [selectedConn, setSelectedConn] = useState<WSConnection | null>(null)

  const fetchConnections = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listWSConnections()
      setConnections(res.data.list || [])
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchConnections() }, [])

  const handleKick = async (token: string) => {
    if (!token) {
      toast.error('该连接未登录，无法踢出')
      return
    }
    if (!await confirm('确定要踢出此连接吗？')) return
    try {
      await userApi.kickWSConnection(token)
      toast.success('已踢出')
      fetchConnections()
    } catch (e: any) { toast.error(e.message || '操作失败') }
  }

  const showDetail = (conn: WSConnection) => {
    setSelectedConn(conn)
    onDetailOpen()
  }

  const loggedInCount = connections.filter(c => c.token).length

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="flat" startContent={<HiArrowLeft className="w-4 h-4" />} onPress={() => navigate('/online')}>返回</Button>
          <Chip size="lg" color="primary" variant="flat">{connections.length} 个连接</Chip>
          <Chip size="lg" color="success" variant="flat">{loggedInCount} 已登录</Chip>
        </div>
        <Button size="sm" variant="flat" startContent={<HiRefresh className="w-4 h-4" />} onPress={fetchConnections}>刷新</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : connections.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无WebSocket连接</CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map((conn) => (
            <Card key={conn.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => showDetail(conn)}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${conn.token ? 'bg-success/10' : 'bg-gray-100 dark:bg-content2'}`}>
                      <span className={`font-bold text-lg ${conn.token ? 'text-success' : 'text-gray-400'}`}>
                        {conn.username ? conn.username.charAt(0).toUpperCase() : '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{conn.username || '未登录'}</h3>
                      <div className="flex gap-1 flex-wrap">
                        <Chip size="sm" variant="flat" color={conn.token ? 'success' : 'default'}>
                          {conn.token ? '已登录' : '未登录'}
                        </Chip>
                        {conn.encrypted && <Chip size="sm" variant="flat" color="warning">加密</Chip>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm mb-3">
                  {conn.app_name && (
                    <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                      <span className="text-xs text-gray-400">应用</span>
                      <p className="truncate">{conn.app_name}</p>
                    </div>
                  )}
                  {conn.token && (
                    <div className="bg-gray-50 dark:bg-content2 rounded p-2">
                      <span className="text-xs text-gray-400">Token</span>
                      <p className="truncate font-mono text-xs">{conn.token.slice(0, 20)}...</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="flat" startContent={<HiEye className="w-4 h-4" />} onPress={() => showDetail(conn)}>详情</Button>
                  {conn.token && (
                    <Button size="sm" variant="flat" color="danger" startContent={<HiLogout className="w-4 h-4" />}
                      onPress={() => handleKick(conn.token)}>踢出</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 详情弹窗 */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="lg" placement="center">
        <ModalContent>
          <ModalHeader>连接详情</ModalHeader>
          <ModalBody>
            {selectedConn && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{selectedConn.username || '未登录'}</span>
                  <Chip size="sm" color={selectedConn.token ? 'success' : 'default'}>
                    {selectedConn.token ? '已登录' : '未登录'}
                  </Chip>
                  {selectedConn.encrypted && <Chip size="sm" color="warning">加密通讯</Chip>}
                </div>
                {selectedConn.app_name && (
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                    <span className="text-xs text-gray-400">应用</span>
                    <p className="font-medium">{selectedConn.app_name}</p>
                  </div>
                )}
                {selectedConn.token && (
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                    <span className="text-xs text-gray-400">Token</span>
                    <p className="font-mono text-sm break-all">{selectedConn.token}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                    <span className="text-xs text-gray-400">客户端IP</span>
                    <p className="font-medium">{selectedConn.client_ip || '-'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg p-3">
                    <span className="text-xs text-gray-400">特征码</span>
                    <p className="font-medium break-all">{selectedConn.feature || '-'}</p>
                  </div>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDetailClose}>关闭</Button>
            {selectedConn?.token && (
              <Button color="danger" startContent={<HiLogout className="w-4 h-4" />}
                onPress={() => { onDetailClose(); handleKick(selectedConn.token) }}>踢出</Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
