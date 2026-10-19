import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Switch, Spinner, Chip } from '@heroui/react'
import { DatePicker } from '@heroui/date-picker'
import { parseAbsoluteToLocal, ZonedDateTime } from '@internationalized/date'
import { HiArrowLeft, HiPlus, HiTrash, HiSave } from 'react-icons/hi'
import MDEditor from '@uiw/react-md-editor'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { currentZonedDateTime } from '../utils/datePicker'

interface Prize {
  id?: number
  name: string
  type: number    // 1:自定义文本 2:谢谢参与 3:卡种
  content: string
  card_type_id: number
  probability: number
  stock: number
  sort: number
}

export default function ActivityEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cardTypes, setCardTypes] = useState<{id: number; name: string; app_id: number}[]>([])

  const [form, setForm] = useState({
    title: '', type: 1, description: '', cover: '',
    start_at: null as ZonedDateTime | null,
    end_at: null as ZonedDateTime | null,
    draw_at: null as ZonedDateTime | null,
    max_join: -1, status: 1,
  })
  const [prizes, setPrizes] = useState<Prize[]>([])

  useEffect(() => { if (id) fetchActivity() }, [id])

  const fetchActivity = async () => {
    try {
      const res: any = await userApi.getActivity(parseInt(id!))
      const a = res.data.activity
      const ap = res.data.prizes || []
      setForm({
        title: a.title, type: a.type, description: a.description || '', cover: a.cover || '',
        start_at: null, end_at: null, draw_at: null,
        max_join: a.max_join, status: a.status,
      })
      if (a.start_at) try { setForm(f => ({ ...f, start_at: parseAbsoluteToLocal(a.start_at) })) } catch {}
      if (a.end_at) try { setForm(f => ({ ...f, end_at: parseAbsoluteToLocal(a.end_at) })) } catch {}
      if (a.draw_at) try { setForm(f => ({ ...f, draw_at: parseAbsoluteToLocal(a.draw_at) })) } catch {}
      setPrizes(ap.map((p: any) => ({
        id: p.id, name: p.name, type: p.type, content: p.content || '',
        card_type_id: p.card_type_id || 0,
        probability: p.probability, stock: p.stock, sort: p.sort,
      })))
      // 获取所有卡种（跨应用）
      try {
        const ctRes: any = await userApi.listApps(1, 100)
        const apps = ctRes.data.list || []
        const allCardTypes: any[] = []
        for (const app of apps) {
          try {
            const r: any = await userApi.listCardTypes(app.id, 1, 100)
            for (const ct of (r.data.list || [])) {
              allCardTypes.push({ ...ct, app_name: app.app_name })
            }
          } catch {}
        }
        setCardTypes(allCardTypes)
      } catch {}
    } catch (e: any) { toast.error(e.message || '获取失败'); navigate('/activities') }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('请填写活动标题'); return }
    setSaving(true)
    try {
      await userApi.updateActivity(parseInt(id!), {
        title: form.title, description: form.description, cover: form.cover,
        start_at: form.start_at ? form.start_at.toDate().toISOString() : '',
        end_at: form.end_at ? form.end_at.toDate().toISOString() : '',
        draw_at: form.draw_at ? form.draw_at.toDate().toISOString() : '',
        max_join: form.max_join, status: form.status,
      })
      toast.success('保存成功')
    } catch (e: any) { toast.error(e.message || '保存失败') }
    finally { setSaving(false) }
  }

  const handleSavePrizes = async () => {
    for (const p of prizes) {
      if (!p.name.trim()) { toast.error('请填写奖品名称'); return }
      if (p.type === 3 && !p.card_type_id) { toast.error('卡种类型奖品请选择卡种'); return }
    }
    setSaving(true)
    try {
      await userApi.saveActivityPrizes(parseInt(id!), prizes)
      toast.success('奖品保存成功')
    } catch (e: any) { toast.error(e.message || '保存失败') }
    finally { setSaving(false) }
  }

  const addPrize = () => {
    setPrizes([...prizes, { name: '', type: 1, content: '', card_type_id: 0, probability: 0, stock: -1, sort: prizes.length }])
  }

  const removePrize = async (index: number) => {
    if (!await confirm('确定要删除这个奖品吗？', '删除确认')) return
    setPrizes(prizes.filter((_, i) => i !== index).map((item, sort) => ({ ...item, sort })))
  }

  const updatePrize = (index: number, field: keyof Prize, value: any) => {
    const np = [...prizes]
    np[index] = { ...np[index], [field]: value }
    setPrizes(np)
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="light" startContent={<HiArrowLeft />} onPress={() => navigate('/activities')}>返回</Button>
        <h2 className="text-xl font-bold">编辑活动</h2>
      </div>

      <Card>
        <CardHeader className="pb-0"><h3 className="font-medium">基本信息</h3></CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="活动标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="flex items-center gap-4">
              <Chip color={form.type === 1 ? 'primary' : form.type === 2 ? 'secondary' : 'success'}>
                {form.type === 1 ? '🎡 转盘抽奖' : form.type === 2 ? '⏰ 定时抽奖' : '🎁 发放卡号'}
              </Chip>
              <Switch isSelected={form.status === 1} onValueChange={(v) => setForm({ ...form, status: v ? 1 : 0 })}>启用活动</Switch>
            </div>
          </div>
          <Input label="封面图片URL" placeholder="可选，输入图片链接" value={form.cover} onChange={(e) => setForm({ ...form, cover: e.target.value })} />
          <div data-color-mode="light">
            <label className="text-sm text-gray-600 mb-1 block">活动描述</label>
            <MDEditor value={form.description} onChange={(v) => setForm({ ...form, description: v || '' })} height={300} preview="edit" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <DatePicker label="开始时间" granularity="second" hourCycle={24} hideTimeZone value={form.start_at} onChange={(v) => setForm({ ...form, start_at: v })} />
              <Button size="sm" variant="flat" onPress={() => setForm({ ...form, start_at: currentZonedDateTime() })}>设为当前时间</Button>
            </div>
            {form.type === 2 ? (
              <div className="space-y-2">
                <DatePicker label="开奖时间" granularity="second" hourCycle={24} hideTimeZone value={form.draw_at} onChange={(v) => setForm({ ...form, draw_at: v })} />
                <Button size="sm" variant="flat" onPress={() => setForm({ ...form, draw_at: currentZonedDateTime() })}>设为当前时间</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <DatePicker label="结束时间" granularity="second" hourCycle={24} hideTimeZone value={form.end_at} onChange={(v) => setForm({ ...form, end_at: v })} />
                <Button size="sm" variant="flat" onPress={() => setForm({ ...form, end_at: currentZonedDateTime() })}>设为当前时间</Button>
              </div>
            )}
          </div>
          <Input type="number" label="参与次数限制" description="-1表示无限制" value={String(form.max_join)} onChange={(e) => setForm({ ...form, max_join: parseInt(e.target.value) || -1 })} />
          <div className="flex justify-end">
            <Button color="primary" startContent={<HiSave />} onPress={handleSave} isLoading={saving}>保存基本信息</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="pb-0 flex justify-between items-center">
          <h3 className="font-medium">奖品配置</h3>
          <Button size="sm" color="primary" variant="flat" startContent={<HiPlus />} onPress={addPrize}>添加奖品</Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {prizes.length === 0 ? (
            <div className="text-center text-gray-500 py-8">暂无奖品，点击上方按钮添加</div>
          ) : (
            prizes.map((prize, index) => (
              <Card key={index} className="bg-default-50">
                <CardBody className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <Input size="sm" label="奖品名称" value={prize.name} onChange={(e) => updatePrize(index, 'name', e.target.value)} />
                      <Select size="sm" label="奖品类型" selectedKeys={[String(prize.type)]} onChange={(e) => updatePrize(index, 'type', parseInt(e.target.value))}>
                        <SelectItem key="1">自定义文本</SelectItem>
                        <SelectItem key="2">谢谢参与</SelectItem>
                        <SelectItem key="3">卡种(自动发卡)</SelectItem>
                      </Select>
                      {prize.type === 1 && (
                        <Input size="sm" label="奖品内容" placeholder="如卡号、兑换码等" value={prize.content} onChange={(e) => updatePrize(index, 'content', e.target.value)} />
                      )}
                      {prize.type === 3 && (
                        <Select size="sm" label="选择卡种" selectedKeys={prize.card_type_id ? [String(prize.card_type_id)] : []} onChange={(e) => updatePrize(index, 'card_type_id', parseInt(e.target.value))}>
                          {cardTypes.map((ct: any) => (
                            <SelectItem key={String(ct.id)}>{ct.app_name ? `[${ct.app_name}] ${ct.name}` : ct.name}</SelectItem>
                          ))}
                        </Select>
                      )}
                      {form.type !== 3 && (
                        <Input size="sm" type="number" label="中奖概率(万分比)" description="如100表示1%" value={String(prize.probability)} onChange={(e) => updatePrize(index, 'probability', parseInt(e.target.value) || 0)} />
                      )}
                      <Input size="sm" type="number" label="库存" description="-1表示无限" value={String(prize.stock)} onChange={(e) => updatePrize(index, 'stock', parseInt(e.target.value) || -1)} />
                      {form.type !== 3 && (
                        <Input size="sm" type="number" label="排序" value={String(prize.sort)} onChange={(e) => updatePrize(index, 'sort', parseInt(e.target.value) || 0)} />
                      )}
                    </div>
                    <Button size="sm" color="danger" variant="flat" isIconOnly onPress={() => removePrize(index)}><HiTrash /></Button>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
          <div className="flex justify-end">
            <Button color="primary" startContent={<HiSave />} onPress={handleSavePrizes} isLoading={saving}>保存奖品配置</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
