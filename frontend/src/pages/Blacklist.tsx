import { useState, useEffect } from 'react'
import {
  Card, CardBody, Button, Chip, Pagination, Spinner,
  Input, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
  Checkbox, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DatePicker,
} from '@heroui/react'
import { getLocalTimeZone, parseAbsoluteToLocal } from '@internationalized/date'
import { currentCalendarDateTime } from '../utils/datePicker'

/** DatePicker 在本地时间粒度下常为 CalendarDateTime；parseAbsoluteToLocal 得到 ZonedDateTime。仅后者有 toAbsoluteString。 */
function expireDateValueToApiString(v: unknown): string | undefined {
  if (v == null) return undefined
  const d = v as { toAbsoluteString?: () => string; toDate?: (tz: string) => Date }
  if (typeof d.toAbsoluteString === 'function') {
    return d.toAbsoluteString()
  }
  if (typeof d.toDate === 'function') {
    return d.toDate(getLocalTimeZone()).toISOString()
  }
  return undefined
}
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiTrash, HiPlus, HiSearch, HiDotsVertical, HiPencil } from 'react-icons/hi'

interface BlacklistItem {
  id: number
  app_id: number
  type: number
  value: string
  remark: string
  expire_at: string | null
  created_at: string
  app?: { id: number; app_name: string }
}

interface App {
  id: number
  app_name: string
}

const TYPE_MAP: Record<number, { label: string; color: 'danger' | 'warning' }> = {
  1: { label: 'IP', color: 'danger' },
  2: { label: '特征码', color: 'warning' },
}

export default function Blacklist() {
  const [items, setItems] = useState<BlacklistItem[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number>(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [appsLoading, setAppsLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const { isOpen, onOpen, onClose } = useDisclosure()
  const [editItem, setEditItem] = useState<BlacklistItem | null>(null)
  const [formAppId, setFormAppId] = useState<string>('')
  const [formType, setFormType] = useState<string>('1')
  const [formValue, setFormValue] = useState('')
  const [formRemark, setFormRemark] = useState('')
  const [formExpireAt, setFormExpireAt] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAppsLoading(true)
    userApi.listApps(1, 100).then((res: any) => {
      setApps(res.data.list || [])
    }).finally(() => setAppsLoading(false))
  }, [])

  const fetchList = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (selectedAppId) params.app_id = selectedAppId
      if (filterType) params.type = Number(filterType)
      if (keyword) params.keyword = keyword
      const res: any = await userApi.listBlacklist(page, 12, params)
      setItems(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchList() }, [page, selectedAppId, filterType])
  const handleSearch = () => { setPage(1); fetchList() }

  const handleDelete = async (id: number) => {
    if (!await confirm('确定要删除这条黑名单记录吗？')) return
    try {
      await userApi.deleteBlacklist(id)
      toast.success('删除成功')
      fetchList()
    } catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) { toast.error('请先选择记录'); return }
    if (!await confirm(`确定要删除选中的 ${selectedIds.length} 条记录吗？`)) return
    try {
      await userApi.batchDeleteBlacklist(selectedIds)
      toast.success('批量删除成功')
      setSelectedIds([])
      fetchList()
    } catch (e: any) { toast.error(e.message || '批量删除失败') }
  }

  const openCreate = () => {
    setEditItem(null)
    setFormAppId(selectedAppId ? String(selectedAppId) : '')
    setFormType('1')
    setFormValue('')
    setFormRemark('')
    setFormExpireAt(null)
    onOpen()
  }

  const openEdit = (item: BlacklistItem) => {
    setEditItem(item)
    setFormAppId(String(item.app_id))
    setFormType(String(item.type))
    setFormValue(item.value)
    setFormRemark(item.remark || '')
    setFormExpireAt(item.expire_at ? parseAbsoluteToLocal(item.expire_at) : null)
    onOpen()
  }

  const handleSave = async () => {
    if (!editItem && !formAppId) { toast.error('请选择应用'); return }
    if (!formValue.trim()) { toast.error('请输入封禁值'); return }
    setSaving(true)
    try {
      const expireAtStr = expireDateValueToApiString(formExpireAt)
      if (editItem) {
        await userApi.updateBlacklist(editItem.id, {
          value: formValue,
          remark: formRemark,
          expire_at: expireAtStr,
        })
        toast.success('更新成功')
      } else {
        await userApi.createBlacklist({
          app_id: Number(formAppId),
          type: Number(formType),
          value: formValue,
          remark: formRemark,
          expire_at: expireAtStr,
        })
        toast.success('添加成功')
      }
      onClose()
      fetchList()
    } catch (e: any) { toast.error(e.message || '保存失败') }
    finally { setSaving(false) }
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? items.map(i => i.id) : [])
  }

  const handleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds(checked ? [...selectedIds, id] : selectedIds.filter(i => i !== id))
  }

  const isExpired = (expireAt: string | null) => {
    if (!expireAt) return false
    return new Date(expireAt) < new Date()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部筛选栏 */}
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto_auto] gap-2 items-center sm:grid-cols-[10rem_minmax(0,12rem)_7rem_auto_auto] lg:grid-cols-[10rem_12rem_7rem_auto_1fr_auto_auto]">
        {/* 应用选择下拉框 */}
        <Select 
          placeholder="选择应用" 
          selectedKeys={[String(selectedAppId)]}
          onChange={(e) => { setSelectedAppId(Number(e.target.value)); setPage(1) }}
          size="sm"
          isLoading={appsLoading}
        >
          <SelectItem key="0">全部应用</SelectItem>
          {apps.map(app => (
            <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
          ))}
        </Select>
        <Input placeholder="搜索IP/特征码/备注" value={keyword} onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          startContent={<HiSearch className="w-4 h-4 text-gray-400" />} className="col-span-4 row-start-2 sm:col-span-1 sm:row-start-1" size="sm" />
        <Select placeholder="类型" selectedKeys={filterType ? [filterType] : []}
          onChange={(e) => { setFilterType(e.target.value); setPage(1) }} size="sm">
          <SelectItem key="1">IP</SelectItem>
          <SelectItem key="2">特征码</SelectItem>
        </Select>
        <Button color="primary" size="sm" onPress={handleSearch}>搜索</Button>
        {selectedIds.length > 0 && (
          <div className="col-span-4 flex gap-2 items-center justify-end sm:col-span-5 lg:col-span-1">
            <span className="text-sm text-gray-500">已选 {selectedIds.length} 项</span>
            <Button color="danger" size="sm" variant="flat" startContent={<HiTrash className="w-4 h-4" />} onPress={handleBatchDelete}>删除</Button>
          </div>
        )}
        <Button color="primary" size="sm" startContent={<HiPlus className="w-4 h-4" />} onPress={openCreate} className="lg:col-start-7">添加</Button>
      </div>

      {/* 列表内容 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-gray-500">暂无黑名单记录</CardBody></Card>
      ) : (
        <>
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-left text-sm font-medium w-12">
                        <Checkbox isSelected={items.length > 0 && selectedIds.length === items.length}
                          isIndeterminate={selectedIds.length > 0 && selectedIds.length < items.length}
                          onValueChange={handleSelectAll} />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">封禁值</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">类型</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">应用</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">状态</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">备注</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">创建时间</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">过期时间</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${selectedIds.includes(item.id) ? 'bg-primary/5' : ''}`}>
                        <td className="px-4 py-3"><Checkbox isSelected={selectedIds.includes(item.id)} onValueChange={(checked) => handleSelectOne(item.id, checked)} /></td>
                        <td className="px-4 py-3 font-mono text-sm font-medium max-w-[260px] truncate" title={item.value}>{item.value}</td>
                        <td className="px-4 py-3"><Chip size="sm" variant="flat" color={TYPE_MAP[item.type]?.color || 'default'}>{TYPE_MAP[item.type]?.label || '未知'}</Chip></td>
                        <td className="px-4 py-3 text-sm">{item.app?.app_name || '-'}</td>
                        <td className="px-4 py-3"><Chip size="sm" variant="flat" color={isExpired(item.expire_at) ? 'default' : 'success'}>{isExpired(item.expire_at) ? '已过期' : '生效中'}</Chip></td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-[220px] truncate" title={item.remark || ''}>{item.remark || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(item.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.expire_at ? new Date(item.expire_at).toLocaleString() : '永久'}</td>
                        <td className="px-4 py-3">
                          <Dropdown>
                            <DropdownTrigger><Button isIconOnly size="sm" variant="light"><HiDotsVertical className="w-5 h-5" /></Button></DropdownTrigger>
                            <DropdownMenu>
                              <DropdownItem key="edit" startContent={<HiPencil className="w-4 h-4" />} onPress={() => openEdit(item)}>编辑</DropdownItem>
                              <DropdownItem key="delete" className="text-danger" color="danger" startContent={<HiTrash className="w-4 h-4" />} onPress={() => handleDelete(item.id)}>删除</DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          {total > 12 && <div className="flex justify-center mt-4"><Pagination total={Math.ceil(total / 12)} page={page} onChange={setPage} /></div>}
        </>
      )}

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} placement="center">
        <ModalContent>
          <ModalHeader>{editItem ? '编辑黑名单' : '添加黑名单'}</ModalHeader>
          <ModalBody className="space-y-4">
            {!editItem && (
              <>
                <Select label="选择应用" selectedKeys={formAppId ? [formAppId] : []}
                  onChange={(e) => setFormAppId(e.target.value)} isRequired>
                  {apps.map(app => <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>)}
                </Select>
                <Select label="类型" selectedKeys={[formType]} onChange={(e) => setFormType(e.target.value)} isRequired>
                  <SelectItem key="1">IP</SelectItem>
                  <SelectItem key="2">特征码</SelectItem>
                </Select>
              </>
            )}
            <Input label={formType === '1' ? 'IP地址' : '特征码'} value={formValue}
              onChange={(e) => setFormValue(e.target.value)} isRequired
              placeholder={formType === '1' ? '如: 192.168.1.1' : '设备特征码'} />
            <Input label="备注" value={formRemark} onChange={(e) => setFormRemark(e.target.value)} placeholder="可选" />
            <div className="space-y-2">
              <DatePicker label="过期时间" value={formExpireAt} onChange={setFormExpireAt}
                granularity="second" hourCycle={24} hideTimeZone description="留空表示永久封禁" showMonthAndYearPickers />
              <Button size="sm" variant="flat" onPress={() => setFormExpireAt(currentCalendarDateTime())}>设为当前时间</Button>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
