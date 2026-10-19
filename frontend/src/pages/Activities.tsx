import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, Button, Chip, Spinner, Pagination, Drawer, DrawerContent, DrawerHeader, DrawerBody, Input, Textarea, Select, SelectItem, Tabs, Tab } from '@heroui/react'
import { HiPlus, HiPencil, HiTrash, HiUsers, HiPlay, HiLink, HiSearch, HiKey } from 'react-icons/hi'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'

interface Activity {
  id: number
  title: string
  type: number
  description: string
  cover: string
  start_at: string | null
  end_at: string | null
  draw_at: string | null
  max_join: number
  status: number
  created_at: string
}

const typeMap: Record<number, { label: string; color: 'primary' | 'secondary' | 'success' }> = {
  1: { label: '🎡 转盘抽奖', color: 'primary' },
  2: { label: '⏰ 定时抽奖', color: 'secondary' },
  3: { label: '🎁 发放卡号', color: 'success' },
}

export default function Activities() {
  const navigate = useNavigate()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 10

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', type: '1', description: '' })
  const [activityCode, setActivityCode] = useState('')

  // 活动用户管理
  const [actUsers, setActUsers] = useState<{ id: number; username: string; created_at: string }[]>([])
  const [actUserLoading, setActUserLoading] = useState(false)
  const [actUserPage, setActUserPage] = useState(1)
  const [actUserTotal, setActUserTotal] = useState(0)
  const [actUserKeyword, setActUserKeyword] = useState('')
  const actUserPageSize = 15
  const [showRecords, setShowRecords] = useState(false)
  const [recordsUser, setRecordsUser] = useState<{ id: number; username: string } | null>(null)
  const [userRecords, setUserRecords] = useState<{ id: number; prize_name: string; prize_content: string; status: number; created_at: string; activity?: { title: string } }[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsPage, setRecordsPage] = useState(1)
  const recordsPageSize = 10

  useEffect(() => { fetchActivities(); fetchProfile() }, [page])

  const fetchProfile = async () => {
    try {
      const res: any = await userApi.getProfile()
      setActivityCode(res.data?.activity_code || '')
    } catch {}
  }

  const fetchActUsers = async () => {
    setActUserLoading(true)
    try {
      const res: any = await userApi.listActivityUsers(actUserPage, actUserPageSize, actUserKeyword || undefined)
      setActUsers(res.data?.list || [])
      setActUserTotal(res.data?.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setActUserLoading(false) }
  }

  const handleDeleteActUser = async (u: { id: number; username: string }) => {
    if (!await confirm(`确定要删除用户「${u.username}」吗？`, '删除确认')) return
    try { await userApi.deleteActivityUser(u.id); toast.success('删除成功'); fetchActUsers() }
    catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleResetActUserPwd = async (u: { id: number; username: string }) => {
    if (!await confirm(`确定要将「${u.username}」的密码重置为 123456 吗？`, '重置密码')) return
    try { await userApi.resetActivityUserPassword(u.id, '123456'); toast.success('密码已重置为 123456') }
    catch (e: any) { toast.error(e.message || '重置失败') }
  }

  const handleViewRecords = async (u: { id: number; username: string }) => {
    setRecordsUser(u)
    setShowRecords(true)
    setRecordsLoading(true)
    setRecordsPage(1)
    try {
      const res: any = await userApi.getActivityUserRecords(u.id)
      setUserRecords(res.data || [])
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setRecordsLoading(false) }
  }

  const fetchActivities = async () => {
    setLoading(true)
    try {
      const res: any = await userApi.listActivities(page, pageSize)
      setActivities(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '获取失败') }
    finally { setLoading(false) }
  }

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error('请填写标题'); return }
    setCreating(true)
    try {
      const res: any = await userApi.createActivity({
        title: form.title, type: parseInt(form.type), description: form.description, status: 1,
      })
      toast.success('创建成功')
      setShowCreate(false)
      setForm({ title: '', type: '1', description: '' })
      navigate(`/activities/${res.data.id}`)
    } catch (e: any) { toast.error(e.message || '创建失败') }
    finally { setCreating(false) }
  }

  const handleDelete = async (a: Activity) => {
    if (!await confirm(`确定要删除活动「${a.title}」吗？`, '删除确认')) return
    try { await userApi.deleteActivity(a.id); toast.success('删除成功'); fetchActivities() }
    catch (e: any) { toast.error(e.message || '删除失败') }
  }

  const handleManualDraw = async (a: Activity) => {
    if (!await confirm(`确定要手动开奖「${a.title}」吗？`, '开奖确认')) return
    try { await userApi.manualDraw(a.id); toast.success('开奖成功'); fetchActivities() }
    catch (e: any) { toast.error(e.message || '开奖失败') }
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('zh-CN') : '-'

  const copyLink = (a: Activity) => {
    const chParam = activityCode ? `?ch=${activityCode}` : ''
    navigator.clipboard.writeText(`${window.location.origin}/activity/${a.id}${chParam}`)
    toast.success('链接已复制')
  }

  const getStatus = (a: Activity) => {
    if (a.status === 0) return { label: '已禁用', color: 'default' as const }
    if (a.type === 2 && a.status === 2) return { label: '已开奖', color: 'default' as const }
    const now = new Date()
    if (a.start_at && new Date(a.start_at) > now) return { label: '未开始', color: 'warning' as const }
    if (a.end_at && new Date(a.end_at) < now) return { label: '已结束', color: 'default' as const }
    return { label: '进行中', color: 'success' as const }
  }

  return (
    <div>
      <Tabs aria-label="活动管理" onSelectionChange={(key) => {
        if (key === 'users') fetchActUsers()
      }}>
        <Tab key="activities" title="活动管理">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {activityCode && (
                <Button size="sm" variant="flat" startContent={<HiLink />} onPress={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/activity?ch=${activityCode}`)
                  toast.success('活动中心链接已复制')
                }}>
                  复制活动中心链接
                </Button>
              )}
              <Button size="sm" color="primary" startContent={<HiPlus />} onPress={() => setShowCreate(true)}>创建活动</Button>
            </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : activities.length === 0 ? (
        <Card><CardBody className="py-12 text-center text-gray-500"><p>暂无活动</p></CardBody></Card>
      ) : (
        <>
          <div className="grid gap-4">
            {activities.map(a => {
              const st = getStatus(a)
              return (
                <Card key={a.id} className="hover:shadow-2xl transition-all duration-200 border border-transparent">
                  <CardBody className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Chip size="sm" color={typeMap[a.type]?.color} variant="flat">{typeMap[a.type]?.label}</Chip>
                          <Chip size="sm" color={st.color} variant="flat">{st.label}</Chip>
                        </div>
                        <h3 className="font-medium text-lg mb-1">{a.title}</h3>
                        <div className="text-sm text-gray-500 space-y-1">
                          {a.type === 2 ? (
                            <p>开始: {fmt(a.start_at)} | 开奖: {fmt(a.draw_at)}</p>
                          ) : (
                            <p>开始: {fmt(a.start_at)} | 结束: {fmt(a.end_at)}</p>
                          )}
                          <p>参与限制: {a.max_join === -1 ? '无限制' : `${a.max_join}次`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="flat" startContent={<HiLink className="w-4 h-4" />} onPress={() => copyLink(a)}>链接</Button>
                        <Button size="sm" variant="flat" startContent={<HiUsers className="w-4 h-4" />} onPress={() => navigate(`/activities/${a.id}/records`)}>记录</Button>
                        {a.type === 2 && a.status === 1 && (
                          <Button size="sm" variant="flat" color="warning" startContent={<HiPlay className="w-4 h-4" />} onPress={() => handleManualDraw(a)}>开奖</Button>
                        )}
                        <Button size="sm" variant="flat" startContent={<HiPencil className="w-4 h-4" />} onPress={() => navigate(`/activities/${a.id}`)}>编辑</Button>
                        <Button size="sm" variant="flat" color="danger" startContent={<HiTrash className="w-4 h-4" />} onPress={() => handleDelete(a)}>删除</Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
          {total > pageSize && <div className="flex justify-center"><Pagination total={Math.ceil(total / pageSize)} page={page} onChange={setPage} /></div>}
        </>
      )}
          </div>
        </Tab>
        <Tab key="users" title="活动用户">
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Input size="sm" placeholder="搜索用户名" value={actUserKeyword}
                onChange={(e) => setActUserKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setActUserPage(1); fetchActUsers() } }}
                startContent={<HiSearch className="text-gray-400" />}
                className="max-w-xs" />
              <Button size="sm" color="primary" onPress={() => { setActUserPage(1); fetchActUsers() }}>搜索</Button>
            </div>
            {actUserLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : actUsers.length === 0 ? (
              <Card><CardBody className="py-12 text-center text-gray-500"><p>暂无活动用户</p></CardBody></Card>
            ) : (
              <>
                <div className="grid gap-2">
                  {actUsers.map(u => (
                    <Card key={u.id} className="w-full">
                      <CardBody className="px-4 py-3 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{u.username}</p>
                            <p className="text-xs text-gray-400">{new Date(u.created_at).toLocaleString('zh-CN')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="light" startContent={<HiUsers className="w-3.5 h-3.5" />} onPress={() => handleViewRecords(u)}>记录</Button>
                          <Button size="sm" variant="light" startContent={<HiKey className="w-3.5 h-3.5" />} onPress={() => handleResetActUserPwd(u)}>重置密码</Button>
                          <Button size="sm" variant="light" color="danger" startContent={<HiTrash className="w-3.5 h-3.5" />} onPress={() => handleDeleteActUser(u)}>删除</Button>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
                {actUserTotal > actUserPageSize && (
                  <div className="flex justify-center">
                    <Pagination total={Math.ceil(actUserTotal / actUserPageSize)} page={actUserPage} onChange={(p) => { setActUserPage(p); setTimeout(fetchActUsers, 0) }} />
                  </div>
                )}
              </>
            )}
          </div>
        </Tab>
      </Tabs>

      <Drawer isOpen={showCreate} onClose={() => setShowCreate(false)} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">创建活动</span>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" onPress={() => setShowCreate(false)}>取消</Button>
              <Button size="sm" color="primary" onPress={handleCreate} isLoading={creating}>创建</Button>
            </div>
          </DrawerHeader>
          <DrawerBody className="px-6 py-6">
            <div className="space-y-4">
              <Input label="活动标题" size="sm" variant="bordered" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Select label="活动类型" size="sm" variant="bordered" selectedKeys={[form.type]} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <SelectItem key="1">🎡 转盘抽奖</SelectItem>
                <SelectItem key="2">⏰ 定时抽奖</SelectItem>
                <SelectItem key="3">🎁 发放卡号</SelectItem>
              </Select>
              <Textarea label="活动描述" placeholder="支持Markdown" size="sm" variant="bordered" minRows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer isOpen={showRecords} onClose={() => setShowRecords(false)} placement="right" size="md" hideCloseButton className="rounded-none">
        <DrawerContent>
          <DrawerHeader className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <span className="text-lg font-semibold">{recordsUser?.username} 的参与记录</span>
            <Button size="sm" variant="flat" onPress={() => setShowRecords(false)}>关闭</Button>
          </DrawerHeader>
          <DrawerBody className="px-6 py-4">
            {recordsLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : userRecords.length === 0 ? (
              <p className="text-center text-gray-400 py-12">暂无参与记录</p>
            ) : (
              <>
              <div className="space-y-3">
                {userRecords.slice((recordsPage - 1) * recordsPageSize, recordsPage * recordsPageSize).map(r => (
                  <div key={r.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{r.activity?.title || '未知活动'}</span>
                        <Chip size="sm" color={r.status === 2 ? 'success' : r.status === 3 ? 'default' : 'warning'} variant="flat">
                          {r.status === 2 ? '已中奖' : r.status === 3 ? '未中奖' : '已参与'}
                        </Chip>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <p className="font-medium text-sm">{r.prize_name}</p>
                    {r.status === 2 && r.prize_content && (
                      <code className="text-xs font-mono text-primary">{r.prize_content}</code>
                    )}
                  </div>
                ))}
              </div>
              {userRecords.length > recordsPageSize && (
                <div className="flex justify-center mt-4">
                  <Pagination total={Math.ceil(userRecords.length / recordsPageSize)} page={recordsPage} onChange={setRecordsPage} />
                </div>
              )}
            </>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
