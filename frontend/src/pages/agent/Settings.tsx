import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Avatar, Card, CardBody, Button, Input } from '@heroui/react'
import { agentCenterApi } from '../../api'
import { toast } from '../../components/Toast'
import { avatarOrDefault } from '../../utils/avatar'

export default function AgentSettings() {
  const { agentInfo, refreshProfile } = useOutletContext<{ agentInfo: any; refreshProfile: () => void }>()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('只能上传图片类型的文件')
      return
    }
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await agentCenterApi.uploadAvatar(form)
      await refreshProfile()
      toast.success('头像已上传')
    } catch (err: any) {
      toast.error(err.message || '上传失败')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSubmit = async () => {
    if (newPwd.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      await agentCenterApi.changePassword(oldPwd, newPwd)
      toast.success('密码已更新，请牢记新密码')
      setOldPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (e: any) {
      toast.error(e.message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h2 className="text-lg font-semibold px-1">账号设置</h2>
      <Card>
        <CardBody className="p-6">
          <div className="flex items-center gap-4">
            <Avatar
              src={avatarOrDefault(agentInfo?.avatar)}
              name={agentInfo?.nickname || agentInfo?.username}
              className="h-16 w-16 text-lg"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {agentInfo?.nickname || agentInfo?.username}
              </div>
              <div className="mt-1 text-xs text-gray-500">支持 JPG/PNG/GIF/WebP，最大 2MB</div>
              <Button
                size="sm"
                color="primary"
                variant="flat"
                className="mt-3"
                isLoading={uploadingAvatar}
                onPress={() => avatarInputRef.current?.click()}
              >
                上传头像
              </Button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <h2 className="text-lg font-semibold px-1">修改密码</h2>
      <Card>
        <CardBody className="p-6 space-y-4">
          <Input
            label="当前密码"
            type="password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="新密码"
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            description="至少 6 位"
            autoComplete="new-password"
          />
          <Input
            label="确认新密码"
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
          />
          <Button color="primary" className="w-full" onPress={handleSubmit} isLoading={loading}>
            保存
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
