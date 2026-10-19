import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip,
  useDisclosure, Select, SelectItem,
  Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, Input, Textarea, Switch, DatePicker,
} from '@heroui/react'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { RBtn } from '../components/ResponsiveButton'
import { confirm } from '../components/ConfirmModal'
import { currentCalendarDateTime } from '../utils/datePicker'
import { HiCalendar, HiCloudDownload, HiPencil, HiTrash, HiPlus, HiEye, HiSave, HiShieldCheck, HiSparkles, HiCube } from 'react-icons/hi'

interface AppVersion {
  id: number
  app_id: number
  app?: { id: number; app_name: string }
  version: string
  check_md5: number
  md5_value: string
  is_beta: number
  is_default: number
  min_required: number
  force_update: number
  gray_enabled: number
  gray_features: string
  status: number
  download_url: string
  changelog: string
  published_at: string | null
  remark: string
  created_at: string
}

interface App {
  id: number
  app_name: string
}

export default function AppVersions() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [versions, setVersions] = useState<AppVersion[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [appsLoading, setAppsLoading] = useState(true)

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const [selectedVersion, setSelectedVersion] = useState<AppVersion | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
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

  const isAllApps = selectedAppId === null
  const isNewVersion = editingId === null

  const isGrayEnabled = (grayEnabled: number) => grayEnabled === 1

  const setPublishedToNow = () => {
    setPublishedDate(currentCalendarDateTime())
  }

  useEffect(() => {
    const appIdParam = searchParams.get('app_id')
    if (appIdParam) {
      setSelectedAppId(Number(appIdParam))
    }
  }, [searchParams])

  useEffect(() => {
    setAppsLoading(true)
    userApi.listApps(1, 100).then((res: any) => {
      const list = res.data.list || []
      setApps(list)
    }).finally(() => setAppsLoading(false))
  }, [])

  const fetchVersions = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listAppVersions(isAllApps ? null : selectedAppId, page, 12)
      setVersions(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchVersions() }, [page, selectedAppId])

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这个版本吗？')) return
    try {
      await userApi.deleteAppVersion(id)
      toast.success('删除成功')
      fetchVersions()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const showDetail = (v: AppVersion) => {
    setSelectedVersion(v)
    onDetailOpen()
  }

  const handleEdit = (id: number) => {
    setEditingId(id)
    userApi.getAppVersion(id).then((res: any) => {
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
      } else {
        setPublishedDate(null)
      }
      onEditOpen()
    }).catch(() => toast.error('获取版本信息失败'))
  }

  const handleNew = () => {
    if (isAllApps) {
      toast.error('请先选择一个应用')
      return
    }
    setEditingId(null)
    setFormData({
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
    setPublishedDate(null)
    onEditOpen()
  }

  const handleSave = async () => {
    if (!formData.version.trim()) { toast.error('请输入版本号'); return }
    if (formData.check_md5 === 1 && !formData.md5_value.trim()) { toast.error('请输入MD5值'); return }
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (isNewVersion) data.app_id = selectedAppId
      data.published_at = publishedDate ? publishedDate.toDate().toISOString() : ''
      
      if (isNewVersion) {
        await userApi.createAppVersion(data)
        toast.success('创建成功')
      } else {
        await userApi.updateAppVersion(editingId!, data)
        toast.success('保存成功')
      }
      onEditClose()
      fetchVersions()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* 顶部筛选栏 */}
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <Select 
          placeholder="全部应用" 
          selectedKeys={selectedAppId !== null ? [String(selectedAppId)] : []}
          onChange={(e) => { 
            const newAppId = e.target.value === '' ? null : Number(e.target.value)
            setSelectedAppId(newAppId)
            setPage(1)
            if (newAppId) {
              navigate(`/app-versions?app_id=${newAppId}`)
            } else {
              navigate('/app-versions')
            }
          }}
          className="w-full md:w-64" 
          size="sm"
          isLoading={appsLoading}
        >
          {apps.map(app => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        {!isAllApps && (
          <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />}
            onPress={handleNew}>添加版本</Button>
        )}
      </div>

      {/* 版本列表 */}
      {renderVersionList()}

      {/* 详情抽屉 */}
      <Drawer isOpen={isDetailOpen} onClose={onDetailClose} placement="right" size="lg" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex flex-row items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h2 className="text-xl font-bold">版本详情</h2>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onDetailClose} size="sm">关闭</Button>
              <Button color="primary" onPress={() => { onDetailClose(); handleEdit(selectedVersion!.id) }} size="sm">编辑</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6">
            {selectedVersion && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-content2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">版本号</p>
                      <h3 className="mt-1 text-2xl font-semibold tracking-tight truncate">{selectedVersion.version}</h3>
                      <p className="mt-1 text-sm text-gray-500 truncate">{selectedVersion.app?.app_name || apps.find(a => a.id === selectedVersion.app_id)?.app_name || '应用版本'}</p>
                    </div>
                    <Chip size="sm" color={selectedVersion.status === 1 ? 'success' : 'danger'} variant="flat" className="flex-shrink-0">{selectedVersion.status === 1 ? '已启用' : '已禁用'}</Chip>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                    {selectedVersion.is_default === 1 && <Chip size="sm" color="success" variant="flat">默认版本</Chip>}
                    {selectedVersion.min_required === 1 && <Chip size="sm" color="danger" variant="flat">最低可用</Chip>}
                    {selectedVersion.force_update === 1 && <Chip size="sm" color="danger" variant="flat">强制更新</Chip>}
                    {selectedVersion.is_beta === 1 && <Chip size="sm" color="warning" variant="flat">内测版本</Chip>}
                    {isGrayEnabled(selectedVersion.gray_enabled) && <Chip size="sm" color="secondary" variant="flat">灰度测试</Chip>}
                    {selectedVersion.check_md5 === 1 && <Chip size="sm" variant="flat">MD5校验</Chip>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="flex items-center gap-1 text-xs text-gray-400"><HiCalendar className="w-3.5 h-3.5" />发布时间</span>
                    <p className="mt-1 text-sm font-medium">{selectedVersion.published_at ? new Date(selectedVersion.published_at).toLocaleString() : '未发布'}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="flex items-center gap-1 text-xs text-gray-400"><HiShieldCheck className="w-3.5 h-3.5" />MD5校验</span>
                    <p className="mt-1 text-sm font-medium">{selectedVersion.check_md5 === 1 ? '开启' : '关闭'}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="flex items-center gap-1 text-xs text-gray-400"><HiSparkles className="w-3.5 h-3.5" />灰度测试</span>
                    <p className="mt-1 text-sm font-medium">{isGrayEnabled(selectedVersion.gray_enabled) ? '已开启' : '关闭'}</p>
                  </div>
                </div>

                {selectedVersion.check_md5 === 1 && (
                  <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="text-xs text-gray-400">MD5值</span>
                    <p className="mt-1 font-mono text-sm break-all">{selectedVersion.md5_value || '未设置'}</p>
                  </div>
                )}

                <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                  <span className="flex items-center gap-1 text-xs text-gray-400"><HiCloudDownload className="w-3.5 h-3.5" />下载链接</span>
                  <p className="mt-1 text-sm break-all">{selectedVersion.download_url || '未设置'}</p>
                </div>

                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">灰度测试</h3>
                    <Chip size="sm" color={isGrayEnabled(selectedVersion.gray_enabled) ? 'secondary' : 'default'} variant="flat">{isGrayEnabled(selectedVersion.gray_enabled) ? '开启' : '关闭'}</Chip>
                  </div>
                  <p className="text-xs text-gray-500">{isGrayEnabled(selectedVersion.gray_enabled) ? '仅特征码白名单可检测到此版本。' : '所有客户端按正常规则可检测。'}</p>
                  {isGrayEnabled(selectedVersion.gray_enabled) && (
                    <div className="mt-3 rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                      <span className="text-xs text-gray-400">特征码白名单</span>
                      <p className="mt-1 text-sm whitespace-pre-wrap break-all">{selectedVersion.gray_features || '未设置'}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <h3 className="text-sm font-semibold mb-3">更新日志</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-gray-600 dark:text-gray-300">{selectedVersion.changelog || '无'}</div>
                </div>

                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <h3 className="text-sm font-semibold mb-3">备注</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selectedVersion.remark || '无'}</p>
                </div>

                <div className="text-xs text-gray-400 text-right">创建于 {new Date(selectedVersion.created_at).toLocaleString()}</div>
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 编辑抽屉 */}
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="lg" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex flex-row items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h2 className="text-xl font-bold">{isNewVersion ? '添加版本' : '编辑版本'}</h2>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">
                {isNewVersion ? '创建' : '保存'}
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <Input label="版本号" value={formData.version} onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="例如: 1.0.0" isRequired />
                <div className="space-y-2">
                  <DatePicker label="发布时间" value={publishedDate} onChange={setPublishedDate}
                    granularity="second" hourCycle={24} hideTimeZone description="留空表示未发布" showMonthAndYearPickers />
                  <Button size="sm" variant="flat" onPress={setPublishedToNow}>设为当前时间</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
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
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )

  function renderVersionList() {
    if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
    if (versions.length === 0) return <Card><CardBody className="text-center py-12 text-gray-500">暂无版本</CardBody></Card>

    const getAppName = (v: AppVersion) => v.app?.app_name || apps.find(a => a.id === v.app_id)?.app_name
    return (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {versions.map((v) => {
            const appName = isAllApps ? getAppName(v) || '未知应用' : '应用版本'

            return (
            <Card key={v.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => showDetail(v)}>
                    <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 dark:bg-primary/15">
                      <HiCube className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold leading-5 text-gray-900 dark:text-white">{v.version}</span>
                      <span className="mt-1 inline-flex max-w-full rounded bg-gray-50/80 px-1 py-0.5 text-[11px] font-medium leading-4 text-gray-600 ring-1 ring-gray-100 dark:bg-content2 dark:text-gray-300 dark:ring-gray-800">
                        <span className="truncate">{appName}</span>
                      </span>
                    </span>
                  </button>
                  <Chip size="sm" color={v.status === 1 ? 'success' : 'danger'} variant="flat" className="flex-shrink-0">{v.status === 1 ? '启用' : '禁用'}</Chip>
                </div>

                <div className="flex gap-1 flex-wrap">
                  {v.is_default === 1 && <Chip size="sm" color="success" variant="flat">默认</Chip>}
                  {v.min_required === 1 && <Chip size="sm" color="danger" variant="flat">最低可用</Chip>}
                  {v.force_update === 1 && <Chip size="sm" color="danger" variant="flat">强制更新</Chip>}
                  {v.is_beta === 1 && <Chip size="sm" color="warning" variant="flat">内测</Chip>}
                  {isGrayEnabled(v.gray_enabled) && <Chip size="sm" color="secondary" variant="flat">灰度测试</Chip>}
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg bg-gray-50/80 dark:bg-content2 px-2.5 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="flex items-center gap-1 text-[11px] text-gray-400"><HiCalendar className="w-3 h-3" />发布</span>
                    <p className="mt-1 truncate text-xs font-medium">{v.published_at ? new Date(v.published_at).toLocaleDateString() : '未发布'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50/80 dark:bg-content2 px-2.5 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="flex items-center gap-1 text-[11px] text-gray-400"><HiSparkles className="w-3 h-3" />灰度</span>
                    <p className="mt-1 text-xs font-medium">{isGrayEnabled(v.gray_enabled) ? '开启' : '关闭'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50/80 dark:bg-content2 px-2.5 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <span className="flex items-center gap-1 text-[11px] text-gray-400"><HiShieldCheck className="w-3 h-3" />MD5</span>
                    <p className="mt-1 text-xs font-medium">{v.check_md5 === 1 ? '开启' : '关闭'}</p>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50/80 dark:bg-content2 px-2.5 py-1.5 ring-1 ring-gray-100 dark:ring-gray-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <HiCloudDownload className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.download_url || '未设置下载链接'}</span>
                  </div>
                </div>

                <div className="flex gap-2 justify-end rbtn-group pt-1">
                  <RBtn icon={<HiEye className="w-4 h-4" />} label="详情" variant="flat" onPress={() => showDetail(v)} />
                  <RBtn icon={<HiPencil className="w-4 h-4" />} label="编辑" variant="flat" color="primary" onPress={() => handleEdit(v.id)} />
                  <RBtn icon={<HiTrash className="w-4 h-4" />} label="删除" variant="flat" color="danger" onPress={() => handleDelete(v.id)} />
                </div>
              </CardBody>
            </Card>
            )
          })}
        </div>
        {total > 12 && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} /></div>}
      </>
    )
  }
}
