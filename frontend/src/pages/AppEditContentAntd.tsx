import { useState, useEffect } from 'react'
import { Form, Input, Select, InputNumber, Switch, Button, Tabs, Card, Space, Spin } from 'antd'
import { SaveOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons'
import { userApi } from '../api'
import { toast } from '../components/Toast'

const { TextArea } = Input
const { TabPane } = Tabs

const generateRandomStr = (len: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
  return s
}

const getStringLength = (str: string) => {
  let len = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9fa5) {
      len += 2
    } else {
      len += 1
    }
  }
  return len
}

interface AppEditContentAntdProps {
  appId: number | null
  onSuccess: () => void
  onCancel: () => void
}

export default function AppEditContentAntd({ appId, onSuccess, onCancel }: AppEditContentAntdProps) {
  const [form] = Form.useForm()
  const isNew = appId === null
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isNew && appId) {
      userApi.listApps(1, 100).then((res: any) => {
        const app = res.data.list?.find((a: any) => a.id === appId)
        if (app) {
          form.setFieldsValue({
            app_name: app.app_name,
            description: app.description || '',
            login_mode: app.login_mode || 1,
            billing_mode: app.billing_mode || 1,
            heartbeat: app.heartbeat || 60,
            crypto_mode: app.crypto_mode || 'aes-256-cbc',
            sign_algo: app.sign_algo || '',
            server_sign_algo: app.server_sign_algo || '',
            bind_device: app.bind_device === 1,
            channel_mode: app.channel_mode || 1,
            reg_mode: app.reg_mode || 1,
            reg_limit: app.reg_limit || 1,
            trial_duration: app.trial_duration || 0,
            trial_points: app.trial_points || 0,
            trial_limit: app.trial_limit || 0
          })
        }
      }).finally(() => setLoading(false))
    } else {
      // 设置新建时的默认值
      form.setFieldsValue({
        login_mode: 1,
        billing_mode: 1,
        heartbeat: 60,
        crypto_mode: 'aes-256-cbc',
        sign_algo: `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`,
        server_sign_algo: `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`,
        bind_device: false,
        channel_mode: 1,
        reg_mode: 1,
        reg_limit: 1,
        trial_duration: 0,
        trial_points: 0,
        trial_limit: 0
      })
    }
  }, [appId, isNew, form])

  const generateSignAlgo = () => {
    const algo = `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`
    form.setFieldsValue({ sign_algo: algo })
  }

  const generateServerSignAlgo = () => {
    const algo = `${generateRandomStr(64)}[key]${generateRandomStr(64)}[data]${generateRandomStr(64)}`
    form.setFieldsValue({ server_sign_algo: algo })
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      
      const nameLength = getStringLength(values.app_name)
      if (nameLength > 20) {
        toast.error('APP名称过长，最多20个字符（1个中文=2个字符）')
        return
      }

      const formData = {
        ...values,
        bind_device: values.bind_device ? 1 : 0
      }
      
      setSaving(true)
      if (isNew) {
        await userApi.createApp(formData)
        toast.success('创建成功')
      } else {
        await userApi.updateApp(appId!, formData)
        toast.success('保存成功')
      }
      onSuccess()
    } catch (e: any) {
      if (e.errorFields) {
        toast.error('请填写必填项')
      } else {
        toast.error(e.message || '操作失败')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* 隐藏的保存按钮，供父组件触发 */}
      <button id="app-edit-save-btn" onClick={handleSave} style={{ display: 'none' }} />

      {/* 表单内容 */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
        <Form form={form} layout="vertical" autoComplete="off">
          <Tabs defaultActiveKey="basic">
            <TabPane tab="基本信息" key="basic">
              <Space direction="vertical" size="small" style={{ width: '100%', paddingTop: '12px' }}>
                <Card title="基础信息" size="small" bordered={true}>
                  <Form.Item
                    label="APP名称"
                    name="app_name"
                    rules={[{ required: true, message: '请输入APP名称' }]}
                    extra={`当前长度: ${getStringLength(form.getFieldValue('app_name') || '')}/20 (中文=2字符)`}
                    style={{ marginBottom: '16px' }}
                  >
                    <Input placeholder="请输入APP名称" />
                  </Form.Item>
                  <Form.Item label="应用描述" name="description" style={{ marginBottom: 0 }}>
                    <TextArea rows={3} placeholder="请输入应用描述" />
                  </Form.Item>
                </Card>

                <Card title="功能配置" size="small" bordered={true}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Form.Item label="登录模式" name="login_mode" style={{ marginBottom: 0 }}>
                      <Select>
                        <Select.Option value={1}>账号登录</Select.Option>
                        <Select.Option value={2}>卡密登录</Select.Option>
                        <Select.Option value={3}>账号+卡密</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item label="计费模式" name="billing_mode" style={{ marginBottom: 0 }}>
                      <Select>
                        <Select.Option value={1}>完全免费</Select.Option>
                        <Select.Option value={2}>计时收费</Select.Option>
                        <Select.Option value={3}>计点收费</Select.Option>
                      </Select>
                    </Form.Item>
                  </div>
                </Card>
              </Space>
            </TabPane>

            <TabPane tab="安全设置" key="security">
              <Space direction="vertical" size="small" style={{ width: '100%', paddingTop: '12px' }}>
                <Card title="基础配置" size="small" bordered={true}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Form.Item label="心跳周期(秒)" name="heartbeat" style={{ marginBottom: 0 }}>
                      <InputNumber min={10} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="通讯加密" name="crypto_mode" style={{ marginBottom: 0 }}>
                      <Select>
                        <Select.Option value="aes-256-cbc">AES-256-CBC</Select.Option>
                      </Select>
                    </Form.Item>
                  </div>
                </Card>

                <Card title="密钥配置" size="small" bordered={true}>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <div style={{ padding: '12px', backgroundColor: '#e6f7ff', borderRadius: '4px' }}>
                      <p style={{ margin: 0, fontWeight: 500, marginBottom: '4px' }}>加密密钥说明</p>
                      <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>系统将自动使用 AppSecret 作为 AES 加密密钥，无需单独配置。</p>
                    </div>
                  </Form.Item>
                </Card>

                <Card title="签名算法" size="small" bordered={true}>
                  <Form.Item
                    label={
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span>客户端签名算法</span>
                        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={generateSignAlgo} />
                      </div>
                    }
                    name="sign_algo"
                    style={{ marginBottom: '16px' }}
                  >
                    <TextArea rows={2} style={{ fontFamily: 'monospace', fontSize: '12px' }} />
                  </Form.Item>
                  <Form.Item
                    label={
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span>服务端签名算法</span>
                        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={generateServerSignAlgo} />
                      </div>
                    }
                    name="server_sign_algo"
                    style={{ marginBottom: 0 }}
                  >
                    <TextArea rows={2} style={{ fontFamily: 'monospace', fontSize: '12px' }} />
                  </Form.Item>
                </Card>

                <Card title="设备绑定" size="small" bordered={true}>
                  <Form.Item name="bind_device" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                    <span style={{ marginLeft: '12px', color: '#666', fontSize: '12px' }}>
                      开启后用户需绑定设备特征码
                    </span>
                  </Form.Item>
                </Card>
              </Space>
            </TabPane>

            <TabPane tab="通道注册" key="channel">
              <Space direction="vertical" size="small" style={{ width: '100%', paddingTop: '12px' }}>
                <Card title="通道配置" size="small" bordered={true}>
                  <Form.Item label="通道模式" name="channel_mode" style={{ marginBottom: 0 }}>
                    <Select>
                      <Select.Option value={1}>单绑定通道</Select.Option>
                      <Select.Option value={2}>账户总通道</Select.Option>
                    </Select>
                  </Form.Item>
                </Card>

                <Card title="注册配置" size="small" bordered={true}>
                  <Form.Item label="注册模式" name="reg_mode" style={{ marginBottom: '16px' }}>
                    <Select>
                      <Select.Option value={1}>关闭注册</Select.Option>
                      <Select.Option value={2}>开放注册(无限制)</Select.Option>
                      <Select.Option value={3}>开放注册(需充值卡)</Select.Option>
                      <Select.Option value={4}>开放注册(限制次数)</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => prevValues.reg_mode !== currentValues.reg_mode}
                  >
                    {({ getFieldValue }) =>
                      getFieldValue('reg_mode') === 4 ? (
                        <Form.Item label="特征限制注册次数" name="reg_limit" style={{ marginBottom: 0 }}>
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>
                </Card>

                <Card title="试用设置" size="small" bordered={true}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <Form.Item label="试用时长(分)" name="trial_duration" style={{ marginBottom: 0 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="试用点数" name="trial_points" style={{ marginBottom: 0 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="特征试用限制" name="trial_limit" style={{ marginBottom: 0 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </Card>
              </Space>
            </TabPane>
          </Tabs>
        </Form>
      </div>
    </div>
  )
}
