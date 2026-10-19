import { useState, useEffect } from 'react'
import { Card, CardBody, CardHeader, Input, Button, Switch, Spinner } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { HiSave } from 'react-icons/hi'

export default function AdminSocialLogin() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    enable: 0,
    app_id: '',
    app_key: '',
    login_url: '',
  })

  useEffect(() => {
    adminApi.getSocialLoginConfig().then((res: any) => {
      if (res.data) {
        setConfig({
          enable: res.data.enable || 0,
          app_id: res.data.app_id || '',
          app_key: res.data.app_key || '',
          login_url: res.data.login_url || '',
        })
      }
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.saveSocialLoginConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">社交登录配置</h2>
      <Card>
        <CardHeader className="pb-0">
          <h3 className="font-semibold">彩虹聚合登录</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">启用社交登录</p>
              <p className="text-sm text-gray-500">开启后登录页面显示第三方登录按钮</p>
            </div>
            <Switch
              isSelected={config.enable === 1}
              onValueChange={(v) => setConfig({ ...config, enable: v ? 1 : 0 })}
            />
          </div>
          <Input
            label="AppID"
            value={config.app_id}
            onChange={(e) => setConfig({ ...config, app_id: e.target.value })}
            placeholder="彩虹聚合登录的 AppID"
          />
          <Input
            label="AppKey"
            value={config.app_key}
            onChange={(e) => setConfig({ ...config, app_key: e.target.value })}
            placeholder="彩虹聚合登录的 AppKey"
          />
          <Input
            label="接口地址"
            value={config.login_url}
            onChange={(e) => setConfig({ ...config, login_url: e.target.value })}
            placeholder="如 https://connect.example.com/connect.php"
            description="彩虹聚合登录的接口地址"
          />
          <div className="flex justify-end pt-2">
            <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
              保存配置
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
