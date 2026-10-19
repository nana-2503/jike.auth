import { useEffect, useState } from 'react'
import { Card, CardBody, Spinner, Chip, Progress } from '@heroui/react'
import { userApi } from '../api'
import { HiClock, HiCube, HiUsers, HiTicket, HiCreditCard } from 'react-icons/hi'

interface Package {
  id: number
  name: string
  icon: string
  duration: number
}

interface UserPackage {
  id: number
  package_id: number
  package: Package
  extra_apps: number
  extra_users: number
  extra_card_types: number
  extra_cards: number
  expire_at: string
  created_at: string
}

export default function MyPackages() {
  const [userPackages, setUserPackages] = useState<UserPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    userApi.getUserPackage().then((res: any) => {
      setUserPackages(res.data || [])
    }).finally(() => setLoading(false))
  }, [])

  const isExpired = (expireAt: string) => new Date(expireAt) < new Date()
  
  const getRemainingDays = (expireAt: string) => {
    const diff = new Date(expireAt).getTime() - new Date().getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const getProgress = (createdAt: string, expireAt: string) => {
    const total = new Date(expireAt).getTime() - new Date(createdAt).getTime()
    const passed = new Date().getTime() - new Date(createdAt).getTime()
    return Math.min(100, Math.max(0, (passed / total) * 100))
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  if (userPackages.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-16">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-gray-500">暂无套餐</p>
          <p className="text-sm text-gray-400 mt-2">前往"开通套餐"页面购买</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userPackages.map(up => {
          const expired = isExpired(up.expire_at)
          const remainingDays = getRemainingDays(up.expire_at)
          const progress = getProgress(up.created_at, up.expire_at)
          
          return (
            <Card key={up.id} className={expired ? 'opacity-60' : ''}>
              <CardBody className="p-0">
                {/* 套餐头部 */}
                <div className={`p-4 ${expired ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600'}`}>
                  <div className="flex items-center gap-3">
                    {up.package?.icon ? (
                      <img src={up.package.icon} alt="" className="w-12 h-12 object-contain bg-white rounded-lg p-1" />
                    ) : (
                      <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                        <span className="text-2xl">📦</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className={`font-bold text-lg ${expired ? 'text-gray-600 dark:text-gray-300' : 'text-gray-800 dark:text-white'}`}>
                        {up.package?.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Chip 
                          size="sm" 
                          color={expired ? 'danger' : 'success'} 
                          variant="flat"
                          classNames={{ content: 'text-xs px-1' }}
                        >
                          {expired ? '已过期' : '生效中'}
                        </Chip>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 有效期进度 */}
                <div className="px-4 pt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-500 flex items-center gap-1">
                      <HiClock className="w-4 h-4" />
                      剩余时间
                    </span>
                    <span className={expired ? 'text-red-500' : 'text-primary font-medium'}>
                      {expired ? '已过期' : `${remainingDays} 天`}
                    </span>
                  </div>
                  <Progress 
                    value={expired ? 100 : progress} 
                    color={expired ? 'danger' : progress > 80 ? 'warning' : 'primary'}
                    size="sm"
                    className="mb-2"
                  />
                  <p className="text-xs text-gray-400 text-right">
                    到期: {new Date(up.expire_at).toLocaleString()}
                  </p>
                </div>

                {/* 套餐权益 */}
                <div className="p-4 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <HiCube className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="text-xs text-gray-500">应用</div>
                      <div className="font-bold text-blue-600">+{up.extra_apps}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <HiUsers className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="text-xs text-gray-500">用户</div>
                      <div className="font-bold text-green-600">+{up.extra_users}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <HiTicket className="w-5 h-5 text-purple-500" />
                    <div>
                      <div className="text-xs text-gray-500">卡种</div>
                      <div className="font-bold text-purple-600">+{up.extra_card_types}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <HiCreditCard className="w-5 h-5 text-orange-500" />
                    <div>
                      <div className="text-xs text-gray-500">卡号</div>
                      <div className="font-bold text-orange-600">+{up.extra_cards}</div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
