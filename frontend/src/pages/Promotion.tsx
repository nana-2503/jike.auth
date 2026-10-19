import { Tab, Tabs } from '@heroui/react'
import { useLocation, useNavigate } from 'react-router-dom'
import PointShop from './PointShop'
import Rebate from './Rebate'

export default function Promotion() {
  const location = useLocation()
  const navigate = useNavigate()
  const selectedKey = location.pathname.includes('point-shop') ? 'point-shop' : 'rebate'

  return (
    <div>
      <Tabs
        aria-label="推广管理"
        selectedKey={selectedKey}
        classNames={{ base: 'gap-0', panel: '!mt-0 !pt-3 !px-0 !pb-0' }}
        onSelectionChange={(key) => navigate(key === 'point-shop' ? '/point-shop' : '/rebate')}
      >
        <Tab key="rebate" title="推广返利">
          <Rebate />
        </Tab>
        <Tab key="point-shop" title="积分商城">
          <PointShop />
        </Tab>
      </Tabs>
    </div>
  )
}
