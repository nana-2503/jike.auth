import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Input, Chip, Pagination, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, RadioGroup, Radio, Spinner, Checkbox } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiSearch } from 'react-icons/hi'

interface User {
  id: number
  username: string
  email: string
  nickname: string
  role: number
  status: number
  balance: number
  max_apps: number
  max_users: number
  max_card_types: number
  max_cards: number
  created_at: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ username: '', email: '', nickname: '', status: 1, role: 0, max_apps: -1, max_users: -1, max_card_types: -1, max_cards: -1 })
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; user: User | null }>({ show: false, user: null })
  const [rechargeModal, setRechargeModal] = useState<{ show: boolean; user: User | null }>({ show: false, user: null })
  const [rechargeAmount, setRechargeAmount] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res: any = await adminApi.listUsers(page, 20, keyword)
      setUsers(res.data.list || [])
      setTotal(res.data.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [page])

  const handleSearch = () => {
    setPage(1)
    loadUsers()
  }

  const handleEdit = (user: User) => {
    setEditUser(user)
    setEditForm({ 
      username: user.username,
      email: user.email,
      nickname: user.nickname, 
      status: user.status, 
      role: user.role,
      max_apps: user.max_apps ?? -1,
      max_users: user.max_users ?? -1,
      max_card_types: user.max_card_types ?? -1,
      max_cards: user.max_cards ?? -1,
    })
  }

  const handleSave = async () => {
    if (!editUser) return
    try {
      await adminApi.updateUser(editUser.id, {
        username: editForm.username,
        email: editForm.email,
        nickname: editForm.nickname,
        status: editForm.status,
        role: editForm.role,
        max_apps: editForm.max_apps,
        max_users: editForm.max_users,
        max_card_types: editForm.max_card_types,
        max_cards: editForm.max_cards,
      })
      toast.success('保存成功')
      setEditUser(null)
      loadUsers()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.user) return
    try {
      await adminApi.deleteUser(deleteConfirm.user.id)
      toast.success('删除成功')
      setDeleteConfirm({ show: false, user: null })
      loadUsers()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleRecharge = async () => {
    if (!rechargeModal.user || !rechargeAmount) return
    try {
      await adminApi.rechargeUser(rechargeModal.user.id, parseFloat(rechargeAmount))
      toast.success('充值成功')
      setRechargeModal({ show: false, user: null })
      setRechargeAmount('')
      loadUsers()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleSelectUser = (userId: number, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId])
    } else {
      setSelectedUsers(selectedUsers.filter(id => id !== userId))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(users.map(u => u.id))
    } else {
      setSelectedUsers([])
    }
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input 
          placeholder="搜索用户名/邮箱" 
          value={keyword} 
          onChange={(e) => setKeyword(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 md:max-w-xs" 
          size="sm"
          startContent={<HiSearch className="w-4 h-4 text-gray-400" />}
        />
        <Button onPress={handleSearch} size="sm" color="primary">搜索</Button>
      </div>

      {/* 移动端卡片列表 */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">暂无用户</div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1">
              <Checkbox 
                size="sm"
                isSelected={selectedUsers.length === users.length && users.length > 0}
                isIndeterminate={selectedUsers.length > 0 && selectedUsers.length < users.length}
                onValueChange={handleSelectAll}
              >
                全选
              </Checkbox>
            </div>
            {users.map((user) => (
              <Card key={user.id}>
                <CardBody className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        size="sm"
                        isSelected={selectedUsers.includes(user.id)}
                        onValueChange={(checked) => handleSelectUser(user.id, checked)}
                      />
                      <span className="text-xs text-gray-400">#{user.id}</span>
                      <span className="font-medium text-sm">{user.username}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Chip color={user.role === 1 ? 'primary' : 'default'} size="sm" classNames={{ base: 'h-5 text-xs', content: user.role === 1 ? 'px-1 text-white' : 'px-1' }}>
                        {user.role === 1 ? '管理员' : '作者'}
                      </Chip>
                      <Chip color={user.status === 1 ? 'success' : 'danger'} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1 text-white' }}>
                        {user.status === 1 ? '正常' : '禁用'}
                      </Chip>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{user.email}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">昵称: </span>
                      <span>{user.nickname || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">余额: </span>
                      <span className="text-primary font-medium">¥{user.balance?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">注册: </span>
                      <span>{new Date(user.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <Button size="sm" variant="flat" onPress={() => handleEdit(user)} className="flex-1 h-7 text-xs">编辑</Button>
                    <Button size="sm" color="success" variant="flat" onPress={() => { setRechargeModal({ show: true, user }); setRechargeAmount('') }} className="flex-1 h-7 text-xs">充值</Button>
                    <Button size="sm" color="danger" variant="flat" onPress={() => setDeleteConfirm({ show: true, user })} className="flex-1 h-7 text-xs">删除</Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* 桌面端表格 */}
      <Card className="hidden md:block">
        <CardBody className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center text-gray-500 py-12">暂无用户</div>
          ) : (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap w-10">
                    <Checkbox 
                      size="sm"
                      isSelected={selectedUsers.length === users.length && users.length > 0}
                      isIndeterminate={selectedUsers.length > 0 && selectedUsers.length < users.length}
                      onValueChange={handleSelectAll}
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">ID</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">用户名</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">邮箱</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">昵称</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">角色</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">状态</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">余额</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">注册时间</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Checkbox 
                        size="sm"
                        isSelected={selectedUsers.includes(user.id)}
                        onValueChange={(checked) => handleSelectUser(user.id, checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{user.id}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{user.username}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{user.email}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{user.nickname || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Chip color={user.role === 1 ? 'primary' : 'default'} size="sm" classNames={{ base: 'h-5 text-xs', content: user.role === 1 ? 'px-1 text-white' : 'px-1' }}>
                        {user.role === 1 ? '管理员' : '作者'}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Chip color={user.status === 1 ? 'success' : 'danger'} size="sm" classNames={{ base: 'h-5 text-xs', content: 'px-1 text-white' }}>
                        {user.status === 1 ? '正常' : '禁用'}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap text-primary font-medium">¥{user.balance?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{new Date(user.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button size="sm" variant="flat" onPress={() => handleEdit(user)} className="min-w-0 h-6 px-2 text-xs">编辑</Button>
                        <Button size="sm" color="success" variant="flat" onPress={() => { setRechargeModal({ show: true, user }); setRechargeAmount('') }} className="min-w-0 h-6 px-2 text-xs">充值</Button>
                        <Button size="sm" color="danger" variant="flat" onPress={() => setDeleteConfirm({ show: true, user })} className="min-w-0 h-6 px-2 text-xs">删除</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {total > 20 && (
        <div className="flex justify-center">
          <Pagination 
            total={Math.ceil(total / 20)} 
            page={page} 
            onChange={setPage}
            siblings={0}
            boundaries={1}
            classNames={{
              wrapper: 'gap-1 md:gap-2',
              item: 'w-7 h-7 md:w-8 md:h-8 text-xs md:text-sm',
              cursor: 'w-7 h-7 md:w-8 md:h-8 text-xs md:text-sm',
              prev: 'w-7 h-7 md:w-8 md:h-8',
              next: 'w-7 h-7 md:w-8 md:h-8',
            }}
          />
        </div>
      )}

      {/* 编辑用户 Modal */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} size="lg" placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>编辑用户: {editUser?.username}</ModalHeader>
          <ModalBody className="space-y-4">
            <Input 
              label="用户名" 
              value={editForm.username} 
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
            />
            <Input 
              label="邮箱" 
              value={editForm.email} 
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <Input 
              label="昵称" 
              value={editForm.nickname} 
              onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
            />
            <RadioGroup 
              label="状态" 
              orientation="horizontal" 
              value={editForm.status.toString()} 
              onValueChange={(v) => setEditForm({ ...editForm, status: parseInt(v) })}
            >
              <Radio value="1">正常</Radio>
              <Radio value="0">禁用</Radio>
            </RadioGroup>
            <RadioGroup 
              label="角色" 
              orientation="horizontal" 
              value={editForm.role.toString()} 
              onValueChange={(v) => setEditForm({ ...editForm, role: parseInt(v) })}
            >
              <Radio value="0">作者</Radio>
              <Radio value="1">管理员</Radio>
            </RadioGroup>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-sm font-medium mb-3">用户配额 <span className="text-gray-400 font-normal">(-1表示无限制)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Input 
                  label="最大应用数" 
                  type="number"
                  min={-1}
                  size="sm"
                  value={String(editForm.max_apps)} 
                  onChange={(e) => setEditForm({ ...editForm, max_apps: Number(e.target.value) })}
                />
                <Input 
                  label="最大用户数" 
                  type="number"
                  min={-1}
                  size="sm"
                  value={String(editForm.max_users)} 
                  onChange={(e) => setEditForm({ ...editForm, max_users: Number(e.target.value) })}
                />
                <Input 
                  label="最大卡种数" 
                  type="number"
                  min={-1}
                  size="sm"
                  value={String(editForm.max_card_types)} 
                  onChange={(e) => setEditForm({ ...editForm, max_card_types: Number(e.target.value) })}
                />
                <Input 
                  label="最大卡号数" 
                  type="number"
                  min={-1}
                  size="sm"
                  value={String(editForm.max_cards)} 
                  onChange={(e) => setEditForm({ ...editForm, max_cards: Number(e.target.value) })}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setEditUser(null)}>取消</Button>
            <Button color="primary" onPress={handleSave}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认 Modal */}
      <Modal isOpen={deleteConfirm.show} onClose={() => setDeleteConfirm({ show: false, user: null })} placement="center">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定要删除用户 "{deleteConfirm.user?.username}" 吗？</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteConfirm({ show: false, user: null })}>取消</Button>
            <Button color="danger" onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 充值 Modal */}
      <Modal isOpen={rechargeModal.show} onClose={() => setRechargeModal({ show: false, user: null })} placement="center">
        <ModalContent>
          <ModalHeader>余额充值</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">用户</span>
                <span>{rechargeModal.user?.username}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">当前余额</span>
                <span className="text-primary font-medium">¥{rechargeModal.user?.balance?.toFixed(2) || '0.00'}</span>
              </div>
              <Input
                label="充值金额"
                type="number"
                placeholder="输入充值金额，负数为扣款"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                startContent={<span className="text-gray-400">¥</span>}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setRechargeModal({ show: false, user: null })}>取消</Button>
            <Button color="primary" onPress={handleRecharge} isDisabled={!rechargeAmount}>确认充值</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
