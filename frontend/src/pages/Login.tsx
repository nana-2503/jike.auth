import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Input, Button } from '@heroui/react'
import { authApi, userApi } from '../api'
import { useAuthStore, useSiteStore } from '../store'
import { SiTencentqq, SiGithub, SiTelegram } from 'react-icons/si'
import { HiMail, HiLockClosed } from 'react-icons/hi'
import { AuthPageLayout, authFieldClass, AuthBrandRow } from './AuthPageLayout'

function OrDivider() {
  return (
    <div className="relative flex items-center gap-4 py-1" aria-hidden>
      <div className="h-px flex-1 bg-default-200 dark:bg-default-100" />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-default-400">
        或
      </span>
      <div className="h-px flex-1 bg-default-200 dark:bg-default-100" />
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { setToken, setUser } = useAuthStore()
  const siteConfig = useSiteStore((state) => state.config)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [needCaptcha, setNeedCaptcha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [socialEnabled, setSocialEnabled] = useState(false)
  const [socialLoading, setSocialLoading] = useState('')

  useEffect(() => {
    document.title = `登录 - ${siteConfig.site_name}`
    checkLoginStatus()
    checkSocialLogin()
    handleSocialCallback()
  }, [siteConfig.site_name])

  const checkSocialLogin = async () => {
    try {
      const res: any = await authApi.getSocialLoginStatus()
      setSocialEnabled(res.data.enabled)
    } catch (e) { /* ignore */ }
  }

  const handleSocialCallback = async () => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const err = params.get('error')
    if (err) {
      setError(decodeURIComponent(err))
      window.history.replaceState(null, '', '/login')
      return
    }
    if (token) {
      setToken(token)
      try {
        const res: any = await userApi.getProfile()
        setUser(res.data)
        navigate('/')
      } catch (e) {
        setError('登录失败，请重试')
      }
      window.history.replaceState(null, '', '/login')
    }
  }

  const handleSocialLogin = async (type: string) => {
    setSocialLoading(type)
    try {
      const res: any = await authApi.getSocialLoginURL(type)
      if (res.data?.url) {
        window.location.href = res.data.url
      }
    } catch (e: any) {
      setError(e.message || '获取登录链接失败')
      setSocialLoading('')
    }
  }

  const checkLoginStatus = async () => {
    try {
      const res: any = await authApi.getLoginStatus()
      if (res.data.need_captcha) {
        setNeedCaptcha(true)
        loadCaptcha()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const loadCaptcha = async () => {
    try {
      const res: any = await authApi.getCaptcha()
      setCaptchaId(res.data.captcha_id)
      setCaptchaImg(res.data.captcha_img)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res: any = await authApi.login(username, password, captchaId, captcha)
      setToken(res.data.token)
      setUser(res.data.user)
      navigate('/')
    } catch (err: any) {
      setError(err.message || '登录失败')
      try {
        const statusRes: any = await authApi.getLoginStatus()
        if (statusRes.data.need_captcha && !needCaptcha) {
          setNeedCaptcha(true)
          await loadCaptcha()
        } else if (needCaptcha) {
          await loadCaptcha()
        }
      } catch (e) {
        console.error('Failed to check login status:', e)
      }
      setCaptcha('')
    } finally {
      setLoading(false)
    }
  }

  const socialBtn =
    'w-full h-12 rounded-full flex items-center gap-3 px-5 text-sm font-medium text-foreground transition-colors border border-default-200/80 bg-default-50/80 hover:bg-default-100 dark:bg-default-100/30 dark:hover:bg-default-100/50 disabled:opacity-50 disabled:pointer-events-none'

  return (
    <AuthPageLayout>
          <div className="text-center mb-9">
            <AuthBrandRow
              site_name={siteConfig.site_name}
              site_logo={siteConfig.site_logo}
              site_logo_dark={siteConfig.site_logo_dark}
            />
            <h1 className="text-[1.65rem] sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
              欢迎回来
            </h1>
            <p className="mt-2.5 text-sm text-default-500 leading-relaxed">
              登录你的账号，继续使用全部服务
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <Input
              name="username"
              autoComplete="username"
              radius="full"
              variant="bordered"
              placeholder="用户名或邮箱"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              size="lg"
              startContent={<HiMail className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            <Input
              name="password"
              autoComplete="current-password"
              radius="full"
              variant="bordered"
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              size="lg"
              startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            {needCaptcha && (
              <div className="flex gap-3 items-center pt-0.5">
                <Input
                  radius="full"
                  variant="bordered"
                  placeholder="验证码"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  required
                  size="lg"
                  className="flex-1 min-w-0"
                  classNames={authFieldClass}
                />
                {captchaImg && (
                  <button
                    type="button"
                    className="shrink-0 h-12 w-[108px] rounded-xl border border-default-200 ring-1 ring-black/[0.03] bg-white dark:bg-default-50 cursor-pointer hover:opacity-95 transition-opacity p-1"
                    onClick={loadCaptcha}
                    title="点击刷新"
                  >
                    <img src={captchaImg} alt="" className="h-full w-full object-contain" />
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
              >
                登录
              </Button>
            </div>
          </form>

          {socialEnabled && (
            <div className="mt-7 space-y-3">
              <OrDivider />
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  className={socialBtn}
                  onClick={() => handleSocialLogin('qq')}
                  disabled={!!socialLoading}
                  aria-label="使用 QQ 登录"
                >
                  {socialLoading === 'qq' ? (
                    <span className="inline-block w-5 h-5 border-2 border-default-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <SiTencentqq className="w-5 h-5 shrink-0 text-[#12B7F5]" aria-hidden />
                  )}
                  <span className="flex-1 text-left">使用 QQ 登录</span>
                </button>
                <button
                  type="button"
                  className={socialBtn}
                  onClick={() => handleSocialLogin('github')}
                  disabled={!!socialLoading}
                  aria-label="使用 GitHub 登录"
                >
                  {socialLoading === 'github' ? (
                    <span className="inline-block w-5 h-5 border-2 border-default-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <SiGithub className="w-5 h-5 shrink-0 text-[#181717] dark:text-white" aria-hidden />
                  )}
                  <span className="flex-1 text-left">使用 GitHub 登录</span>
                </button>
                <button
                  type="button"
                  className={socialBtn}
                  onClick={() => handleSocialLogin('telegram')}
                  disabled={!!socialLoading}
                  aria-label="使用 Telegram 登录"
                >
                  {socialLoading === 'telegram' ? (
                    <span className="inline-block w-5 h-5 border-2 border-default-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <SiTelegram className="w-5 h-5 shrink-0 text-[#26A5E4]" aria-hidden />
                  )}
                  <span className="flex-1 text-left">使用 Telegram 登录</span>
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 space-y-3 text-center text-sm">
            <p className="text-default-600 dark:text-default-400">
              还没有账号？{' '}
              <Link to="/register" className="text-primary font-semibold hover:opacity-90 inline">
                立即注册 →
              </Link>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-default-400">
              <Link to="/forgot-password" className="hover:text-primary transition-colors">
                忘记密码
              </Link>
              <span className="text-default-300 dark:text-default-600 select-none" aria-hidden>
                ·
              </span>
              <Link to="/agent/login" className="hover:text-primary transition-colors">
                代理登录
              </Link>
            </div>
          </div>
    </AuthPageLayout>
  )
}
