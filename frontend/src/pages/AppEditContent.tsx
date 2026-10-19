import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Input, Textarea, Select, SelectItem, Switch, Spinner,
} from '@heroui/react'
import { userApi } from '../api'
import { HiKey, HiRefresh, HiInformationCircle, HiCog, HiShieldCheck, HiLockClosed, HiDocumentText, HiLink, HiUserGroup, HiClock } from 'react-icons/hi'

const generateRandomStr = (len: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
  return s
}

const getStringLength = (str: string) => {
  let len = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
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
  bind_device: 0, channel_mode: 1, login_kick: 0, reg_mode: 1, reg_limit: 1,
  reg_channels: 1, reg_features: 1, reg_duration: 0, reg_points: 0,
  trial_duration: 0, trial_points: 0, trial_limit: 0, maintenance: 0,
  sdk_log_enabled: 0,
})

interface AppEditContentProps {
  appId: number | null
  onSuccess: () => void
  onCancel: () => void
  onSave: () => Promise<void>
  saving: boolean
  api?: typeof userApi
}

export default function AppEditContent({ appId, onSuccess, onCancel, onSave, saving, api = userApi }: AppEditContentProps) {
  void onSuccess
  void onCancel
  void onSave
  void saving
  const isNew = appId === null
  const [loading, setLoading] = useState(!isNew)
  const [formData, setFormData] = useState(generateDefaultFormData)

  // 暴露 formData 给父组件
  useEffect(() => {
    (window as any).__appEditFormData = formData
  }, [formData])

  useEffect(() => {
    if (!isNew && appId) {
      api.listApps(1, 100).then((res: any) => {
        const app = res.data.list?.find((a: any) => a.id === appId)
        if (app) {
          setFormData({
            app_name: app.app_name, description: app.description || '', login_mode: app.login_mode || 1,
            billing_mode: app.billing_mode || 1, heartbeat: app.heartbeat || 60,
            crypto_mode: app.crypto_mode || 'aes-256-cbc', app_secret: app.app_secret || '',
            sign_algo: app.sign_algo || '', server_sign_algo: app.server_sign_algo || '',
            bind_device: app.bind_device || 0, channel_mode: app.channel_mode || 1,
            login_kick: app.login_kick || 0,
            reg_mode: app.reg_mode || 1, reg_limit: app.reg_limit || 1,
            reg_channels: app.reg_channels || 1, reg_features: app.reg_features || 1,
            reg_duration: app.reg_duration || 0, reg_points: app.reg_points || 0,
            trial_duration: app.trial_duration || 0, trial_points: app.trial_points || 0,
            trial_limit: app.trial_limit || 0, maintenance: app.maintenance || 0,
            sdk_log_enabled: app.sdk_log_enabled || 0,
          })
        }
      }).finally(() => setLoading(false))
    }
  }, [appId, isNew, api])

  const generateSignAlgo = () => {
    const algo = `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`
    setFormData({ ...formData, sign_algo: algo })
  }

  const generateServerSignAlgo = () => {
    const algo = `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`
    setFormData({ ...formData, server_sign_algo: algo })
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div>
      <div className="space-y-4 mt-6 pb-4">
        {/* 基本信息 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <HiInformationCircle className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">基础信息</h3>
          </div>
          <div className="space-y-3">
            <Input 
              label="APP名称" 
              value={formData.app_name} 
              onChange={(e) => setFormData({ ...formData, app_name: e.target.value })} 
              isRequired 
              description={`当前长度: ${getStringLength(formData.app_name)}/20 (中文=2字符)`}
              size="sm"
              variant="bordered"
            />
            <Textarea 
              label="应用描述" 
              value={formData.description} 
              onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
              minRows={3}
              size="sm"
              variant="bordered"
            />
          </div>
        </div>

        {/* 功能配置 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
              <HiCog className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">功能配置</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select 
              label="登录模式" 
              selectedKeys={[String(formData.login_mode)]} 
              onChange={(e) => setFormData({ ...formData, login_mode: Number(e.target.value) })}
              size="sm"
              variant="bordered"
            >
              <SelectItem key="1">账号登录</SelectItem>
              <SelectItem key="2">卡密登录</SelectItem>
              <SelectItem key="3">账号+卡密</SelectItem>
            </Select>
            <Select 
              label="计费模式" 
              selectedKeys={[String(formData.billing_mode)]} 
              onChange={(e) => setFormData({ ...formData, billing_mode: Number(e.target.value) })}
              size="sm"
              variant="bordered"
            >
              <SelectItem key="1">完全免费</SelectItem>
              <SelectItem key="2">计时收费</SelectItem>
              <SelectItem key="3">计点收费</SelectItem>
            </Select>
          </div>
        </div>

        {/* 通讯配置 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <HiLink className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">通讯配置</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input 
              type="number" 
              label="心跳周期(秒)" 
              min={10} 
              value={String(formData.heartbeat)} 
              onChange={(e) => setFormData({ ...formData, heartbeat: Number(e.target.value) })}
              size="sm"
              variant="bordered"
            />
            <Select 
              label="通讯加密" 
              selectedKeys={[formData.crypto_mode]} 
              onChange={(e) => setFormData({ ...formData, crypto_mode: e.target.value })}
              size="sm"
              variant="bordered"
            >
              <SelectItem key="aes-256-cbc">AES-256-CBC</SelectItem>
            </Select>
          </div>
        </div>

        {/* 密钥配置 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <HiKey className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold">密钥配置</h3>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">AppSecret（AES加密密钥）</label>
            <div className="flex gap-2">
              <Input 
                value={formData.app_secret || ''} 
                onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })} 
                placeholder="留空则自动生成"
                className="flex-1"
                size="sm"
                variant="bordered"
                classNames={{ input: 'font-mono text-xs' }}
              />
              <Button 
                size="sm" 
                color="primary" 
                variant="flat" 
                onPress={() => setFormData({ ...formData, app_secret: generateRandomStr(32) })} 
                className="mt-0"
              >
                <HiRefresh className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500">用于 AES 加密通讯，留空则系统自动生成32位随机密钥</p>
          </div>
        </div>

        {/* 签名算法 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center">
              <HiDocumentText className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">签名算法</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium">客户端签名算法</label>
                <Button size="sm" variant="flat" onPress={generateSignAlgo}><HiRefresh className="w-3 h-3" /></Button>
              </div>
              <Textarea 
                value={formData.sign_algo} 
                onChange={(e) => setFormData({ ...formData, sign_algo: e.target.value })} 
                minRows={2}
                size="sm"
                variant="bordered"
                classNames={{ input: 'font-mono text-xs' }}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium">服务端签名算法</label>
                <Button size="sm" variant="flat" onPress={generateServerSignAlgo}><HiRefresh className="w-3 h-3" /></Button>
              </div>
              <Textarea 
                value={formData.server_sign_algo} 
                onChange={(e) => setFormData({ ...formData, server_sign_algo: e.target.value })} 
                minRows={2}
                size="sm"
                variant="bordered"
                classNames={{ input: 'font-mono text-xs' }}
              />
            </div>
          </div>
        </div>

        {/* 设备绑定 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
              <HiShieldCheck className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">设备绑定</h3>
          </div>
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium">绑定设备特征</p>
              <p className="text-xs text-gray-500 mt-1">开启后用户需绑定设备特征码</p>
            </div>
            <Switch size="sm" isSelected={formData.bind_device === 1} onValueChange={(v) => setFormData({ ...formData, bind_device: v ? 1 : 0 })} />
          </div>
        </div>

        {/* SDK日志 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-500 flex items-center justify-center">
              <HiDocumentText className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">接口日志</h3>
          </div>
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium">记录客户端接口日志</p>
              <p className="text-xs text-gray-500 mt-1">开启后记录该应用 SDK HTTP 请求和响应，仅保留最近3天。</p>
            </div>
            <Switch size="sm" isSelected={formData.sdk_log_enabled === 1} onValueChange={(v) => setFormData({ ...formData, sdk_log_enabled: v ? 1 : 0 })} />
          </div>
        </div>

        {/* 通道配置 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
              <HiLink className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">通道配置</h3>
          </div>
          <Select 
            label="通道模式" 
            selectedKeys={[String(formData.channel_mode)]} 
            onChange={(e) => setFormData({ ...formData, channel_mode: Number(e.target.value) })}
            size="sm"
            variant="bordered"
          >
            <SelectItem key="1">单绑定通道</SelectItem>
            <SelectItem key="2">账户总通道</SelectItem>
          </Select>
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 mt-3">
            <div>
              <p className="text-sm font-medium">登录顶号</p>
              <p className="text-xs text-gray-500 mt-1">开启后通道满时自动踢掉最早登录的会话，关闭则拒绝新登录</p>
            </div>
            <Switch size="sm" isSelected={formData.login_kick === 1} onValueChange={(v) => setFormData({ ...formData, login_kick: v ? 1 : 0 })} />
          </div>
        </div>

        {/* 注册配置 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center">
              <HiUserGroup className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">注册配置</h3>
          </div>
          <div className="space-y-3">
            <Select 
              label="注册模式" 
              selectedKeys={[String(formData.reg_mode)]} 
              onChange={(e) => setFormData({ ...formData, reg_mode: Number(e.target.value) })}
              size="sm"
              variant="bordered"
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
                size="sm"
                variant="bordered"
              />
            )}
            {formData.reg_mode >= 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input 
                  type="number" 
                  label="默认通道数" 
                  min={1} 
                  value={String(formData.reg_channels)} 
                  onChange={(e) => setFormData({ ...formData, reg_channels: Number(e.target.value) })}
                  size="sm"
                  variant="bordered"
                />
                <Input 
                  type="number" 
                  label="默认特征数" 
                  min={1} 
                  value={String(formData.reg_features)} 
                  onChange={(e) => setFormData({ ...formData, reg_features: Number(e.target.value) })}
                  size="sm"
                  variant="bordered"
                />
                <Input 
                  type="number" 
                  label="赠送时长(分钟)" 
                  description="0表示不赠送"
                  min={0} 
                  value={String(formData.reg_duration)} 
                  onChange={(e) => setFormData({ ...formData, reg_duration: Number(e.target.value) })}
                  size="sm"
                  variant="bordered"
                />
                <Input 
                  type="number" 
                  label="赠送点数" 
                  description="0表示不赠送"
                  min={0} 
                  value={String(formData.reg_points)} 
                  onChange={(e) => setFormData({ ...formData, reg_points: Number(e.target.value) })}
                  size="sm"
                  variant="bordered"
                />
              </div>
            )}
          </div>
        </div>

        {/* 试用设置 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center">
              <HiClock className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">试用设置</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input 
              type="number" 
              label="试用时长(分)" 
              min={0} 
              value={String(formData.trial_duration)} 
              onChange={(e) => setFormData({ ...formData, trial_duration: Number(e.target.value) })}
              size="sm"
              variant="bordered"
            />
            <Input 
              type="number" 
              label="试用点数" 
              min={0} 
              value={String(formData.trial_points)} 
              onChange={(e) => setFormData({ ...formData, trial_points: Number(e.target.value) })}
              size="sm"
              variant="bordered"
            />
            <Input 
              type="number" 
              label="特征试用限制" 
              min={0} 
              value={String(formData.trial_limit)} 
              onChange={(e) => setFormData({ ...formData, trial_limit: Number(e.target.value) })}
              size="sm"
              variant="bordered"
            />
          </div>
        </div>

        {/* 维护模式 */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
              <HiLockClosed className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold">维护模式</h3>
          </div>
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium">开启维护</p>
              <p className="text-xs text-gray-500 mt-1">开启后禁止所有登录，已在线用户将被全部踢下线</p>
            </div>
            <Switch size="sm" isSelected={formData.maintenance === 1} onValueChange={(v) => setFormData({ ...formData, maintenance: v ? 1 : 0 })} color="danger" />
          </div>
        </div>
      </div>
    </div>
  )
}
