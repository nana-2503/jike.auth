import { useState, useEffect } from 'react'
import {
  Avatar, Button, Card, CardBody, Chip, Drawer, DrawerBody, DrawerContent, DrawerHeader,
  Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input,
  Pagination, Progress, Spinner, Tooltip, useDisclosure,
} from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'
import { RBtn } from '../../components/ResponsiveButton'
import { avatarOrDefault } from '../../utils/avatar'
import { HiClipboard, HiDesktopComputer, HiDotsVertical, HiKey, HiPencil, HiPlus, HiRefresh, HiSave, HiSearch, HiSpeakerphone, HiStatusOnline, HiTrash } from 'react-icons/hi'
import AppEditContent from '../AppEditContent'
import AppAnnouncementDrawer from '../AppAnnouncementDrawer'

type CustomField = { key: string; value: string }

const parseCustomFields = (fields: any): CustomField[] => {
  if (!fields) return []
  if (Array.isArray(fields)) return fields.map((item) => ({ key: item.key || '', value: item.value || '' }))
  try {
    const parsed = typeof fields === 'string' ? JSON.parse(fields) : fields
    return Object.entries(parsed || {}).map(([key, value]) => ({ key, value: String(value ?? '') }))
  } catch {
    return []
  }
}

const CUSTOM_FIELDS_PAGE_SIZE = 15

interface User { id: number; username: string; nickname: string; avatar: string }
interface App {
  id: number; user_id: number; user?: User; app_name: string; app_key: string; app_code: string; app_secret: string
  description: string; login_mode: number; billing_mode: number; heartbeat: number; crypto_mode: string
  sign_algo: string; server_sign_algo: string; custom_fields?: string | Record<string, string> | CustomField[]
  bind_device: number; channel_mode: number; reg_mode: number; reg_limit: number; status: number; created_at: string
  user_count: number; online_count: number; online_client_count: number
}

const LOGIN_MODE_MAP: Record<number, string> = { 1: '账号登录', 2: '卡密登录', 3: '账号+卡密' }
const BILLING_MODE_MAP: Record<number, string> = { 1: '免费', 2: '计时', 3: '计点' }
const CHANNEL_MODE_MAP: Record<number, string> = { 1: '单绑定', 2: '总通道' }
const REG_MODE_MAP: Record<number, string> = { 1: '关闭注册', 2: '开放(无限制)', 3: '开放(需充值卡)', 4: '开放(限次数)' }

const maskString = (str: string, showLen = 8) => {
  if (!str || str.length <= showLen * 2) return str
  return str.slice(0, showLen) + '*****' + str.slice(-showLen)
}

export default function AdminApps() {
  const [apps, setApps] = useState<App[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const [selectedApp, setSelectedApp] = useState<App | null>(null)
  const [editingAppId, setEditingAppId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [announcementAppId, setAnnouncementAppId] = useState<number | null>(null)
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false)
  const [customFieldsSaving, setCustomFieldsSaving] = useState(false)
  const [customFieldsApp, setCustomFieldsApp] = useState<App | null>(null)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [customFieldsPage, setCustomFieldsPage] = useState(1)

  const fetchApps = async () => {
    setLoading(true)
    try {
      const res: any = await adminApi.listApps(page, 12, keyword || undefined)
      setApps(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchApps() }, [page])
  const handleSearch = () => { setPage(1); fetchApps() }

  const handleSave = async () => {
    const formData = (window as any).__appEditFormData
    if (!formData) return
    if (!formData.app_name.trim()) { toast.error('请输入APP名称'); return }
    setSaving(true)
    try {
      await adminApi.updateApp(editingAppId!, formData)
      toast.success('保存成功')
      onEditClose()
      fetchApps()
    } catch (e: any) { toast.error(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这个APP吗？')) return
    try { await adminApi.deleteApp(id); toast.success('删除成功'); fetchApps() }
    catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleResetSecret = async (id: number) => {
    if (!await confirm('确定要重置 AppSecret 吗？重置后旧密钥将失效，所有使用该密钥的客户端需要更新。')) return
    try { await adminApi.resetAppSecret(id); toast.success('AppSecret 已重置'); fetchApps() }
    catch (e: any) { toast.error(e.message || '重置失败') }
  }

  const handleToggleStatus = async (app: App) => {
    try { await adminApi.updateApp(app.id, { status: app.status === 1 ? 0 : 1 }); toast.success('状态更新成功'); fetchApps() }
    catch (e: any) { toast.error(e.message || '更新失败') }
  }

  const showDetail = (app: App) => { setSelectedApp(app); onDetailOpen() }
  const handleEdit = (id: number) => { setEditingAppId(id); onEditOpen() }
  const copyToClipboard = (text: string, label: string) => { navigator.clipboard.writeText(text); toast.success(`${label}已复制`) }
  const ownerName = (app: App) => app.user?.nickname || app.user?.username || '未知用户'

  const openCustomFields = (app: App) => {
    setCustomFieldsApp(app)
    setCustomFields(parseCustomFields(app.custom_fields))
    setCustomFieldsPage(1)
    setCustomFieldsOpen(true)
  }
  const updateCustomField = (index: number, patch: Partial<CustomField>) => setCustomFields(customFields.map((field, i) => i === index ? { ...field, ...patch } : field))
  const removeCustomField = (index: number) => setCustomFields(customFields.filter((_, i) => i !== index))
  const saveCustomFields = async () => {
    if (!customFieldsApp) return
    setCustomFieldsSaving(true)
    try {
      await adminApi.updateApp(customFieldsApp.id, { custom_fields: customFields })
      toast.success('自定义字段已保存')
      setCustomFieldsOpen(false)
      fetchApps()
    } catch (e: any) { toast.error(e.message || '保存失败') }
    finally { setCustomFieldsSaving(false) }
  }
  const customFieldsTotalPages = Math.max(1, Math.ceil(customFields.length / CUSTOM_FIELDS_PAGE_SIZE))
  const customFieldsPageItems = customFields.slice((customFieldsPage - 1) * CUSTOM_FIELDS_PAGE_SIZE, customFieldsPage * CUSTOM_FIELDS_PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Input placeholder="搜索APP名称或Key" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="flex-1 sm:w-48 md:w-64" size="sm" startContent={<HiSearch className="w-4 h-4 text-gray-400" />} />
        <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : apps.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500"><p>暂无APP数据</p></CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {apps.map((app) => {
            const onlineRate = app.user_count > 0 ? Math.round((app.online_count / app.user_count) * 100) : 0
            return (
              <Card key={app.id} className="hover:shadow-2xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 border border-transparent">
                <CardBody className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => showDetail(app)}>
                      <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 ring-1 ring-primary/10">
                        <span className="text-primary font-semibold text-lg">{app.app_name.charAt(0).toUpperCase()}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold truncate leading-5">{app.app_name}</span>
                        <span className="mt-1 flex gap-1 flex-wrap">
                          <Chip color={app.status === 1 ? 'success' : 'danger'} size="sm" variant="flat">{app.status === 1 ? '正常' : '禁用'}</Chip>
                          <Chip size="sm" variant="flat" color="secondary">{LOGIN_MODE_MAP[app.login_mode] || '账号登录'}</Chip>
                        </span>
                      </span>
                    </button>
                    <Dropdown>
                      <DropdownTrigger><Button isIconOnly size="sm" variant="light" className="flex-shrink-0"><HiDotsVertical className="w-4 h-4" /></Button></DropdownTrigger>
                      <DropdownMenu aria-label="应用操作">
                        <DropdownItem key="detail" onPress={() => showDetail(app)}>查看详情</DropdownItem>
                        <DropdownItem key="status" onPress={() => handleToggleStatus(app)}>{app.status === 1 ? '禁用应用' : '启用应用'}</DropdownItem>
                        <DropdownItem key="code" description={app.app_code} onPress={() => copyToClipboard(app.app_code, 'AppCode')}>复制 AppCode</DropdownItem>
                        <DropdownItem key="key" description={maskString(app.app_key)} onPress={() => copyToClipboard(app.app_key, 'AppKey')}>复制 AppKey</DropdownItem>
                        <DropdownItem key="secret" description={maskString(app.app_secret)} onPress={() => copyToClipboard(app.app_secret, 'AppSecret')}>复制 AppSecret</DropdownItem>
                        {app.sign_algo ? <DropdownItem key="sign" description={maskString(app.sign_algo, 6)} onPress={() => copyToClipboard(app.sign_algo, '客户端签名算法')}>复制 客户端签名</DropdownItem> : null}
                        {app.server_sign_algo ? <DropdownItem key="ssign" description={maskString(app.server_sign_algo, 6)} onPress={() => copyToClipboard(app.server_sign_algo, '服务端签名算法')}>复制 服务端签名</DropdownItem> : null}
                      </DropdownMenu>
                    </Dropdown>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-gray-50/80 dark:bg-content2 px-2.5 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <Avatar size="sm" src={avatarOrDefault(app.user?.avatar)} name={ownerName(app)} className="w-7 h-7" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">所属作者</p>
                      <p className="text-sm font-medium truncate">{ownerName(app)}</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 min-h-10">{app.description || '暂无描述'}</p>

                  <div className="bg-gray-50/80 dark:bg-content2 rounded-lg px-2.5 py-2 ring-1 ring-gray-100 dark:ring-gray-800">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[11px] text-gray-400"><HiStatusOnline className="w-3 h-3" />在线率</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">{app.online_count || 0} / {app.user_count || 0} · {onlineRate}%</span>
                    </div>
                    <Progress value={onlineRate} size="sm" color={onlineRate > 0 ? 'success' : 'default'} aria-label={`${app.app_name} 用户在线率`} />
                    <div className="mt-1.5 flex items-center justify-end gap-1 text-[11px] text-gray-400">
                      <HiDesktopComputer className="w-3 h-3" />
                      <span>{app.online_client_count || 0} 个客户端在线</span>
                    </div>
                  </div>

                  <div className="bg-gray-50/80 dark:bg-content2 rounded-lg px-2.5 py-1.5 ring-1 ring-gray-100 dark:ring-gray-800">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-gray-400 flex-shrink-0">创建时间</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{new Date(app.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <div className="flex gap-1.5 rbtn-group">
                      <RBtn icon={<HiSpeakerphone className="w-4 h-4" />} label="公告" variant="flat" color="secondary" onPress={() => { setAnnouncementAppId(app.id); setAnnouncementOpen(true) }} />
                      <RBtn icon={<HiKey className="w-4 h-4" />} label="字段" variant="flat" color="success" onPress={() => openCustomFields(app)} />
                      <RBtn icon={<HiPencil className="w-4 h-4" />} label="编辑" variant="flat" color="primary" onPress={() => handleEdit(app.id)} />
                      <RBtn icon={<HiRefresh className="w-4 h-4" />} label="重置密钥" variant="flat" color="warning" onPress={() => handleResetSecret(app.id)} />
                      <RBtn icon={<HiTrash className="w-4 h-4" />} label="删除" variant="flat" color="danger" onPress={() => handleDelete(app.id)} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {total > 12 && <div className="flex justify-center mt-6"><Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} /></div>}

      <Drawer isOpen={isDetailOpen} onClose={onDetailClose} size="xl" placement="right" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>应用详情</span>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onDetailClose} size="sm">关闭</Button>
              <Button color="primary" onPress={() => { onDetailClose(); handleEdit(selectedApp!.id) }} size="sm">编辑</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            {selectedApp && (
              <div className="space-y-5 py-5">
                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-content2 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 ring-1 ring-primary/10">
                      <span className="text-primary font-semibold text-xl">{selectedApp.app_name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold truncate">{selectedApp.app_name}</h3>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{selectedApp.description || '暂无描述'}</p>
                        </div>
                        <Chip color={selectedApp.status === 1 ? 'success' : 'danger'} size="sm" variant="flat" className="flex-shrink-0">{selectedApp.status === 1 ? '正常' : '禁用'}</Chip>
                      </div>
                      <div className="mt-3 flex gap-1.5 flex-wrap">
                        <Chip size="sm" color="secondary" variant="flat">{LOGIN_MODE_MAP[selectedApp.login_mode]}</Chip>
                        <Chip size="sm" variant="flat">{BILLING_MODE_MAP[selectedApp.billing_mode]}</Chip>
                        <Chip size="sm" variant="flat">{CHANNEL_MODE_MAP[selectedApp.channel_mode]}</Chip>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800 flex items-center gap-2">
                  <Avatar size="sm" src={avatarOrDefault(selectedApp.user?.avatar)} name={ownerName(selectedApp)} />
                  <div><span className="text-xs text-gray-400">所属作者</span><p className="font-medium">{ownerName(selectedApp)}</p></div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ['心跳周期', `${selectedApp.heartbeat}秒`], ['通讯加密', selectedApp.crypto_mode || 'aes-256-cbc'], ['通道模式', CHANNEL_MODE_MAP[selectedApp.channel_mode]],
                    ['注册模式', REG_MODE_MAP[selectedApp.reg_mode]], ['绑定设备', selectedApp.bind_device ? '是' : '否'],
                    ...(selectedApp.reg_mode === 4 ? [['注册限制次数', `${selectedApp.reg_limit}次`]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                      <span className="text-xs text-gray-400">{label}</span>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">密钥信息</p>
                  {[
                    ['AppCode', selectedApp.app_code], ['AppKey', selectedApp.app_key], ['AppSecret', selectedApp.app_secret],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800">
                      <div className="flex justify-between items-center mb-1"><span className="text-xs text-gray-400">{label}</span><Button size="sm" variant="light" onPress={() => copyToClipboard(value, label)}>复制</Button></div>
                      <p className="font-mono text-sm break-all">{value}</p>
                    </div>
                  ))}
                  {selectedApp.sign_algo && <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800"><div className="flex justify-between items-center mb-1"><span className="text-xs text-gray-400">客户端签名算法</span><Button size="sm" variant="light" onPress={() => copyToClipboard(selectedApp.sign_algo, '客户端签名算法')}>复制</Button></div><p className="font-mono text-xs break-all">{selectedApp.sign_algo}</p></div>}
                  {selectedApp.server_sign_algo && <div className="rounded-xl bg-gray-50/80 dark:bg-content2 p-3 ring-1 ring-gray-100 dark:ring-gray-800"><div className="flex justify-between items-center mb-1"><span className="text-xs text-gray-400">服务端签名算法</span><Button size="sm" variant="light" onPress={() => copyToClipboard(selectedApp.server_sign_algo, '服务端签名算法')}>复制</Button></div><p className="font-mono text-xs break-all">{selectedApp.server_sign_algo}</p></div>}
                </div>
                <div className="text-xs text-gray-400 text-right">创建于 {new Date(selectedApp.created_at).toLocaleString()}</div>
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer isOpen={isEditOpen} onClose={onEditClose} size="xl" placement="right" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <span>编辑应用</span>
            <div className="flex gap-2">
              <Button variant="flat" onPress={onEditClose} size="sm">取消</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />} size="sm">保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-gray-800 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
            <AppEditContent appId={editingAppId} onSuccess={() => { onEditClose(); fetchApps() }} onCancel={onEditClose} onSave={handleSave} saving={saving} api={adminApi} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <AppAnnouncementDrawer isOpen={announcementOpen} onClose={() => setAnnouncementOpen(false)} appId={announcementAppId} api={adminApi} />

      <Drawer isOpen={customFieldsOpen} onClose={() => setCustomFieldsOpen(false)} size="lg" placement="right" hideCloseButton>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
            <div><div className="text-base font-semibold">自定义字段</div><div className="text-xs text-gray-500 mt-1">{customFieldsApp?.app_name || ''}</div></div>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" color="primary" startContent={<HiPlus className="w-4 h-4" />} onPress={() => { const next = [...customFields, { key: '', value: '' }]; setCustomFields(next); setCustomFieldsPage(Math.ceil(next.length / CUSTOM_FIELDS_PAGE_SIZE)) }}>添加字段</Button>
              <Button size="sm" color="primary" onPress={saveCustomFields} isLoading={customFieldsSaving}>保存</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="py-5 overflow-y-auto">
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              {customFields.length === 0 ? <div className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-4">暂无自定义字段，点击右上角添加。</div> : (
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500"><tr><th className="w-14 px-3 py-2 text-left font-medium whitespace-nowrap">序号</th><th className="w-[35%] px-2 py-2 text-left font-medium whitespace-nowrap">字段名</th><th className="px-2 py-2 text-left font-medium whitespace-nowrap">字段值</th><th className="w-12 px-2 py-2 text-right font-medium whitespace-nowrap">操作</th></tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {customFieldsPageItems.map((field, index) => { const realIndex = (customFieldsPage - 1) * CUSTOM_FIELDS_PAGE_SIZE + index; return (
                      <tr key={realIndex}>
                        <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">#{realIndex + 1}</td>
                        <td className="px-2 py-1.5"><Input aria-label="字段名" size="sm" variant="bordered" value={field.key} onChange={(e) => updateCustomField(realIndex, { key: e.target.value })} placeholder="如 salt" /></td>
                        <td className="px-2 py-1.5"><Input aria-label="字段值" size="sm" variant="bordered" value={field.value} onChange={(e) => updateCustomField(realIndex, { value: e.target.value })} placeholder="字段值" /></td>
                        <td className="px-2 py-1.5 text-right"><Button isIconOnly size="sm" variant="light" color="danger" onPress={() => removeCustomField(realIndex)}><HiTrash className="w-4 h-4" /></Button></td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              )}
            </div>
            {customFields.length > CUSTOM_FIELDS_PAGE_SIZE && <div className="flex justify-center"><Pagination total={customFieldsTotalPages} page={customFieldsPage} onChange={setCustomFieldsPage} size="sm" /></div>}
            <div className="text-xs text-gray-500 leading-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">JS 读取：ctx.custom_fields.字段名。步骤组合 key 读取：custom_fields.字段名、custom.字段名 或 custom:字段名。</div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
