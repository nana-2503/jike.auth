import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { Card, CardBody, Input, Button, Chip, Avatar, Spinner } from '@heroui/react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { userApi, authApi } from '../api'
import { useAuthStore } from '../store'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { avatarOrDefault } from '../utils/avatar'
import { HiUser, HiMail, HiKey, HiCreditCard, HiCamera, HiLink, HiDownload, HiUpload, HiShieldCheck, HiSparkles, HiEye, HiEyeOff, HiPlus } from 'react-icons/hi'
import { FaQq, FaGithub, FaTelegramPlane } from 'react-icons/fa'

export default function Profile() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, setUser, token } = useAuthStore()
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [socialAccounts, setSocialAccounts] = useState<any[]>([])
  const [unbinding, setUnbinding] = useState('')
  const [binding, setBinding] = useState('')
  const [exportingPortable, setExportingPortable] = useState(false)
  const [importingPortable, setImportingPortable] = useState(false)
  const portableImportRef = useRef<HTMLInputElement>(null)
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  useEffect(() => {
    if (user) {
      setNickname(user.nickname || '')
    }
    loadSocialAccounts()
    // 处理社交绑定回调
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success) {
      toast.success(success)
      loadSocialAccounts()
      window.history.replaceState(null, '', '/profile')
    }
    if (error) {
      toast.error(error)
      window.history.replaceState(null, '', '/profile')
    }
  }, [user])

  const loadSocialAccounts = async () => {
    try {
      const res: any = await userApi.getSocialAccounts()
      setSocialAccounts(res.data || [])
    } catch (e) { /* ignore */ }
  }

  const handleUnbind = async (type: string) => {
    setUnbinding(type)
    try {
      await userApi.unbindSocialAccount(type)
      toast.success('解绑成功')
      loadSocialAccounts()
    } catch (e: any) {
      toast.error(e.message || '解绑失败')
    } finally { setUnbinding('') }
  }

  const handlePortableExport = async () => {
    setExportingPortable(true)
    try {
      const blob = await userApi.portableExport()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `jike_author_data_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已开始下载')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExportingPortable(false)
    }
  }

  const handlePortableImportPick = () => portableImportRef.current?.click()

  const handlePortableImportChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) { return }
    if (!await confirm('确定要导入数据包吗？导入的数据将归属当前作者账号，且无法自动撤回。')) {
      e.target.value = ''
      return
    }
    setImportingPortable(true)
    try {
      const res: any = await userApi.portableImport(file)
      toast.success(res.message || '导入成功')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImportingPortable(false)
      e.target.value = ''
    }
  }

  const handleBind = async (type: string) => {
    setBinding(type)
    try {
      const res: any = await authApi.getSocialLoginURL(type)
      if (res.data?.url) {
        window.location.href = res.data.url
      }
    } catch (e: any) {
      toast.error(e.message || '获取授权链接失败')
      setBinding('')
    }
  }

  const handleSaveNickname = async () => {
    if (!nickname.trim()) {
      toast.error('请输入昵称')
      return
    }
    setSavingNickname(true)
    try {
      await userApi.updateProfile({ nickname: nickname.trim() })
      toast.success('昵称修改成功')
      // 更新本地用户信息
      if (user) {
        setUser({ ...user, nickname: nickname.trim() })
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingNickname(false)
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 检查文件类型
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
      toast.error('只支持 JPG/PNG/GIF 格式')
      return
    }

    // 检查文件大小
    if (file.size > 2 * 1024 * 1024) {
      toast.error('文件大小不能超过2MB')
      return
    }

    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res: any = await userApi.uploadAvatar(formData)
      toast.success('头像上传成功')
      if (user) {
        setUser({ ...user, avatar: res.data.avatar })
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUploadingAvatar(false)
      // 清空 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast.error('请输入原密码')
      return
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error('新密码至少6位')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的密码不一致')
      return
    }
    setSavingPassword(true)
    try {
      await userApi.changePassword(oldPassword, newPassword)
      toast.success('密码修改成功')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingPassword(false)
    }
  }

  const cardCls = 'hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent'
  const sectionHeader = (icon: React.ReactNode, title: string, desc: string, iconCls = 'bg-primary/10 text-primary') => (
    <div className="mb-5 flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconCls}`}>{icon}</div>
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="truncate text-xs text-gray-400">{desc}</p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card className={`${cardCls} overflow-hidden`}>
        <CardBody className="relative max-w-full overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <div className="relative flex min-w-0 max-w-full flex-col gap-6 lg:flex-row lg:items-center">
            <div className="flex min-w-0 max-w-full items-center gap-4">
              <div className="relative shrink-0">
                <Avatar
                  src={avatarOrDefault(user?.avatar)}
                  name={user?.nickname || user?.username}
                  radius="full"
                  classNames={{
                    base: 'h-20 w-20 shrink-0 overflow-hidden rounded-full shadow-md ring-4 ring-white/70 dark:ring-white/10',
                    img: 'h-full w-full rounded-full object-cover',
                    fallback: 'h-full w-full rounded-full',
                    name: 'text-2xl',
                  }}
                />
                <button onClick={handleAvatarClick} disabled={uploadingAvatar} className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-50" aria-label="更换头像">
                  {uploadingAvatar ? <Spinner size="sm" color="white" /> : <HiCamera className="h-4 w-4" />}
                </button>
                {uploadingAvatar && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
                    <Spinner size="sm" color="white" />
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif" onChange={handleAvatarChange} className="hidden" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{user?.nickname || user?.username}</h2>
                  <Chip color="primary" variant="flat" size="sm" className="shrink-0">作者</Chip>
                </div>
                <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">@{user?.username}</p>
                {user?.email && (
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-gray-400">
                    <HiMail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid min-w-0 max-w-full flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md lg:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-content2">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">账户余额</p>
                  <p className="mt-0.5 truncate text-lg font-semibold text-primary">¥{user?.balance?.toFixed(2) || '0.00'}</p>
                </div>
                <Button size="sm" color="primary" variant="flat" isIconOnly aria-label="充值" onPress={() => navigate('/recharge')}><HiPlus className="h-4 w-4" /></Button>
              </div>
              <button onClick={() => navigate('/my-packages')} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5 dark:border-gray-800 dark:bg-content2 dark:hover:bg-primary/10">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">我的套餐</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-gray-700 dark:text-gray-200">查看已购套餐</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><HiCreditCard className="h-4 w-4" /></span>
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className={cardCls}>
          <CardBody className="p-5">
            {sectionHeader(<HiUser className="h-5 w-5" />, '基本资料', '管理昵称与展示信息')}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="用户名" value={user?.username || ''} isReadOnly variant="flat" startContent={<HiUser className="h-4 w-4 text-gray-400" />} />
                <Input label="邮箱" value={user?.email || '未绑定'} isReadOnly variant="flat" startContent={<HiMail className="h-4 w-4 text-gray-400" />} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input label="昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} className="flex-1" description="头像支持 JPG/PNG/GIF，最大 2MB" />
                <Button color="primary" className="w-full sm:w-auto" onPress={handleSaveNickname} isLoading={savingNickname} isDisabled={!nickname.trim() || nickname.trim() === (user?.nickname || '')}>保存</Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className={cardCls}>
          <CardBody className="p-5">
            {sectionHeader(<HiShieldCheck className="h-5 w-5" />, '安全设置', '定期更新密码以保护账号', 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300')}
            <div className="space-y-4">
              <Input label="原密码" type={showOldPwd ? 'text' : 'password'} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} endContent={
                <button type="button" onClick={() => setShowOldPwd(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label={showOldPwd ? '隐藏' : '显示'}>
                  {showOldPwd ? <HiEyeOff className="h-4 w-4" /> : <HiEye className="h-4 w-4" />}
                </button>
              } />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="新密码" type={showNewPwd ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} description="至少6位" endContent={
                  <button type="button" onClick={() => setShowNewPwd(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label={showNewPwd ? '隐藏' : '显示'}>
                    {showNewPwd ? <HiEyeOff className="h-4 w-4" /> : <HiEye className="h-4 w-4" />}
                  </button>
                } />
                <Input label="确认新密码" type={showConfirmPwd ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} color={confirmPassword && confirmPassword !== newPassword ? 'danger' : 'default'} errorMessage={confirmPassword && confirmPassword !== newPassword ? '两次输入不一致' : undefined} endContent={
                  <button type="button" onClick={() => setShowConfirmPwd(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label={showConfirmPwd ? '隐藏' : '显示'}>
                    {showConfirmPwd ? <HiEyeOff className="h-4 w-4" /> : <HiEye className="h-4 w-4" />}
                  </button>
                } />
              </div>
              <Button color="primary" onPress={handleChangePassword} isLoading={savingPassword} isDisabled={!oldPassword || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword} startContent={<HiKey className="h-4 w-4" />}>修改密码</Button>
            </div>
          </CardBody>
        </Card>

        <Card className={cardCls}>
          <CardBody className="p-5">
            {sectionHeader(<HiLink className="h-5 w-5" />, '社交账号', '绑定后可使用第三方账号登录', 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300')}
            <div className="grid gap-3 sm:grid-cols-1">
              {([
                { type: 'qq', label: 'QQ', icon: <FaQq className="h-4 w-4" />, brand: 'bg-[#12B7F5]' },
                { type: 'github', label: 'GitHub', icon: <FaGithub className="h-4 w-4" />, brand: 'bg-gray-900' },
                { type: 'telegram', label: 'Telegram', icon: <FaTelegramPlane className="h-4 w-4" />, brand: 'bg-[#27A7E7]' },
              ] as const).map((item) => {
                const bound = socialAccounts.find((a: any) => a.type === item.type)
                return (
                  <div key={item.type} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-content2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${item.brand}`}>{item.icon}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                        <p className="truncate text-xs text-gray-400">{bound ? `已绑定: ${bound.nickname || bound.social_uid}` : '未绑定'}</p>
                      </div>
                    </div>
                    {bound ? (
                      <Button size="sm" variant="flat" color="danger" isLoading={unbinding === item.type} onPress={() => handleUnbind(item.type)}>解绑</Button>
                    ) : (
                      <Button size="sm" variant="flat" color="primary" isLoading={binding === item.type} onPress={() => handleBind(item.type)}>绑定</Button>
                    )}
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>

        <Card className={cardCls}>
          <CardBody className="p-5">
            {sectionHeader(<HiSparkles className="h-5 w-5" />, '数据迁移', '导出或导入作者端业务数据', 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300')}
            <p className="mb-4 text-sm leading-6 text-gray-500 dark:text-gray-400">导出为不含数据库 ID 的压缩包，导入后数据归属当前作者账号。导入前请确认应用编码与 AppKey 无冲突。</p>
            <div className="flex flex-wrap gap-2">
              <Button color="primary" variant="flat" startContent={<HiDownload className="h-4 w-4" />} isLoading={exportingPortable} onPress={handlePortableExport}>导出我的数据</Button>
              <input ref={portableImportRef} type="file" accept=".zip,.json,application/zip,application/json" className="hidden" onChange={handlePortableImportChange} />
              <Button variant="bordered" startContent={<HiUpload className="h-4 w-4" />} isLoading={importingPortable} onPress={handlePortableImportPick}>导入数据包</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
