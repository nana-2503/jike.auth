import { useState, useEffect } from 'react'
import { Card, CardBody, Button, Chip, Spinner } from '@heroui/react'
import { userApi } from '../api'
import { useAuthStore } from '../store'
import { useNavigate } from 'react-router-dom'
import { toast } from '../components/Toast'

interface Pkg {
  id: number; name: string; amount: number; balance_amount: number; bonus: string
}

export default function Recharge() {
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [payType, setPayType] = useState<'alipay' | 'wxpay'>('alipay')
  const [paying, setPaying] = useState(false)
  const { user } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    userApi.getRechargePackages().then((res: any) => setPackages(res.data || []))
      .finally(() => setLoading(false))
  }, [])

  const handlePay = async () => {
    if (!selected) { toast.error('请选择充值套餐'); return }
    if (!user) { toast.error('请先登录'); return }
    setPaying(true)
    try {
      const res: any = await userApi.createRechargeOrder({ package_id: selected, pay_type: payType })
      if (res.code !== 0) { toast.error(res.message); return }
      window.open(res.data.pay_url, '_blank')
      navigate(`/recharge/result?order_no=${res.data.order_no}`)
    } catch (e: any) { toast.error(e.message || '创建订单失败') }
    finally { setPaying(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">账户充值</h2>
        <Chip variant="flat" color="primary">当前余额: ¥{user?.balance?.toFixed(2) || '0.00'}</Chip>
      </div>

      {packages.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无充值套餐</CardBody></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map(pkg => (
              <Card
                key={pkg.id}
                isPressable
                onPress={() => setSelected(pkg.id)}
                className={`transition-all ${selected === pkg.id ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`}
              >
                <CardBody className="p-5 text-center space-y-2">
                  <p className="font-semibold text-lg">{pkg.name}</p>
                  <p className="text-3xl font-bold text-primary">¥{pkg.amount}</p>
                  <p className="text-sm text-gray-500">到账余额: <span className="text-primary font-medium">{pkg.balance_amount}</span></p>
                  {pkg.bonus && <Chip size="sm" color="warning" variant="flat">{pkg.bonus}</Chip>}
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardBody className="p-5">
              <p className="text-sm font-medium mb-3">选择支付方式</p>
              <div className="flex gap-3">
                <Button
                  variant={payType === 'alipay' ? 'solid' : 'flat'}
                  color={payType === 'alipay' ? 'primary' : 'default'}
                  onPress={() => setPayType('alipay')}
                >支付宝</Button>
                <Button
                  variant={payType === 'wxpay' ? 'solid' : 'flat'}
                  color={payType === 'wxpay' ? 'success' : 'default'}
                  onPress={() => setPayType('wxpay')}
                >微信支付</Button>
              </div>
            </CardBody>
          </Card>

          <div className="flex justify-center">
            <Button color="primary" size="lg" onPress={handlePay} isLoading={paying} isDisabled={!selected}>
              立即充值
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
