import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Input, Button } from '@heroui/react'
import { HiMail, HiKey, HiLockClosed } from 'react-icons/hi'
import { authApi } from '../api'
import { toast } from '../components/Toast'
import { useSiteStore } from '../store'
import { AuthPageLayout, authFieldClass, AuthBrandRow } from './AuthPageLayout'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const siteConfig = useSiteStore((state) => state.config)
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    document.title = `忘记密码 - ${siteConfig.site_name}`
  }, [siteConfig.site_name])

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [countdown])

  const handleSendCode = async () => {
    if (!email) {
      toast.error('请输入邮箱')
      return
    }
    setSendingCode(true)
    try {
      await authApi.sendResetCode(email)
      toast.success('验证码已发送')
      setStep(2)
      setCountdown(60)
    } catch (e: any) {
      toast.error(e.message || '发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const handleReset = async () => {
    if (!code) {
      toast.error('请输入验证码')
      return
    }
    if (password.length < 6) {
      toast.error('密码至少6位')
      return
    }
    if (password !== confirmPassword) {
      toast.error('两次密码不一致')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(email, code, password)
      toast.success('密码重置成功')
      navigate('/login')
    } catch (e: any) {
      toast.error(e.message || '重置失败')
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
        <h1 className="text-[1.65rem] sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
          忘记密码
        </h1>
        <p className="mt-2.5 text-sm text-default-500 leading-relaxed">
          {step === 1
            ? '通过注册邮箱验证，重置你的登录密码'
            : '输入邮件中的验证码并设置新密码'}
        </p>
      </div>

      {step === 1 ? (
        <div className="space-y-3.5">
          <Input
            radius="full"
            variant="bordered"
            type="email"
            placeholder="注册邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            size="lg"
            startContent={<HiMail className="w-5 h-5 text-default-400 shrink-0" />}
            classNames={authFieldClass}
          />
          <div className="pt-1">
            <Button
              color="primary"
              radius="full"
              className="w-full h-12 font-semibold text-[15px] shadow-md shadow-primary/25"
              onPress={handleSendCode}
              isLoading={sendingCode}
            >
              发送验证码
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="flex gap-3 items-center">
            <Input
              radius="full"
              variant="bordered"
              placeholder="邮箱验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              size="lg"
              className="flex-1 min-w-0"
              startContent={<HiKey className="w-5 h-5 text-default-400 shrink-0" />}
              classNames={authFieldClass}
            />
            <Button
              radius="full"
              variant="flat"
              color="primary"
              className="shrink-0 h-12 px-4 font-medium min-w-[5.5rem]"
              onPress={handleSendCode}
              isDisabled={countdown > 0}
              isLoading={sendingCode}
            >
              {countdown > 0 ? `${countdown}s` : '重发'}
            </Button>
          </div>
          <Input
            radius="full"
            variant="bordered"
            type="password"
            placeholder="新密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            size="lg"
            startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
            classNames={authFieldClass}
          />
          <Input
            radius="full"
            variant="bordered"
            type="password"
            placeholder="确认新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            size="lg"
            startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
            classNames={authFieldClass}
            onKeyDown={(e) => e.key === 'Enter' && handleReset()}
          />
          <div className="pt-1">
            <Button
              color="primary"
              radius="full"
              className="w-full h-12 font-semibold text-[15px] shadow-md shadow-primary/25"
              onPress={handleReset}
              isLoading={loading}
            >
              重置密码
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-3 text-center text-sm">
        <p className="text-default-600 dark:text-default-400">
          想起密码了？{' '}
          <Link to="/login" className="text-primary font-semibold hover:opacity-90 inline">
            返回登录 →
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-default-400">
          <Link to="/register" className="hover:text-primary transition-colors">
            注册账号
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
