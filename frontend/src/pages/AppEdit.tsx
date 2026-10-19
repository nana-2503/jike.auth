import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Input, Textarea, Select, SelectItem, Switch, Spinner, Tabs, Tab,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiArrowLeft, HiKey, HiSave, HiRefresh } from 'react-icons/hi'

const generateRandomStr = (len: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
  return s
}

// 计算字符串长度（中文算2个字符）
const getStringLength = (str: string) => {
  let len = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // 中文字符范围
    if (code >= 0x4e00 && code <= 0x9fa5) {
      len += 2
    } else {
      len += 1
    }
  }
  return len
}

const generateDefaultFormData = () => ({
  app_name: '', description: '', login_mode: 1, billing_mode: 1, heartbeat: 60,
  crypto_mode: 'aes-256-cbc', app_secret: '',
  sign_algo: `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`,
  server_sign_algo: `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`,
  bind_device: 0, channel_mode: 1, reg_mode: 1, reg_limit: 1,
  trial_duration: 0, trial_points: 0, trial_limit: 0
})

export default function AppEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(generateDefaultFormData)

  useEffect(() => {
    if (!isNew && id) {
      userApi.listApps(1, 100).then((res: any) => {
        const app = res.data.list?.find((a: any) => a.id === Number(id))
        if (app) {
          setFormData({
            app_name: app.app_name, description: app.description || '', login_mode: app.login_mode || 1,
            billing_mode: app.billing_mode || 1, heartbeat: app.heartbeat || 60,
            crypto_mode: app.crypto_mode || 'aes-256-cbc', app_secret: app.app_secret || '',
            sign_algo: app.sign_algo || '', server_sign_algo: app.server_sign_algo || '',
            bind_device: app.bind_device || 0, channel_mode: app.channel_mode || 1,
            reg_mode: app.reg_mode || 1, reg_limit: app.reg_limit || 1,
            trial_duration: app.trial_duration || 0, trial_points: app.trial_points || 0,
            trial_limit: app.trial_limit || 0
          })
        }
      }).finally(() => setLoading(false))
    }
  }, [id, isNew])

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
    
    // 验证应用名称长度（中文算2个字符，最大20个字符）
    const nameLength = getStringLength(formData.app_name)
    if (nameLength > 20) {
      toast.error('APP名称过长，最多20个字符（1个中文=2个字符）')
      return
    }
    
    setSaving(true)
    try {
      if (isNew) {
        await userApi.createApp(formData)
        toast.success('创建成功')
      } else {
        await userApi.updateApp(Number(id), formData)
        toast.success('保存成功')
      }
      navigate('/apps')
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/apps')}><HiArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-xl font-bold">{isNew ? '创建APP' : '编辑APP'}</h2>
      </div>

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
                    description={`当前长度: ${getStringLength(formData.app_name)}/20 (中文=2字符)`}
                    errorMessage={getStringLength(formData.app_name) > 20 ? '名称过长' : ''}
                    isInvalid={getStringLength(formData.app_name) > 20}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
              </CardBody>
            </Card>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="flat" onPress={() => navigate('/apps')}>取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
                {isNew ? '创建' : '保存'}
              </Button>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">AppSecret（AES加密密钥）</label>
                  <div className="flex gap-2 items-start">
                    <Input 
                      value={formData.app_secret || ''} 
                      onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })} 
                      placeholder="留空则自动生成"
                      className="flex-1"
                      description="用于 AES 加密通讯，留空则系统自动生成32位随机密钥"
                      classNames={{ input: 'font-mono text-sm' }}
                    />
                    <Button className="h-14 mt-0" color="primary" variant="flat" onPress={() => setFormData({ ...formData, app_secret: generateRandomStr(32) })}>
                      <HiKey className="w-4 h-4 mr-1" /> 生成
                    </Button>
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
              <Button variant="flat" onPress={() => navigate('/apps')}>取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
                {isNew ? '创建' : '保存'}
              </Button>
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

            {/* 试用设置卡片 */}
            <Card>
              <CardBody className="p-6">
                <div className="mb-4">
                  <h3 className="text-base font-semibold">试用设置</h3>
                  <p className="text-xs text-gray-500 mt-1">新注册用户自动获得以下试用权益</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input 
                    type="number" 
                    label="试用时长" 
                    min={0} 
                    value={String(formData.trial_duration)} 
                    onChange={(e) => setFormData({ ...formData, trial_duration: Number(e.target.value) })}
                    description="0表示不启用"
                    endContent={<span className="text-xs text-gray-400">分钟</span>}
                  />
                  <Input 
                    type="number" 
                    label="试用点数" 
                    min={0} 
                    value={String(formData.trial_points)} 
                    onChange={(e) => setFormData({ ...formData, trial_points: Number(e.target.value) })}
                    description="0表示不启用"
                    endContent={<span className="text-xs text-gray-400">点</span>}
                  />
                  <Input 
                    type="number" 
                    label="特征试用限制" 
                    min={0} 
                    value={String(formData.trial_limit)} 
                    onChange={(e) => setFormData({ ...formData, trial_limit: Number(e.target.value) })}
                    description="0表示不限制"
                    endContent={<span className="text-xs text-gray-400">次</span>}
                  />
                </div>
              </CardBody>
            </Card>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
              <Button variant="flat" onPress={() => navigate('/apps')}>取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
                {isNew ? '创建' : '保存'}
              </Button>
            </div>
          </div>
        </Tab>
      </Tabs>
    </div>
  )
}
