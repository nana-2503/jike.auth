import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Button } from '@heroui/react'
import { HiCube, HiUser, HiLockClosed } from 'react-icons/hi'
import { agentCenterApi, configApi } from '../../api'
import { toast } from '../../components/Toast'
import { useSiteStore } from '../../store'
import { AuthPageLayout, authFieldClass, AuthBrandRow } from '../AuthPageLayout'

export default function AgentLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const siteConfig = useSiteStore((state) => state.config)
  const [appCode, setAppCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [siteName, setSiteName] = useState('验证系统')

  useEffect(() => {
    if (localStorage.getItem('agent_token')) {
      navigate('/agent')
    }
    configApi.getSite().then((res: any) => {
      if (res.data?.site_name) setSiteName(res.data.site_name)
    }).catch(() => {})
  }, [navigate])

  useEffect(() => {
    const fromQuery = searchParams.get('app_code')?.trim()
    const savedAppCode = localStorage.getItem('agent_last_app_code')?.trim()
    if (fromQuery) {
      setAppCode(fromQuery)
      localStorage.setItem('agent_last_app_code', fromQuery)
    } else if (savedAppCode) {
      setAppCode(savedAppCode)
    }
  }, [searchParams])

  useEffect(() => {
    document.title = `代理登录 - ${siteName}`
  }, [siteName])

  const handleLogin = async () => {
    if (!appCode || !username || !password) {
      toast.error('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      const res: any = await agentCenterApi.login(appCode, username, password)
      localStorage.setItem('agent_token', res.data.token)
      localStorage.setItem('agent_info', JSON.stringify(res.data))
      localStorage.setItem('agent_last_app_code', appCode.trim())
      toast.success('登录成功')
      navigate('/agent')
    } catch (e: any) {
      toast.error(e.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthPageLayout>
      <div className="text-center mb-9">
        <AuthBrandRow
          site_name={siteConfig.site_name || siteName}
          site_logo={siteConfig.site_logo}
          site_logo_dark={siteConfig.site_logo_dark}
        />
        <h1 className="text-[1.65rem] sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
          代理登录
        </h1>
        <p className="mt-2.5 text-sm text-default-500 leading-relaxed">
          使用应用编码与代理账号登录，进行制卡与用户管理
        </p>
      </div>

      <div className="space-y-3.5">
        <Input
          radius="full"
          variant="bordered"
              placeholder="应用编码"
          value={appCode}
          onChange={(e) => setAppCode(e.target.value)}
          size="lg"
          autoComplete="off"
          startContent={<HiCube className="w-5 h-5 text-default-400 shrink-0" />}
          classNames={authFieldClass}
        />
        <Input
          radius="full"
          variant="bordered"
          placeholder="代理账号"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          size="lg"
          autoComplete="username"
          startContent={<HiUser className="w-5 h-5 text-default-400 shrink-0" />}
          classNames={authFieldClass}
        />
        <Input
          radius="full"
          variant="bordered"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          size="lg"
          autoComplete="current-password"
          startContent={<HiLockClosed className="w-5 h-5 text-default-400 shrink-0" />}
          classNames={authFieldClass}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <div className="pt-1">
          <Button
            color="primary"
            radius="full"
            className="w-full h-12 font-semibold text-[15px] shadow-md shadow-primary/25"
            onPress={handleLogin}
            isLoading={loading}
          >
            登录
          </Button>
        </div>
      </div>
    </AuthPageLayout>
  )
}
