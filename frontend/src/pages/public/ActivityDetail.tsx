import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardBody, Button, Spinner, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Pagination } from '@heroui/react'
import { HiArrowLeft, HiGift, HiTicket, HiLogin, HiClipboardCopy } from 'react-icons/hi'
import { publicActivityApi } from '../../api'
import { toast } from '../../components/Toast'
import ReactMarkdown from 'react-markdown'

// 活动类型图标
import wheelIcon from '../../assets/activities/抽奖.png'
import timedIcon from '../../assets/activities/定时.png'
import giftIcon from '../../assets/activities/礼物.png'

interface Activity {
  id: number
  user_id: number
  title: string
  type: number
  description: string
  cover: string
  start_at: string | null
  end_at: string | null
  draw_at: string | null
  max_join: number
  status: number
  app?: { app_name: string }
}

interface Prize {
  id: number
  name: string
  type: number
  value: number
  stock: number
  sort: number
}

const typeMap: Record<number, { label: string; icon: string }> = {
  1: { label: '转盘抽奖', icon: wheelIcon },
  2: { label: '定时抽奖', icon: timedIcon },
  3: { label: '发放卡号', icon: giftIcon },
}

export default function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ch = searchParams.get('ch') || ''
  
  const [activity, setActivity] = useState<Activity | null>(null)
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  
  // 登录/注册
  const [showLogin, setShowLogin] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [userId, setUserId] = useState(0)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loggedUsername, setLoggedUsername] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  
  // 转盘
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const wheelRef = useRef<HTMLDivElement>(null)
  
  // 结果
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<{ prize_name?: string; prize_content?: string } | null>(null)
  
  // 参与状态
  const [joined, setJoined] = useState(false)
  const [joinCount, setJoinCount] = useState(0)
  
  // 我的抽奖记录
  const [myRecords, setMyRecords] = useState<{ prize_name: string; prize_content: string; status: number; created_at: string }[]>([])
  const [recordPage, setRecordPage] = useState(1)
  const recordPageSize = 6

  // 中奖名单
  const [winners, setWinners] = useState<{ username: string; prize_name: string; prize_type: number }[]>([])
  const [drawn, setDrawn] = useState(false)
  
  // 已领取的卡号
  const [claimedCards, setClaimedCards] = useState<{ card_no: string; prize_name: string; created_at: string }[]>([])

  useEffect(() => {
    fetchActivity()
  }, [id])

  // 登录态按作者维度共享，保证同作者下多个活动复用登录状态
  useEffect(() => {
    if (!activity) return
    const authorUidKey = `activity_uid_author_${activity.user_id}`
    const authorUnameKey = `activity_uname_author_${activity.user_id}`
    const legacyUidKey = `activity_uid_${id}`
    const legacyUnameKey = `activity_uname_${id}`

    const uid = parseInt(localStorage.getItem(authorUidKey) || localStorage.getItem(legacyUidKey) || '0')
    const uname = localStorage.getItem(authorUnameKey) || localStorage.getItem(legacyUnameKey) || ''

    setUserId(uid > 0 ? uid : 0)
    setLoggedUsername(uname)
  }, [activity?.id, activity?.user_id, id])

  useEffect(() => {
    if (userId && id && activity?.id) {
      checkJoinedStatus()
    }
  }, [userId, id, activity?.id])

  useEffect(() => {
    if (activity && activity.type === 2) {
      fetchWinners()
    }
    if (activity && activity.type === 3 && userId) {
      fetchMyCards()
    }
    if (activity && activity.type === 1 && userId) {
      fetchMyRecords()
    }
  }, [activity?.id, activity?.type, userId])

  const fetchActivity = async () => {
    try {
      const res: any = await publicActivityApi.getActivity(parseInt(id!), ch || undefined)
      setActivity(res.data.activity)
      setPrizes(res.data.prizes || [])
    } catch {
      // 活动不存在，不弹提示，直接显示404
    } finally {
      setLoading(false)
    }
  }

  const checkJoinedStatus = async () => {
    if (!activity || !userId) return
    try {
      const res: any = await publicActivityApi.checkJoined(parseInt(id!), userId)
      const count = res.data.count || 0
      setJoinCount(count)
      if (activity.type === 2) {
        setJoined(activity.max_join > 0 && count >= activity.max_join)
      } else {
        setJoined(res.data.joined)
      }
    } catch {}
  }

  const fetchWinners = async () => {
    try {
      const res: any = await publicActivityApi.getWinners(parseInt(id!))
      setWinners(res.data.list || [])
      setDrawn(res.data.drawn || false)
    } catch {
      // ignore
    }
  }

  const fetchMyCards = async () => {
    if (!userId) return
    try {
      const res: any = await publicActivityApi.getMyCards(parseInt(id!), userId)
      setClaimedCards(res.data || [])
    } catch {}
  }

  const fetchMyRecords = async () => {
    if (!userId) return
    try {
      const res: any = await publicActivityApi.getMyRecords(userId, 1, 100)
      const list = (res.data?.list || []).filter((r: any) => r.activity_id === parseInt(id!))
      setMyRecords(list)
    } catch {}
  }

  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) { toast.error('请输入用户名和密码'); return }
    setLoginLoading(true)
    try {
      let res: any
      if (isRegister) {
        res = await publicActivityApi.register(parseInt(id!), loginUsername, loginPassword)
        toast.success('注册成功')
      } else {
        res = await publicActivityApi.login(parseInt(id!), loginUsername, loginPassword)
      }
      const uid = res.data.user_id
      setUserId(uid)
      setLoggedUsername(res.data.username)
      if (activity?.user_id) {
        localStorage.setItem(`activity_uid_author_${activity.user_id}`, String(uid))
        localStorage.setItem(`activity_uname_author_${activity.user_id}`, res.data.username)
      }
      // 兼容旧存储键，避免历史页面读不到
      localStorage.setItem(`activity_uid_${id}`, String(uid))
      localStorage.setItem(`activity_uname_${id}`, res.data.username)
      setShowLogin(false)
      setLoginUsername('')
      setLoginPassword('')
      if (!isRegister) toast.success('登录成功')
      setTimeout(() => checkJoinedStatus(), 100)
    } catch (e: any) { toast.error(e.message || (isRegister ? '注册失败' : '登录失败')) }
    finally { setLoginLoading(false) }
  }

  const handleLogout = () => {
    setUserId(0)
    setLoggedUsername('')
    setJoined(false)
    setJoinCount(0)
    if (activity?.user_id) {
      localStorage.removeItem(`activity_uid_author_${activity.user_id}`)
      localStorage.removeItem(`activity_uname_author_${activity.user_id}`)
    }
    localStorage.removeItem(`activity_uid_${id}`)
    localStorage.removeItem(`activity_uname_${id}`)
    toast.success('已退出')
  }

  const checkLogin = () => {
    if (!userId) { setShowLogin(true); return false }
    return true
  }

  const handleSpin = async () => {
    if (!checkLogin()) return
    if (spinning) return
    
    setSpinning(true)
    setActing(true)
    
    try {
      const res: any = await publicActivityApi.spinWheel(parseInt(id!), userId)
      const prizeIndex = res.data.prize_index || 0
      const prizeName = res.data.prize_name
      const prizeContent = res.data.prize_content
      
      const segmentAngle = 360 / prizes.length
      const targetAngle = 360 - (prizeIndex * segmentAngle) - segmentAngle / 2
      const spins = 5
      const finalRotation = rotation + spins * 360 + targetAngle - (rotation % 360)
      
      setRotation(finalRotation)
      
      setTimeout(() => {
        setSpinning(false)
        setResult({ prize_name: prizeName, prize_content: prizeContent })
        setShowResult(true)
        checkJoinedStatus()
        fetchMyRecords()
      }, 4000)
    } catch (e: any) {
      setSpinning(false)
      if (e.message?.includes('登录')) {
        handleLogout()
        setShowLogin(true)
      } else {
        toast.error(e.message || '抽奖失败')
      }
    } finally {
      setActing(false)
    }
  }

  const handleJoin = async () => {
    if (!checkLogin()) return
    setActing(true)
    try {
      const res: any = await publicActivityApi.joinTimedDraw(parseInt(id!), userId)
      setJoinCount(res.data?.join_count || joinCount + 1)
      // 检查是否还能继续参与
      if (activity && activity.max_join > 0 && (res.data?.join_count || joinCount + 1) >= activity.max_join) {
        setJoined(true)
      }
      toast.success('参与成功，请等待开奖')
    } catch (e: any) {
      if (e.message?.includes('登录')) {
        handleLogout()
        setShowLogin(true)
      } else {
        toast.error(e.message || '参与失败')
      }
    } finally {
      setActing(false)
    }
  }

  const handleClaim = async () => {
    if (!checkLogin()) return
    setActing(true)
    try {
      const res: any = await publicActivityApi.claimCard(parseInt(id!), userId)
      setResult({ prize_name: res.data.prize_name, prize_content: res.data.prize_content })
      setShowResult(true)
      // 刷新已领取列表和参与状态
      fetchMyCards()
      checkJoinedStatus()
    } catch (e: any) {
      if (e.message?.includes('登录')) {
        handleLogout()
        setShowLogin(true)
      } else {
        toast.error(e.message || '领取失败')
      }
    } finally {
      setActing(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const status = useMemo(() => {
    if (!activity) return null
    // 定时抽奖已开奖（通过 drawn 状态或 activity.status=2 判断）
    if (activity.type === 2 && (activity.status === 2 || drawn)) {
      return { label: '已开奖', color: 'secondary' as const, canJoin: false }
    }
    // 活动已禁用 (status === 0)
    if (activity.status === 0) {
      return { label: '已关闭', color: 'default' as const, canJoin: false }
    }
    // 非定时抽奖的 status=2 也当作已关闭
    if (activity.status !== 1) {
      return { label: '已关闭', color: 'default' as const, canJoin: false }
    }
    const now = new Date()
    if (activity.start_at && new Date(activity.start_at) > now) {
      return { label: '即将开始', color: 'warning' as const, canJoin: false }
    }
    if (activity.end_at && new Date(activity.end_at) < now) {
      return { label: '已结束', color: 'default' as const, canJoin: false }
    }
    return { label: '进行中', color: 'success' as const, canJoin: true }
  }, [activity, drawn])

  const getWheelColors = () => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
    return prizes.map((_, i) => colors[i % colors.length])
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center">
        <p className="text-6xl font-bold text-gray-300 mb-4">404</p>
        <p className="text-gray-500 mb-6">不存在该页面</p>
        <Button color="primary" variant="flat" onPress={() => navigate(-1)}>返回</Button>
      </div>
    )
  }

  const typeInfo = typeMap[activity.type]
  const wheelColors = getWheelColors()

  const goBackToActivityList = () => {
    const code = ch.trim()
    if (code) navigate(`/activity?ch=${encodeURIComponent(code)}`)
    else navigate(-1)
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Button size="sm" variant="light" startContent={<HiArrowLeft />} onPress={goBackToActivityList}>
            返回
          </Button>
          <div className="flex items-center gap-2">
            {userId ? (
              <>
                <span className="text-sm text-gray-500">{loggedUsername}</span>
                <Button size="sm" variant="flat" color="danger" onPress={handleLogout}>退出</Button>
              </>
            ) : (
              <Button size="sm" color="primary" startContent={<HiLogin />} onPress={() => setShowLogin(true)}>登录</Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardBody className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <img src={typeInfo?.icon} alt={typeInfo?.label} className="w-12 h-12" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Chip size="sm" color={status?.color} variant="flat">{status?.label}</Chip>
                  <Chip size="sm" variant="flat">{typeInfo?.label}</Chip>
                </div>
                <h1 className="text-2xl font-bold">{activity.title}</h1>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <span className="text-gray-500">开始时间</span>
                <p className="font-medium">{formatDate(activity.start_at)}</p>
              </div>
              {activity.type === 2 ? (
                <div>
                  <span className="text-gray-500">开奖时间</span>
                  <p className="font-medium">{formatDate(activity.draw_at)}</p>
                </div>
              ) : (
                <div>
                  <span className="text-gray-500">结束时间</span>
                  <p className="font-medium">{formatDate(activity.end_at)}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">参与限制</span>
                <p className="font-medium">{activity.max_join === -1 ? '无限制' : `${activity.max_join}次`}</p>
              </div>
            </div>

            {activity.description && (
              <div className="prose prose-sm dark:prose-invert max-w-none border-t border-gray-200 dark:border-gray-700 pt-4">
                <ReactMarkdown>{activity.description}</ReactMarkdown>
              </div>
            )}
          </CardBody>
        </Card>

        {activity.type === 1 && prizes.length > 0 && (
          <Card>
            <CardBody className="p-6 flex flex-col items-center">
              <h3 className="text-lg font-bold mb-6">🎡 幸运转盘</h3>
              <div className="relative w-72 h-72 md:w-80 md:h-80 mb-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
                  <div className="w-0 h-0 border-l-[15px] border-r-[15px] border-t-[30px] border-l-transparent border-r-transparent border-t-red-500" />
                </div>
                <div
                  ref={wheelRef}
                  className="w-full h-full rounded-full border-8 border-yellow-400 shadow-xl overflow-hidden"
                  style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none' }}
                >
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    {prizes.map((prize, i) => {
                      const angle = 360 / prizes.length
                      const startAngle = i * angle - 90
                      const endAngle = startAngle + angle
                      const startRad = (startAngle * Math.PI) / 180
                      const endRad = (endAngle * Math.PI) / 180
                      const x1 = 50 + 50 * Math.cos(startRad)
                      const y1 = 50 + 50 * Math.sin(startRad)
                      const x2 = 50 + 50 * Math.cos(endRad)
                      const y2 = 50 + 50 * Math.sin(endRad)
                      const largeArc = angle > 180 ? 1 : 0
                      const textAngle = startAngle + angle / 2
                      const textRad = (textAngle * Math.PI) / 180
                      const textX = 50 + 32 * Math.cos(textRad)
                      const textY = 50 + 32 * Math.sin(textRad)
                      return (
                        <g key={prize.id}>
                          <path d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={wheelColors[i]} />
                          <text x={textX} y={textY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold" transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}>
                            {prize.name.length > 6 ? prize.name.substring(0, 6) + '..' : prize.name}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              </div>
              <Button size="lg" color="primary" className="px-12" isLoading={spinning || acting} isDisabled={!status?.canJoin} onPress={handleSpin}>
                {spinning ? '抽奖中...' : '开始抽奖'}
              </Button>
              {userId > 0 && joinCount > 0 && (
                <p className="text-sm text-gray-500 mt-3">
                  已抽奖 {joinCount} 次
                  {activity.max_join > 0 && ` / 最多 ${activity.max_join} 次`}
                </p>
              )}
            </CardBody>
          </Card>
        )}

        {activity.type === 1 && myRecords.length > 0 && (
          <Card>
            <CardBody className="p-6">
              <h3 className="text-lg font-bold mb-4">中奖记录</h3>
              <div className="space-y-3">
                {myRecords.slice((recordPage - 1) * recordPageSize, recordPage * recordPageSize).map((r, i) => (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${r.status === 2 ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {r.prize_name}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    {r.status === 2 && r.prize_content && (
                      <div className="flex items-center gap-1">
                        <code className="text-sm font-mono text-primary select-all">{r.prize_content}</code>
                        <Button isIconOnly size="sm" variant="light" className="min-w-6 w-6 h-6"
                          onPress={() => { navigator.clipboard.writeText(r.prize_content); toast.success('已复制') }}>
                          <HiClipboardCopy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {myRecords.length > recordPageSize && (
                <div className="flex justify-center mt-4">
                  <Pagination total={Math.ceil(myRecords.length / recordPageSize)} page={recordPage} onChange={setRecordPage} />
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {activity.type === 2 && (
          <Card>
            <CardBody className="p-6 text-center">
              <h3 className="text-lg font-bold mb-4">⏰ 定时抽奖</h3>
              {drawn ? (
                <>
                  <Chip color="secondary" variant="flat" className="mb-4">🎉 已开奖</Chip>
                  {winners.length > 0 ? (
                    <div className="mb-6">
                      <p className="text-gray-500 mb-4">中奖名单</p>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-4 py-2 text-center">用户</th>
                              <th className="px-4 py-2 text-center">奖品</th>
                            </tr>
                          </thead>
                          <tbody>
                            {winners.map((w, i) => (
                              <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                                <td className="px-4 py-2 text-center">{w.username}</td>
                                <td className="px-4 py-2 text-center">
                                  <span className="text-yellow-600">{w.prize_name}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 mb-6">暂无中奖记录</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-gray-500 mb-6">点击参与后，等待开奖时间自动开奖，中奖结果将发放到您的账户</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {prizes.map(prize => (
                      <div key={prize.id} className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-3">
                        <HiGift className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                        <p className="font-medium text-sm">{prize.name}</p>
                        {prize.stock > 0 && <p className="text-xs text-gray-400">剩余 {prize.stock}</p>}
                      </div>
                    ))}
                  </div>
                  {joinCount > 0 && (
                    <p className="text-sm text-gray-500 mb-3">
                      已参与 {joinCount} 次
                      {activity.max_join > 0 && ` / 最多 ${activity.max_join} 次`}
                    </p>
                  )}
                  {joined ? (
                    <Button size="lg" color="default" className="px-12" isDisabled>
                      已达上限
                    </Button>
                  ) : (
                    <Button size="lg" color="secondary" className="px-12" isLoading={acting} isDisabled={!status?.canJoin} onPress={handleJoin}>
                      {joinCount > 0 ? '再次参与' : '立即参与'}
                    </Button>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        )}

        {activity.type === 3 && (
          <>
            <Card>
              <CardBody className="p-6 text-center">
                <h3 className="text-lg font-bold mb-4">🎁 领取卡号</h3>
                <p className="text-gray-500 mb-6">点击领取即可获得充值卡号，请妥善保管</p>
                {prizes.length > 0 && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 mb-6 inline-block">
                    <HiTicket className="w-12 h-12 mx-auto mb-2 text-green-500" />
                    <p className="font-medium">{prizes[0].name}</p>
                    {prizes[0].stock > 0 && <p className="text-sm text-gray-400">剩余 {prizes[0].stock} 张</p>}
                    {prizes[0].stock === 0 && <p className="text-sm text-red-500">已领完</p>}
                  </div>
                )}
                {joinCount > 0 && (
                  <p className="text-sm text-gray-500 mb-3">
                    已领取 {joinCount} 次
                    {activity.max_join > 0 && ` / 最多 ${activity.max_join} 次`}
                  </p>
                )}
                <div>
                  {activity.max_join > 0 && joinCount >= activity.max_join ? (
                    <Button size="lg" color="default" className="px-12" isDisabled>
                      已达上限
                    </Button>
                  ) : (
                    <Button size="lg" color="success" className="px-12 text-white" isLoading={acting} isDisabled={!status?.canJoin || (prizes[0]?.stock === 0)} onPress={handleClaim}>
                      {joinCount > 0 ? '再次领取' : '立即领取'}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>

            {claimedCards.length > 0 && (
              <Card>
                <CardBody className="p-6">
                  <h3 className="text-lg font-bold mb-4">📋 我的卡号</h3>
                  <div className="space-y-3">
                    {claimedCards.map((card, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div>
                          <code className="text-primary font-mono font-bold select-all">{card.card_no}</code>
                          <p className="text-xs text-gray-400 mt-1">{card.prize_name} · {new Date(card.created_at).toLocaleString('zh-CN')}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => {
                            navigator.clipboard.writeText(card.card_no)
                            toast.success('已复制')
                          }}
                        >
                          复制
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </main>

      <Modal isOpen={showLogin} onClose={() => setShowLogin(false)} placement="center">
        <ModalContent>
          <ModalHeader>{isRegister ? '注册账号' : '登录参与活动'}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-500 mb-4">{isRegister ? '注册一个新账号参与活动' : '请输入您的账号密码'}</p>
            <div className="space-y-4">
              <Input label="用户名" placeholder="请输入用户名" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} />
              <Input label="密码" type="password" placeholder="请输入密码" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
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

      <Modal isOpen={showResult} onClose={() => setShowResult(false)} placement="center">
        <ModalContent>
          <ModalHeader className="text-center">🎉 结果</ModalHeader>
          <ModalBody className="text-center py-6">
            {result?.prize_name && (
              <>
                <div className="text-6xl mb-4">🎁</div>
                <p className="text-xl font-bold mb-2">{result.prize_name}</p>
              </>
            )}
            {result?.prize_content && (
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-500 mb-2">奖品内容:</p>
                <code className="text-lg font-mono font-bold text-primary select-all">{result.prize_content}</code>
                <p className="text-xs text-gray-400 mt-2">请复制保存</p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={() => setShowResult(false)} className="w-full">知道了</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
