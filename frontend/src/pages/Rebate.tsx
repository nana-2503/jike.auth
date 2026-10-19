import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Input, Switch, Spinner, Chip, Tabs, Tab, Pagination } from '@heroui/react'
import { HiUsers, HiCurrencyDollar, HiTrendingUp, HiChevronRight } from 'react-icons/hi'
import { toast } from '../components/Toast'
import { userApi } from '../api'

interface RebateConfig {
  enabled: number
  rate: number
  reg_reward: number
}

interface RebateStats {
  total_inviters: number
  total_rebate: number
  today_rebate: number
}

interface RebateLog {
  id: number
  app_user: { id: number; username: string } | null
  from_user: { id: number; username: string } | null
  type: number
  amount: number
  source_value: number
  remark: string
  created_at: string
}

interface RankItem {
  app_user_id: number
  username: string
  invite_count: number
  total_rebate: number
}

interface TreeUser {
  id: number
  username: string
  invite_code: string
  inviter_id: number
  invite_count: number
  total_rebate: number
  rebate_points: number
  created_at: string
  has_children: boolean
}

export default function Rebate() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<RebateConfig>({
    enabled: 0,
    rate: 10,
    reg_reward: 0,
  })
  const [stats, setStats] = useState<RebateStats>({ total_inviters: 0, total_rebate: 0, today_rebate: 0 })
  const [logs, setLogs] = useState<RebateLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [ranking, setRanking] = useState<RankItem[]>([])
  const [treeUsers, setTreeUsers] = useState<TreeUser[]>([])
  const [treeTotal, setTreeTotal] = useState(0)
  const [treePage, setTreePage] = useState(1)
  const [treePath, setTreePath] = useState<{ id: number; username: string }[]>([])

  const loadConfig = async () => {
    try {
      const res: any = await userApi.getRebateConfig()
      setConfig(res.data)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const loadStats = async () => {
    try {
      const res: any = await userApi.getRebateStats()
      setStats(res.data)
    } catch (err: any) {
      // ignore
    }
  }

  const loadLogs = async (page: number) => {
    try {
      const res: any = await userApi.listRebateLogs(page, 10)
      setLogs(res.data.list || [])
      setLogsTotal(res.data.total)
    } catch (err: any) {
      // ignore
    }
  }

  const loadRanking = async () => {
    try {
      const res: any = await userApi.getRebateRanking()
      setRanking(res.data || [])
    } catch (err: any) {
      // ignore
    }
  }

  const loadTree = async (page: number, parentId?: number) => {
    try {
      const res: any = await userApi.getInviteTree(page, 20, parentId)
      setTreeUsers(res.data.list || [])
      setTreeTotal(res.data.total)
    } catch (err: any) {
      // ignore
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([loadConfig(), loadStats(), loadRanking()])
      await loadLogs(1)
      await loadTree(1)
      setLoading(false)
    }
    init()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await userApi.saveRebateConfig(config)
      toast.success('保存成功')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTreeClick = (user: TreeUser) => {
    if (!user.has_children) return
    setTreePath([...treePath, { id: user.id, username: user.username }])
    setTreePage(1)
    loadTree(1, user.id)
  }

  const handleTreeBack = (index: number) => {
    if (index === -1) {
      setTreePath([])
      setTreePage(1)
      loadTree(1)
    } else {
      const newPath = treePath.slice(0, index + 1)
      setTreePath(newPath)
      setTreePage(1)
      loadTree(1, newPath[newPath.length - 1].id)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <HiUsers className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">推广人数</p>
              <p className="text-2xl font-bold">{stats.total_inviters}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <HiCurrencyDollar className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">累计返利</p>
              <p className="text-2xl font-bold">{stats.total_rebate} <span className="text-sm font-normal">积分</span></p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <HiTrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">今日返利</p>
              <p className="text-2xl font-bold">{stats.today_rebate} <span className="text-sm font-normal">积分</span></p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Tabs aria-label="推广管理" classNames={{ base: 'gap-0', panel: '!mt-0 !pt-1 !px-0 !pb-0' }}>
        <Tab key="config" title="返利配置">
          <Card>
            <CardBody className="space-y-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <p className="font-medium mb-1">返利规则</p>
                <ul className="space-y-1 list-disc pl-5">
                  <li>注册奖励：下级完成注册后，直接上级获得固定返利积分。</li>
                  <li>消费返利：下级使用卡密充值成功后，直接上级获得该卡种配置的固定返利积分。</li>
                  <li>返利积分可用于积分商城兑换点数、时长或卡密。</li>
                </ul>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">启用推广返利</p>
                  <p className="text-sm text-gray-500">开启后用户可通过推广码邀请新用户</p>
                </div>
                <Switch
                  isSelected={config.enabled === 1}
                  onValueChange={(v) => setConfig({ ...config, enabled: v ? 1 : 0 })}
                />
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
                <div>
                  <p className="font-medium mb-4">返利配置</p>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                      消费返利积分现在在“卡种”里单独配置，每个卡种可以设置不同的固定返利积分。
                    </div>
                    <Input
                      type="number"
                      label="注册奖励(积分)"
                      description="下级用户注册时，上级获得的奖励积分"
                      value={config.reg_reward.toString()}
                      onChange={(e) => setConfig({ ...config, reg_reward: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button color="primary" onPress={handleSave} isLoading={saving}>
                  保存配置
                </Button>
              </div>
            </CardBody>
          </Card>
        </Tab>

        <Tab key="logs" title="返利记录">
          <Card>
            <CardBody className="p-0">
              {logs.length === 0 ? (
                <div className="text-center text-gray-500 py-12">暂无返利记录</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 text-sm font-medium">获得者</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">来源用户</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">类型</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">返利积分</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm">{log.app_user?.username || '-'}</td>
                          <td className="px-4 py-3 text-sm">{log.from_user?.username || '-'}</td>
                          <td className="px-4 py-3">
                            <Chip size="sm" color={log.type === 1 ? 'primary' : 'success'} classNames={{ content: 'text-white' }}>
                              {log.type === 1 ? '注册奖励' : '消费返利'}
                            </Chip>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-green-600">+{log.amount}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {logsTotal > 10 && (
                    <div className="flex justify-center py-4">
                      <Pagination
                        total={Math.ceil(logsTotal / 10)}
                        page={logsPage}
                        onChange={(p) => { setLogsPage(p); loadLogs(p) }}
                      />
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Tab>

        <Tab key="ranking" title="推广排行">
          <Card>
            <CardBody className="p-4">
              {ranking.length === 0 ? (
                <div className="text-center text-gray-500 py-12">暂无推广数据</div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-gray-800/50">
                    排名按累计返利优先，其次按推广人数排序。
                  </div>

                  <div className="space-y-2">
                    {ranking.map((item, index) => {
                      const rank = index + 1
                      return (
                        <div key={item.app_user_id} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-3 transition-colors hover:border-gray-200 dark:border-gray-800 dark:bg-content1 dark:hover:border-gray-700 sm:flex-row sm:items-center">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-sm font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                            {rank}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate">{item.username}</p>
                            <p className="text-xs text-gray-400 truncate">推广用户 #{item.app_user_id}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-center text-sm sm:w-auto">
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                              <div className="flex items-center justify-center gap-1 text-xs text-gray-400 whitespace-nowrap"><HiUsers className="w-3.5 h-3.5" />推广人数</div>
                              <div className="font-semibold whitespace-nowrap">{item.invite_count}</div>
                            </div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                              <div className="flex items-center justify-center gap-1 text-xs text-gray-400 whitespace-nowrap"><HiCurrencyDollar className="w-3.5 h-3.5" />累计返利</div>
                              <div className="font-semibold text-green-600 whitespace-nowrap">{item.total_rebate}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </Tab>

        <Tab key="tree" title="推广关系">
          <Card>
            <CardBody>
              {/* 面包屑导航 */}
              <div className="flex items-center gap-2 mb-4 text-sm flex-wrap">
                <button
                  onClick={() => handleTreeBack(-1)}
                  className={`hover:text-primary ${treePath.length === 0 ? 'text-primary font-medium' : 'text-gray-500'}`}
                >
                  全部推广人
                </button>
                {treePath.map((item, index) => (
                  <span key={item.id} className="flex items-center gap-2">
                    <HiChevronRight className="w-4 h-4 text-gray-400" />
                    <button
                      onClick={() => handleTreeBack(index)}
                      className={`hover:text-primary ${index === treePath.length - 1 ? 'text-primary font-medium' : 'text-gray-500'}`}
                    >
                      {item.username}的下线
                    </button>
                  </span>
                ))}
              </div>

              {treeUsers.length === 0 ? (
                <div className="text-center text-gray-500 py-12">暂无数据</div>
              ) : (
                <>
                  <div className="space-y-2">
                    {treeUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`flex flex-col gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between ${
                          user.has_children ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''
                        }`}
                        onClick={() => handleTreeClick(user)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-primary font-medium">{user.username.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{user.username}</p>
                            <p className="text-xs text-gray-500 truncate">推广码: {user.invite_code || '未生成'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 w-full text-sm sm:flex sm:items-center sm:gap-6 sm:w-auto">
                          <div className="text-center rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-800/50 sm:bg-transparent sm:p-0 dark:sm:bg-transparent">
                            <p className="text-gray-500">下线</p>
                            <p className="font-medium">{user.invite_count}</p>
                          </div>
                          <div className="text-center rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-800/50 sm:bg-transparent sm:p-0 dark:sm:bg-transparent">
                            <p className="text-gray-500">累计返利</p>
                            <p className="font-medium text-green-600">{user.total_rebate}</p>
                          </div>
                          <div className="text-center rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-800/50 sm:bg-transparent sm:p-0 dark:sm:bg-transparent">
                            <p className="text-gray-500">可用积分</p>
                            <p className="font-medium text-blue-600">{user.rebate_points}</p>
                          </div>
                          {user.has_children && (
                            <HiChevronRight className="hidden sm:block w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {treeTotal > 20 && (
                    <div className="flex justify-center pt-4">
                      <Pagination
                        total={Math.ceil(treeTotal / 20)}
                        page={treePage}
                        onChange={(p) => {
                          setTreePage(p)
                          loadTree(p, treePath.length > 0 ? treePath[treePath.length - 1].id : undefined)
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Tab>
      </Tabs>
    </div>
  )
}
