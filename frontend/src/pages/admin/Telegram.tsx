import { useState, useEffect } from 'react'
import { Card, CardBody, Input, Button, Switch, Spinner } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

export default function AdminTelegram() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [config, setConfig] = useState({
    bot_token: '',
    chat_id: '',
    proxy_url: '',
    notify_register: 0,
    notify_package: 0,
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res: any = await adminApi.getTelegramConfig()
      if (res.data) {
        setConfig({
          bot_token: res.data.bot_token || '',
          chat_id: res.data.chat_id || '',
          proxy_url: res.data.proxy_url || '',
          notify_register: res.data.notify_register ?? 0,
          notify_package: res.data.notify_package ?? 0,
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
      await adminApi.saveTelegramConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!config.bot_token || !config.chat_id) {
      toast.error('请先填写Bot Token和Chat ID')
      return
    }
    setTesting(true)
    try {
      await adminApi.testTelegramNotify()
      toast.success('发送成功，请查看Telegram')
    } catch (e: any) {
      toast.error(e.message || '发送失败')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-medium mb-4">Telegram Bot配置</h3>
          <div className="space-y-4">
            <Input
              label="Bot Token"
              placeholder="从 @BotFather 获取的Token"
              value={config.bot_token}
              onChange={(e) => setConfig({ ...config, bot_token: e.target.value })}
            />
            <Input
              label="Chat ID"
              placeholder="接收通知的Chat ID（可以是群组或个人）"
              value={config.chat_id}
              onChange={(e) => setConfig({ ...config, chat_id: e.target.value })}
            />
            <Input
              label="代理地址（可选）"
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
              value={config.proxy_url}
              onChange={(e) => setConfig({ ...config, proxy_url: e.target.value })}
            />
            <p className="text-sm text-gray-500">
              国内服务器需要配置代理才能访问 Telegram API
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-medium mb-4">通知开关</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">注册通知</p>
                <p className="text-sm text-gray-500">有新用户注册时发送通知</p>
              </div>
              <Switch
                isSelected={config.notify_register === 1}
                onValueChange={(v) => setConfig({ ...config, notify_register: v ? 1 : 0 })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">套餐开通通知</p>
                <p className="text-sm text-gray-500">有用户购买套餐时发送通知</p>
              </div>
              <Switch
                isSelected={config.notify_package === 1}
                onValueChange={(v) => setConfig({ ...config, notify_package: v ? 1 : 0 })}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="flat" onPress={handleTest} isLoading={testing}>
          测试发送
        </Button>
        <Button color="primary" onPress={handleSave} isLoading={saving}>
          保存配置
        </Button>
      </div>
    </div>
  )
}
