import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Avatar, Card, CardBody, Button, Input, Select, SelectItem, Spinner, Tabs, Tab, DatePicker,
  Switch, Textarea,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { currentZonedDateTime } from '../utils/datePicker'
import { avatarOrDefault } from '../utils/avatar'
import { HiArrowLeft, HiSave, HiRefresh, HiClipboardCopy } from 'react-icons/hi'

interface App {
  id: number
  app_name: string
}

export default function AppUserEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [apps, setApps] = useState<App[]>([])
  const avatarInputRef = useRef<HTMLInputElement>(null)
  
  // 基本信息
  const [formData, setFormData] = useState({
    app_id: 0,
    username: '',
    password: '',  
    status: 1,
    is_paid: 0,
    is_tester: 0,
    points: 0,
    channels: 1,
    features: 1,
    unbind_day: -1,
    unbind_week: -1,
    unbind_month: -1,
    unbind_quarter: -1,
    unbind_halfy: -1,
    unbind_year: -1,
    unbind_total: -1,
    extra_data: '',
    cloud_data: '',
    qq: '',
    wechat: '',
    phone: '',
    email: '',
    avatar: '',
  })
  const [expireDate, setExpireDate] = useState<any>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [resettingInviteCode, setResettingInviteCode] = useState(false)
  const [appName, setAppName] = useState('')

  useEffect(() => {
    loadApps()
    if (!isNew && id) {
      loadUser()
    }
  }, [id, isNew])

  const loadApps = async () => {
    try {
      const res: any = await userApi.listApps(1, 1000)
      setApps(res.data?.list || [])
    } catch { }
  }

  const loadUser = async () => {
    try {
      const res: any = await userApi.getAppUser(Number(id))
      const u = res.data
      setFormData({
        app_id: u.app_id || 0,
        username: u.username || '',
        password: '',
        status: u.status || 1,
        is_paid: u.is_paid || 0,
        is_tester: u.is_tester || 0,
        points: u.points || 0,
        channels: u.channels || 1,
        features: u.features || 1,
        unbind_day: u.unbind_day ?? -1,
        unbind_week: u.unbind_week ?? -1,
        unbind_month: u.unbind_month ?? -1,
        unbind_quarter: u.unbind_quarter ?? -1,
        unbind_halfy: u.unbind_halfy ?? -1,
        unbind_year: u.unbind_year ?? -1,
        unbind_total: u.unbind_total ?? -1,
        extra_data: u.extra_data || '',
        cloud_data: u.cloud_data || '',
        qq: u.qq || '',
        wechat: u.wechat || '',
        phone: u.phone || '',
        email: u.email || '',
        avatar: u.avatar || '',
      })
      if (u.expire_at) {
        try { setExpireDate(parseAbsoluteToLocal(u.expire_at)) } catch { setExpireDate(null) }
      } else {
        setExpireDate(null)
      }
      setInviteCode(u.invite_code || '')
      setAppName(u.app?.app_name || '')
    } catch {
      toast.error('获取用户信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleResetInviteCode = async () => {
    if (!id) return
    setResettingInviteCode(true)
    try {
      const res: any = await userApi.resetAppUserInviteCode(Number(id))
      setInviteCode(res.data?.invite_code || '')
      toast.success('推广码已重置')
    } catch (e: any) { toast.error(e.message || '重置失败') }
    finally { setResettingInviteCode(false) }
  }

  const handleSave = async () => {
    if (isNew && !formData.app_id) { toast.error('请选择应用'); return }
    if (!formData.username.trim()) { toast.error('请输入用户名'); return }
    if (isNew && !formData.password.trim()) { toast.error('请输入密码'); return }
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (!isNew && !data.password) delete data.password
      data.expire_at = expireDate ? expireDate.toDate().toISOString() : ''
      
      if (isNew) {
        await userApi.createAppUser(data)
        toast.success('创建成功')
      } else {
        await userApi.updateAppUser(Number(id), data)
        toast.success('保存成功')
      }
      navigate('/app-users')
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || isNew || !id) return
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res: any = await userApi.uploadAppUserAvatar(Number(id), form)
      setFormData({ ...formData, avatar: res.data?.avatar || '' })
      toast.success('头像已上传')
    } catch (err: any) {
      toast.error(err.message || '上传失败')
    } finally {
      setUploadingAvatar(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/app-users')}><HiArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-xl font-bold">{isNew ? '添加用户' : '编辑用户'}</h2>
        {!isNew && appName && <span className="text-gray-500">({appName})</span>}
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardBody className="p-6">
          <Tabs aria-label="用户信息">
            <Tab key="basic" title="基本信息">
              <div className="space-y-4 pt-4">
                {isNew ? (
                  <Select
                    label="所属应用"
                    selectedKeys={formData.app_id ? [String(formData.app_id)] : []}
                    onChange={(e) => setFormData({ ...formData, app_id: Number(e.target.value) })}
                    isRequired
                  >
                    {apps.map((app) => (
                      <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                    ))}
                  </Select>
                ) : (
                  <Input label="所属应用" value={appName} isReadOnly />
                )}
                {!isNew && (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-content2">
                    <div className="flex items-center gap-3">
                        <Avatar src={avatarOrDefault(formData.avatar)} name={formData.username} className="h-14 w-14 text-lg" />
                      <div>
                        <p className="font-medium">用户头像</p>
                        <p className="text-xs text-gray-400">支持 JPG/PNG/GIF/WebP，最大 2MB</p>
                      </div>
                    </div>
                    <Button size="sm" variant="flat" color="primary" isLoading={uploadingAvatar} onPress={() => avatarInputRef.current?.click()}>上传头像</Button>
                    <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="用户名" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} isRequired />
                  <Input label={isNew ? '密码' : '新密码'} type="password" value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={isNew ? '' : '留空则不修改'} isRequired={isNew} />
                </div>
                <Select label="账户状态" selectedKeys={[String(formData.status)]} onChange={(e) => setFormData({ ...formData, status: Number(e.target.value) })}>
                  <SelectItem key="1">正常</SelectItem>
                  <SelectItem key="2">封停</SelectItem>
                  <SelectItem key="3">冻结</SelectItem>
                </Select>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
                    <span>收费账户</span>
                    <Switch isSelected={formData.is_paid === 1} onValueChange={(v) => setFormData({ ...formData, is_paid: v ? 1 : 0 })} />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
                    <span>内测账户</span>
                    <Switch isSelected={formData.is_tester === 1} onValueChange={(v) => setFormData({ ...formData, is_tester: v ? 1 : 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <DatePicker label="到期时间" value={expireDate} onChange={setExpireDate}
                      granularity="second" hourCycle={24} hideTimeZone showMonthAndYearPickers />
                    <Button size="sm" variant="flat" onPress={() => setExpireDate(currentZonedDateTime())}>设为当前时间</Button>
                  </div>
                  <Input label="点数余额" type="number" value={String(formData.points)}
                    onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="通道数量" type="number" min={1} value={String(formData.channels)}
                    onChange={(e) => setFormData({ ...formData, channels: Number(e.target.value) })} />
                  <Input label="特征数量" type="number" min={1} value={String(formData.features)}
                    onChange={(e) => setFormData({ ...formData, features: Number(e.target.value) })} />
                </div>
                {/* 推广码 - 仅编辑时显示 */}
                {!isNew && (
                  <div className="bg-gray-50 dark:bg-content2 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-gray-500">推广码</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-lg">{inviteCode || '未生成'}</span>
                          {inviteCode && (
                            <Button isIconOnly size="sm" variant="light"
                              onPress={() => { navigator.clipboard.writeText(inviteCode); toast.success('已复制') }}>
                              <HiClipboardCopy className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="flat" color="primary" startContent={<HiRefresh className="w-4 h-4" />}
                        onPress={handleResetInviteCode} isLoading={resettingInviteCode}>
                        重置
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Tab>
            <Tab key="contact" title="联系方式">
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="QQ号" value={formData.qq} onChange={(e) => setFormData({ ...formData, qq: e.target.value })} />
                  <Input label="微信号" value={formData.wechat} onChange={(e) => setFormData({ ...formData, wechat: e.target.value })} />
                  <Input label="手机号" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  <Input label="邮箱" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
            </Tab>
            <Tab key="unbind" title="解绑设置">
              <div className="space-y-4 pt-4">
                <p className="text-sm text-gray-500">-1 表示无限次数</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="每天解绑次数" type="number" value={String(formData.unbind_day)}
                    onChange={(e) => setFormData({ ...formData, unbind_day: Number(e.target.value) })} />
                  <Input label="每周解绑次数" type="number" value={String(formData.unbind_week)}
                    onChange={(e) => setFormData({ ...formData, unbind_week: Number(e.target.value) })} />
                  <Input label="每月解绑次数" type="number" value={String(formData.unbind_month)}
                    onChange={(e) => setFormData({ ...formData, unbind_month: Number(e.target.value) })} />
                  <Input label="每季解绑次数" type="number" value={String(formData.unbind_quarter)}
                    onChange={(e) => setFormData({ ...formData, unbind_quarter: Number(e.target.value) })} />
                  <Input label="每半年解绑次数" type="number" value={String(formData.unbind_halfy)}
                    onChange={(e) => setFormData({ ...formData, unbind_halfy: Number(e.target.value) })} />
                  <Input label="每年解绑次数" type="number" value={String(formData.unbind_year)}
                    onChange={(e) => setFormData({ ...formData, unbind_year: Number(e.target.value) })} />
                  <Input label="总解绑次数" type="number" value={String(formData.unbind_total)}
                    onChange={(e) => setFormData({ ...formData, unbind_total: Number(e.target.value) })} />
                </div>
              </div>
            </Tab>
            <Tab key="data" title="附加数据">
              <div className="space-y-4 pt-4">
                <Textarea label="附加数据" value={formData.extra_data}
                  onChange={(e) => setFormData({ ...formData, extra_data: e.target.value })}
                  placeholder="任意格式的附加数据" minRows={3} />
                <Textarea label="云端数据" value={formData.cloud_data}
                  onChange={(e) => setFormData({ ...formData, cloud_data: e.target.value })}
                  placeholder="通过客户端接口读写的数据" minRows={3} />
              </div>
            </Tab>
          </Tabs>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="flat" onPress={() => navigate('/app-users')}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
              {isNew ? '创建' : '保存'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
