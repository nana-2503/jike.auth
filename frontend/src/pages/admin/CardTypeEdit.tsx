import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, CardBody, Button, Input, Textarea, Select, SelectItem, Spinner, Tabs, Tab,
} from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiArrowLeft, HiSave } from 'react-icons/hi'

const GEN_RULES = [
  { key: '1', label: '小写字母' },
  { key: '2', label: '大写字母' },
  { key: '3', label: '大小写字母' },
  { key: '4', label: '小写字母+数字' },
  { key: '5', label: '大写字母+数字' },
  { key: '6', label: '大小写字母+数字' },
]

const DURATION_PRESETS = [
  { label: '不充值', value: 0 },
  { label: '1天', value: 1440 },
  { label: '3天', value: 4320 },
  { label: '7天', value: 10080 },
  { label: '15天', value: 21600 },
  { label: '1个月', value: 43200 },
  { label: '3个月', value: 129600 },
  { label: '6个月', value: 259200 },
  { label: '1年', value: 525600 },
  { label: '永久', value: -1 },
]

export default function AdminCardTypeEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [appName, setAppName] = useState('')
	const [formData, setFormData] = useState({
		name: '', prefix: '', points: 0, rebate_points: 0, duration: 0, gen_rule: 6, category: 1,
    max_use: 1, max_user_use: 1, channels: 1, features: 1,
    unbind_day: -1, unbind_week: -1, unbind_month: -1, unbind_quarter: -1, unbind_halfy: -1, unbind_year: -1, unbind_total: -1,
    card_length: 16, extra_data: '', remark: ''
  })

  useEffect(() => {
    if (id) {
      adminApi.getCardType(Number(id)).then((res: any) => {
        const c = res.data
        setAppName(c.app?.app_name || '未知应用')
        setFormData({
			name: c.name || '', prefix: c.prefix || '', points: c.points || 0, rebate_points: c.rebate_points || 0,
          duration: c.duration || 0, gen_rule: c.gen_rule || 6, category: c.category || 1,
          max_use: c.max_use || 1, max_user_use: c.max_user_use || 1,
          channels: c.channels || 1, features: c.features || 1,
          unbind_day: c.unbind_day ?? -1, unbind_week: c.unbind_week ?? -1,
          unbind_month: c.unbind_month ?? -1, unbind_quarter: c.unbind_quarter ?? -1, unbind_halfy: c.unbind_halfy ?? -1,
          unbind_year: c.unbind_year ?? -1, unbind_total: c.unbind_total ?? -1,
          card_length: c.card_length || 16, extra_data: c.extra_data || '', remark: c.remark || ''
        })
      }).catch(() => toast.error('获取卡种信息失败')).finally(() => setLoading(false))
    }
  }, [id])

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('请输入卡种名称'); return }
    if (formData.card_length < 5) { toast.error('卡号长度最少5位'); return }
    setSaving(true)
    try {
      await adminApi.updateCardType(Number(id), formData)
      toast.success('保存成功')
      navigate('/admin/cardtypes')
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate('/admin/cardtypes')}><HiArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h2 className="text-xl font-bold">编辑卡种</h2>
          <span className="text-sm text-gray-400">所属应用: {appName}</span>
        </div>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardBody className="p-6">
          <Tabs aria-label="配置选项" className="w-full">
            <Tab key="basic" title="基本信息">
              <div className="space-y-4 pt-4">
                <Select label="卡种分类" selectedKeys={[String(formData.category)]}
                  onChange={(e) => {
                    const cat = Number(e.target.value)
                    setFormData({ ...formData, category: cat, ...(cat === 2 ? { max_use: 1, max_user_use: 1 } : {}) })
                  }}>
                  <SelectItem key="1">充值卡</SelectItem>
                  <SelectItem key="2">登录卡</SelectItem>
                </Select>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="卡种名称" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} isRequired />
                  <Input label="附加卡头" value={formData.prefix} onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                    placeholder="生成卡号时的前缀" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="充值点数" type="number" value={String(formData.points)}
                    onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })} />
                  <div>
                    <Input label="充值时间(分钟)" type="number" value={String(formData.duration)}
                      onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                      description="0=不充值时间, -1=永久" />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {DURATION_PRESETS.map(p => (
                        <Button key={p.value} size="sm" variant={formData.duration === p.value ? 'solid' : 'flat'}
                          color={formData.duration === p.value ? 'primary' : 'default'}
                          onPress={() => setFormData({ ...formData, duration: p.value })}>{p.label}</Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select label="制卡规则" selectedKeys={[String(formData.gen_rule)]}
                    onChange={(e) => setFormData({ ...formData, gen_rule: Number(e.target.value) })}>
                    {GEN_RULES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
                  </Select>
                  <Input label="卡号长度" type="number" min={5} value={String(formData.card_length)}
                    onChange={(e) => setFormData({ ...formData, card_length: Math.max(5, Number(e.target.value)) })}
                    description="最少5位" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="可充值次数" type="number" min={1} value={String(formData.max_use)}
                    onChange={(e) => setFormData({ ...formData, max_use: Number(e.target.value) })}
                    className={formData.category === 2 ? 'hidden' : ''} />
                  <Input label="每用户可充值次数" type="number" min={1} value={String(formData.max_user_use)}
                    onChange={(e) => setFormData({ ...formData, max_user_use: Number(e.target.value) })}
                    className={formData.category === 2 ? 'hidden' : ''} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="通道数量" type="number" min={1} value={String(formData.channels)}
                    onChange={(e) => setFormData({ ...formData, channels: Number(e.target.value) })} />
                  <Input label="特征数量" type="number" min={1} value={String(formData.features)}
                    onChange={(e) => setFormData({ ...formData, features: Number(e.target.value) })} />
                </div>
              </div>
            </Tab>
            <Tab key="unbind" title="解绑设置">
              <div className="space-y-4 pt-4">
                <p className="text-sm text-gray-500">-1 表示无限次数，充值后覆盖用户的解绑设置</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Input label="每天解绑次数" type="number" value={String(formData.unbind_day)}
                    onChange={(e) => setFormData({ ...formData, unbind_day: Number(e.target.value) })} />
                  <Input label="每周解绑次数" type="number" value={String(formData.unbind_week)}
                    onChange={(e) => setFormData({ ...formData, unbind_week: Number(e.target.value) })} />
                  <Input label="每月解绑次数" type="number" value={String(formData.unbind_month)}
                    onChange={(e) => setFormData({ ...formData, unbind_month: Number(e.target.value) })} />
                  <Input label="每季解绑次数" type="number" value={String(formData.unbind_quarter)}
                    onChange={(e) => setFormData({ ...formData, unbind_quarter: Number(e.target.value) })} />
                  <Input label="每半年解绑次数" type="number" value={String(formData.unbind_halfy)}
                    onChange={(e) => setFormData({ ...formData, unbind_halfy: Number(e.target.value) })} />
                  <Input label="每年解绑次数" type="number" value={String(formData.unbind_year)}
                    onChange={(e) => setFormData({ ...formData, unbind_year: Number(e.target.value) })} />
                  <Input label="总解绑次数" type="number" value={String(formData.unbind_total)}
                    onChange={(e) => setFormData({ ...formData, unbind_total: Number(e.target.value) })} />
                </div>
              </div>
            </Tab>
            <Tab key="extra" title="附加信息">
              <div className="space-y-4 pt-4">
                <Input label="消费返利积分" type="number" min={0} value={String(formData.rebate_points)}
                  onChange={(e) => setFormData({ ...formData, rebate_points: Math.max(0, Number(e.target.value)) })}
                  description="该卡充值成功后，直接上级获得的固定返利积分，0=不返利" />
                <Textarea label="附加数据" value={formData.extra_data}
                  onChange={(e) => setFormData({ ...formData, extra_data: e.target.value })}
                  placeholder="充值后覆盖用户的附加数据" minRows={3} />
                <Textarea label="卡种备注" value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  placeholder="仅管理员可见" minRows={2} />
              </div>
            </Tab>
          </Tabs>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="flat" onPress={() => navigate('/admin/cardtypes')}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
              保存
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
