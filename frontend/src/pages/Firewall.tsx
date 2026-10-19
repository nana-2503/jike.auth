import { useState, useEffect } from 'react'
import {
  Card, CardBody, CardHeader, Button, Switch, Input, Textarea, Select, SelectItem,
  Spinner, Tabs, Tab, Chip,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiShieldCheck, HiSave } from 'react-icons/hi'

interface App {
  id: number
  app_name: string
}

interface FirewallConfig {
  id: number
  app_id: number
  enable: number
  ip_whitelist_enable: number
  ip_whitelist: string
  ip_concurrent_limit: number
  ip_rate_limit_enable: number
  ip_rate_limit: number
  ip_region_enable: number
  ip_region_mode: number
  ip_region_list: string
  login_fail_limit: number
  login_fail_lock_time: number
  captcha_login_enable: number
  captcha_login_after: number
  captcha_reg_enable: number
  captcha_recharge_enable: number
  captcha_changepwd_enable: number
  api_rate_limit_enable: number
  api_rate_limit: number
  heartbeat_check_enable: number
  heartbeat_tolerance: number
  replay_check_enable: number
  replay_window: number
  auto_ban_enable: number
  auto_ban_duration: number
  auto_ban_ip_on_fail: number
  auto_ban_ip_on_rate: number
}

const defaultConfig: FirewallConfig = {
  id: 0,
  app_id: 0,
  enable: 0,
  ip_whitelist_enable: 0,
  ip_whitelist: '',
  ip_concurrent_limit: 0,
  ip_rate_limit_enable: 0,
  ip_rate_limit: 60,
  ip_region_enable: 0,
  ip_region_mode: 1,
  ip_region_list: '',
  login_fail_limit: 0,
  login_fail_lock_time: 30,
  captcha_login_enable: 0,
  captcha_login_after: 3,
  captcha_reg_enable: 0,
  captcha_recharge_enable: 0,
  captcha_changepwd_enable: 0,
  api_rate_limit_enable: 0,
  api_rate_limit: 100,
  heartbeat_check_enable: 0,
  heartbeat_tolerance: 30,
  replay_check_enable: 0,
  replay_window: 60,
  auto_ban_enable: 0,
  auto_ban_duration: 1440,
  auto_ban_ip_on_fail: 0,
  auto_ban_ip_on_rate: 0,
}

export default function Firewall() {
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number>(0)
  const [config, setConfig] = useState<FirewallConfig>(defaultConfig)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('config')

  // 锁定IP相关
  const [locks, setLocks] = useState<{ ip: string; fail_count: number; locked: boolean }[]>([])
  const [locksLoading, setLocksLoading] = useState(false)

  useEffect(() => {
    userApi.listApps(1, 100).then((res: any) => {
      const list = res.data.list || []
      setApps(list)
      if (list.length > 0) {
        setSelectedAppId(list[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (selectedAppId > 0) {
      fetchConfig()
    }
  }, [selectedAppId])

  useEffect(() => {
    if (selectedAppId > 0 && activeTab === 'locks') {
      fetchLocks()
    }
  }, [selectedAppId, activeTab])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.getFirewallConfig(selectedAppId)
      setConfig({ ...defaultConfig, ...res.data, app_id: selectedAppId })
    } catch (e: any) {
      setConfig({ ...defaultConfig, app_id: selectedAppId })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await userApi.saveFirewallConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const fetchLocks = async () => {
    setLocksLoading(true)
    try {
      const res: any = await userApi.listLoginLocks(selectedAppId)
      setLocks(res.data || [])
    } catch {} finally { setLocksLoading(false) }
  }

  const handleUnlock = async (ip: string) => {
    try {
      await userApi.unlockLoginIP(selectedAppId, ip)
      toast.success('解锁成功')
      fetchLocks()
    } catch { toast.error('解锁失败') }
  }

  const updateConfig = (key: keyof FirewallConfig, value: any) => {
    setConfig({ ...config, [key]: value })
  }

  if (apps.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-12 text-gray-500">
          请先创建应用
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Select
          label="选择应用"
          selectedKeys={selectedAppId ? [String(selectedAppId)] : []}
          onChange={(e) => setSelectedAppId(Number(e.target.value))}
          className="w-48"
        >
          {apps.map(app => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <div className="flex-1" />
        <Chip
          color={config.enable === 1 ? 'success' : 'default'}
          variant="flat"
          startContent={<HiShieldCheck className="w-4 h-4" />}
        >
          {config.enable === 1 ? '防火墙已启用' : '防火墙未启用'}
        </Chip>
      </div>

      <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as string)} classNames={{ panel: 'pt-0' }}>
        <Tab key="config" title="配置">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <div className="space-y-4">
              {/* 总开关 */}
              <Card>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">启用防火墙</h3>
                      <p className="text-sm text-gray-500">开启后将对该应用的SDK请求进行安全检查</p>
                    </div>
                    <Switch
                      isSelected={config.enable === 1}
                      onValueChange={(v) => updateConfig('enable', v ? 1 : 0)}
                    />
                  </div>
                </CardBody>
              </Card>

              {/* IP限制 */}
              <Card>
                <CardHeader className="pb-0">
                  <h3 className="font-semibold">IP限制</h3>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">IP白名单</p>
                      <p className="text-sm text-gray-500">只允许白名单内的IP访问</p>
                    </div>
                    <Switch
                      isSelected={config.ip_whitelist_enable === 1}
                      onValueChange={(v) => updateConfig('ip_whitelist_enable', v ? 1 : 0)}
                    />
                  </div>
                  {config.ip_whitelist_enable === 1 && (
                    <Textarea
                      label="IP白名单"
                      placeholder="每行一个IP地址，或用逗号分隔"
                      value={config.ip_whitelist}
                      onChange={(e) => updateConfig('ip_whitelist', e.target.value)}
                      minRows={3}
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">IP频率限制</p>
                      <p className="text-sm text-gray-500">限制单个IP每分钟的请求次数</p>
                    </div>
                    <Switch
                      isSelected={config.ip_rate_limit_enable === 1}
                      onValueChange={(v) => updateConfig('ip_rate_limit_enable', v ? 1 : 0)}
                    />
                  </div>
                  {config.ip_rate_limit_enable === 1 && (
                    <Input
                      type="number"
                      label="每分钟最大请求数"
                      value={String(config.ip_rate_limit)}
                      onChange={(e) => updateConfig('ip_rate_limit', Number(e.target.value))}
                    />
                  )}

                  <Input
                    type="number"
                    label="单IP并发连接数限制"
                    description="0表示不限制"
                    value={String(config.ip_concurrent_limit)}
                    onChange={(e) => updateConfig('ip_concurrent_limit', Number(e.target.value))}
                  />
                </CardBody>
              </Card>

              {/* 登录保护 */}
              <Card>
                <CardHeader className="pb-0">
                  <h3 className="font-semibold">登录保护</h3>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      type="number"
                      label="登录失败次数限制"
                      description="0表示不限制"
                      value={String(config.login_fail_limit)}
                      onChange={(e) => updateConfig('login_fail_limit', Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      label="锁定时长(分钟)"
                      value={String(config.login_fail_lock_time)}
                      onChange={(e) => updateConfig('login_fail_lock_time', Number(e.target.value))}
                    />
                  </div>
                </CardBody>
              </Card>

              {/* 验证码保护 */}
              <Card>
                <CardHeader className="pb-0">
                  <h3 className="font-semibold">验证码保护</h3>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">登录验证码</p>
                      <p className="text-sm text-gray-500">开启后每次登录都要求输入验证码</p>
                    </div>
                    <Switch
                      isSelected={config.captcha_login_enable === 1}
                      onValueChange={(v) => updateConfig('captcha_login_enable', v ? 1 : 0)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">注册验证码</p>
                      <p className="text-sm text-gray-500">注册时要求输入验证码</p>
                    </div>
                    <Switch
                      isSelected={config.captcha_reg_enable === 1}
                      onValueChange={(v) => updateConfig('captcha_reg_enable', v ? 1 : 0)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">充值验证码</p>
                      <p className="text-sm text-gray-500">充值时要求输入验证码</p>
                    </div>
                    <Switch
                      isSelected={config.captcha_recharge_enable === 1}
                      onValueChange={(v) => updateConfig('captcha_recharge_enable', v ? 1 : 0)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">修改密码验证码</p>
                      <p className="text-sm text-gray-500">修改密码时要求输入验证码</p>
                    </div>
                    <Switch
                      isSelected={config.captcha_changepwd_enable === 1}
                      onValueChange={(v) => updateConfig('captcha_changepwd_enable', v ? 1 : 0)}
                    />
                  </div>
                </CardBody>
              </Card>

              {/* 请求防护 */}
              <Card>
                <CardHeader className="pb-0">
                  <h3 className="font-semibold">请求防护</h3>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">API频率限制</p>
                      <p className="text-sm text-gray-500">限制每分钟API调用次数</p>
                    </div>
                    <Switch
                      isSelected={config.api_rate_limit_enable === 1}
                      onValueChange={(v) => updateConfig('api_rate_limit_enable', v ? 1 : 0)}
                    />
                  </div>
                  {config.api_rate_limit_enable === 1 && (
                    <Input
                      type="number"
                      label="每分钟最大调用数"
                      value={String(config.api_rate_limit)}
                      onChange={(e) => updateConfig('api_rate_limit', Number(e.target.value))}
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">重放攻击防护</p>
                      <p className="text-sm text-gray-500">防止请求被重复提交</p>
                    </div>
                    <Switch
                      isSelected={config.replay_check_enable === 1}
                      onValueChange={(v) => updateConfig('replay_check_enable', v ? 1 : 0)}
                    />
                  </div>
                  {config.replay_check_enable === 1 && (
                    <Input
                      type="number"
                      label="检测窗口(秒)"
                      description="同一UUID在此时间内不能重复使用"
                      value={String(config.replay_window)}
                      onChange={(e) => updateConfig('replay_window', Number(e.target.value))}
                    />
                  )}
                </CardBody>
              </Card>

              {/* 自动封禁 */}
              <Card>
                <CardHeader className="pb-0">
                  <h3 className="font-semibold">自动封禁</h3>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">启用自动封禁</p>
                      <p className="text-sm text-gray-500">触发规则后自动加入黑名单</p>
                    </div>
                    <Switch
                      isSelected={config.auto_ban_enable === 1}
                      onValueChange={(v) => updateConfig('auto_ban_enable', v ? 1 : 0)}
                    />
                  </div>

                  {config.auto_ban_enable === 1 && (
                    <>
                      <Input
                        type="number"
                        label="封禁时长(分钟)"
                        description="0表示永久封禁"
                        value={String(config.auto_ban_duration)}
                        onChange={(e) => updateConfig('auto_ban_duration', Number(e.target.value))}
                      />

                      <div className="flex items-center justify-between">
                        <p className="text-sm">登录失败超限时自动封禁IP</p>
                        <Switch
                          isSelected={config.auto_ban_ip_on_fail === 1}
                          onValueChange={(v) => updateConfig('auto_ban_ip_on_fail', v ? 1 : 0)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-sm">请求频率超限时自动封禁IP</p>
                        <Switch
                          isSelected={config.auto_ban_ip_on_rate === 1}
                          onValueChange={(v) => updateConfig('auto_ban_ip_on_rate', v ? 1 : 0)}
                        />
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>

              <div className="flex justify-end">
                <Button
                  color="primary"
                  startContent={<HiSave className="w-4 h-4" />}
                  onPress={handleSave}
                  isLoading={saving}
                >
                  保存配置
                </Button>
              </div>
            </div>
          )}
        </Tab>

        <Tab key="locks" title="锁定IP">
          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <Button size="sm" variant="flat" onPress={fetchLocks}>刷新</Button>
            </div>
            {locksLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : locks.length === 0 ? (
              <Card><CardBody className="text-center py-12 text-gray-500">暂无锁定IP</CardBody></Card>
            ) : (
              <Table aria-label="锁定IP">
                <TableHeader>
                  <TableColumn>IP地址</TableColumn>
                  <TableColumn>失败次数</TableColumn>
                  <TableColumn>状态</TableColumn>
                  <TableColumn>操作</TableColumn>
                </TableHeader>
                <TableBody>
                  {locks.map((item) => (
                    <TableRow key={item.ip}>
                      <TableCell>{item.ip}</TableCell>
                      <TableCell>{item.fail_count}</TableCell>
                      <TableCell>
                        <Chip size="sm" color={item.locked ? 'danger' : 'warning'} variant="flat">
                          {item.locked ? '已锁定' : '计数中'}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="flat" color="primary" onPress={() => handleUnlock(item.ip)}>解锁</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  )
}
