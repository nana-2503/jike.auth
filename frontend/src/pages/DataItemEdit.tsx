import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardBody, Button, Input, Textarea, Switch, Spinner } from '@heroui/react'
import { DatePicker } from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { currentZonedDateTime } from '../utils/datePicker'
import { HiArrowLeft } from 'react-icons/hi'

export default function DataItemEdit() {
  const navigate = useNavigate()
  const { poolId, itemId } = useParams()
  const isEdit = itemId && itemId !== 'new'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pool, setPool] = useState<any>(null)

  const [form, setForm] = useState({
    name: '',
    code: '',
    content: '',
    modify_count: -1,
    expire_at: null as any,
    require_login: false,
    require_paid: false,
    allow_delete: false,
    allow_modify: false,
    allow_expire: false,
    remark: '',
  })

  useEffect(() => {
    userApi.getDataPool(Number(poolId)).then((res: any) => {
      setPool(res.data)
    }).catch(() => {
      navigate('/data-pools')
    })

    if (isEdit) {
      setLoading(true)
      userApi.getDataItem(Number(poolId), Number(itemId)).then((res: any) => {
        const data = res.data
        setForm({
          name: data.name || '',
          code: data.code || '',
          content: data.content || '',
          modify_count: data.modify_count ?? -1,
          expire_at: data.expire_at && data.expire_at !== '0001-01-01T00:00:00Z'
            ? parseAbsoluteToLocal(data.expire_at) : null,
          require_login: data.require_login === 1,
          require_paid: data.require_paid === 1,
          allow_delete: data.allow_delete === 1,
          allow_modify: data.allow_modify === 1,
          allow_expire: data.allow_expire === 1,
          remark: data.remark || '',
        })
      }).catch((e: any) => {
        toast.error(e.message || '加载失败')
        navigate(`/data-pools/${poolId}/items`)
      }).finally(() => setLoading(false))
    }
  }, [poolId, itemId, isEdit, navigate])

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('请输入数据名称'); return }
    if (!form.code.trim()) { toast.error('请输入数据编号'); return }

    setSaving(true)
    try {
      let expireAtStr = ''
      if (form.expire_at) {
        const d = form.expire_at as any
        if (d.toAbsoluteString) {
          expireAtStr = d.toAbsoluteString()
        } else if (d.toDate) {
          expireAtStr = d.toDate().toISOString()
        }
      }

      const data = {
        name: form.name,
        code: form.code,
        content: form.content,
        modify_count: form.modify_count,
        expire_at: expireAtStr,
        require_login: form.require_login ? 1 : 0,
        require_paid: form.require_paid ? 1 : 0,
        allow_delete: form.allow_delete ? 1 : 0,
        allow_modify: form.allow_modify ? 1 : 0,
        allow_expire: form.allow_expire ? 1 : 0,
        remark: form.remark,
      }

      if (isEdit) {
        await userApi.updateDataItem(Number(poolId), Number(itemId), data)
        toast.success('更新成功')
      } else {
        await userApi.createDataItem(Number(poolId), data)
        toast.success('创建成功')
      }
      navigate(`/data-pools/${poolId}/items`)
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button isIconOnly variant="light" onPress={() => navigate(`/data-pools/${poolId}/items`)}>
          <HiArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{isEdit ? '编辑数据项' : '新建数据项'}</h1>
          <p className="text-sm text-gray-500">数据池: {pool?.name}</p>
        </div>
      </div>

      <Card>
        <CardBody className="p-6 space-y-4">
          <Input
            label="数据名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            isRequired
          />

          <Input
            label="数据编号"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            description="唯一标识，用于API调用"
            isRequired
          />

          <Textarea
            label="数据内容"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            minRows={5}
            maxRows={15}
            description="支持长文本数据"
          />

          <Input
            label="可修改次数"
            type="number"
            value={String(form.modify_count)}
            onChange={(e) => setForm({ ...form, modify_count: Number(e.target.value) })}
            description="-1 表示无限次"
          />

          <div className="space-y-2">
            <DatePicker
              label="过期时间"
              value={form.expire_at}
              onChange={(v) => setForm({ ...form, expire_at: v })}
              granularity="second"
              hourCycle={24}
              hideTimeZone
            />
            <Button size="sm" variant="flat" onPress={() => setForm({ ...form, expire_at: currentZonedDateTime() })}>设为当前时间</Button>
          </div>

          <div className="space-y-3 pt-2">
            <p className="font-medium text-sm">客户端接口权限</p>
            
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm">验证登录</p>
                <p className="text-xs text-gray-500">客户端访问此数据需要先登录</p>
              </div>
              <Switch
                isSelected={form.require_login}
                onValueChange={(v) => setForm({ ...form, require_login: v })}
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm">需要付费</p>
                <p className="text-xs text-gray-500">仅付费用户可访问此数据（自动要求登录）</p>
              </div>
              <Switch
                isSelected={form.require_paid}
                onValueChange={(v) => setForm({ ...form, require_paid: v })}
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm">允许删除</p>
                <p className="text-xs text-gray-500">客户端可以删除此数据</p>
              </div>
              <Switch
                isSelected={form.allow_delete}
                onValueChange={(v) => setForm({ ...form, allow_delete: v })}
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm">允许修改</p>
                <p className="text-xs text-gray-500">客户端可以修改此数据内容</p>
              </div>
              <Switch
                isSelected={form.allow_modify}
                onValueChange={(v) => setForm({ ...form, allow_modify: v })}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm">允许过期修改</p>
                <p className="text-xs text-gray-500">客户端可以修改此数据的过期时间</p>
              </div>
              <Switch
                isSelected={form.allow_expire}
                onValueChange={(v) => setForm({ ...form, allow_expire: v })}
              />
            </div>
          </div>

          <Textarea
            label="备注"
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
          />

          <div className="flex gap-3 pt-4">
            <Button color="primary" onPress={handleSubmit} isLoading={saving}>
              {isEdit ? '保存' : '创建'}
            </Button>
            <Button variant="flat" onPress={() => navigate(`/data-pools/${poolId}/items`)}>取消</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
