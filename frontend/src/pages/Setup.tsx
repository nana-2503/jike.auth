import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardBody, Chip, Divider, Input, Progress, Select, SelectItem, Spinner, Switch } from '@heroui/react'
import {
  HiCheckCircle,
  HiChevronLeft,
  HiChevronRight,
  HiDatabase,
  HiLockClosed,
  HiMail,
  HiServer,
  HiUser,
} from 'react-icons/hi'
import { authApi } from '../api'
import { toast } from '../components/Toast'
import { useSiteStore } from '../store'
import { AuthBrandRow } from './AuthPageLayout'

type DBType = 'mysql' | 'mariadb' | 'postgres'

const steps = [
  { title: '数据库', desc: '配置业务数据源', icon: HiDatabase },
  { title: 'Redis', desc: '可选缓存服务', icon: HiServer },
  { title: '管理员', desc: '创建后台入口账号', icon: HiUser },
]

const fieldProps = {
  labelPlacement: 'outside' as const,
  variant: 'bordered' as const,
  radius: 'sm' as const,
}

export default function Setup({ onSetupComplete }: { onSetupComplete?: () => void }) {
  const navigate = useNavigate()
  const siteConfig = useSiteStore((state) => state.config)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [testingDatabase, setTestingDatabase] = useState(false)
  const [testingRedis, setTestingRedis] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [hasAdmin, setHasAdmin] = useState(false)
  const [form, setForm] = useState({
    database: {
      type: 'mysql' as DBType,
      host: '127.0.0.1',
      port: '3306',
      user: 'root',
      password: '',
      dbname: 'jike-auth',
      sslmode: 'disable',
    },
    redis: {
      enable: false,
      host: '127.0.0.1',
      port: '6379',
      password: '',
      db: '0',
    },
    admin: {
      username: '',
      nickname: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step])

  useEffect(() => {
    document.title = `系统初始化 - ${siteConfig.site_name}`
  }, [siteConfig.site_name])

  useEffect(() => {
    authApi.getSetupStatus()
      .then((res: any) => {
        if (!res.data?.need_setup) {
          navigate('/login', { replace: true })
          return
        }
        setHasAdmin(Boolean(res.data?.has_admin))
      })
      .catch(() => {
        setError('无法获取初始化状态，请稍后重试')
      })
      .finally(() => setChecking(false))
  }, [navigate])

  const setDatabase = (patch: Partial<typeof form.database>) => {
    setForm((prev) => ({ ...prev, database: { ...prev.database, ...patch } }))
  }

  const setRedis = (patch: Partial<typeof form.redis>) => {
    setForm((prev) => ({ ...prev, redis: { ...prev.redis, ...patch } }))
  }

  const setAdmin = (patch: Partial<typeof form.admin>) => {
    setForm((prev) => ({ ...prev, admin: { ...prev.admin, ...patch } }))
  }

  const validateStep = (targetStep = step) => {
    if (targetStep === 0) {
      if (!form.database.host.trim()) return '请输入数据库地址'
      if (!form.database.user.trim()) return '请输入数据库账号'
      if (!form.database.dbname.trim()) return '请输入数据库名称'
      if (!isPositiveInteger(form.database.port)) return '请输入有效的数据库端口'
    }

    if (targetStep === 1 && form.redis.enable) {
      if (!form.redis.host.trim()) return '请输入 Redis 地址'
      if (!isPositiveInteger(form.redis.port)) return '请输入有效的 Redis 端口'
      if (!isNonNegativeInteger(form.redis.db)) return '请输入有效的 Redis DB'
    }

    if (targetStep === 2) {
      if (hasAdmin) return ''
      if (!form.admin.username.trim()) return '请输入管理员用户名'
      if (!/^[a-zA-Z0-9]{5,14}$/.test(form.admin.username.trim())) {
        return '管理员用户名需为 5-14 位大小写字母或数字'
      }
      if (!form.admin.email.trim()) return '请输入管理员邮箱'
      if (!form.admin.email.includes('@')) return '请输入有效的管理员邮箱'
      if (form.admin.password.length < 8) return '管理员密码至少 8 位'
      if (form.admin.password !== form.admin.confirmPassword) return '两次输入的密码不一致'
    }

    return ''
  }

  const getDatabasePayload = () => ({
    type: form.database.type,
    host: form.database.host.trim(),
    port: Number(form.database.port),
    user: form.database.user.trim(),
    password: form.database.password,
    dbname: form.database.dbname.trim(),
    sslmode: form.database.sslmode || 'disable',
  })

  const getRedisPayload = () => ({
    enable: form.redis.enable,
    host: form.redis.host.trim(),
    port: Number(form.redis.port),
    password: form.redis.password,
    db: Number(form.redis.db || 0),
  })

  const nextStep = async () => {
    const msg = validateStep()
    if (msg) {
      setError(msg)
      return
    }

    if (step === 0) {
      setTestingDatabase(true)
      setError('')
      try {
        const res: any = await authApi.testSetupDatabase(getDatabasePayload())
        setHasAdmin(Boolean(res.data?.has_admin))
      } catch {
        setError('数据库链接失败')
        return
      } finally {
        setTestingDatabase(false)
      }
    }

    if (step === 1 && form.redis.enable) {
      setTestingRedis(true)
      setError('')
      try {
        await authApi.testSetupRedis(getRedisPayload())
      } catch {
        setError('Redis 链接失败')
        return
      } finally {
        setTestingRedis(false)
      }
    }

    setError('')
    setStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const prevStep = () => {
    setError('')
    setStep((prev) => Math.max(prev - 1, 0))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const msg = validateStep(2)
    if (msg) {
      setError(msg)
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload: Parameters<typeof authApi.setupInit>[0] = {
        database: getDatabasePayload(),
        redis: getRedisPayload(),
      }
      if (!hasAdmin) {
        payload.admin = {
          username: form.admin.username.trim(),
          nickname: form.admin.nickname.trim(),
          email: form.admin.email.trim(),
          password: form.admin.password,
        }
      }
      await authApi.setupInit(payload)
      localStorage.removeItem('token')
      toast.success('系统初始化完成，请登录')
      onSetupComplete?.()
      navigate('/login', { replace: true })
    } catch (e: any) {
      setError(e.message || '初始化失败')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-default-500">
          <Spinner size="lg" />
          <span className="text-sm">正在检查初始化状态...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:py-8">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <AuthBrandRow
            site_name={siteConfig.site_name}
            site_logo={siteConfig.site_logo}
            site_logo_dark={siteConfig.site_logo_dark}
          />
          <Chip color="primary" variant="flat" radius="sm" className="w-fit">
            初始化进度 {progress}%
          </Chip>
        </header>

        <main className="flex flex-1 items-center">
          <Card radius="sm" shadow="none" className="w-full border border-default-200 bg-content1">
            <CardBody className="p-0">
              <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="border-b border-default-200 p-5 sm:p-6 lg:border-b-0 lg:border-r">
                  <div>
                    <h1 className="text-xl font-semibold">系统初始化</h1>
                    <p className="mt-2 text-sm leading-6 text-default-500">完成基础配置后自动写入配置文件并创建管理员。</p>
                  </div>
                  <Progress aria-label="初始化进度" value={progress} radius="sm" className="mt-5" />
                  <div className="mt-5 flex flex-col gap-2">
                    {steps.map((item, index) => {
                      const Icon = item.icon
                      const active = index === step
                      const done = index < step
                      return (
                        <Button
                          key={item.title}
                          type="button"
                          variant={active ? 'flat' : 'light'}
                          color={active ? 'primary' : 'default'}
                          radius="sm"
                          className="h-auto justify-start px-3 py-3"
                          isDisabled={index > step || loading || testingDatabase || testingRedis}
                          onPress={() => {
                            if (index <= step) {
                              setError('')
                              setStep(index)
                            }
                          }}
                          startContent={
                            <Chip
                              size="sm"
                              radius="sm"
                              color={done ? 'success' : active ? 'primary' : 'default'}
                              variant="flat"
                              className="shrink-0"
                            >
                              {done ? <HiCheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                            </Chip>
                          }
                        >
                          <span className="flex min-w-0 flex-col items-start text-left">
                            <span className="text-sm font-semibold">{item.title}</span>
                            <span className="max-w-full truncate text-xs font-normal text-default-500">{item.desc}</span>
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                </aside>

                <section className="p-5 sm:p-7">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <Chip color="primary" variant="flat" radius="sm">
                          步骤 {step + 1} / {steps.length}
                        </Chip>
                        <h2 className="mt-3 text-2xl font-semibold">{steps[step].title}</h2>
                        <p className="mt-1 text-sm text-default-500">{steps[step].desc}</p>
                      </div>
                      {(() => {
                        const Icon = steps[step].icon
                        return (
                          <Chip color="default" variant="bordered" radius="sm" startContent={<Icon className="h-4 w-4" />}>
                            初始化配置
                          </Chip>
                        )
                      })()}
                    </div>

                    <Divider />

                {step === 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      label="数据库类型"
                      {...fieldProps}
                      selectedKeys={[form.database.type]}
                      onChange={(e) => {
                        const value = e.target.value as DBType
                        setDatabase({ type: value, port: value === 'postgres' ? '5432' : '3306' })
                      }}
                    >
                      <SelectItem key="mysql">MySQL</SelectItem>
                      <SelectItem key="mariadb">MariaDB</SelectItem>
                      <SelectItem key="postgres">PostgreSQL</SelectItem>
                    </Select>
                    <Input
                      label="数据库地址"
                      {...fieldProps}
                      value={form.database.host}
                      onChange={(e) => setDatabase({ host: e.target.value })}
                      isRequired
                    />
                    <Input
                      label="端口"
                      {...fieldProps}
                      type="number"
                      value={form.database.port}
                      onChange={(e) => setDatabase({ port: e.target.value })}
                      isRequired
                    />
                    <Input
                      label="数据库名"
                      {...fieldProps}
                      value={form.database.dbname}
                      onChange={(e) => setDatabase({ dbname: e.target.value })}
                      isRequired
                    />
                    <Input
                      label="账号"
                      {...fieldProps}
                      value={form.database.user}
                      onChange={(e) => setDatabase({ user: e.target.value })}
                      isRequired
                    />
                    <Input
                      label="密码"
                      {...fieldProps}
                      type="password"
                      value={form.database.password}
                      onChange={(e) => setDatabase({ password: e.target.value })}
                    />
                    {form.database.type === 'postgres' && (
                      <Input
                        label="SSL Mode"
                        {...fieldProps}
                        value={form.database.sslmode}
                        onChange={(e) => setDatabase({ sslmode: e.target.value })}
                      />
                    )}
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4 rounded-small border border-default-200 bg-default-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">启用 Redis</p>
                        <p className="mt-1 text-xs text-default-500">关闭后系统会使用内存缓存。</p>
                      </div>
                      <Switch isSelected={form.redis.enable} onValueChange={(enable) => setRedis({ enable })} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Redis 地址"
                        {...fieldProps}
                        value={form.redis.host}
                        onChange={(e) => setRedis({ host: e.target.value })}
                        isDisabled={!form.redis.enable}
                      />
                      <Input
                        label="端口"
                        {...fieldProps}
                        type="number"
                        value={form.redis.port}
                        onChange={(e) => setRedis({ port: e.target.value })}
                        isDisabled={!form.redis.enable}
                      />
                      <Input
                        label="密码"
                        {...fieldProps}
                        type="password"
                        value={form.redis.password}
                        onChange={(e) => setRedis({ password: e.target.value })}
                        isDisabled={!form.redis.enable}
                      />
                      <Input
                        label="DB"
                        {...fieldProps}
                        type="number"
                        value={form.redis.db}
                        onChange={(e) => setRedis({ db: e.target.value })}
                        isDisabled={!form.redis.enable}
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    {hasAdmin && (
                      <div className="rounded-small border border-success-200 bg-success-50 px-4 py-3 text-sm leading-6 text-success-700 dark:bg-success-50/10 dark:text-success-300">
                        当前数据库已存在管理员账户，安装向导将跳过管理员创建。你可以直接完成初始化。
                      </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="用户名"
                      {...fieldProps}
                      value={form.admin.username}
                      onChange={(e) => setAdmin({ username: e.target.value })}
                      startContent={<HiUser className="h-5 w-5 text-default-400" />}
                      isRequired={!hasAdmin}
                      isDisabled={hasAdmin}
                    />
                    <Input
                      label="昵称"
                      {...fieldProps}
                      value={form.admin.nickname}
                      onChange={(e) => setAdmin({ nickname: e.target.value })}
                      startContent={<HiUser className="h-5 w-5 text-default-400" />}
                      isDisabled={hasAdmin}
                    />
                    <Input
                      label="邮箱"
                      {...fieldProps}
                      type="email"
                      value={form.admin.email}
                      onChange={(e) => setAdmin({ email: e.target.value })}
                      startContent={<HiMail className="h-5 w-5 text-default-400" />}
                      isRequired={!hasAdmin}
                      isDisabled={hasAdmin}
                    />
                    <div />
                    <Input
                      label="密码"
                      {...fieldProps}
                      type="password"
                      value={form.admin.password}
                      onChange={(e) => setAdmin({ password: e.target.value })}
                      startContent={<HiLockClosed className="h-5 w-5 text-default-400" />}
                      isRequired={!hasAdmin}
                      isDisabled={hasAdmin}
                    />
                    <Input
                      label="确认密码"
                      {...fieldProps}
                      type="password"
                      value={form.admin.confirmPassword}
                      onChange={(e) => setAdmin({ confirmPassword: e.target.value })}
                      startContent={<HiLockClosed className="h-5 w-5 text-default-400" />}
                      isRequired={!hasAdmin}
                      isDisabled={hasAdmin}
                    />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-small border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger dark:bg-danger-50/10" role="alert">
                    {error}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-default-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="flat"
                    startContent={<HiChevronLeft className="h-4 w-4" />}
                    onPress={prevStep}
                    isDisabled={step === 0 || loading}
                  >
                    上一步
                  </Button>
                  {step < steps.length - 1 ? (
                    <Button
                      type="button"
                      color="primary"
                      endContent={<HiChevronRight className="h-4 w-4" />}
                      onPress={nextStep}
                      isLoading={testingDatabase || testingRedis}
                      isDisabled={testingDatabase || testingRedis}
                    >
                      {step === 0 || (step === 1 && form.redis.enable) ? '测试并下一步' : '下一步'}
                    </Button>
                  ) : (
                    <Button type="submit" color="primary" isLoading={loading} startContent={!loading && <HiCheckCircle className="h-4 w-4" />}>
                      开始初始化
                    </Button>
                  )}
                </div>
                  </form>
                </section>
              </div>
            </CardBody>
          </Card>
        </main>
      </div>
    </div>
  )
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0
}

function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) >= 0
}
