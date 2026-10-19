import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Button, Tabs, Tab, InputOtp } from '@heroui/react'
import { authApi, userApi, configApi } from '../api'
import { useAuthStore, useSiteStore } from '../store'
import { AuthPageLayout, AuthBrandRow, authFieldClass } from './AuthPageLayout'
import { HiMail, HiLockClosed, HiUser } from 'react-icons/hi'

const tabsClassNames = {
  tabList: 'w-full bg-default-100/90 dark:bg-default-50/40 p-1 rounded-full gap-0.5',
  cursor: 'bg-white dark:bg-content1 shadow-sm rounded-full',
  tab: 'h-10 max-w-full rounded-full',
  tabContent: 'text-sm group-data-[selected=true]:font-semibold',
  panel: 'outline-none pt-5',
}

export default function BindSocial() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setToken, setUser } = useAuthStore()
  const siteConfig = useSiteStore((state) => state.config)
  const bindToken = searchParams.get('token') || ''
  const socialType = searchParams.get('type') || ''
  const nickname = searchParams.get('nickname') || ''

  const [tab, setTab] = useState('bind')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requireEmailCode, setRequireEmailCode] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)

  const [bindUsername, setBindUsername] = useState('')
  const [bindPassword, setBindPassword] = useState('')

  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regEmailCode, setRegEmailCode] = useState('')

  useEffect(() => {
    document.title = `绑定账号 - ${siteConfig.site_name}`
  }, [siteConfig.site_name])

  useEffect(() => {
    configApi.getRegisterConfig().then((res: any) => {
      if (res.data?.require_email_code === 1) {
        setRequireEmailCode(true)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (codeCooldown > 0) {
      const timer = setTimeout(() => setCodeCooldown(codeCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [codeCooldown])

  const handleSendCode = async () => {
    if (!regEmail) {
      setError('请先输入邮箱')
      return
    }
    setSendingCode(true)
    try {
      await authApi.sendRegisterCode(regEmail)
      setCodeCooldown(60)
      setError('')
    } catch (e: any) {
      setError(e.message || '发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bindUsername.trim()) {
      setError('请输入用户名或邮箱')
      return
    }
    if (!bindPassword) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res: any = await authApi.bindSocialAccount({
        bind_token: bindToken,
        username: bindUsername,
        password: bindPassword,
      })
      setToken(res.data.token)
      const profile: any = await userApi.getProfile()
      setUser(profile.data)
      navigate('/')
    } catch (err: any) {
      setError(err.message || '绑定失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regUsername.trim() || regUsername.length < 5) {
      setError('用户名至少 5 位')
      return
    }
    if (!regEmail.trim()) {
      setError('请输入邮箱')
      return
    }
    if (!regPassword || regPassword.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (requireEmailCode && regEmailCode.length < 6) {
      setError('请输入 6 位邮箱验证码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res: any = await authApi.registerAndBindSocial({
        bind_token: bindToken,
        username: regUsername,
        email: regEmail,
        password: regPassword,
        email_code: regEmailCode,
      })
      setToken(res.data.token)
      const profile: any = await userApi.getProfile()
      setUser(profile.data)
      navigate('/')
    } catch (err: any) {
      setError(err.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  const typeLabel: Record<string, string> = { qq: 'QQ', github: 'GitHub', telegram: 'Telegram' }

  return (
    <AuthPageLayout>
      <div className="text-center mb-6">
        <AuthBrandRow
          site_name={siteConfig.site_name}
          site_logo={siteConfig.site_logo}
          site_logo_dark={siteConfig.site_logo_dark}
        />
        <p className="mt-1 text-sm text-default-500 leading-relaxed px-1">
          {typeLabel[socialType] || socialType || '第三方'} 账号{' '}
          <span className="font-medium text-foreground">{nickname || '（未命名）'}</span>{' '}
          首次登录，请绑定已有账号或注册新账号
        </p>
      </div>

      {error ? (
        <p className="text-center text-danger text-sm mb-4 px-1" role="alert">
          {error}
        </p>
      ) : null}

      <Tabs
        selectedKey={tab}
        onSelectionChange={(k) => {
          setTab(String(k))
          setError('')
        }}
        fullWidth
        classNames={tabsClassNames}
        aria-label="绑定方式"
      >
        <Tab key="bind" title="绑定已有账号">
          <form noValidate onSubmit={handleBind} className="space-y-3.5">
            <Input
              name="bind_user"
              autoComplete="username"
              radius="full"
              variant="bordered"
              placeholder="用户名或邮箱"
              value={bindUsername}
              onChange={(e) => setBindUsername(e.target.value)}
              size="lg"
              startContent={<HiMail className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            <Input
              name="bind_pass"
              autoComplete="current-password"
              radius="full"
              variant="bordered"
              type="password"
              placeholder="密码"
              value={bindPassword}
              onChange={(e) => setBindPassword(e.target.value)}
              size="lg"
              startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            <div className="pt-1">
              <Button
                type="submit"
                color="primary"
                radius="full"
                className="w-full h-12 font-semibold text-[15px] shadow-md shadow-primary/25"
                isLoading={loading}
              >
                绑定并登录
              </Button>
            </div>
          </form>
        </Tab>
        <Tab key="register" title="注册新账号">
          <form noValidate onSubmit={handleRegister} className="space-y-3.5">
            <Input
              radius="full"
              variant="bordered"
              placeholder="用户名（5 位以上）"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
              size="lg"
              maxLength={14}
              startContent={<HiUser className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            <Input
              radius="full"
              variant="bordered"
              type="email"
              placeholder="邮箱"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              size="lg"
              startContent={<HiMail className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            {requireEmailCode && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-sm text-default-600 font-medium">邮箱验证码</span>
                  <Button
                    type="button"
                    radius="full"
                    size="sm"
                    variant="flat"
                    color="primary"
                    onPress={handleSendCode}
                    isLoading={sendingCode}
                    isDisabled={codeCooldown > 0}
                    className="font-medium"
                  >
                    {codeCooldown > 0 ? `${codeCooldown}s 后重发` : '获取验证码'}
                  </Button>
                </div>
                <div className="flex justify-center">
                  <InputOtp
                    length={6}
                    value={regEmailCode}
                    onValueChange={setRegEmailCode}
                    classNames={{
                      segmentWrapper: 'gap-2',
                      segment:
                        'w-10 h-12 rounded-full border-default-200 data-[active=true]:border-primary data-[active=true]:shadow-none',
                    }}
                  />
                </div>
              </div>
            )}
            <Input
              radius="full"
              variant="bordered"
              type="password"
              placeholder="密码（6 位以上）"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              size="lg"
              maxLength={16}
              startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            <div className="pt-1">
              <Button
                type="submit"
                color="primary"
                radius="full"
                className="w-full h-12 font-semibold text-[15px] shadow-md shadow-primary/25"
                isLoading={loading}
              >
                注册并绑定
              </Button>
            </div>
          </form>
        </Tab>
      </Tabs>
    </AuthPageLayout>
  )
}
