import { useState, useEffect } from 'react'
import { Card, CardBody, Input, Button, Switch, Textarea, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
    .header img { max-height: 50px; margin-bottom: 10px; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .code { background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; border-radius: 8px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="{网站logo}" alt="Logo">
      <h1>{网站名称}</h1>
    </div>
    <div class="content">
      <p>您好，</p>
      <p>您正在进行账户验证操作，验证码如下：</p>
      <div class="code">{验证码}</div>
      <p>验证码有效期为5分钟，请勿泄露给他人。</p>
      <p>如非本人操作，请忽略此邮件。</p>
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿回复</p>
      <p>发送时间：{当前时间}</p>
      <p>如有问题请联系客服QQ：{客服QQ}</p>
    </div>
  </div>
</body>
</html>`

export default function AdminEmail() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [config, setConfig] = useState({
    smtp_host: '',
    smtp_port: 465,
    smtp_user: '',
    smtp_pass: '',
    smtp_ssl: 1,
    from_name: '',
    code_template: defaultTemplate,
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res: any = await adminApi.getEmailConfig()
      if (res.data) {
        setConfig({
          smtp_host: res.data.smtp_host || '',
          smtp_port: res.data.smtp_port || 465,
          smtp_user: res.data.smtp_user || '',
          smtp_pass: res.data.smtp_pass || '',
          smtp_ssl: res.data.smtp_ssl ?? 1,
          from_name: res.data.from_name || '',
          code_template: res.data.code_template || defaultTemplate,
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
      await adminApi.saveEmailConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSend = async () => {
    if (!testEmail) {
      toast.error('请输入测试邮箱')
      return
    }
    setTesting(true)
    try {
      await adminApi.testSendEmail(testEmail)
      toast.success('发送成功，请查收邮件')
      setTestModalOpen(false)
      setTestEmail('')
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
          <h3 className="text-lg font-medium mb-4">SMTP服务器配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="SMTP服务器"
              placeholder="smtp.qq.com"
              value={config.smtp_host}
              onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
            />
            <Input
              label="SMTP端口"
              type="number"
              placeholder="465"
              value={String(config.smtp_port)}
              onChange={(e) => setConfig({ ...config, smtp_port: Number(e.target.value) })}
            />
            <Input
              label="发信邮箱"
              placeholder="your@email.com"
              value={config.smtp_user}
              onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })}
            />
            <Input
              label="邮箱密码/授权码"
              type="password"
              placeholder="授权码"
              value={config.smtp_pass}
              onChange={(e) => setConfig({ ...config, smtp_pass: e.target.value })}
            />
            <Input
              label="发件人名称"
              placeholder="验证系统"
              value={config.from_name}
              onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <Switch
                isSelected={config.smtp_ssl === 1}
                onValueChange={(v) => setConfig({ ...config, smtp_ssl: v ? 1 : 0 })}
              />
              <span>启用SSL加密</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-medium mb-2">验证码邮件模板</h3>
          <p className="text-sm text-gray-500 mb-4">
            可用变量：{'{客服QQ}'} {'{网站名称}'} {'{网站logo}'} {'{当前时间}'} {'{验证码}'}
          </p>
          <Textarea
            minRows={15}
            maxRows={30}
            value={config.code_template}
            onChange={(e) => setConfig({ ...config, code_template: e.target.value })}
            classNames={{ input: 'font-mono text-sm' }}
          />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="flat" onPress={() => setTestModalOpen(true)}>
          测试发送
        </Button>
        <Button color="primary" onPress={handleSave} isLoading={saving}>
          保存配置
        </Button>
      </div>

      <Modal isOpen={testModalOpen} onClose={() => setTestModalOpen(false)} placement="center">
        <ModalContent>
          <ModalHeader>测试发送邮件</ModalHeader>
          <ModalBody>
            <Input
              label="收件邮箱"
              placeholder="请输入测试邮箱地址"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <p className="text-sm text-gray-500">将发送一封包含测试验证码(888888)的邮件到该邮箱</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setTestModalOpen(false)}>取消</Button>
            <Button color="primary" onPress={handleTestSend} isLoading={testing}>发送</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
