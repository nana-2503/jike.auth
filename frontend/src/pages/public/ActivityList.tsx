import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardBody, Button, Spinner, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input } from '@heroui/react'
import { HiGift, HiClock, HiUsers, HiLogout } from 'react-icons/hi'
import { publicActivityApi, configApi } from '../../api'
import { toast } from '../../components/Toast'

// 活动类型图标
import wheelIcon from '../../assets/activities/抽奖.png'
import timedIcon from '../../assets/activities/定时.png'
import giftIcon from '../../assets/activities/礼物.png'

interface Activity {
  id: number
  title: string
  type: number
  description: string
  cover: string
  start_at: string | null
  end_at: string | null
  draw_at: string | null
  max_join: number
  status: number
}

const typeMap: Record<number, { label: string; icon: string; color: 'primary' | 'secondary' | 'success' }> = {
  1: { label: '转盘抽奖', icon: wheelIcon, color: 'primary' },
  2: { label: '定时抽奖', icon: timedIcon, color: 'secondary' },
  3: { label: '发放卡号', icon: giftIcon, color: 'success' },
}

export default function ActivityList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ch = searchParams.get('ch') || ''
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [siteName, setSiteName] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    if (!ch.trim()) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchActivities()
    fetchSiteConfig()
    checkLogin()
  }, [ch])

  const checkLogin = () => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('activity_uid_')) {
        const uid = parseInt(localStorage.getItem(key) || '0')
        if (uid > 0) { setIsLoggedIn(true); return }
      }
    }
  }

  const handleLogout = () => {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('activity_uid_') || key?.startsWith('activity_uname_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
    setIsLoggedIn(false)
    toast.success('已退出登录')
  }

  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) { toast.error('请输入用户名和密码'); return }
    if (activities.length === 0) { toast.error('暂无活动'); return }
    const activityId = activities[0].id
    setLoginLoading(true)
    try {
      let res: any
      if (isRegister) {
        res = await publicActivityApi.register(activityId, loginUsername, loginPassword)
        toast.success('注册成功')
      } else {
        res = await publicActivityApi.login(activityId, loginUsername, loginPassword)
        toast.success('登录成功')
      }
      const uid = res.data.user_id
      localStorage.setItem(`activity_uid_${activityId}`, String(uid))
      localStorage.setItem(`activity_uname_${activityId}`, res.data.username)
      setIsLoggedIn(true)
      setShowLogin(false)
      setLoginUsername('')
      setLoginPassword('')
    } catch (e: any) { toast.error(e.message || (isRegister ? '注册失败' : '登录失败')) }
    finally { setLoginLoading(false) }
  }

  const fetchSiteConfig = async () => {
    try {
      const res: any = await configApi.getSite()
      setSiteName(res.data?.site_name || '活动中心')
    } catch {}
  }

  const fetchActivities = async () => {
    try {
      const res: any = await publicActivityApi.listActivities(ch)
      setActivities(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '获取活动列表失败')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const getActivityStatus = (activity: Activity) => {
    // 定时抽奖 status=2 表示已开奖
    if (activity.type === 2 && activity.status === 2) {
      return { label: '已开奖', color: 'default' as const }
    }
    const now = new Date()
    if (activity.start_at && new Date(activity.start_at) > now) {
      return { label: '即将开始', color: 'warning' as const }
    }
    // 定时抽奖用 draw_at 作为结束时间
    if (activity.type === 2) {
      if (activity.draw_at && new Date(activity.draw_at) < now) {
        return { label: '已截止', color: 'default' as const }
      }
    } else {
      if (activity.end_at && new Date(activity.end_at) < now) {
        return { label: '已结束', color: 'default' as const }
      }
    }
    return { label: '进行中', color: 'success' as const }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!ch.trim()) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center px-4">
        <p className="text-6xl font-bold text-gray-300 mb-4">404</p>
        <p className="text-gray-500 mb-6 text-center">请通过作者提供的活动链接访问（需带频道参数）</p>
        <Button color="primary" variant="flat" onPress={() => navigate(-1)}>返回</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* 头部 */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-bold leading-none flex items-center gap-2">
            <HiGift className="text-primary" />
            {siteName} - 活动中心
          </h1>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => navigate(`/activity/user${ch ? `?ch=${ch}` : ''}`)}
                >
                  <HiUsers className="mr-1" /> 我的记录
                </Button>
                <Button size="sm" variant="flat" color="danger" onPress={handleLogout}>
                  <HiLogout className="mr-1" /> 退出
                </Button>
              </>
            ) : (
              <Button size="sm" color="primary" onPress={() => setShowLogin(true)}>
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 活动列表 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {activities.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <HiGift className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">暂无进行中的活动</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activities.map(activity => {
              const status = getActivityStatus(activity)
              const typeInfo = typeMap[activity.type]
              return (
                <Card
                  key={activity.id}
                  isPressable
                  onPress={() => navigate(`/activity/${activity.id}${ch ? `?ch=${ch}` : ''}`)}
                  className="overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {activity.cover && (
                    <Image
                      src={activity.cover}
                      alt={activity.title}
                      className="w-full h-40 object-cover"
                      removeWrapper
                    />
                  )}
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <img src={typeInfo?.icon} alt={typeInfo?.label} className="w-8 h-8" />
                        <Chip size="sm" color={typeInfo?.color} variant="flat">
                          {typeInfo?.label}
                        </Chip>
                      </div>
                      <Chip size="sm" color={status.color} variant="flat">
                        {status.label}
                      </Chip>
                    </div>
                    <h3 className="font-bold text-lg mb-2 line-clamp-2">{activity.title}</h3>
                    {activity.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {activity.description.replace(/[#*`]/g, '').substring(0, 100)}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {activity.end_at && (
                        <span className="flex items-center gap-1">
                          <HiClock />
                          截止: {formatDate(activity.end_at)}
                        </span>
                      )}
                      {activity.type === 2 && activity.draw_at && (
                        <span className="flex items-center gap-1">
                          <HiClock />
                          开奖: {formatDate(activity.draw_at)}
                        </span>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      <Modal isOpen={showLogin} onClose={() => setShowLogin(false)} placement="center">
        <ModalContent>
          <ModalHeader>{isRegister ? '注册账号' : '登录'}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input label="用户名" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} />
              <Input label="密码" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            </div>
            <p className="text-sm text-center mt-2">
              {isRegister ? (
                <>已有账号？<Button variant="light" size="sm" onPress={() => setIsRegister(false)}>去登录</Button></>
              ) : (
                <>没有账号？<Button variant="light" size="sm" onPress={() => setIsRegister(true)}>去注册</Button></>
              )}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowLogin(false)}>取消</Button>
            <Button color="primary" onPress={handleLogin} isLoading={loginLoading}>{isRegister ? '注册' : '登录'}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
