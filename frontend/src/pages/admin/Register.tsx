import { useState, useEffect } from 'react'
import { Card, CardBody, Input, Button, Switch, Spinner } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

export default function AdminRegister() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    max_apps: -1,
    max_users: -1,
    max_card_types: -1,
    max_cards: -1,
    register_enabled: 1,
    require_email_code: 0,
    require_captcha: 0,
    reg_rate_limit: 5,
    reg_ip_max_total: 0,
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res: any = await adminApi.getRegisterConfig()
      if (res.data) {
        setConfig({
          max_apps: res.data.max_apps ?? -1,
          max_users: res.data.max_users ?? -1,
          max_card_types: res.data.max_card_types ?? -1,
          max_cards: res.data.max_cards ?? -1,
          register_enabled: res.data.register_enabled ?? 1,
          require_email_code: res.data.require_email_code ?? 0,
          require_captcha: res.data.require_captcha ?? 0,
          reg_rate_limit: res.data.reg_rate_limit ?? 5,
          reg_ip_max_total: res.data.reg_ip_max_total ?? 0,
        })
      }
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.saveRegisterConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-medium mb-4">注册验证</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                isSelected={config.register_enabled === 1}
                onValueChange={(v) => setConfig({ ...config, register_enabled: v ? 1 : 0 })}
              />
              <div>
                <p className="font-medium">开放用户注册</p>
                <p className="text-sm text-gray-500">关闭后，仅作者端注册和社交注册绑定会被拒绝，不影响客户端 HTTP/WS 用户注册</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                isSelected={config.require_email_code === 1}
                onValueChange={(v) => setConfig({ ...config, require_email_code: v ? 1 : 0 })}
              />
              <div>
                <p className="font-medium">注册需要邮箱验证码</p>
                <p className="text-sm text-gray-500">开启后，用户注册时需要先接收邮箱验证码</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                isSelected={config.require_captcha === 1}
                onValueChange={(v) => setConfig({ ...config, require_captcha: v ? 1 : 0 })}
              />
              <div>
                <p className="font-medium">注册需要图形验证码</p>
                <p className="text-sm text-gray-500">开启后，用户注册时需要输入图形验证码</p>
              </div>
            </div>
            <Input
              label="同IP每小时注册上限"
              type="number"
              min={0}
              className="max-w-xs"
              description="同一IP每小时最多注册次数，0表示不限制"
              value={String(config.reg_rate_limit)}
              onChange={(e) => setConfig({ ...config, reg_rate_limit: Number(e.target.value) })}
            />
            <Input
              label="同IP最多注册次数"
              type="number"
              min={0}
              className="max-w-xs"
              description="同一IP累计最多注册次数，0表示不限制"
              value={String(config.reg_ip_max_total)}
              onChange={(e) => setConfig({ ...config, reg_ip_max_total: Number(e.target.value) })}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-medium mb-4">新用户默认配额</h3>
          <p className="text-sm text-gray-500 mb-4">设置新注册用户默认可创建的资源数量限制，-1表示无限制</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="最大应用数"
              type="number"
              min={-1}
              description="用户可创建的应用数量上限"
              value={String(config.max_apps)}
              onChange={(e) => setConfig({ ...config, max_apps: Number(e.target.value) })}
            />
            <Input
              label="最大用户数"
              type="number"
              min={-1}
              description="用户名下所有应用的用户总数上限"
              value={String(config.max_users)}
              onChange={(e) => setConfig({ ...config, max_users: Number(e.target.value) })}
            />
            <Input
              label="最大卡种数"
              type="number"
              min={-1}
              description="用户名下所有应用的卡种总数上限"
              value={String(config.max_card_types)}
              onChange={(e) => setConfig({ ...config, max_card_types: Number(e.target.value) })}
            />
            <Input
              label="最大卡号数"
              type="number"
              min={-1}
              description="用户名下所有应用的卡号总数上限"
              value={String(config.max_cards)}
              onChange={(e) => setConfig({ ...config, max_cards: Number(e.target.value) })}
            />
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
