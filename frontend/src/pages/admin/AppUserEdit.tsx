import { useState, useEffect, useRef } from 'react'
import {
  Avatar, Button, Input, Select, SelectItem, Spinner, Tabs, Tab, DatePicker,
  Switch, Textarea, Drawer, DrawerContent, DrawerHeader, DrawerBody,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { avatarOrDefault } from '../../utils/avatar'
import { HiSave } from 'react-icons/hi'

interface AdminAppUserEditDrawerProps {
  isOpen: boolean
  onClose: () => void
  userId: number | null
  onSaved?: () => void
}

export default function AdminAppUserEditDrawer({ isOpen, onClose, userId, onSaved }: AdminAppUserEditDrawerProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [ownerName, setOwnerName] = useState('')
  const [appName, setAppName] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
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

  useEffect(() => {
    if (isOpen && userId) { setLoading(true); loadUser() }
  }, [isOpen, userId])

  const loadUser = async () => {
    if (!userId) return
    try {
      const res: any = await adminApi.getAppUser(userId)
      const u = res.data
      setOwnerName(u.app?.user?.nickname || u.app?.user?.username || '-')
      setAppName(u.app?.app_name || '未知应用')
      setFormData({
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
    } catch {
      toast.error('获取用户信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.username.trim()) { toast.error('请输入用户名'); return }
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (!data.password) delete data.password
      data.expire_at = expireDate ? expireDate.toDate().toISOString() : ''
      await adminApi.updateAppUser(userId!, data)
      toast.success('保存成功')
      onSaved?.()
      onClose()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res: any = await adminApi.uploadAppUserAvatar(userId, form)
      setFormData({ ...formData, avatar: res.data?.avatar || '' })
      toast.success('头像已上传')
      onSaved?.()
    } catch (err: any) {
      toast.error(err.message || '上传失败')
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="xl" hideCloseButton>
      <DrawerContent className="rounded-none">
        <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
          <div>
            <span className="font-bold">编辑用户</span>
            {!loading && <p className="text-xs text-gray-500 font-normal mt-0.5">所属作者: {ownerName} | 应用: {appName}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>保存</Button>
            <Button variant="flat" size="sm" onPress={onClose}>关闭</Button>
          </div>
        </DrawerHeader>
        <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <div className="mt-2">
              <Tabs aria-label="用户信息">
                <Tab key="basic" title="基本信息">
                  <div className="space-y-4 pt-4">
                    <Input label="所属应用" value={appName} isReadOnly />
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input label="用户名" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} isRequired />
                      <Input label="新密码" type="password" value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="留空则不修改" />
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
                      <DatePicker label="到期时间" value={expireDate} onChange={setExpireDate}
                        granularity="second" hourCycle={24} hideTimeZone showMonthAndYearPickers />
                      <Input label="点数余额" type="number" value={String(formData.points)}
                        onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="通道数量" type="number" min={1} value={String(formData.channels)}
                        onChange={(e) => setFormData({ ...formData, channels: Number(e.target.value) })} />
                      <Input label="特征数量" type="number" min={1} value={String(formData.features)}
                        onChange={(e) => setFormData({ ...formData, features: Number(e.target.value) })} />
                    </div>
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
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
