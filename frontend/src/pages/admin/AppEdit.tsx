import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Input, Textarea, Select, SelectItem, Switch, Spinner, Tabs, Tab, Avatar,
} from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { avatarOrDefault } from '../../utils/avatar'
import { HiArrowLeft, HiSave, HiRefresh } from 'react-icons/hi'

interface App {
  id: number
  user_id: number
  user?: { id: number; username: string; nickname: string; avatar: string }
  app_name: string
  description: string
  login_mode: number
  billing_mode: number
  heartbeat: number
  crypto_mode: string
  sign_algo: string
  server_sign_algo: string
  bind_device: number
  channel_mode: number
  reg_mode: number
  reg_limit: number
  status: number
}

const defaultFormData = {
  app_name: '', description: '', login_mode: 1, billing_mode: 1, heartbeat: 60,
  crypto_mode: 'aes-256-cbc', sign_algo: '', server_sign_algo: '',
  bind_device: 0, channel_mode: 1, reg_mode: 1, reg_limit: 1, status: 1,
}

export default function AdminAppEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(defaultFormData)
  const [appInfo, setAppInfo] = useState<App | null>(null)

  useEffect(() => {
    if (id) {
      adminApi.listApps(1, 100).then((res: any) => {
        const app = res.data.list?.find((a: any) => a.id === Number(id))
        if (app) {
          setAppInfo(app)
          setFormData({
            app_name: app.app_name, description: app.description || '', login_mode: app.login_mode || 1,
            billing_mode: app.billing_mode || 1, heartbeat: app.heartbeat || 60,
            crypto_mode: app.crypto_mode || 'aes-256-cbc',
            sign_algo: app.sign_algo || '', server_sign_algo: app.server_sign_algo || '',
            bind_device: app.bind_device || 0, channel_mode: app.channel_mode || 1,
            reg_mode: app.reg_mode || 1, reg_limit: app.reg_limit || 1, status: app.status,
          })
        }
      }).finally(() => setLoading(false))
    }
  }, [id])

  const generateRandomStr = (len: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let s = ''
    for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
    return s
  }

  const generateSignAlgo = () => {
    const algo = `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`
    setFormData({ ...formData, sign_algo: algo })
  }

  const generateServerSignAlgo = () => {
    const algo = `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`
    setFormData({ ...formData, server_sign_algo: algo })
  }

  const handleSave = async () => {
    if (!formData.app_name.trim()) { toast.error('请输入APP名称'); return }
    setSaving(true)
    try {
      await adminApi.updateApp(Number(id), formData)
      toast.success('保存成功')
      navigate('/admin/apps')
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/admin/apps')}><HiArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-xl font-bold">编辑APP</h2>
      </div>

      {appInfo?.user && (
        <Card className="max-w-4xl mx-auto">
          <CardBody className="flex-row items-center gap-3 p-4">
            <Avatar size="sm" src={avatarOrDefault(appInfo.user.avatar)} name={appInfo.user.nickname || appInfo.user.username} />
            <div>
              <p className="font-medium">{appInfo.user.nickname || appInfo.user.username}</p>
              <p className="text-xs text-gray-400">所属用户</p>
            </div>
          </CardBody>
        </Card>
      )}

      <Tabs aria-label="配置选项" className="w-full max-w-4xl mx-auto">
        <Tab key="basic" title="基本信息">
          <div className="space-y-4">
            {/* 基础信息卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">基础信息</h3>
                <div className="space-y-4">
                  <Input 
                    label="APP名称" 
                    value={formData.app_name} 
                    onChange={(e) => setFormData({ ...formData, app_name: e.target.value })} 
                    isRequired
                    placeholder="请输入应用名称"
                  />
                  <Textarea 
                    label="应用描述" 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    minRows={3}
                    placeholder="简要描述应用的功能和用途"
                  />
                </div>
              </CardBody>
            </Card>

            {/* 功能配置卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">功能配置</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select 
                    label="登录模式" 
                    selectedKeys={[String(formData.login_mode)]} 
                    onChange={(e) => setFormData({ ...formData, login_mode: Number(e.target.value) })}
                    description="选择用户登录方式"
                  >
                    <SelectItem key="1">账号登录</SelectItem>
                    <SelectItem key="2">卡密登录</SelectItem>
                    <SelectItem key="3">账号+卡密</SelectItem>
                  </Select>
                  <Select 
                    label="计费模式" 
                    selectedKeys={[String(formData.billing_mode)]} 
                    onChange={(e) => setFormData({ ...formData, billing_mode: Number(e.target.value) })}
                    description="选择收费方式"
                  >
                    <SelectItem key="1">完全免费</SelectItem>
                    <SelectItem key="2">计时收费</SelectItem>
                    <SelectItem key="3">计点收费</SelectItem>
                  </Select>
                  <Select 
                    label="应用状态" 
                    selectedKeys={[String(formData.status)]} 
                    onChange={(e) => setFormData({ ...formData, status: Number(e.target.value) })}
                    description="控制应用启用状态"
                  >
                    <SelectItem key="1">正常</SelectItem>
                    <SelectItem key="0">禁用</SelectItem>
                  </Select>
                </div>
              </CardBody>
            </Card>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="flat" onPress={() => navigate('/admin/apps')}>取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>保存</Button>
            </div>
          </div>
        </Tab>

        <Tab key="security" title="安全设置">
          <div className="space-y-4">
            {/* 基础配置卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">基础配置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    type="number" 
                    label="心跳周期" 
                    min={10} 
                    value={String(formData.heartbeat)} 
                    onChange={(e) => setFormData({ ...formData, heartbeat: Number(e.target.value) })}
                    description="客户端心跳间隔"
                    endContent={<span className="text-xs text-gray-400">秒</span>}
                  />
                  <Select 
                    label="通讯加密" 
                    selectedKeys={[formData.crypto_mode]} 
                    onChange={(e) => setFormData({ ...formData, crypto_mode: e.target.value })}
                    description="客户端与服务器通讯加密方式"
                  >
                    <SelectItem key="aes-256-cbc">AES-256-CBC</SelectItem>
                  </Select>
                </div>
              </CardBody>
            </Card>

            {/* 密钥配置卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">密钥配置</h3>
                <div className="flex gap-2 items-start">
                  <div className="text-sm text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                    <p className="font-medium mb-1">加密密钥说明</p>
                    <p>系统将自动使用 AppSecret 作为 AES 加密密钥，无需单独配置。</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* 签名算法卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">签名算法</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm">客户端签名算法</label>
                      <Button size="sm" color="primary" variant="flat" onPress={generateSignAlgo}>
                        <HiRefresh className="w-4 h-4 mr-1" /> 生成
                      </Button>
                    </div>
                    <Textarea 
                      value={formData.sign_algo} 
                      onChange={(e) => setFormData({ ...formData, sign_algo: e.target.value })} 
                      placeholder="点击生成按钮自动生成，包含[key]和[data]变量" 
                      minRows={2}
                      classNames={{ input: 'font-mono text-xs' }}
                      description="用于客户端生成请求签名"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm">服务端签名算法</label>
                      <Button size="sm" color="primary" variant="flat" onPress={generateServerSignAlgo}>
                        <HiRefresh className="w-4 h-4 mr-1" /> 生成
                      </Button>
                    </div>
                    <Textarea 
                      value={formData.server_sign_algo} 
                      onChange={(e) => setFormData({ ...formData, server_sign_algo: e.target.value })} 
                      placeholder="点击生成按钮自动生成，包含[key]和[data]变量" 
                      minRows={2}
                      classNames={{ input: 'font-mono text-xs' }}
                      description="用于服务端生成请求签名"
                    />
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* 设备管理卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">设备管理</h3>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="font-medium">绑定设备特征</p>
                    <p className="text-sm text-gray-500">开启后用户需绑定设备特征码才能使用</p>
                  </div>
                  <Switch isSelected={formData.bind_device === 1} onValueChange={(v) => setFormData({ ...formData, bind_device: v ? 1 : 0 })} />
                </div>
              </CardBody>
            </Card>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="flat" onPress={() => navigate('/admin/apps')}>取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>保存</Button>
            </div>
          </div>
        </Tab>

        <Tab key="channel" title="通道注册">
          <div className="space-y-4">
            {/* 通道配置卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">通道配置</h3>
                <Select 
                  label="通道模式" 
                  selectedKeys={[String(formData.channel_mode)]} 
                  onChange={(e) => setFormData({ ...formData, channel_mode: Number(e.target.value) })}
                  description="单绑定通道：每个设备独立通道；账户总通道：所有设备共享通道"
                >
                  <SelectItem key="1">单绑定通道</SelectItem>
                  <SelectItem key="2">账户总通道</SelectItem>
                </Select>
              </CardBody>
            </Card>

            {/* 注册配置卡片 */}
            <Card>
              <CardBody className="p-6">
                <h3 className="text-base font-semibold mb-4">注册配置</h3>
                <div className="space-y-4">
                  <Select 
                    label="注册模式" 
                    selectedKeys={[String(formData.reg_mode)]} 
                    onChange={(e) => setFormData({ ...formData, reg_mode: Number(e.target.value) })}
                    description="控制用户注册权限"
                  >
                    <SelectItem key="1">关闭注册</SelectItem>
                    <SelectItem key="2">开放注册(无限制)</SelectItem>
                    <SelectItem key="3">开放注册(需充值卡)</SelectItem>
                    <SelectItem key="4">开放注册(限制次数)</SelectItem>
                  </Select>
                  {formData.reg_mode === 4 && (
                    <Input 
                      type="number" 
                      label="特征限制注册次数" 
                      min={1} 
                      value={String(formData.reg_limit)} 
                      onChange={(e) => setFormData({ ...formData, reg_limit: Number(e.target.value) })}
                      description="同一设备特征最多可注册的账号数量"
                      endContent={<span className="text-xs text-gray-400">次</span>}
                    />
                  )}
                </div>
              </CardBody>
            </Card>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="flat" onPress={() => navigate('/admin/apps')}>取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>保存</Button>
            </div>
          </div>
        </Tab>
      </Tabs>

    </div>
  )
}
