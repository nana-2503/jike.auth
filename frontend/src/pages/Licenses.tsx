import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Input, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea, Select, SelectItem, Chip, DatePicker, Drawer, DrawerContent, DrawerHeader, DrawerBody, useDisclosure, Tooltip } from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { RBtn } from '../components/ResponsiveButton'
import { HiPlus, HiPencil, HiTrash, HiKey, HiRefresh, HiLockClosed, HiClipboardCopy, HiSave } from 'react-icons/hi'
import { CalendarDateTime } from '@internationalized/date'
import { currentCalendarDateTime, dateValueToLocalDateTimeString } from '../utils/datePicker'

interface App {
  id: number
  app_name: string
}

interface License {
  id: number
  app_id: number
  app?: App
  name: string
  certificate: string
  content?: string
  max_use: number
  used_count: number
  bind_feature: string
  remark: string
  status: number
  expire_at?: string
  created_at: string
}

export default function Licenses() {
  const [apps, setApps] = useState<App[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedApp, setSelectedApp] = useState<number>(0)
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const [editLicense, setEditLicense] = useState<License | null>(null)
  const [form, setForm] = useState<{ app_id: string; name: string; certificate: string; content: string; remark: string; status: number; max_use: number; bind_feature: string; expire_at: CalendarDateTime | null }>({ app_id: '', name: '', certificate: '', content: '', remark: '', status: 1, max_use: 0, bind_feature: '', expire_at: null })
  const [encryptedPreview, setEncryptedPreview] = useState('')
  const [encrypting, setEncrypting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<License | null>(null)
  const [extractedKey, setExtractedKey] = useState('')

  const loadApps = async () => {
    const res: any = await userApi.listApps(1, 100)
    setApps(res.data?.list || [])
  }

  const loadLicenses = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listLicenses(selectedApp || undefined)
      setLicenses(res.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadApps() }, [])
  useEffect(() => { loadLicenses() }, [selectedApp])

  const handleNew = () => {
    setEditLicense(null)
    setForm({ app_id: apps[0]?.id?.toString() || '', name: '', certificate: '', content: '', remark: '', status: 1, max_use: 0, bind_feature: '', expire_at: null })
    setEncryptedPreview('')
    setExtractedKey('')
    onEditOpen()
  }

  const handleEdit = async (license: License) => {
    try {
      const res: any = await userApi.getLicense(license.id)
      const data = res.data
      setEditLicense(license)
      
      // 解析过期时间
      let expireDate: CalendarDateTime | null = null
      if (data.expire_at) {
        const d = new Date(data.expire_at)
        expireDate = new CalendarDateTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes())
      }
      
      setForm({
        app_id: data.app_id.toString(),
        name: data.name,
        certificate: data.certificate,
        content: data.content || '',
        remark: data.remark || '',
        status: data.status,
        max_use: data.max_use || 0,
        bind_feature: data.bind_feature || '',
        expire_at: expireDate
      })
      setEncryptedPreview('')
      setExtractedKey('')
      onEditOpen()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // 从证书码提取AES密钥（随机位置混淆）
  const extractAesKey = (certificate: string) => {
    if (certificate.length !== 256) {
      toast.error('证书格式错误')
      return ''
    }

    // 种子位置（固定）
    const seedPositions = [32, 128, 185, 213]

    // 从固定位置提取种子
    let seedHex = ''
    for (const pos of seedPositions) {
      seedHex += certificate[pos]
    }
    const seed = parseInt(seedHex, 16)

    // 根据种子生成位置序列（排除种子位置）
    const positions = generatePositions(seed, 256, 64, seedPositions)

    // 从对应位置提取密钥字符
    let key = ''
    for (const pos of positions) {
      key += certificate[pos]
    }

    return key
  }

  // 根据种子生成n个不重复的随机位置（排除指定位置）
  const generatePositions = (seed: number, total: number, count: number, exclude: number[]) => {
    const excludeSet = new Set(exclude)

    // 创建可用位置列表
    const available: number[] = []
    for (let i = 0; i < total; i++) {
      if (!excludeSet.has(i)) {
        available.push(i)
      }
    }

    // Fisher-Yates 洗牌算法（使用种子）
    let s = seed
    for (let i = available.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff // LCG伪随机
      const j = s % (i + 1)
      ;[available[i], available[j]] = [available[j], available[i]]
    }

    return available.slice(0, count)
  }

  const handleExtractKey = () => {
    if (!form.certificate) {
      toast.error('请先生成证书')
      return
    }
    const key = extractAesKey(form.certificate)
    if (key) {
      setExtractedKey(key)
    }
  }

  const handleGenerateCert = async () => {
    try {
      const res: any = await userApi.generateCertificate()
      setForm({ ...form, certificate: res.data.certificate })
      setEncryptedPreview('')
      setExtractedKey('')
      toast.success('证书已生成')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleEncrypt = async () => {
    if (!form.certificate || !form.content) {
      toast.error('请先生成证书并输入附加内容')
      return
    }
    setEncrypting(true)
    try {
      const res: any = await userApi.encryptPreview(form.certificate, form.content)
      setEncryptedPreview(res.data.encrypted)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setEncrypting(false)
    }
  }

  const handleSave = async () => {
    if (!form.app_id || !form.name || !form.certificate) {
      toast.error('请填写完整信息')
      return
    }
    setSaving(true)
    try {
      const expireAtStr = dateValueToLocalDateTimeString(form.expire_at)
      
      if (editLicense) {
        await userApi.updateLicense(editLicense.id, {
          name: form.name,
          content: form.content,
          remark: form.remark,
          status: form.status,
          max_use: form.max_use,
          bind_feature: form.bind_feature,
          expire_at: expireAtStr
        })
        toast.success('更新成功')
      } else {
        await userApi.createLicense({
          app_id: parseInt(form.app_id),
          name: form.name,
          certificate: form.certificate,
          content: form.content,
          remark: form.remark,
          status: form.status,
          max_use: form.max_use,
          bind_feature: form.bind_feature,
          expire_at: expireAtStr
        })
        toast.success('创建成功')
      }
      onEditClose()
      loadLicenses()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await userApi.deleteLicense(deleteConfirm.id)
      toast.success('删除成功')
      setDeleteConfirm(null)
      loadLicenses()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString() : '-'

  const getExpireState = (value?: string) => {
    if (!value) return { text: '永久有效', className: 'text-emerald-600 dark:text-emerald-400' }
    const expired = new Date(value) < new Date()
    return {
      text: expired ? `已过期 ${formatDateTime(value)}` : formatDateTime(value),
      className: expired ? 'text-red-500' : 'text-gray-700 dark:text-gray-200',
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select
          placeholder="选择应用"
          selectedKeys={selectedApp ? [selectedApp.toString()] : []}
          onChange={(e) => setSelectedApp(Number(e.target.value))}
          className="w-48"
          size="sm"
        >
          {[{ id: 0, app_name: '全部应用' }, ...apps].map(app => (
            <SelectItem key={app.id.toString()}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <Button color="primary" size="sm" startContent={<HiPlus />} onPress={handleNew}>
          新建证书
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : licenses.length === 0 ? (
        <Card><CardBody className="text-center text-gray-500 py-12">暂无授权证书</CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {licenses.map(license => {
            const expireState = getExpireState(license.expire_at)
            const usePercent = license.max_use > 0 ? Math.min(100, Math.round((license.used_count / license.max_use) * 100)) : 0
            return (
            <Card key={license.id} className="h-full hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
              <CardBody className="p-4 flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/10 flex-shrink-0">
                      <HiKey className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate leading-5">{license.name}</div>
                      <div className="text-xs text-gray-500 truncate mt-1">{license.app?.app_name || '未关联应用'}</div>
                    </div>
                  </div>
                  <Chip size="sm" color={license.status === 1 ? 'success' : 'danger'} variant="flat" className="flex-shrink-0">
                    {license.status === 1 ? '启用' : '禁用'}
                  </Chip>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 dark:bg-content2 px-3 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <div className="text-gray-400 mb-1">使用次数</div>
                    <div className="font-medium text-gray-700 dark:text-gray-200">{license.max_use > 0 ? `${license.used_count}/${license.max_use}` : `${license.used_count} / 不限`}</div>
                    {license.max_use > 0 && <div className="mt-2 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${usePercent}%` }} /></div>}
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-content2 px-3 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <div className="text-gray-400 mb-1">有效期</div>
                    <div className={`font-medium truncate ${expireState.className}`}>{expireState.text}</div>
                  </div>
                </div>

                {license.bind_feature && (
                  <div className="rounded-lg bg-gray-50 dark:bg-content2 px-3 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <div className="text-xs text-gray-400 mb-1">绑定特征</div>
                    <div className="text-xs font-mono truncate text-gray-600 dark:text-gray-300">{license.bind_feature}</div>
                  </div>
                )}

                <div className="rounded-lg bg-gray-50 dark:bg-content2 px-3 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">证书码</span>
                    <Button size="sm" variant="light" isIconOnly onPress={() => copyToClipboard(license.certificate)}>
                      <HiClipboardCopy className="w-4 h-4" />
                    </Button>
                  </div>
                  <code className="block overflow-hidden break-all text-xs font-mono leading-4 text-gray-600 dark:text-gray-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{license.certificate}</code>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
                  <span className="text-xs text-gray-400 truncate">创建于 {formatDateTime(license.created_at)}</span>
                  <div className="flex gap-1.5 rbtn-group flex-shrink-0">
                    <RBtn icon={<HiPencil className="w-4 h-4" />} label="编辑" variant="flat" color="primary" onPress={() => handleEdit(license)} />
                    <RBtn icon={<HiTrash className="w-4 h-4" />} label="删除" variant="flat" color="danger" onPress={() => setDeleteConfirm(license)} />
                  </div>
                </div>
              </CardBody>
            </Card>
            )
          })}
        </div>
      )}

      {/* 编辑抽屉 */}
      <Drawer isOpen={isEditOpen} onClose={onEditClose} placement="right" size="xl" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>{editLicense ? '编辑证书' : '新建证书'}</span>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="space-y-4 mt-6">
              <Select
                label="所属应用"
                selectedKeys={form.app_id ? [form.app_id] : []}
                onChange={(e) => setForm({ ...form, app_id: e.target.value })}
                isDisabled={!!editLicense}
                isRequired
                size="sm"
                variant="bordered"
              >
                {apps.map(app => (
                  <SelectItem key={app.id.toString()}>{app.app_name}</SelectItem>
                ))}
              </Select>
              <Input
                label="证书名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如: 正式版授权"
                size="sm"
                variant="bordered"
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">证书码</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="flat" startContent={<HiKey className="w-4 h-4" />} onPress={handleExtractKey} isDisabled={!form.certificate}>
                      提取密钥
                    </Button>
                    {!editLicense && (
                      <Button size="sm" variant="flat" startContent={<HiRefresh className="w-4 h-4" />} onPress={handleGenerateCert}>
                        生成证书
                      </Button>
                    )}
                  </div>
                </div>
                <Textarea
                  value={form.certificate}
                  onChange={(e) => !editLicense && setForm({ ...form, certificate: e.target.value })}
                  placeholder="点击生成证书按钮自动生成"
                  minRows={2}
                  maxRows={4}
                  isReadOnly={!!editLicense}
                  classNames={{ input: 'font-mono text-xs' }}
                  size="sm"
                  variant="bordered"
                />
                {extractedKey && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">AES-256 密钥 (Hex)</span>
                      <Button size="sm" variant="light" isIconOnly onPress={() => copyToClipboard(extractedKey)}>
                        <HiClipboardCopy className="w-4 h-4" />
                      </Button>
                    </div>
                    <code className="text-xs break-all font-mono">{extractedKey}</code>
                  </div>
                )}
                <p className="text-xs text-gray-400">证书码包含混淆的AES-256密钥，用于加解密附加内容</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">附加内容</span>
                  <Button size="sm" variant="flat" color="primary" startContent={<HiLockClosed className="w-4 h-4" />} onPress={handleEncrypt} isLoading={encrypting} isDisabled={!form.certificate || !form.content}>
                    加密预览
                  </Button>
                </div>
                <Textarea
                  value={form.content}
                  onChange={(e) => { setForm({ ...form, content: e.target.value }); setEncryptedPreview('') }}
                  placeholder="输入需要加密存储的附加内容"
                  minRows={3}
                  maxRows={6}
                  size="sm"
                  variant="bordered"
                />
              </div>
              {encryptedPreview && (
                <div className="space-y-2">
                  <span className="text-sm text-gray-500">加密后数据预览</span>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded p-3">
                    <code className="text-xs break-all">{encryptedPreview}</code>
                  </div>
                </div>
              )}
              <Input
                label="备注"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                size="sm"
                variant="bordered"
              />
              <Input
                label="最大使用次数"
                type="number"
                value={form.max_use.toString()}
                onChange={(e) => setForm({ ...form, max_use: parseInt(e.target.value) || 0 })}
                description="0 表示不限制"
                size="sm"
                variant="bordered"
              />
              <Input
                label="绑定特征码"
                value={form.bind_feature}
                onChange={(e) => setForm({ ...form, bind_feature: e.target.value })}
                description="留空表示不绑定设备"
                size="sm"
                variant="bordered"
              />
              <div className="space-y-2">
                <DatePicker
                  label="过期时间"
                  value={form.expire_at}
                  onChange={(date) => setForm({ ...form, expire_at: date })}
                  description="留空表示永不过期"
                  granularity="second"
                  hourCycle={24}
                  hideTimeZone
                  size="sm"
                />
                <Button size="sm" variant="flat" onPress={() => setForm({ ...form, expire_at: currentCalendarDateTime() })}>设为当前时间</Button>
              </div>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* 删除确认 */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} placement="center">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定要删除证书 "{deleteConfirm?.name}" 吗？</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="danger" onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
