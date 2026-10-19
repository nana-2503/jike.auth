import { useState, useEffect } from 'react'
import {
  Card, CardBody, CardHeader, Button, Select, SelectItem, Input, Spinner,
  Tabs, Tab, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Pagination, DatePicker,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { dateValueToLocalDateTimeString } from '../utils/datePicker'
import { HiTrash, HiRefresh, HiUsers, HiCreditCard, HiStatusOnline, HiBan, HiPlus, HiClock, HiLogout, HiDeviceMobile } from 'react-icons/hi'

interface App {
  id: number
  app_name: string
}

interface FilteredUser {
  id: number
  username: string
  status: number
  points: number
  expire_at: string | null
  created_at: string
}

export default function Tools() {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)

  // 卡号工具
  const [cardAppId, setCardAppId] = useState('')
  const [unusedDays, setUnusedDays] = useState('30')

  // 在线工具
  const [onlineAppId, setOnlineAppId] = useState('')

  // 条件筛选
  const [filterAppId, setFilterAppId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterExpire, setFilterExpire] = useState('')
  const [filterPointsMin, setFilterPointsMin] = useState('')
  const [filterPointsMax, setFilterPointsMax] = useState('')
  const [filterRegStart, setFilterRegStart] = useState<any>(null)
  const [filterRegEnd, setFilterRegEnd] = useState<any>(null)
  const [filterKeyword, setFilterKeyword] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<FilteredUser[]>([])
  const [filterTotal, setFilterTotal] = useState(0)
  const [filterPage, setFilterPage] = useState(1)
  const [filterLoading, setFilterLoading] = useState(false)

  // 批量操作参数
  const [batchAction, setBatchAction] = useState('')
  const [batchNewStatus, setBatchNewStatus] = useState('')
  const [batchPoints, setBatchPoints] = useState('')
  const [batchDays, setBatchDays] = useState('')
  const [batchHours, setBatchHours] = useState('')
  const [batchMinutes, setBatchMinutes] = useState('')
  const [batchExpireDate, setBatchExpireDate] = useState<any>(null)

  /** 维护工具子模块（移动端用下拉、桌面端用 Tabs，避免横滑标签被裁切） */
  const [toolsTabKey, setToolsTabKey] = useState('cards')

  useEffect(() => {
    loadApps()
  }, [])

  const loadApps = async () => {
    try {
      const res: any = await userApi.listApps(1, 100)
      setApps(res.data.list || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const getFilterParams = () => {
    return {
      app_id: filterAppId || undefined,
      status: filterStatus || undefined,
      expire_status: filterExpire || undefined,
      points_min: filterPointsMin ? parseInt(filterPointsMin) : undefined,
      points_max: filterPointsMax ? parseInt(filterPointsMax) : undefined,
      reg_date_start: filterRegStart ? dateValueToLocalDateTimeString(filterRegStart) : undefined,
      reg_date_end: filterRegEnd ? dateValueToLocalDateTimeString(filterRegEnd) : undefined,
      keyword: filterKeyword.trim() || undefined,
    }
  }

  const loadFilteredUsers = async (page = 1) => {
    setFilterLoading(true)
    try {
      const params: any = {
        app_id: filterAppId || undefined,
        status: filterStatus || undefined,
        expire: filterExpire || undefined,
        points_min: filterPointsMin || undefined,
        points_max: filterPointsMax || undefined,
        reg_start: filterRegStart ? dateValueToLocalDateTimeString(filterRegStart) : undefined,
        reg_end: filterRegEnd ? dateValueToLocalDateTimeString(filterRegEnd) : undefined,
        keyword: filterKeyword || undefined,
      }
      const res: any = await userApi.toolsFilterUsers(page, 20, params)
      setFilteredUsers(res.data.list || [])
      setFilterTotal(res.data.total || 0)
      setFilterPage(page)
    } catch (e: any) {
      toast.error(e.message || '查询失败')
    } finally {
      setFilterLoading(false)
    }
  }

  const handleBatchOperation = async () => {
    if (!batchAction) {
      toast.error('请选择操作类型')
      return
    }

    const filter = getFilterParams()
    const actionNames: Record<string, string> = {
      'set-status': '设置状态',
      'add-points': '增减点数',
      'add-duration': '增加时长',
      'set-expire': '设置到期',
      'delete': '删除用户',
      'kick': '踢下线',
      'unbind': '解绑设备',
    }

    if (!await confirm(`确定要对筛选出的 ${filterTotal} 个用户执行"${actionNames[batchAction]}"操作吗？此操作不可撤销！`)) return

    setExecuting(true)
    try {
      let res: any
      switch (batchAction) {
        case 'set-status':
          if (!batchNewStatus) { toast.error('请选择新状态'); setExecuting(false); return }
          res = await userApi.toolsFilterSetStatus(filter, parseInt(batchNewStatus))
          break
        case 'add-points':
          if (!batchPoints) { toast.error('请输入点数'); setExecuting(false); return }
          res = await userApi.toolsFilterAddPoints(filter, parseInt(batchPoints))
          break
        case 'add-duration':
          const days = parseInt(batchDays) || 0
          const hours = parseInt(batchHours) || 0
          const minutes = parseInt(batchMinutes) || 0
          if (days === 0 && hours === 0 && minutes === 0) { toast.error('请设置时长'); setExecuting(false); return }
          res = await userApi.toolsFilterAddDuration(filter, days, hours, minutes)
          break
        case 'set-expire':
          res = await userApi.toolsFilterSetExpire(filter, dateValueToLocalDateTimeString(batchExpireDate))
          break
        case 'delete':
          res = await userApi.toolsFilterDelete(filter)
          break
        case 'kick':
          res = await userApi.toolsFilterKick(filter)
          break
        case 'unbind':
          res = await userApi.toolsFilterUnbind(filter)
          break
      }
      toast.success(res.message)
      loadFilteredUsers(filterPage)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setExecuting(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const getStatusChip = (status: number) => {
    switch (status) {
      case 1: return <Chip size="sm" color="success" variant="solid" classNames={{ content: "text-white" }}>正常</Chip>
      case 2: return <Chip size="sm" color="danger" variant="solid" classNames={{ content: "text-white" }}>封停</Chip>
      case 3: return <Chip size="sm" color="warning" variant="solid" classNames={{ content: "text-white" }}>冻结</Chip>
      default: return <Chip size="sm" variant="flat">未知</Chip>
    }
  }

  const handleCleanUnusedCards = async () => {
    const days = parseInt(unusedDays) || 0
    const daysText = days > 0 ? `创建超过${days}天的` : '所有'
    if (!await confirm(`确定要删除${daysText}未使用卡号吗？此操作不可撤销！`)) return
    
    setExecuting(true)
    try {
      const appId = cardAppId ? parseInt(cardAppId) : undefined
      const res: any = await userApi.toolsCleanUnusedCards(appId, days)
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setExecuting(false)
    }
  }

  const handleCleanUsedCards = async () => {
    if (!await confirm('确定要删除所有已使用卡号吗？此操作不可撤销！')) return
    
    setExecuting(true)
    try {
      const appId = cardAppId ? parseInt(cardAppId) : undefined
      const res: any = await userApi.toolsCleanUsedCards(appId)
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setExecuting(false)
    }
  }

  const handleCleanDisabledCards = async () => {
    if (!await confirm('确定要删除所有禁用卡号吗？此操作不可撤销！')) return
    
    setExecuting(true)
    try {
      const appId = cardAppId ? parseInt(cardAppId) : undefined
      const res: any = await userApi.toolsCleanDisabledCards(appId)
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setExecuting(false)
    }
  }

  const handleKickAllOnline = async () => {
    if (!await confirm('确定要踢下线所有在线用户吗？')) return
    
    setExecuting(true)
    try {
      const appId = onlineAppId ? parseInt(onlineAppId) : undefined
      const res: any = await userApi.toolsKickAllOnline(appId)
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setExecuting(false)
    }
  }

  const handleCleanExpiredBlacklist = async () => {
    if (!await confirm('确定要清理所有过期黑名单吗？')) return
    
    setExecuting(true)
    try {
      const res: any = await userApi.toolsCleanExpiredBlacklist()
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setExecuting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div>
      {/* 移动端：下拉切换；桌面端：下方 Tabs 与最初样式一致，仅 tab 栏小屏隐藏 */}
      <div className="md:hidden mb-3 w-full min-w-0">
        <Select
          aria-label="维护工具功能"
          label="功能模块"
          size="sm"
          className="w-full max-w-full"
          classNames={{ trigger: 'min-h-11', value: 'text-left' }}
          selectedKeys={[toolsTabKey]}
          onChange={(e) => setToolsTabKey(e.target.value)}
        >
          <SelectItem key="cards" startContent={<HiCreditCard className="w-4 h-4 shrink-0 text-default-500" />}>
            卡号管理
          </SelectItem>
          <SelectItem key="online" startContent={<HiStatusOnline className="w-4 h-4 shrink-0 text-default-500" />}>
            在线管理
          </SelectItem>
          <SelectItem key="blacklist" startContent={<HiBan className="w-4 h-4 shrink-0 text-default-500" />}>
            黑名单
          </SelectItem>
          <SelectItem key="filter" startContent={<HiUsers className="w-4 h-4 shrink-0 text-default-500" />}>
            用户管理
          </SelectItem>
        </Select>
      </div>

      <Tabs
        selectedKey={toolsTabKey}
        onSelectionChange={(key) => {
          if (key != null) setToolsTabKey(String(key))
        }}
        classNames={{
          /* 标签栏在 base 内；仅 hidden tabList 时外层 inline-flex 仍可能占一大块空白，小屏直接隐藏整个 base */
          base: 'hidden md:inline-flex md:w-full',
          panel: 'max-md:!py-0 max-md:px-0 md:py-3 md:px-1',
        }}
      >
        <Tab key="cards" title={<div className="flex items-center gap-2"><HiCreditCard className="w-4 h-4" />卡号管理</div>}>
          <div className="space-y-4 pt-2">
            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">选择应用</h3>
              </CardHeader>
              <CardBody>
                <Select
                  placeholder="全部应用"
                  selectedKeys={cardAppId ? [cardAppId] : []}
                  onChange={(e) => setCardAppId(e.target.value)}
                  className="w-48"
                  size="sm"
                >
                  {apps.map(app => (
                    <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                  ))}
                </Select>
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">清理未使用卡号</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-500">删除状态为"未使用"的卡号</p>
                <div className="flex gap-4 items-center flex-wrap">
                  <Input
                    type="number"
                    placeholder="创建超过N天"
                    value={unusedDays}
                    onChange={(e) => setUnusedDays(e.target.value)}
                    className="w-40"
                    size="sm"
                    endContent={<span className="text-gray-400 text-sm">天</span>}
                  />
                  <Button
                    color="danger"
                    size="sm"
                    className="text-white"
                    startContent={<HiTrash className="w-4 h-4" />}
                    onPress={handleCleanUnusedCards}
                    isLoading={executing}
                  >
                    清理未使用
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">清理已使用卡号</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-500">删除状态为"已使用"的卡号</p>
                <Button
                  color="danger"
                  size="sm"
                  className="text-white"
                  startContent={<HiTrash className="w-4 h-4" />}
                  onPress={handleCleanUsedCards}
                  isLoading={executing}
                >
                  清理已使用
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">清理禁用卡号</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-500">删除状态为"禁用"的卡号</p>
                <Button
                  color="danger"
                  size="sm"
                  className="text-white"
                  startContent={<HiTrash className="w-4 h-4" />}
                  onPress={handleCleanDisabledCards}
                  isLoading={executing}
                >
                  清理禁用
                </Button>
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab key="online" title={<div className="flex items-center gap-2"><HiStatusOnline className="w-4 h-4" />在线管理</div>}>
          <div className="space-y-4 pt-2">
            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">全部踢下线</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-500">踢下线所有在线用户</p>
                <div className="flex gap-4 items-center flex-wrap">
                  <Select
                    placeholder="全部应用"
                    selectedKeys={onlineAppId ? [onlineAppId] : []}
                    onChange={(e) => setOnlineAppId(e.target.value)}
                    className="w-48"
                    size="sm"
                  >
                    {apps.map(app => (
                      <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                    ))}
                  </Select>
                  <Button
                    color="warning"
                    size="sm"
                    className="text-white"
                    startContent={<HiRefresh className="w-4 h-4" />}
                    onPress={handleKickAllOnline}
                    isLoading={executing}
                  >
                    全部踢下线
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab key="blacklist" title={<div className="flex items-center gap-2"><HiBan className="w-4 h-4" />黑名单</div>}>
          <div className="space-y-4 pt-2">
            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">清理过期黑名单</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-500">删除所有已过期的黑名单记录</p>
                <Button
                  color="danger"
                  size="sm"
                  className="text-white"
                  startContent={<HiTrash className="w-4 h-4" />}
                  onPress={handleCleanExpiredBlacklist}
                  isLoading={executing}
                >
                  清理过期黑名单
                </Button>
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab key="filter" title={<div className="flex items-center gap-2"><HiUsers className="w-4 h-4" />用户管理</div>}>
          <div className="space-y-4 pt-2">
            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">筛选条件</h3>
              </CardHeader>
              <CardBody className="space-y-4 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 w-full min-w-0">
                  <Select
                    placeholder="选择软件"
                    selectedKeys={filterAppId ? [filterAppId] : []}
                    onChange={(e) => setFilterAppId(e.target.value)}
                    size="sm"
                    className="w-full min-w-0 max-w-full"
                    listboxProps={{ className: "max-h-[200px] overflow-y-auto" }}
                  >
                    {apps.map(app => (
                      <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                    ))}
                  </Select>
                  <Select
                    placeholder="用户状态"
                    selectedKeys={filterStatus ? [filterStatus] : []}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    size="sm"
                    className="w-full min-w-0 max-w-full"
                    listboxProps={{ className: "max-h-[200px] overflow-y-auto" }}
                  >
                    <SelectItem key="1">正常</SelectItem>
                    <SelectItem key="2">封停</SelectItem>
                    <SelectItem key="3">冻结</SelectItem>
                  </Select>
                  <Select
                    placeholder="到期状态"
                    selectedKeys={filterExpire ? [filterExpire] : []}
                    onChange={(e) => setFilterExpire(e.target.value)}
                    size="sm"
                    className="w-full min-w-0 max-w-full"
                    listboxProps={{ className: "max-h-[200px] overflow-y-auto" }}
                  >
                    <SelectItem key="expired">已过期</SelectItem>
                    <SelectItem key="expiring">即将过期(7天内)</SelectItem>
                    <SelectItem key="active">未过期</SelectItem>
                    <SelectItem key="never">永不过期</SelectItem>
                  </Select>
                  <Input
                    type="number"
                    placeholder="最小积分"
                    value={filterPointsMin}
                    onChange={(e) => setFilterPointsMin(e.target.value)}
                    size="sm"
                    className="w-full min-w-0"
                  />
                  <Input
                    type="number"
                    placeholder="最大积分"
                    value={filterPointsMax}
                    onChange={(e) => setFilterPointsMax(e.target.value)}
                    size="sm"
                    className="w-full min-w-0"
                  />
                  <DatePicker
                    granularity="second"
                    hourCycle={24}
                    hideTimeZone
                    value={filterRegStart}
                    onChange={setFilterRegStart}
                    size="sm"
                    className="w-full min-w-0 max-w-full xl:col-span-2"
                  />
                  <DatePicker
                    granularity="second"
                    hourCycle={24}
                    hideTimeZone
                    value={filterRegEnd}
                    onChange={setFilterRegEnd}
                    size="sm"
                    className="w-full min-w-0 max-w-full xl:col-span-2"
                  />
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center min-w-0">
                  <Input
                    placeholder="搜索用户名/QQ/手机/邮箱"
                    value={filterKeyword}
                    onChange={(e) => setFilterKeyword(e.target.value)}
                    size="sm"
                    className="w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xl"
                  />
                  <Button
                    color="primary"
                    size="sm"
                    className="text-white"
                    onPress={() => loadFilteredUsers(1)}
                    isLoading={filterLoading}
                  >
                    查询
                  </Button>
                  <Button
                    variant="flat"
                    size="sm"
                    onPress={() => {
                      setFilterStatus('')
                      setFilterAppId('')
                      setFilterExpire('')
                      setFilterPointsMin('')
                      setFilterPointsMax('')
                      setFilterRegStart(null)
                      setFilterRegEnd(null)
                      setFilterKeyword('')
                      setFilteredUsers([])
                      setFilterTotal(0)
                    }}
                  >
                    重置
                  </Button>
                </div>
              </CardBody>
            </Card>

            {filterTotal > 0 && (
              <>
                <Card>
                  <CardHeader className="pb-0">
                    <div className="flex justify-between items-center w-full">
                      <h3 className="font-semibold">筛选结果 ({filterTotal}个用户)</h3>
                    </div>
                  </CardHeader>
                  <CardBody>
                    {/* 桌面端表格 */}
                    <div className="hidden md:block">
                      <Table aria-label="筛选用户列表" removeWrapper>
                        <TableHeader>
                          <TableColumn>用户名</TableColumn>
                          <TableColumn>状态</TableColumn>
                          <TableColumn>积分</TableColumn>
                          <TableColumn>到期时间</TableColumn>
                          <TableColumn>注册时间</TableColumn>
                        </TableHeader>
                        <TableBody 
                          items={filteredUsers}
                          emptyContent="暂无数据" 
                          isLoading={filterLoading}
                        >
                          {(user) => (
                            <TableRow key={user.id}>
                              <TableCell>{user.username}</TableCell>
                              <TableCell>{getStatusChip(user.status)}</TableCell>
                              <TableCell>{user.points}</TableCell>
                              <TableCell>{formatDate(user.expire_at)}</TableCell>
                              <TableCell>{formatDate(user.created_at)}</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* 移动端卡片 */}
                    <div className="md:hidden space-y-2">
                      {filterLoading ? (
                        <div className="flex justify-center py-8"><Spinner size="sm" /></div>
                      ) : filteredUsers.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">暂无数据</p>
                      ) : (
                        filteredUsers.map(user => (
                          <div key={user.id} className="bg-gray-50 dark:bg-content2 rounded-lg p-2 text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-gray-900 dark:text-white">{user.username}</span>
                              {getStatusChip(user.status)}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                              <div>积分: <span className="text-gray-900 dark:text-white">{user.points}</span></div>
                              <div>到期: <span className="text-gray-900 dark:text-white">{formatDate(user.expire_at)}</span></div>
                              <div className="col-span-2">注册: <span className="text-gray-900 dark:text-white">{formatDate(user.created_at)}</span></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {filterTotal > 20 && (
                      <div className="flex justify-center mt-4">
                        <Pagination
                          total={Math.ceil(filterTotal / 20)}
                          page={filterPage}
                          onChange={(page) => loadFilteredUsers(page)}
                          size="sm"
                        />
                      </div>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader className="pb-0">
                    <h3 className="font-semibold">批量操作</h3>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <p className="text-sm text-gray-500">对筛选出的 {filterTotal} 个用户执行批量操作</p>
                    <div className="flex gap-4 items-end flex-wrap">
                      <Select
                        placeholder="选择操作"
                        selectedKeys={batchAction ? [batchAction] : []}
                        onChange={(e) => setBatchAction(e.target.value)}
                        className="w-40"
                        size="sm"
                        listboxProps={{ className: "max-h-[200px] overflow-y-auto" }}
                      >
                        <SelectItem key="set-status" startContent={<HiUsers className="w-4 h-4" />}>设置状态</SelectItem>
                        <SelectItem key="add-points" startContent={<HiPlus className="w-4 h-4" />}>增减点数</SelectItem>
                        <SelectItem key="add-duration" startContent={<HiClock className="w-4 h-4" />}>增加时长</SelectItem>
                        <SelectItem key="set-expire" startContent={<HiClock className="w-4 h-4" />}>设置到期</SelectItem>
                        <SelectItem key="kick" startContent={<HiLogout className="w-4 h-4" />}>踢下线</SelectItem>
                        <SelectItem key="unbind" startContent={<HiDeviceMobile className="w-4 h-4" />}>解绑设备</SelectItem>
                        <SelectItem key="delete" startContent={<HiTrash className="w-4 h-4" />}>删除用户</SelectItem>
                      </Select>

                      {batchAction === 'set-status' && (
                        <Select
                          placeholder="新状态"
                          selectedKeys={batchNewStatus ? [batchNewStatus] : []}
                          onChange={(e) => setBatchNewStatus(e.target.value)}
                          className="w-32"
                          size="sm"
                        >
                          <SelectItem key="1">正常</SelectItem>
                          <SelectItem key="2">封停</SelectItem>
                          <SelectItem key="3">冻结</SelectItem>
                        </Select>
                      )}

                      {batchAction === 'add-points' && (
                        <Input
                          type="number"
                          placeholder="点数(负数扣点)"
                          value={batchPoints}
                          onChange={(e) => setBatchPoints(e.target.value)}
                          className="w-40"
                          size="sm"
                        />
                      )}

                      {batchAction === 'add-duration' && (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="天"
                            value={batchDays}
                            onChange={(e) => setBatchDays(e.target.value)}
                            className="w-20"
                            size="sm"
                            endContent={<span className="text-gray-400 text-xs">天</span>}
                          />
                          <Input
                            type="number"
                            placeholder="时"
                            value={batchHours}
                            onChange={(e) => setBatchHours(e.target.value)}
                            className="w-20"
                            size="sm"
                            endContent={<span className="text-gray-400 text-xs">时</span>}
                          />
                          <Input
                            type="number"
                            placeholder="分"
                            value={batchMinutes}
                            onChange={(e) => setBatchMinutes(e.target.value)}
                            className="w-20"
                            size="sm"
                            endContent={<span className="text-gray-400 text-xs">分</span>}
                          />
                        </div>
                      )}

                      {batchAction === 'set-expire' && (
                        <DatePicker
                          granularity="second"
                          hourCycle={24}
                          hideTimeZone
                          value={batchExpireDate}
                          onChange={setBatchExpireDate}
                          size="sm"
                          className="max-w-[180px]"
                        />
                      )}

                      <Button
                        color="danger"
                        size="sm"
                        className="text-white"
                        onPress={handleBatchOperation}
                        isLoading={executing}
                        isDisabled={!batchAction}
                      >
                        执行操作
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  )
}
