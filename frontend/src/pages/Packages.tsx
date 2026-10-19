import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip } from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiBadgeCheck, HiCreditCard, HiCube, HiSparkles, HiShoppingCart, HiTicket, HiUsers } from 'react-icons/hi'

interface Package {
  id: number
  name: string
  icon: string
  description: string
  price: number
  duration: number
  extra_apps: number
  extra_users: number
  extra_card_types: number
  extra_cards: number
}

interface UserPackage {
  id: number
  package_id: number
}

export default function Packages() {
  const [packages, setPackages] = useState<Package[]>([])
  const [userPackages, setUserPackages] = useState<UserPackage[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [buyConfirm, setBuyConfirm] = useState<Package | null>(null)
  const [buying, setBuying] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [pkgRes, userPkgRes, profileRes]: any = await Promise.all([
        userApi.listPackages(),
        userApi.getUserPackage(),
        userApi.getProfile()
      ])
      setPackages(pkgRes.data || [])
      setUserPackages(userPkgRes.data || [])
      setBalance(profileRes.data?.balance || 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleBuy = async () => {
    if (!buyConfirm) return
    setBuying(true)
    try {
      const res: any = await userApi.buyPackage(buyConfirm.id)
      toast.success(res.message || '购买成功')
      setBuyConfirm(null)
      loadData()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBuying(false)
    }
  }

  const getUserPackage = (pkgId: number) => userPackages.find(up => up.package_id === pkgId)

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-6">
      {packages.length === 0 ? (
        <Card><CardBody className="text-center text-gray-500 py-12">暂无可购买套餐</CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {packages.map(pkg => {
            const owned = getUserPackage(pkg.id)
            const benefits = [
              { label: '应用额度', value: pkg.extra_apps, unit: '个', icon: HiCube, className: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
              { label: '用户额度', value: pkg.extra_users, unit: '个', icon: HiUsers, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
              { label: '卡种额度', value: pkg.extra_card_types, unit: '个', icon: HiTicket, className: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300' },
              { label: '卡号额度', value: pkg.extra_cards, unit: '个', icon: HiCreditCard, className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
            ]
            return (
              <Card key={pkg.id} className="group overflow-hidden border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-[0_22px_55px_-32px_rgba(15,23,42,0.45)] dark:border-gray-800 dark:bg-content1">
                <CardBody className="p-0">
                  <div className="relative overflow-hidden p-5">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-secondary/8 to-transparent opacity-90" />
                    <div className="absolute -right-12 -top-14 h-32 w-32 rounded-full bg-primary/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/10">
                          {pkg.icon ? <img src={pkg.icon} alt="" className="h-10 w-10 object-contain" /> : <HiSparkles className="h-7 w-7 text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate text-xl font-bold tracking-tight text-gray-900 dark:text-white">{pkg.name}</h4>
                            {owned && <HiBadgeCheck className="h-5 w-5 shrink-0 text-success" />}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-500 dark:text-gray-400">{pkg.description || '暂无描述'}</p>
                        </div>
                      </div>
                      <Chip size="sm" color={owned ? 'success' : 'primary'} variant="flat" className="shrink-0">
                        {owned ? '可续费' : '可购买'}
                      </Chip>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-4">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Price</p>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-4xl font-black tracking-tight text-primary">¥{pkg.price}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">/ {pkg.duration} 天</span>
                          </div>
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-gray-100 dark:bg-content1 dark:ring-white/10">
                          有效期 {pkg.duration} 天
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                      {benefits.map(item => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-white/5">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.className}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs text-gray-400">{item.label}</p>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">+{item.value} {item.unit}</p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <Button color="primary" className="mt-5 w-full font-semibold" startContent={<HiShoppingCart />} onPress={() => setBuyConfirm(pkg)}>
                      {owned ? '立即续费' : '立即购买'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!buyConfirm} onClose={() => setBuyConfirm(null)} placement="center">
        <ModalContent>
          <ModalHeader>确认{getUserPackage(buyConfirm?.id || 0) ? '续费' : '购买'}</ModalHeader>
          <ModalBody>
            <div className="flex items-center gap-3 mb-4">
              {buyConfirm?.icon && <img src={buyConfirm.icon} alt="" className="w-12 h-12 object-contain" />}
              <div>
                <p className="font-semibold text-lg">{buyConfirm?.name}</p>
                <p className="text-sm text-gray-500">有效期 {buyConfirm?.duration} 天</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">套餐价格</span>
                <span className="text-xl font-bold text-primary">¥{buyConfirm?.price}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">当前余额</span>
                <span className={balance < (buyConfirm?.price || 0) ? 'text-red-500' : ''}>¥{balance.toFixed(2)}</span>
              </div>
            </div>
            {balance < (buyConfirm?.price || 0) && (
              <p className="text-sm text-red-500 mt-2">余额不足，请先充值</p>
            )}
            {getUserPackage(buyConfirm?.id || 0) && (
              <p className="text-sm text-gray-500 mt-2">续费将在当前有效期基础上叠加 {buyConfirm?.duration} 天</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setBuyConfirm(null)}>取消</Button>
            <Button color="primary" onPress={handleBuy} isLoading={buying} isDisabled={balance < (buyConfirm?.price || 0)}>确认{getUserPackage(buyConfirm?.id || 0) ? '续费' : '购买'}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
