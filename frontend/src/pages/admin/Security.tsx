import { useState, useEffect } from 'react'
import { Card, CardBody, Input, Button, Switch } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

export default function Security() {
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    enable_captcha: 1,
    captcha_after_fails: 3,
    max_login_fails: 5,
    lock_duration: 30,
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res: any = await adminApi.getSecurityConfig()
      setConfig(res.data)
    } catch (e: any) {
      toast.error(e.message || '获取配置失败')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.saveSecurityConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-bold mb-4">登录安全</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">启用图形验证码</p>
                <p className="text-sm text-gray-500">登录失败多次后显示验证码</p>
              </div>
              <Switch
                isSelected={config.enable_captcha === 1}
                onValueChange={(v) => setConfig({ ...config, enable_captcha: v ? 1 : 0 })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                type="number"
                label="失败几次后显示验证码"
                value={String(config.captcha_after_fails)}
                onChange={(e) => setConfig({ ...config, captcha_after_fails: parseInt(e.target.value) || 0 })}
              />
              <Input
                type="number"
                label="最大登录失败次数"
                value={String(config.max_login_fails)}
                onChange={(e) => setConfig({ ...config, max_login_fails: parseInt(e.target.value) || 0 })}
              />
              <Input
                type="number"
                label="锁定时长(分钟)"
                value={String(config.lock_duration)}
                onChange={(e) => setConfig({ ...config, lock_duration: parseInt(e.target.value) || 0 })}
              />
            </div>
            <p className="text-sm text-gray-500">
              登录失败 {config.captcha_after_fails} 次后显示验证码，失败 {config.max_login_fails} 次后锁定 {config.lock_duration} 分钟
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button color="primary" onPress={handleSave} isLoading={saving}>
          保存配置
        </Button>
      </div>
    </div>
  )
}
