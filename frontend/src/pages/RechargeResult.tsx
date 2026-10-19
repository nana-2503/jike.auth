import { useState, useEffect } from 'react'
import { Card, CardBody, Button, Spinner, Chip } from '@heroui/react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { userApi } from '../api'

interface Order {
  id: number; order_no: string; amount: number; balance_amount: number
  pay_type: string; status: number; paid_at: string | null; created_at: string
}

export default function RechargeResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const orderNo = searchParams.get('order_no')
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderNo) return
    const check = () => {
      userApi.getRechargeOrderStatus(orderNo).then((res: any) => {
        if (res.data) setOrder(res.data)
      }).finally(() => setLoading(false))
    }
    check()
    const timer = setInterval(check, 3000)
    return () => clearInterval(timer)
  }, [orderNo])

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  if (!order) return (
    <Card><CardBody className="text-center py-12 text-gray-500">订单不存在</CardBody></Card>
  )

  const statusMap: Record<number, { text: string; color: 'warning' | 'success' | 'default'; icon: string }> = {
    0: { text: '待支付', color: 'warning', icon: '⏳' },
    1: { text: '已支付', color: 'success', icon: '✅' },
    2: { text: '已取消', color: 'default', icon: '❌' },
  }
  const s = statusMap[order.status] || statusMap[0]

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Card>
        <CardBody className="p-8 text-center space-y-4">
          <div className="text-5xl">{s.icon}</div>
          <Chip size="lg" color={s.color} variant="flat">{s.text}</Chip>
          <div className="space-y-2 text-sm text-gray-600">
            <p>订单号: <span className="font-mono">{order.order_no}</span></p>
            <p>支付金额: <span className="font-semibold text-lg text-primary">¥{order.amount}</span></p>
            <p>到账余额: {order.balance_amount}</p>
            <p>支付方式: {order.pay_type === 'alipay' ? '支付宝' : '微信支付'}</p>
            {order.paid_at && <p>支付时间: {new Date(order.paid_at).toLocaleString()}</p>}
          </div>
          {order.status === 0 && <p className="text-xs text-gray-400">正在等待支付结果，页面会自动刷新...</p>}
        </CardBody>
      </Card>
      <div className="flex justify-center gap-3">
        <Button variant="flat" onPress={() => navigate('/recharge')}>继续充值</Button>
        <Button color="primary" onPress={() => navigate('/')}>返回首页</Button>
      </div>
    </div>
  )
}
