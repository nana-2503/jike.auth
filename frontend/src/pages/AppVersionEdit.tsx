import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card, CardBody, Button, Input, Textarea, Switch, Spinner, DatePicker,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { currentCalendarDateTime } from '../utils/datePicker'
import { HiArrowLeft, HiSave } from 'react-icons/hi'

export default function AppVersionEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const appId = Number(searchParams.get('app_id'))
  const isNew = id === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [publishedDate, setPublishedDate] = useState<any>(null)
  const [formData, setFormData] = useState({
    version: '',
    check_md5: 0,
    md5_value: '',
    is_beta: 0,
    is_default: 0,
    min_required: 0,
    force_update: 0,
    gray_enabled: 0,
    gray_features: '',
    status: 1,
    download_url: '',
    changelog: '',
    remark: '',
  })

  const isGrayEnabled = (grayEnabled: number) => grayEnabled === 1

  const setPublishedToNow = () => {
    setPublishedDate(currentCalendarDateTime())
  }

  useEffect(() => {
    if (!isNew && id) {
      userApi.getAppVersion(Number(id)).then((res: any) => {
        const v = res.data
        setFormData({
          version: v.version || '',
          check_md5: v.check_md5 || 0,
          md5_value: v.md5_value || '',
          is_beta: v.is_beta || 0,
          is_default: v.is_default || 0,
          min_required: v.min_required || 0,
          force_update: v.force_update || 0,
          gray_enabled: v.gray_enabled || 0,
          gray_features: v.gray_features || '',
          status: v.status ?? 1,
          download_url: v.download_url || '',
          changelog: v.changelog || '',
          remark: v.remark || '',
        })
        if (v.published_at) {
          try { setPublishedDate(parseAbsoluteToLocal(v.published_at)) } catch { setPublishedDate(null) }
        }
      }).catch(() => toast.error('获取版本信息失败')).finally(() => setLoading(false))
    }
  }, [id, isNew])

  const handleSave = async () => {
    if (!formData.version.trim()) { toast.error('请输入版本号'); return }
    if (formData.check_md5 === 1 && !formData.md5_value.trim()) { toast.error('请输入MD5值'); return }
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (isNew) data.app_id = appId
      data.published_at = publishedDate ? publishedDate.toDate().toISOString() : ''
      
      if (isNew) {
        await userApi.createAppVersion(data)
        toast.success('创建成功')
      } else {
        await userApi.updateAppVersion(Number(id), data)
        toast.success('保存成功')
      }
      navigate(`/app-versions?app_id=${appId}`)
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => navigate(`/app-versions?app_id=${appId}`)}><HiArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-xl font-bold">{isNew ? '添加版本' : '编辑版本'}</h2>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardBody className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="版本号" value={formData.version} onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              placeholder="例如: 1.0.0" isRequired />
            <div className="space-y-2">
              <DatePicker label="发布时间" value={publishedDate} onChange={setPublishedDate}
                granularity="second" hourCycle={24} hideTimeZone description="留空表示未发布" showMonthAndYearPickers />
              <Button size="sm" variant="flat" onPress={setPublishedToNow}>设为当前时间</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
              <div>
                <span className="font-medium">启用版本</span>
                <p className="text-xs text-gray-400">禁用后客户端无法使用此版本</p>
              </div>
              <Switch isSelected={formData.status === 1} onValueChange={(v) => setFormData({ ...formData, status: v ? 1 : 0 })} />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
              <div>
                <span className="font-medium">默认版本</span>
                <p className="text-xs text-gray-400">设为默认后，其他版本将取消默认</p>
              </div>
              <Switch isSelected={formData.is_default === 1} onValueChange={(v) => setFormData({ ...formData, is_default: v ? 1 : 0 })} />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
              <div>
                <span className="font-medium">内测版本</span>
                <p className="text-xs text-gray-400">仅内测用户可见</p>
              </div>
              <Switch isSelected={formData.is_beta === 1} onValueChange={(v) => setFormData({ ...formData, is_beta: v ? 1 : 0 })} />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
              <div>
                <span className="font-medium">最低可用版本</span>
                <p className="text-xs text-gray-400">客户端低于此版本时应提示升级</p>
              </div>
              <Switch isSelected={formData.min_required === 1} onValueChange={(v) => setFormData({ ...formData, min_required: v ? 1 : 0 })} />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
              <div>
                <span className="font-medium">强制更新</span>
                <p className="text-xs text-gray-400">客户端应禁止跳过此版本更新提示</p>
              </div>
              <Switch isSelected={formData.force_update === 1} onValueChange={(v) => setFormData({ ...formData, force_update: v ? 1 : 0 })} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-content2 rounded-lg">
              <div>
                <span className="font-medium">校验MD5</span>
                <p className="text-xs text-gray-400">开启后需要输入MD5值</p>
              </div>
              <Switch isSelected={formData.check_md5 === 1} onValueChange={(v) => setFormData({ ...formData, check_md5: v ? 1 : 0 })} />
            </div>
            {formData.check_md5 === 1 && (
              <Input label="MD5值" value={formData.md5_value} onChange={(e) => setFormData({ ...formData, md5_value: e.target.value })}
                placeholder="32位MD5哈希值" isRequired />
            )}
          </div>

          <Input label="下载链接" value={formData.download_url} onChange={(e) => setFormData({ ...formData, download_url: e.target.value })}
            placeholder="https://example.com/download/app.exe" />

          <Textarea label="更新日志" value={formData.changelog} onChange={(e) => setFormData({ ...formData, changelog: e.target.value })}
            placeholder="支持Markdown格式" minRows={6} description="支持Markdown格式" />

          <Textarea label="备注" value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
            placeholder="仅管理员可见" minRows={2} />

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-content2/50 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">灰度测试</h3>
              <p className="text-xs text-gray-400 mt-1">开启后，此版本只对指定特征码开放检测。</p>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/80 dark:bg-content1/70 rounded-xl ring-1 ring-gray-100 dark:ring-gray-800">
              <div>
                <span className="font-medium">开启灰度测试</span>
                <p className="text-xs text-gray-400">仅特征码白名单可检测到此版本</p>
              </div>
              <Switch isSelected={isGrayEnabled(formData.gray_enabled)} onValueChange={(v) => setFormData({ ...formData, gray_enabled: v ? 1 : 0 })} />
            </div>
            <Textarea label="特征码白名单" value={formData.gray_features} onChange={(e) => setFormData({ ...formData, gray_features: e.target.value })}
              placeholder="多个特征码用换行或逗号分隔" minRows={3} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="flat" onPress={() => navigate(`/app-versions?app_id=${appId}`)}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
              {isNew ? '创建' : '保存'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
