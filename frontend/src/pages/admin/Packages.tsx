import { useEffect, useState, useRef } from 'react'
import { Card, CardBody, Button, Input, Textarea, Switch, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiPlus, HiPencil, HiTrash, HiUpload } from 'react-icons/hi'

interface Package {
  id: number
  name: string
  icon: string
  description: string
  price: number
  duration: number
  extra_apps: number
  extra_users: number
  extra_card_types: number
  extra_cards: number
  sort: number
  status: number
}

export default function AdminPackages() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [editPkg, setEditPkg] = useState<Package | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({
    name: '', icon: '', description: '', price: 0, duration: 30,
    extra_apps: 0, extra_users: 0, extra_card_types: 0, extra_cards: 0,
    sort: 0, status: 1
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Package | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPackages = async () => {
    setLoading(true)
    try {
      const res: any = await adminApi.listPackages()
      setPackages(res.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPackages() }, [])

  const handleAdd = () => {
    setIsNew(true)
    setForm({ name: '', icon: '', description: '', price: 0, duration: 30, extra_apps: 0, extra_users: 0, extra_card_types: 0, extra_cards: 0, sort: 0, status: 1 })
    setEditPkg({} as Package)
  }

  const handleEdit = (pkg: Package) => {
    setIsNew(false)
    setForm({
      name: pkg.name, icon: pkg.icon || '', description: pkg.description, price: pkg.price, duration: pkg.duration,
      extra_apps: pkg.extra_apps, extra_users: pkg.extra_users, extra_card_types: pkg.extra_card_types, extra_cards: pkg.extra_cards,
      sort: pkg.sort, status: pkg.status
    })
    setEditPkg(pkg)
  }

  const handleUploadIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/png') {
      toast.error('只支持PNG格式')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res: any = await adminApi.uploadPackageIcon(formData)
      setForm({ ...form, icon: res.data })
      toast.success('上传成功')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('请输入套餐名称'); return }
    setSaving(true)
    try {
      if (isNew) {
        await adminApi.createPackage(form)
        toast.success('创建成功')
      } else {
        await adminApi.updatePackage(editPkg!.id, form)
        toast.success('保存成功')
      }
      setEditPkg(null)
      loadPackages()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await adminApi.deletePackage(deleteConfirm.id)
      toast.success('删除成功')
      setDeleteConfirm(null)
      loadPackages()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button color="primary" size="sm" startContent={<HiPlus />} onPress={handleAdd}>添加套餐</Button>
      </div>

      {packages.length === 0 ? (
        <Card><CardBody className="text-center text-gray-500 py-12">暂无套餐</CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map(pkg => (
            <Card key={pkg.id}>
              <CardBody className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pkg.icon && <img src={pkg.icon} alt="" className="w-8 h-8 object-contain" />}
                    <h3 className="font-semibold text-lg">{pkg.name}</h3>
                  </div>
                  <Chip color={pkg.status === 1 ? 'success' : 'default'} size="sm" classNames={{ content: 'text-white px-1' }}>
                    {pkg.status === 1 ? '启用' : '禁用'}
                  </Chip>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">{pkg.description || '暂无描述'}</p>
                <div className="text-2xl font-bold text-primary">¥{pkg.price}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-400">有效期:</span> {pkg.duration}天</div>
                  <div><span className="text-gray-400">应用:</span> +{pkg.extra_apps}</div>
                  <div><span className="text-gray-400">用户:</span> +{pkg.extra_users}</div>
                  <div><span className="text-gray-400">卡种:</span> +{pkg.extra_card_types}</div>
                  <div><span className="text-gray-400">卡号:</span> +{pkg.extra_cards}</div>
                  <div><span className="text-gray-400">排序:</span> {pkg.sort}</div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <Button size="sm" variant="flat" startContent={<HiPencil />} onPress={() => handleEdit(pkg)} className="flex-1">编辑</Button>
                  <Button size="sm" variant="flat" color="danger" startContent={<HiTrash />} onPress={() => setDeleteConfirm(pkg)} className="flex-1">删除</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal isOpen={!!editPkg} onClose={() => setEditPkg(null)} size="2xl" placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isNew ? '添加套餐' : '编辑套餐'}</ModalHeader>
          <ModalBody className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center overflow-hidden">
                {form.icon ? (
                  <img src={form.icon} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-400 text-xs">无图标</span>
                )}
              </div>
              <div>
                <input type="file" accept="image/png" ref={fileInputRef} onChange={handleUploadIcon} className="hidden" />
                <Button size="sm" variant="flat" startContent={<HiUpload />} onPress={() => fileInputRef.current?.click()} isLoading={uploading}>
                  上传图标
                </Button>
                <p className="text-xs text-gray-400 mt-1">仅支持PNG格式</p>
              </div>
            </div>
            <Input label="套餐名称" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Textarea label="套餐描述" value={form.description} onChange={e => setForm({...form, description: e.target.value})} minRows={2} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="价格(元)" type="number" min={0} value={String(form.price)} onChange={e => setForm({...form, price: Number(e.target.value)})} />
              <Input label="有效期(天)" type="number" min={1} value={String(form.duration)} onChange={e => setForm({...form, duration: Number(e.target.value)})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="额外应用数" type="number" min={0} value={String(form.extra_apps)} onChange={e => setForm({...form, extra_apps: Number(e.target.value)})} />
              <Input label="额外用户数" type="number" min={0} value={String(form.extra_users)} onChange={e => setForm({...form, extra_users: Number(e.target.value)})} />
              <Input label="额外卡种数" type="number" min={0} value={String(form.extra_card_types)} onChange={e => setForm({...form, extra_card_types: Number(e.target.value)})} />
              <Input label="额外卡号数" type="number" min={0} value={String(form.extra_cards)} onChange={e => setForm({...form, extra_cards: Number(e.target.value)})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="排序(越大越前)" type="number" value={String(form.sort)} onChange={e => setForm({...form, sort: Number(e.target.value)})} />
              <div className="flex items-center gap-2 pt-6">
                <Switch isSelected={form.status === 1} onValueChange={v => setForm({...form, status: v ? 1 : 0})} />
                <span>启用</span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setEditPkg(null)}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认 */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} placement="center">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>确定要删除套餐 "{deleteConfirm?.name}" 吗？</ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="danger" onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
