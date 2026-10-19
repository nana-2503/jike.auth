import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Input, Button, InputOtp } from '@heroui/react'
import { authApi, configApi } from '../api'
import { toast } from '../components/Toast'
import { useSiteStore } from '../store'
import { HiUser, HiMail, HiLockClosed } from 'react-icons/hi'
import { AuthPageLayout, authFieldClass, AuthBrandRow } from './AuthPageLayout'

export default function Register() {
  const navigate = useNavigate()
  const siteConfig = useSiteStore((state) => state.config)
  const [form, setForm] = useState({ username: '', email: '', password: '', email_code: '', captcha: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registerEnabled, setRegisterEnabled] = useState(true)
  const [requireEmailCode, setRequireEmailCode] = useState(false)
  const [requireCaptcha, setRequireCaptcha] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    document.title = `注册 - ${siteConfig.site_name}`
  }, [siteConfig.site_name])

  useEffect(() => {
    configApi.getRegisterConfig().then((res: any) => {
      setRegisterEnabled(res.data?.register_enabled !== 0)
      setRequireEmailCode(res.data?.require_email_code === 1)
      setRequireCaptcha(res.data?.require_captcha === 1)
      if (res.data?.require_captcha === 1) {
        loadCaptcha()
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const loadCaptcha = async () => {
    try {
      const res: any = await authApi.getCaptcha()
      setCaptchaId(res.data.captcha_id)
      setCaptchaImg(res.data.captcha_img)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendCode = async () => {
    if (!form.email) { toast.error('请先输入邮箱'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error('请输入有效的邮箱地址'); return }
    setSendingCode(true)
    try {
      await authApi.sendRegisterCode(form.email)
      toast.success('验证码已发送')
      setCountdown(60)
    } catch (err: any) { toast.error(err.message || '发送失败') }
    finally { setSendingCode(false) }
  }

  const alphanumRegex = /^[a-zA-Z0-9]+$/

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!registerEnabled) { setError('当前已关闭注册'); return }
    if (form.username.length < 5 || form.username.length > 14) { setError('用户名长度为5-14个字符'); return }
    if (!alphanumRegex.test(form.username)) { setError('用户名只能包含大小写字母和数字'); return }
    if (form.password.length < 6 || form.password.length > 16) { setError('密码长度为6-16个字符'); return }
    if (!alphanumRegex.test(form.password)) { setError('密码只能包含大小写字母和数字'); return }
    setLoading(true)
    setError('')
    try {
      const data: any = {
        username: form.username,
        email: form.email,
        password: form.password,
      }
      if (requireEmailCode && form.email_code) {
        data.email_code = form.email_code
      }
      if (requireCaptcha) {
        data.captcha_id = captchaId
        data.captcha = form.captcha
      }
      await authApi.register(data)
      toast.success('注册成功，请登录')
      navigate('/login')
    } catch (err: any) {
      setError(err.message || '注册失败')
      if (requireCaptcha) {
        loadCaptcha()
        setForm(f => ({ ...f, captcha: '' }))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthPageLayout>
      <div className="text-center mb-9">
        <AuthBrandRow
          site_name={siteConfig.site_name}
          site_logo={siteConfig.site_logo}
          site_logo_dark={siteConfig.site_logo_dark}
        />
        {registerEnabled && (
          <>
            <h1 className="text-[1.65rem] sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
              创建账号
            </h1>
            <p className="mt-2.5 text-sm text-default-500 leading-relaxed">
              填写信息完成注册，开始使用全部功能
            </p>
          </>
        )}
      </div>

      {!registerEnabled ? (
        <div className="space-y-6 text-center">
          <div className="rounded-2xl border border-default-200 bg-default-50 px-5 py-8 dark:bg-content2">
            <p className="text-lg font-semibold text-foreground">当前注册已关闭</p>
            <p className="mt-2 text-sm text-default-500">如需开通账号，请联系管理员。</p>
          </div>
          <Link to="/login" className="text-primary font-semibold hover:opacity-90 inline-block">
            返回登录 →
          </Link>
        </div>
      ) : (

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Input
          radius="full"
          variant="bordered"
          placeholder="用户名"
          description="5-14 位，仅限字母与数字"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
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
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
          size="lg"
          startContent={<HiMail className="w-5 h-5 text-default-400 shrink-0" />}
          classNames={authFieldClass}
        />
        {requireEmailCode && (
          <div className="space-y-3 pt-0.5">
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
                isDisabled={countdown > 0}
                className="font-medium"
              >
                {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
              </Button>
            </div>
            <div className="flex justify-center">
              <InputOtp
                length={6}
                value={form.email_code}
                onValueChange={(value) => setForm({ ...form, email_code: value })}
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
          placeholder="密码"
          description="6-16 位，仅限字母与数字"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          size="lg"
          maxLength={16}
          startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
          classNames={authFieldClass}
        />
        {requireCaptcha && (
          <div className="flex gap-3 items-center pt-0.5">
            <Input
              radius="full"
              variant="bordered"
              placeholder="图形验证码"
              value={form.captcha}
              onChange={(e) => setForm({ ...form, captcha: e.target.value })}
              required
              size="lg"
              className="flex-1 min-w-0"
              classNames={authFieldClass}
            />
            {captchaImg && (
              <button
                type="button"
                className="shrink-0 h-12 rounded-xl overflow-hidden border border-default-200 ring-1 ring-black/[0.03] cursor-pointer hover:opacity-95 transition-opacity"
                onClick={loadCaptcha}
                title="点击刷新"
              >
                <img src={captchaImg} alt="" className="h-full w-[100px] object-cover" />
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="text-center text-danger text-sm px-1 pt-1" role="alert">
            {error}
          </p>
        )}
        <div className="pt-1">
          <Button
            type="submit"
            color="primary"
            radius="full"
            className="w-full h-12 font-semibold text-[15px] shadow-md shadow-primary/25"
            isLoading={loading}
            isDisabled={!registerEnabled}
          >
            注册
          </Button>
        </div>
      </form>
      )}

      {registerEnabled && <div className="mt-8 text-center text-sm">
        <p className="text-default-600 dark:text-default-400">
          已有账号？{' '}
          <Link to="/login" className="text-primary font-semibold hover:opacity-90 inline">
            返回登录 →
          </Link>
        </p>
      </div>}
    </AuthPageLayout>
  )
}
