import { useState, useEffect } from 'react'
import { Button, Select, SelectItem, Pagination, Chip, Input } from '@heroui/react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { FiSearch, FiArrowLeft } from 'react-icons/fi'

interface WithdrawLog {
  id: number
  withdraw_key?: {
    name: string
  }
  card_type?: {
    name: string
  }
  card_no: string
  count: number
  price: number
  total_cost: number
  remark: string
  ip: string
  created_at: string
}

interface WithdrawKey {
  id: number
  name: string
  app?: {
    app_name: string
  }
}

interface App {
  id: number
  app_name: string
}

export default function WithdrawLogs() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const keyIdFromUrl = searchParams.get('key_id')
  
  const [logs, setLogs] = useState<WithdrawLog[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [keys, setKeys] = useState<WithdrawKey[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string>('')
  const [selectedKeyId, setSelectedKeyId] = useState<string>(keyIdFromUrl || '')
  const [selectedKeyName, setSelectedKeyName] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const pageSize = 20

  useEffect(() => {
    loadApps()
    // 如果URL中有key_id，加载该密钥信息
    if (keyIdFromUrl) {
      loadKeyInfo(keyIdFromUrl)
    }
  }, [])

  useEffect(() => {
    if (selectedAppId) {
      loadKeys()
    } else {
      setKeys([])
      if (!keyIdFromUrl) {
        setSelectedKeyId('')
      }
    }
  }, [selectedAppId])

  useEffect(() => {
    loadLogs()
  }, [page, selectedKeyId])

  const loadKeyInfo = async (keyId: string) => {
    try {
      // 通过加载所有密钥来找到对应的密钥信息
      const res = await userApi.listWithdrawKeys('')
      const allKeys = res.data || []
      const key = allKeys.find((k: WithdrawKey) => k.id.toString() === keyId)
      if (key) {
        setSelectedKeyName(key.name)
        setSelectedAppId(key.app?.id?.toString() || '')
      }
    } catch (error: any) {
      toast.error(error.message || '加载密钥信息失败')
    }
  }

  const loadApps = async () => {
    try {
      const res = await userApi.listApps(1, 100)
      setApps(res.data?.list || [])
    } catch (error: any) {
      toast.error(error.message || '加载应用失败')
    }
  }

  const loadKeys = async () => {
    try {
      const res = await userApi.listWithdrawKeys(selectedAppId)
      setKeys(res.data || [])
    } catch (error: any) {
      toast.error(error.message || '加载密钥失败')
    }
  }

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await userApi.listWithdrawLogs(page, pageSize, selectedKeyId)
      setLogs(res.data || [])
      setTotal(res.total || 0)
    } catch (error: any) {
      toast.error(error.message || '加载日志失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    loadLogs()
  }

  const filteredLogs = logs.filter(log => {
    if (!searchKeyword) return true
    const keyword = searchKeyword.toLowerCase()
    return (
      log.card_no?.toLowerCase().includes(keyword) ||
      log.card_type?.name?.toLowerCase().includes(keyword) ||
      log.remark?.toLowerCase().includes(keyword) ||
      log.ip?.toLowerCase().includes(keyword)
    )
  })

  return (
    <div className="p-6">
      {keyIdFromUrl && (
        <div className="mb-4">
          <Button isIconOnly variant="light" size="sm" onPress={() => navigate('/withdraw-keys')}>
            <FiArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* 筛选栏 - 如果是从密钥页面进入则隐藏筛选器 */}
      {!keyIdFromUrl && (
        <div className="flex flex-wrap gap-3 mb-6">
          <Select
            placeholder="全部应用"
            selectedKeys={selectedAppId ? [selectedAppId] : []}
            onChange={(e) => {
              setSelectedAppId(e.target.value)
              setPage(1)
            }}
            className="w-48"
            size="sm"
          >
            <SelectItem key="" value="">全部应用</SelectItem>
            {apps.map((app) => (
              <SelectItem key={app.id.toString()} value={app.id.toString()}>
                {app.app_name}
              </SelectItem>
            ))}
          </Select>

          <Select
            placeholder="全部密钥"
            selectedKeys={selectedKeyId ? [selectedKeyId] : []}
            onChange={(e) => {
              setSelectedKeyId(e.target.value)
              setPage(1)
            }}
            className="w-48"
            size="sm"
            isDisabled={!selectedAppId}
          >
            <SelectItem key="" value="">全部密钥</SelectItem>
            {keys.map((key) => (
              <SelectItem key={key.id.toString()} value={key.id.toString()}>
                {key.name}
              </SelectItem>
            ))}
          </Select>

          <Input
            placeholder="搜索卡号、卡种、备注、IP..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            startContent={<FiSearch />}
            className="flex-1 min-w-[200px]"
            size="sm"
          />

          <Button
            color="primary"
            size="sm"
            onPress={handleSearch}
          >
            搜索
          </Button>
        </div>
      )}

      {/* 搜索框 - 如果是从密钥页面进入则只显示搜索框 */}
      {keyIdFromUrl && (
        <div className="flex gap-3 mb-6">
          <Input
            placeholder="搜索卡号、卡种、备注、IP..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            startContent={<FiSearch />}
            className="flex-1"
            size="sm"
          />
          <Button
            color="primary"
            size="sm"
            onPress={handleSearch}
          >
            搜索
          </Button>
        </div>
      )}

      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">总记录数</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{total}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">当前页记录</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{filteredLogs.length}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">总花费</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {filteredLogs.reduce((sum, log) => sum + log.total_cost, 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">总卡数</div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {filteredLogs.reduce((sum, log) => sum + log.count, 0)}
          </div>
        </div>
      </div>

      {/* 记录列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="text-gray-500">加载中...</div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 dark:bg-content2 rounded-lg">
          <p>暂无记录</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {filteredLogs.map((item) => (
              <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-content2 transition-colors">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex-1 min-w-[150px]">
                    <div className="text-xs text-gray-400 mb-1">密钥</div>
                    <div className="font-medium">{item.withdraw_key?.name || '-'}</div>
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <div className="text-xs text-gray-400 mb-1">卡种</div>
                    <Chip size="sm" variant="flat" color="primary">{item.card_type?.name}</Chip>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-xs text-gray-400 mb-1">卡号</div>
                    <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{item.card_no}</code>
                  </div>
                  <div className="w-20">
                    <div className="text-xs text-gray-400 mb-1">数量</div>
                    <div>{item.count}</div>
                  </div>
                  <div className="w-24">
                    <div className="text-xs text-gray-400 mb-1">单价</div>
                    <div>{item.price.toFixed(2)}</div>
                  </div>
                  <div className="w-24">
                    <div className="text-xs text-gray-400 mb-1">总花费</div>
                    <div className="font-medium text-primary">{item.total_cost.toFixed(2)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 items-center mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-xs text-gray-400 mb-1">备注</div>
                    <div className="text-sm" title={item.remark || '-'}>{item.remark || '-'}</div>
                  </div>
                  <div className="w-32">
                    <div className="text-xs text-gray-400 mb-1">IP</div>
                    <div className="text-sm">{item.ip}</div>
                  </div>
                  <div className="w-40">
                    <div className="text-xs text-gray-400 mb-1">时间</div>
                    <div className="text-sm">{new Date(item.created_at).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {total > pageSize && (
            <div className="flex justify-center">
              <Pagination
                total={Math.ceil(total / pageSize)}
                page={page}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
