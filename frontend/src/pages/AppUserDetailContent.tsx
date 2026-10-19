import { Avatar, Chip, Progress } from '@heroui/react'
import { HiAdjustments, HiCash, HiClock, HiMail, HiPhone, HiSparkles, HiStatusOnline, HiTicket, HiUser, HiUserGroup } from 'react-icons/hi'
import { avatarOrDefault } from '../utils/avatar'

interface AppUserDetailContentProps {
  user: any
  statusMap: Record<number, { label: string; color: 'success' | 'danger' | 'warning' }>
  formatExpireAt: (expireAt: string | null) => React.ReactNode
  getExpireProgress: (createdAt: string, expireAt: string | null, lastRechargeAt?: string | null) => { pct: number; color: 'success' | 'primary' | 'warning' | 'danger' | 'secondary' }
  ownerName?: string
}

export default function AppUserDetailContent({ user, statusMap, formatExpireAt, getExpireProgress, ownerName }: AppUserDetailContentProps) {
  const expireProgress = getExpireProgress(user.created_at, user.expire_at, user.last_recharge_at)
  const status = statusMap[user.status]
  const badges = [
    user.is_paid === 1 ? { label: '付费', color: 'warning' as const } : null,
    user.is_tester === 1 ? { label: '内测', color: 'secondary' as const } : null,
    user.is_card_user === 1 ? { label: '卡号', color: 'primary' as const } : null,
    user.is_trial === 1 ? { label: '试用', color: 'default' as const } : null,
  ].filter(Boolean) as { label: string; color: 'warning' | 'secondary' | 'primary' | 'default' }[]

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-secondary/10 bg-gradient-to-br from-secondary/12 via-primary/8 to-transparent p-4 dark:border-secondary/20">
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            <Avatar src={avatarOrDefault(user.avatar)} name={user.username} className="h-16 w-16 text-xl ring-2 ring-white/80 dark:ring-content1" />
            {(user.online_count || 0) > 0 && <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white bg-success dark:border-content1" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-semibold leading-6">{user.username}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{user.app?.app_name || '未知应用'}</p>
                {ownerName && <p className="mt-0.5 text-xs text-gray-400">所属作者：{ownerName}</p>}
              </div>
              <Chip color={status?.color || 'default'} size="sm" variant="flat" className="flex-shrink-0">{status?.label || '未知'}</Chip>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {badges.map((badge) => <Chip key={badge.label} size="sm" variant="flat" color={badge.color}>{badge.label}</Chip>)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-50/80 p-3 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium"><HiClock className="w-4 h-4 text-gray-400" />到期时间</span>
          <span className="text-right font-medium">{formatExpireAt(user.expire_at)}</span>
        </div>
        <Progress value={expireProgress.pct} color={expireProgress.color} size="sm" aria-label={`${user.username} 到期进度`} classNames={expireProgress.color === 'secondary' ? { indicator: '!bg-purple-300' } : expireProgress.color === 'primary' ? { indicator: '!bg-blue-300' } : undefined} />
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-2xl bg-gray-50/80 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
        <Metric icon={<HiCash className="w-4 h-4" />} label="点数" value={user.points} tone="text-warning bg-warning/10" />
        <Metric icon={<HiTicket className="w-4 h-4" />} label="返利积分" value={user.rebate_points || 0} tone="text-primary bg-primary/10" border />
        <Metric icon={<HiStatusOnline className="w-4 h-4" />} label="在线" value={user.online_count || 0} tone="text-success bg-success/10" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoCard icon={<HiAdjustments className="w-4 h-4" />} label="通道数量" value={`${user.channels}`} />
        <InfoCard icon={<HiSparkles className="w-4 h-4" />} label="特征数量" value={`${user.features}`} />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><HiUser className="w-4 h-4 text-gray-400" />联系方式</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoCard icon={<HiUserGroup className="w-4 h-4" />} label="QQ" value={user.qq || '-'} />
          <InfoCard icon={<HiUserGroup className="w-4 h-4" />} label="微信" value={user.wechat || '-'} />
          <InfoCard icon={<HiPhone className="w-4 h-4" />} label="手机" value={user.phone || '-'} />
          <InfoCard icon={<HiMail className="w-4 h-4" />} label="邮箱" value={user.email || '-'} />
        </div>
      </div>

      <div className="text-right text-xs text-gray-400">注册于 {new Date(user.created_at).toLocaleString()}</div>
    </div>
  )
}

function Metric({ icon, label, value, tone, border }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string; border?: boolean }) {
  return (
    <div className={`p-3 text-center ${border ? 'border-x border-gray-100 dark:border-gray-800' : ''}`}>
      <div className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50/80 p-3 ring-1 ring-gray-100 dark:bg-content2 dark:ring-gray-800">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">{icon}{label}</div>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
