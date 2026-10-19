import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardBody, Button, Input, Select, SelectItem, Textarea, Switch, Spinner } from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiArrowLeft } from 'react-icons/hi'

export default function DataPoolEdit() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = id && id !== 'new'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [apps, setApps] = useState<any[]>([])

  const [form, setForm] = useState({
    app_id: '',
    name: '',
    code: '',
    sort: 0,
    require_login: false,
    remark: '',
  })

  useEffect(() => {
    userApi.listApps(1, 100).then((res: any) => {
      setApps(res.data.list || [])
    })

    if (isEdit) {
      setLoading(true)
      userApi.getDataPool(Number(id)).then((res: any) => {
        const data = res.data
        setForm({
          app_id: String(data.app_id),
          name: data.name || '',
          code: data.code || '',
          sort: data.sort || 0,
          require_login: data.require_login === 1,
          remark: data.remark || '',
        })
      }).catch((e: any) => {
        toast.error(e.message || '加载失败')
        navigate('/data-pools')
      }).finally(() => setLoading(false))
    }
  }, [id, isEdit, navigate])

  const handleSubmit = async () => {
    if (!form.app_id) { toast.error('请选择应用'); return }
    if (!form.name.trim()) { toast.error('请输入数据池名称'); return }
    if (!form.code.trim()) { toast.error('请输入数据池编码'); return }

    setSaving(true)
    try {
      const data = {
        app_id: Number(form.app_id),
        name: form.name,
        code: form.code,
        sort: form.sort,
        require_login: form.require_login ? 1 : 0,
        remark: form.remark,
      }

      if (isEdit) {
        await userApi.updateDataPool(Number(id), data)
        toast.success('更新成功')
      } else {
        await userApi.createDataPool(data)
        toast.success('创建成功')
      }
      navigate('/data-pools')
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
        <Button isIconOnly variant="light" onPress={() => navigate('/data-pools')}>
          <HiArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">{isEdit ? '编辑数据池' : '新建数据池'}</h1>
      </div>

      <Card>
        <CardBody className="p-6 space-y-4">
          <Select
            label="所属应用"
            selectedKeys={form.app_id ? [form.app_id] : []}
            onChange={(e) => setForm({ ...form, app_id: e.target.value })}
            isRequired
            isDisabled={!!isEdit}
          >
            {apps.map((app: any) => (
              <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
            ))}
          </Select>

          <Input
            label="数据池名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            isRequired
          />

          <Input
            label="数据池编码"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            description="唯一标识，用于API调用"
            isRequired
          />

          <Input
            label="排序号"
            type="number"
            value={String(form.sort)}
            onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
            description="数字越小越靠前"
          />

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">客户端添加数据需登录</p>
              <p className="text-xs text-gray-500">开启后，客户端接口添加数据需要先登录</p>
            </div>
            <Switch
              isSelected={form.require_login}
              onValueChange={(v) => setForm({ ...form, require_login: v })}
            />
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
            <Button variant="flat" onPress={() => navigate('/data-pools')}>取消</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
