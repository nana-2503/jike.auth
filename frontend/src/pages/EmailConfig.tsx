import { useState, useEffect, useCallback } from 'react'
import {
  Card, CardBody, CardHeader, Input, Button, Switch, Spinner, Textarea,
  Tabs, Tab, Select, SelectItem, Chip, Pagination,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { HiSave, HiMail, HiRefresh } from 'react-icons/hi'

interface App { id: number; app_name: string }
interface EmailCodeRecord {
  id: number
  app_id: number
  email: string
  code: string
  type: number
  used: number
  expire_at: string
  created_at: string
  app?: { id: number; app_name: string }
}

export default function EmailConfig() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [activeTab, setActiveTab] = useState('config')
  const [config, setConfig] = useState({
    smtp_host: '', smtp_port: 465, smtp_user: '', smtp_pass: '',
    smtp_ssl: 1, from_name: '', code_template: '',
  })

  // 验证码记录
  const [apps, setApps] = useState<App[]>([])
  const [codes, setCodes] = useState<EmailCodeRecord[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [codesPage, setCodesPage] = useState(1)
  const [codesTotal, setCodesTotal] = useState(0)
  const [filterAppId, setFilterAppId] = useState<number>(0)
  const [filterType, setFilterType] = useState<string>('')
  const [filterEmail, setFilterEmail] = useState('')

  useEffect(() => {
    userApi.getEmailConfig().then((res: any) => {
      if (res.data) {
        setConfig({
          smtp_host: res.data.smtp_host || '',
          smtp_port: res.data.smtp_port || 465,
          smtp_user: res.data.smtp_user || '',
          smtp_pass: res.data.smtp_pass || '',
          smtp_ssl: res.data.smtp_ssl ?? 1,
          from_name: res.data.from_name || '',
          code_template: res.data.code_template || '',
        })
      }
    }).finally(() => setLoading(false))
    userApi.listApps(1, 100).then((res: any) => setApps(res.data.list || []))
  }, [])

  const fetchCodes = useCallback(async () => {
    setCodesLoading(true)
    try {
      const params: any = {}
      if (filterAppId) params.app_id = filterAppId
      if (filterType) params.type = Number(filterType)
      if (filterEmail) params.email = filterEmail
      const res: any = await userApi.listEmailCodes(codesPage, 20, params)
      setCodes(res.data.list || [])
      setCodesTotal(res.data.total || 0)
    } catch (e: any) { toast.error(e.message || '加载失败') }
    finally { setCodesLoading(false) }
  }, [codesPage, filterAppId, filterType, filterEmail])

  useEffect(() => {
    if (activeTab === 'codes') fetchCodes()
  }, [activeTab, fetchCodes])

  const handleSave = async () => {
    setSaving(true)
    try {
      await userApi.saveEmailConfig(config)
      toast.success('保存成功')
    } catch (e: any) { toast.error(e.message || '保存失败') }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!testEmail) { toast.error('请输入测试邮箱'); return }
    setTesting(true)
    try {
      await userApi.testSendEmail(testEmail)
      toast.success('测试邮件已发送')
    } catch (e: any) { toast.error(e.message || '发送失败') }
    finally { setTesting(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4">
      <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as string)} classNames={{ panel: 'pt-0' }}>
        <Tab key="config" title="邮箱配置">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold flex items-center gap-2"><HiMail className="w-5 h-5" /> SMTP 配置</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="SMTP服务器" value={config.smtp_host} onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })} placeholder="smtp.qq.com" />
                  <Input type="number" label="SMTP端口" value={String(config.smtp_port)} onChange={(e) => setConfig({ ...config, smtp_port: Number(e.target.value) })} />
                  <Input label="发信邮箱" value={config.smtp_user} onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })} placeholder="your@email.com" />
                  <Input label="邮箱密码/授权码" type="password" value={config.smtp_pass} onChange={(e) => setConfig({ ...config, smtp_pass: e.target.value })} />
                  <Input label="发件人名称" value={config.from_name} onChange={(e) => setConfig({ ...config, from_name: e.target.value })} placeholder="我的应用" />
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-content2 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">SSL加密</p>
                    <p className="text-xs text-gray-500">通常465端口使用SSL，587端口不使用</p>
                  </div>
                  <Switch isSelected={config.smtp_ssl === 1} onValueChange={(v) => setConfig({ ...config, smtp_ssl: v ? 1 : 0 })} />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <h3 className="font-semibold">邮件模板</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <Textarea
                  label="验证码邮件模板"
                  value={config.code_template}
                  onChange={(e) => setConfig({ ...config, code_template: e.target.value })}
                  placeholder="留空使用默认模板"
                  minRows={6}
                  description="支持变量: {code}=验证码, {type}=类型(注册/密码重置), {site_name}=站点名, {app_name}=应用名"
                />
              </CardBody>
            </Card>

            <div className="flex gap-3 justify-end">
              <div className="flex gap-2 items-end flex-1">
                <Input label="测试邮箱" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" size="sm" className="max-w-xs" />
                <Button variant="flat" onPress={handleTest} isLoading={testing} size="sm">发送测试</Button>
              </div>
              <Button color="primary" onPress={handleSave} isLoading={saving} startContent={!saving && <HiSave className="w-4 h-4" />}>
                保存配置
              </Button>
            </div>
          </div>
        </Tab>

        <Tab key="codes" title="验证码记录">
          <div className="space-y-4">
            <div className="flex gap-2 items-center flex-wrap">
              <Select
                placeholder="全部应用"
                selectedKeys={filterAppId ? [String(filterAppId)] : []}
                onChange={(e) => { setFilterAppId(Number(e.target.value)); setCodesPage(1) }}
                className="w-40"
                size="sm"
              >
                {apps.map(app => (
                  <SelectItem key={String(app.id)}>{app.app_name}</SelectItem>
                ))}
              </Select>
              <Select
                placeholder="全部类型"
                selectedKeys={filterType ? [filterType] : []}
                onChange={(e) => { setFilterType(e.target.value); setCodesPage(1) }}
                className="w-32"
                size="sm"
              >
                <SelectItem key="1">注册</SelectItem>
                <SelectItem key="2">找回密码</SelectItem>
              </Select>
              <Input
                placeholder="搜索邮箱"
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setCodesPage(1); fetchCodes() } }}
                size="sm"
                className="w-48"
              />
              <Button size="sm" variant="flat" startContent={<HiRefresh className="w-4 h-4" />} onPress={fetchCodes}>
                刷新
              </Button>
            </div>

            {codesLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : codes.length === 0 ? (
              <Card><CardBody className="text-center py-12 text-gray-500">暂无验证码记录</CardBody></Card>
            ) : (
              <>
                <Table aria-label="验证码记录">
                  <TableHeader>
                    <TableColumn>时间</TableColumn>
                    <TableColumn>应用</TableColumn>
                    <TableColumn>邮箱</TableColumn>
                    <TableColumn>验证码</TableColumn>
                    <TableColumn>类型</TableColumn>
                    <TableColumn>状态</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {codes.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                        <TableCell>{item.app?.app_name || '-'}</TableCell>
                        <TableCell>{item.email}</TableCell>
                        <TableCell><code className="bg-gray-100 dark:bg-content2 px-2 py-0.5 rounded text-sm">{item.code}</code></TableCell>
                        <TableCell>
                          <Chip size="sm" color={item.type === 1 ? 'primary' : 'warning'} variant="flat">
                            {item.type === 1 ? '注册' : '找回密码'}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          {item.used === 1 ? (
                            <Chip size="sm" color="success" variant="flat">已使用</Chip>
                          ) : new Date(item.expire_at) < new Date() ? (
                            <Chip size="sm" color="default" variant="flat">已过期</Chip>
                          ) : (
                            <Chip size="sm" color="primary" variant="flat">有效</Chip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {codesTotal > 20 && (
                  <div className="flex justify-center">
                    <Pagination total={Math.ceil(codesTotal / 20)} page={codesPage} onChange={setCodesPage} />
                  </div>
                )}
              </>
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  )
}
