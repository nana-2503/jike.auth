import { useState, useEffect } from 'react'
import { Card, CardBody, Button, Spinner, Chip } from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'

interface StreakReward {
  id: number
  streak_days: number
  extra_reward: number
}

interface CheckinStatus {
  has_checked_in: boolean
  streak: number
  total_days: number
  total_reward: number
  checkin_days: number[]
  config: {
    min_reward: number
    max_reward: number
    enabled: number
  }
  streak_rewards: StreakReward[]
}

interface CheckinLog {
  id: number
  reward: number
  extra_reward: number
  streak: number
  checkin_at: string
}

export default function Checkin() {
  const [status, setStatus] = useState<CheckinStatus | null>(null)
  const [logs, setLogs] = useState<CheckinLog[]>([])
  const [monthLogs, setMonthLogs] = useState<CheckinLog[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    fetchStatus()
    fetchLogs()
  }, [])

  useEffect(() => {
    fetchMonthLogs()
  }, [currentDate])

  const fetchStatus = async () => {
    try {
      const res: any = await userApi.getCheckinStatus()
      setStatus(res.data)
    } catch (e: any) {
      toast.error(e.message || '获取签到状态失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    try {
      const res: any = await userApi.getCheckinLogs(1, 5)
      setLogs(res.data.list || [])
    } catch (e: any) {
      console.error(e)
    }
  }

  const fetchMonthLogs = async () => {
    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const res: any = await userApi.getMonthCheckinLogs(year, month)
      setMonthLogs(res.data || [])
    } catch (e: any) {
      console.error(e)
    }
  }

  const handleCheckin = async () => {
    setChecking(true)
    try {
      const res: any = await userApi.doCheckin()
      toast.success(`签到成功！获得 ${res.data.total_reward.toFixed(2)} 余额`)
      fetchStatus()
      fetchLogs()
      fetchMonthLogs()
    } catch (e: any) {
      toast.error(e.message || '签到失败')
    } finally {
      setChecking(false)
    }
  }

  // 日历相关
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startDay = firstDayOfMonth.getDay()

  // 上个月的天数
  const prevMonthLastDay = new Date(year, month, 0).getDate()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  // 获取某天的签到奖励
  const getDayReward = (day: number): number | null => {
    const log = monthLogs.find(l => {
      const logDate = new Date(l.checkin_at)
      return logDate.getDate() === day
    })
    return log ? log.reward + log.extra_reward : null
  }

  const isCheckedDay = (day: number) => {
    return getDayReward(day) !== null
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 左侧：统计、签到按钮、日历、规则 - 放在一个Card内 */}
      <Card>
        <CardBody className="p-4 space-y-4">
          {/* 统计卡片 - 横向排列 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-primary-50 rounded-lg text-center py-4">
              <p className="text-3xl font-bold text-primary">{status?.total_days || 0}</p>
              <p className="text-xs text-gray-500 mt-1">累计签到</p>
            </div>
            <div className="bg-success-50 rounded-lg text-center py-4">
              <p className="text-3xl font-bold text-success">{status?.streak || 0}</p>
              <p className="text-xs text-gray-500 mt-1">连续签到</p>
            </div>
            <div className="bg-warning-50 rounded-lg text-center py-4">
              <p className="text-3xl font-bold text-warning">{status?.total_reward?.toFixed(2) || '0.00'}</p>
              <p className="text-xs text-gray-500 mt-1">累计奖励</p>
            </div>
          </div>

          {/* 签到按钮 */}
          <Button
            color="primary"
            size="lg"
            className="w-full"
            onPress={handleCheckin}
            isLoading={checking}
            isDisabled={status?.has_checked_in}
          >
            {status?.has_checked_in ? '今日已签到' : '立即签到'}
          </Button>

          {/* 日历 */}
          <div>
            {/* 月份切换 */}
            <div className="flex items-center justify-between mb-4">
              <Button isIconOnly variant="light" size="sm" onPress={prevMonth}>
                <HiChevronLeft className="w-5 h-5" />
              </Button>
              <span className="font-medium">{year}年{month + 1}月</span>
              <Button isIconOnly variant="light" size="sm" onPress={nextMonth}>
                <HiChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* 星期标题 */}
            <div className="grid grid-cols-7 mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center text-sm text-gray-500 py-2">{day}</div>
              ))}
            </div>

            {/* 日期格子 */}
            <div className="grid grid-cols-7">
              {/* 上月日期（灰色） */}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`prev-${i}`} className="h-14 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
                  <span className="text-sm">{prevMonthLastDay - startDay + i + 1}</span>
                </div>
              ))}
              {/* 本月日期 */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const isToday = isCurrentMonth && day === today.getDate()
                const checked = isCheckedDay(day)
                const reward = getDayReward(day)
                const isPast = isCurrentMonth && day < today.getDate() && !checked

                return (
                  <div
                    key={day}
                    className={`h-14 flex flex-col items-center justify-center relative ${
                      isToday ? 'bg-primary text-white rounded-lg' : ''
                    }`}
                  >
                    <span className={`text-sm ${isToday ? 'font-bold' : ''}`}>{day}</span>
                    {checked && reward !== null && (
                      <span className={`text-xs ${isToday ? 'text-white/80' : 'text-success'}`}>
                        +{reward.toFixed(2)} 💰
                      </span>
                    )}
                    {isPast && (
                      <span className="text-xs text-danger">✗</span>
                    )}
                  </div>
                )
              })}
              {/* 下月日期（灰色） */}
              {Array.from({ length: (7 - (startDay + daysInMonth) % 7) % 7 }).map((_, i) => (
                <div key={`next-${i}`} className="h-14 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
                  <span className="text-sm">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 右侧：签到记录 */}
      <Card>
        <CardBody className="p-4">
          <h3 className="font-bold mb-4">签到记录</h3>
          {logs.length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无签到记录</p>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="bg-default-100 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm">
                        {new Date(log.checkin_at).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        }).replace(/\//g, '/')}
                      </p>
                      <p className="text-xs text-gray-500">连续{log.streak}天</p>
                    </div>
                    <div className="text-right">
                      <p className="text-primary font-medium text-sm">+{(log.reward + log.extra_reward).toFixed(2)} 💰</p>
                      {log.extra_reward > 0 && (
                        <p className="text-xs text-warning">含额外+{log.extra_reward.toFixed(2)} 💰</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 签到规则 - 单独一行 */}
      <Card className="lg:col-span-2">
        <CardBody className="p-4">
          <h3 className="font-bold mb-3">签到规则</h3>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>• 每日签到可获得 {status?.config.min_reward}~{status?.config.max_reward} 余额随机奖励</li>
            {status?.streak_rewards && status.streak_rewards.length > 0 && (
              <>
                <li>• 连续签到可获得每日额外奖励：</li>
                <li className="pl-2 flex gap-2 flex-wrap">
                  {status.streak_rewards.map((sr, index) => {
                    const colors = ['warning', 'success', 'primary', 'danger'] as const
                    return (
                      <Chip key={sr.id} size="sm" color={colors[index % colors.length]} variant="flat">
                        连续{sr.streak_days}天起每日+{sr.extra_reward}余额
                      </Chip>
                    )
                  })}
                </li>
              </>
            )}
            <li>• 连续天数越高，每日额外奖励越多</li>
            <li>• 中断签到后连续天数将重新计算</li>
            <li>• 每月1号连续签到天数自动重置</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}
