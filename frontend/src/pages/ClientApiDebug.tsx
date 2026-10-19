import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  ScrollShadow,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react'
import { toast } from '../components/Toast'
import { userApi } from '../api'
import { HiClock, HiClipboardCopy, HiPlay, HiRefresh, HiSparkles, HiTrash } from 'react-icons/hi'
import CryptoJS from 'crypto-js'

type AuthMode = 'none' | 'token' | 'optional-token'

type HistoryItem = {
  id: string
  endpointKey: string
  appCode: string
  token: string
  businessJson: string
  createdAt: number
}

type EndpointPreset = {
  key: string
  label: string
  path: string
  authMode: AuthMode
  sampleData: Record<string, unknown>
}

type DebugApp = {
  id: number
  app_name: string
  app_key: string
  app_code: string
  app_secret: string
  sign_algo: string
  server_sign_algo: string
}

const COMMON_SAMPLE = {
  feature: 'DEVICE-XXXX',
  version: '1.0.0',
  client_id: 'client-uuid-001',
  client_os: 'Windows 10',
  md5: 'abc123def456',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
}

const withCommon = (data: Record<string, unknown> = {}) => JSON.stringify({ ...COMMON_SAMPLE, ...data }, null, 2)

const ENDPOINTS: EndpointPreset[] = [
  { key: 'app-info', label: '应用信息', path: '/api/sdk/app-info', authMode: 'none', sampleData: {} },
  { key: 'custom-field', label: '自定义字段', path: '/api/sdk/custom-field', authMode: 'none', sampleData: { field_name: 'notice' } },
  { key: 'register', label: '用户注册', path: '/api/sdk/register', authMode: 'none', sampleData: { user: 'testuser', password: 'abc123', invite_code: '', card_no: '', captcha_id: '', captcha: '', qq: '', wechat: '', phone: '', email: '', email_code: '' } },
  { key: 'login', label: '用户登录', path: '/api/sdk/login', authMode: 'none', sampleData: { user: 'testuser', password: 'abc123', captcha_id: '', captcha: '' } },
  { key: 'card-login', label: '卡号登录', path: '/api/sdk/card-login', authMode: 'none', sampleData: { card_no: 'CARD-XXXX-XXXX', captcha_id: '', captcha: '' } },
  { key: 'trial', label: '试用登录', path: '/api/sdk/trial', authMode: 'none', sampleData: {} },
  { key: 'captcha', label: '获取验证码', path: '/api/sdk/captcha', authMode: 'none', sampleData: { type: 'login' } },
  { key: 'send-email-code', label: '发送邮箱验证码', path: '/api/sdk/send-email-code', authMode: 'none', sampleData: { email: 'user@example.com', type: 1 } },
  { key: 'versions', label: '版本列表', path: '/api/sdk/versions', authMode: 'none', sampleData: {} },
  { key: 'version', label: '指定版本', path: '/api/sdk/version', authMode: 'none', sampleData: { version: '1.0.0' } },
  { key: 'announcements', label: '公告列表', path: '/api/sdk/announcements', authMode: 'none', sampleData: {} },
  { key: 'report-error', label: '异常日志上报', path: '/api/sdk/report-error', authMode: 'optional-token', sampleData: { severity: 'error', error_type: 'RuntimeError', message: 'Something went wrong', stack: 'Error stack...', context: { page: 'login' }, occurred_at: '2026-05-19 12:00:00', username: 'testuser' } },
  { key: 'forgot-password', label: '找回密码', path: '/api/sdk/forgot-password', authMode: 'none', sampleData: { user: 'testuser', email: 'user@example.com', code: '', new_password: '<your-new-password>' } },
  { key: 'datapools', label: '数据池列表', path: '/api/sdk/datapools', authMode: 'none', sampleData: {} },
  { key: 'dataitem', label: '读取数据项', path: '/api/sdk/dataitem', authMode: 'optional-token', sampleData: { pool_code: 'default', item_code: 'welcome' } },
  { key: 'datapool-create', label: '创建数据池', path: '/api/sdk/datapool/create', authMode: 'optional-token', sampleData: { name: '默认数据池', code: 'default', require_login: 0, remark: '' } },
  { key: 'dataitem-create', label: '创建数据项', path: '/api/sdk/dataitem/create', authMode: 'optional-token', sampleData: { pool_code: 'default', name: '欢迎语', code: 'welcome', content: 'Hello', require_login: 0, require_paid: 0, allow_delete: 1, allow_modify: 1, allow_expire: 0 } },
  { key: 'dataitem-delete', label: '删除数据项', path: '/api/sdk/dataitem/delete', authMode: 'optional-token', sampleData: { pool_code: 'default', item_code: 'welcome' } },
  { key: 'dataitem-update', label: '更新数据项', path: '/api/sdk/dataitem/update', authMode: 'optional-token', sampleData: { pool_code: 'default', item_code: 'welcome', content: 'Updated content' } },
  { key: 'logout', label: '注销登录', path: '/api/sdk/logout', authMode: 'token', sampleData: {} },
  { key: 'heartbeat', label: '心跳', path: '/api/sdk/heartbeat', authMode: 'token', sampleData: {} },
  { key: 'recharge', label: '卡号充值', path: '/api/sdk/recharge', authMode: 'token', sampleData: { card_no: 'CARD-XXXX-XXXX', captcha_id: '', captcha: '' } },
  { key: 'recharge-offline', label: '离线充值', path: '/api/sdk/recharge-offline', authMode: 'none', sampleData: { user: 'testuser', card_no: 'CARD-XXXX-XXXX', feature: 'DEVICE-XXXX', captcha_id: '', captcha: '' } },
  { key: 'deduct-points', label: '扣除点数', path: '/api/sdk/deduct-points', authMode: 'token', sampleData: { points: 1, reason: '测试扣点' } },
  { key: 'deduct-time', label: '扣除时间', path: '/api/sdk/deduct-time', authMode: 'token', sampleData: { minutes: 1, reason: '测试扣时' } },
  { key: 'userinfo', label: '用户信息', path: '/api/sdk/userinfo', authMode: 'token', sampleData: {} },
  { key: 'extradata', label: '附加数据', path: '/api/sdk/extradata', authMode: 'token', sampleData: {} },
  { key: 'clouddata-get', label: '读取云端数据', path: '/api/sdk/clouddata/get', authMode: 'token', sampleData: {} },
  { key: 'clouddata-set', label: '写入云端数据', path: '/api/sdk/clouddata/set', authMode: 'token', sampleData: { cloud_data: 'cloud value' } },
  { key: 'usermark-get', label: '读取用户标识', path: '/api/sdk/usermark/get', authMode: 'token', sampleData: { key: 'vip_level' } },
  { key: 'usermark-set', label: '写入用户标识', path: '/api/sdk/usermark/set', authMode: 'token', sampleData: { key: 'vip_level', value: '1', expire_at: '2026-12-31 23:59:59' } },
  { key: 'devices', label: '设备列表', path: '/api/sdk/devices', authMode: 'none', sampleData: { user: 'testuser', password: 'abc123' } },
  { key: 'unbind-device', label: '解绑设备', path: '/api/sdk/unbind-device', authMode: 'none', sampleData: { user: 'testuser', password: 'abc123', device_id: 1 } },
  { key: 'change-password', label: '修改密码', path: '/api/sdk/change-password', authMode: 'token', sampleData: { old_password: 'abc123', new_password: 'abc123456', captcha_id: '', captcha: '' } },
  { key: 'point-shop-items', label: '积分商品列表', path: '/api/sdk/point-shop/items', authMode: 'token', sampleData: {} },
  { key: 'point-shop-exchange', label: '积分兑换商品', path: '/api/sdk/point-shop/exchange', authMode: 'token', sampleData: { item_id: 1 } },
  { key: 'point-shop-exchanges', label: '兑换记录', path: '/api/sdk/point-shop/exchanges', authMode: 'token', sampleData: {} },
]

const HISTORY_KEY = 'clientapi-debug-history'
const DEFAULT_CLIENT_SIGN_ALGO = '[data][key]'
const DEFAULT_SERVER_SIGN_ALGO = '[data][key]'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const keyBytes = (key: string) => {
  const source = textEncoder.encode(key)
  const result = new Uint8Array(32)
  result.set(source.slice(0, 32))
  return result
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  bytes.forEach((item) => {
    binary += String.fromCharCode(item)
  })
  return btoa(binary)
}

const wordArrayToBytes = (wordArray: CryptoJS.lib.WordArray) => {
  const bytes = new Uint8Array(wordArray.sigBytes)
  for (let i = 0; i < wordArray.sigBytes; i += 1) {
    bytes[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return bytes
}

const bytesToWordArray = (bytes: Uint8Array) => {
  const words: number[] = []
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8))
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length)
}

const base64ToBytes = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const aesEncrypt = async (plainText: string, appSecret: string) => {
  if (!crypto?.subtle) {
    const iv = CryptoJS.lib.WordArray.random(16)
    const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plainText), bytesToWordArray(keyBytes(appSecret)), {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })
    const result = iv.clone().concat(encrypted.ciphertext)
    return CryptoJS.enc.Base64.stringify(result)
  }

  const iv = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', keyBytes(appSecret), { name: 'AES-CBC' }, false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, textEncoder.encode(plainText)))
  const result = new Uint8Array(iv.length + encrypted.length)
  result.set(iv)
  result.set(encrypted, iv.length)
  return bytesToBase64(result)
}

const aesDecrypt = async (cipherText: string, appSecret: string) => {
  if (!crypto?.subtle) {
    const allBytes = wordArrayToBytes(CryptoJS.enc.Base64.parse(cipherText))
    if (allBytes.length < 32) throw new Error('密文太短')
    const iv = bytesToWordArray(allBytes.slice(0, 16))
    const ciphertext = bytesToWordArray(allBytes.slice(16))
    const decrypted = CryptoJS.AES.decrypt({ ciphertext } as CryptoJS.lib.CipherParams, bytesToWordArray(keyBytes(appSecret)), {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })
    return CryptoJS.enc.Utf8.stringify(decrypted)
  }

  const bytes = base64ToBytes(cipherText)
  if (bytes.length < 32) throw new Error('密文太短')
  const iv = bytes.slice(0, 16)
  const encrypted = bytes.slice(16)
  const key = await crypto.subtle.importKey('raw', keyBytes(appSecret), { name: 'AES-CBC' }, false, ['decrypt'])
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, encrypted))
  return textDecoder.decode(decrypted)
}

const sha256Hex = async (value: string) => {
  if (!crypto?.subtle) {
    return CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex)
  }

  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)))
  return Array.from(hash).map((item) => item.toString(16).padStart(2, '0')).join('')
}

const calcSign = async (template: string, data: string, appKey: string) => {
  if (!template.trim()) return ''
  return sha256Hex(template.replaceAll('[data]', data).replaceAll('[key]', appKey))
}

const formatJson = (value: unknown) => JSON.stringify(value, null, 2)

const tryFormatJsonText = (value: string) => {
  try {
    return formatJson(JSON.parse(value))
  } catch {
    return value
  }
}

const presetByKey = (key: string) => ENDPOINTS.find((item) => item.key === key) || ENDPOINTS[0]

export default function ClientApiDebug() {
  const [endpointKey, setEndpointKey] = useState(ENDPOINTS[0].key)
  const [appCode, setAppCode] = useState('')
  const [appKey, setAppKey] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [selectedAppId, setSelectedAppId] = useState('')
  const [apps, setApps] = useState<DebugApp[]>([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [clientSignAlgo, setClientSignAlgo] = useState(DEFAULT_CLIENT_SIGN_ALGO)
  const [serverSignAlgo, setServerSignAlgo] = useState(DEFAULT_SERVER_SIGN_ALGO)
  const [token, setToken] = useState('')
  const [businessJson, setBusinessJson] = useState(withCommon(ENDPOINTS[0].sampleData))
  const [requestBody, setRequestBody] = useState('')
  const [decryptedRequestData, setDecryptedRequestData] = useState('')
  const [loading, setLoading] = useState(false)
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [responseContentType, setResponseContentType] = useState('')
  const [rawResponseBody, setRawResponseBody] = useState('')
  const [decryptedResponseBody, setDecryptedResponseBody] = useState('')
  const [responseSignResult, setResponseSignResult] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])

  const endpoint = useMemo(() => presetByKey(endpointKey), [endpointKey])
  const selectedApp = useMemo(() => apps.find((item) => String(item.id) === selectedAppId), [apps, selectedAppId])

  useEffect(() => {
    const loadApps = async () => {
      setAppsLoading(true)
      try {
        const res: any = await userApi.listApps(1, 200)
        setApps(res.data.list || [])
      } catch (e: any) {
        toast.error(e.message || '获取应用列表失败')
      } finally {
        setAppsLoading(false)
      }
    }
    loadApps()
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      if (saved) setHistory(JSON.parse(saved))
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)))
    } catch {
      // ignore storage failures
    }
  }, [history])

  const applyEndpoint = (key: string) => {
    const next = presetByKey(key)
    setEndpointKey(next.key)
    setBusinessJson(withCommon(next.sampleData))
    setRequestBody('')
    setDecryptedRequestData('')
    setRawResponseBody('')
    setDecryptedResponseBody('')
    setResponseSignResult('')
    setResponseStatus(null)
    setResponseContentType('')
  }

  const applyApp = (id: string) => {
    const app = apps.find((item) => String(item.id) === id)
    setSelectedAppId(id)
    if (!app) return
    setAppCode(app.app_code || '')
    setAppKey(app.app_key || '')
    setAppSecret(app.app_secret || '')
    setClientSignAlgo(app.sign_algo || '')
    setServerSignAlgo(app.server_sign_algo || '')
    setRequestBody('')
    setDecryptedRequestData('')
    toast.success(`已填充应用：${app.app_name}`)
  }

  const buildRequestPayload = async () => {
    if (!appCode.trim()) throw new Error('请输入 AppCode')
    if (!appKey.trim()) throw new Error('请输入 AppKey')
    if (!appSecret.trim()) throw new Error('请输入 AppSecret')

    let data: unknown
    try {
      data = businessJson.trim() ? JSON.parse(businessJson) : {}
    } catch {
      throw new Error('业务参数 JSON 格式错误')
    }

    const plainText = JSON.stringify(data)
    const encryptedData = await aesEncrypt(plainText, appSecret.trim())
    const sign = await calcSign(serverSignAlgo, encryptedData, appKey.trim())
    const payload = {
      app_code: appCode.trim(),
      data: encryptedData,
      sign,
    }
    return { payload, plainText: formatJson(data) }
  }

  const handleGenerateRequest = async () => {
    try {
      const { payload, plainText } = await buildRequestPayload()
      setRequestBody(formatJson(payload))
      setDecryptedRequestData(plainText)
      toast.success('已生成加密请求体')
    } catch (e: any) {
      toast.error(e.message || '生成失败')
    }
  }

  const handleSend = async () => {
    let payload: Record<string, unknown>
    let plainText = ''
    try {
      const built = await buildRequestPayload()
      payload = built.payload
      plainText = built.plainText
    } catch (e: any) {
      toast.error(e.message || '请求参数错误')
      return
    }

    if ((endpoint.authMode === 'token' || endpoint.authMode === 'optional-token') && !token.trim() && endpoint.authMode === 'token') {
      toast.error('该接口需要 X-Token')
      return
    }

    setLoading(true)
    setResponseStatus(null)
    setResponseContentType('')
    setRawResponseBody('')
    setDecryptedResponseBody('')
    setResponseSignResult('')
    setRequestBody(formatJson(payload))
    setDecryptedRequestData(plainText)

    try {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (token.trim()) headers.set('X-Token', token.trim())

      const res = await fetch(endpoint.path, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const contentType = res.headers.get('content-type') || ''
      const text = await res.text()
      setResponseStatus(res.status)
      setResponseContentType(contentType || 'text/plain')
      setRawResponseBody(tryFormatJsonText(text))

      try {
        const parsed = JSON.parse(text)
        if (typeof parsed?.data === 'string' && typeof parsed?.sign === 'string') {
          const decrypted = await aesDecrypt(parsed.data, appSecret.trim())
          const expectedSign = await calcSign(clientSignAlgo, parsed.data, appKey.trim())
          setDecryptedResponseBody(tryFormatJsonText(decrypted))
          if (clientSignAlgo.trim()) {
            setResponseSignResult(expectedSign === parsed.sign ? '响应签名验证通过' : `响应签名不匹配，期望：${expectedSign}`)
          } else {
            setResponseSignResult('未配置客户端签名算法，跳过响应签名校验')
          }
        } else if (typeof parsed?.data === 'string') {
          setDecryptedResponseBody('响应包含 data 但缺少 sign，按明文/非标准响应处理')
          setResponseSignResult('响应缺少 sign，未校验签名')
        } else {
          setDecryptedResponseBody('响应不是加密格式，无需解密')
          setResponseSignResult('响应不是加密格式，未校验签名')
        }
      } catch (e: any) {
        setDecryptedResponseBody(`解密失败：${e.message || '响应内容不是可解密数据'}`)
        setResponseSignResult('解密失败，未完成响应签名校验')
      }

      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          endpointKey,
          appCode,
          token,
          businessJson,
          createdAt: Date.now(),
        },
        ...prev.slice(0, 11),
      ])
    } catch (e: any) {
      toast.error(e.message || '请求失败')
      setRawResponseBody('')
      setDecryptedResponseBody(`请求失败：${e.message || '网络错误或接口不可达'}`)
      setResponseSignResult('请求失败，未进行响应解密和签名校验')
    } finally {
      setLoading(false)
    }
  }

  const loadHistoryItem = (item: HistoryItem) => {
    setEndpointKey(item.endpointKey)
    setAppCode(item.appCode)
    setToken(item.token)
    setBusinessJson(item.businessJson)
  }

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(message)
    } catch {
      toast.error('复制失败')
    }
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
    toast.success('历史已清空')
  }

  const authModeLabel = endpoint.authMode === 'token' ? '需要 X-Token' : endpoint.authMode === 'optional-token' ? '可选 X-Token' : '无需 Token'

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <Card className="border border-primary/10 bg-gradient-to-br from-primary/10 via-white to-white dark:via-content1 dark:to-content1 shadow-sm">
        <CardBody className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <HiSparkles className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-bold">客户端 API 调试台</h1>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                选择 SDK 接口后自动填充业务参数，发送时自动加密 data、计算请求签名，并展示响应解密结果。
              </p>
            </div>
            <Chip color={loading ? 'warning' : 'success'} variant="flat">
              {loading ? '请求中' : '就绪'}
            </Chip>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <h2 className="font-semibold">请求配置</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select
                  label="快捷选择应用"
                  placeholder={appsLoading ? '应用加载中...' : '选择应用后自动填写参数'}
                  selectedKeys={selectedAppId ? new Set([selectedAppId]) : new Set([])}
                  onSelectionChange={(keys) => applyApp(String(Array.from(keys)[0] || ''))}
                  renderValue={() => selectedApp ? `${selectedApp.app_name} - ${selectedApp.app_code}` : ''}
                  isLoading={appsLoading}
                  variant="bordered"
                >
                  {apps.map((item) => <SelectItem key={String(item.id)} textValue={`${item.app_name} - ${item.app_code}`}>{item.app_name} - {item.app_code}</SelectItem>)}
                </Select>
                <Select
                  label="客户端接口"
                  selectedKeys={new Set([endpointKey])}
                  onSelectionChange={(keys) => applyEndpoint(String(Array.from(keys)[0] || endpointKey))}
                  renderValue={() => `${endpoint.label} - ${endpoint.path}`}
                  variant="bordered"
                >
                  {ENDPOINTS.map((item) => <SelectItem key={item.key} textValue={`${item.label} - ${item.path}`}>{item.label} - {item.path}</SelectItem>)}
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="接口路径" value={endpoint.path} isReadOnly variant="bordered" />
                <Input label="应用名称" value={selectedApp?.app_name || ''} isReadOnly placeholder="未选择应用" variant="bordered" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label="AppCode" value={appCode} onChange={(e) => setAppCode(e.target.value)} placeholder="1234-56789012" variant="bordered" />
                <Input label="AppKey" value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="用于签名的 AppKey" variant="bordered" />
                <Input label="AppSecret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="用于 AES 加解密的 AppSecret" variant="bordered" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="客户端签名算法（验响应）" value={clientSignAlgo} onChange={(e) => setClientSignAlgo(e.target.value)} placeholder="[data][key]" variant="bordered" />
                <Input label="服务端签名算法（签请求）" value={serverSignAlgo} onChange={(e) => setServerSignAlgo(e.target.value)} placeholder="[data][key]" variant="bordered" />
              </div>

              {(endpoint.authMode === 'token' || endpoint.authMode === 'optional-token') && (
                <Input label={`X-Token（${authModeLabel}）`} value={token} onChange={(e) => setToken(e.target.value)} placeholder="登录成功后返回的 token" variant="bordered" />
              )}

              <Textarea
                label="业务参数 JSON（明文，发送时自动加密）"
                minRows={11}
                value={businessJson}
                onChange={(e) => setBusinessJson(e.target.value)}
                classNames={{ input: 'font-mono text-xs' }}
                variant="bordered"
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Textarea
                  label="本次外层请求 JSON（自动生成）"
                  minRows={9}
                  value={requestBody}
                  isReadOnly
                  classNames={{ input: 'font-mono text-xs' }}
                  variant="bordered"
                />
                <Textarea
                  label="本次 data 解密预览"
                  minRows={9}
                  value={decryptedRequestData}
                  isReadOnly
                  classNames={{ input: 'font-mono text-xs' }}
                  variant="bordered"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-500 break-all">
                  当前请求: <code className="font-mono">POST {endpoint.path}</code>，{authModeLabel}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="flat" onPress={() => applyEndpoint(endpointKey)} startContent={<HiRefresh className="w-4 h-4" />}>
                    重置示例
                  </Button>
                  <Button variant="flat" onPress={handleGenerateRequest} startContent={<HiSparkles className="w-4 h-4" />}>
                    生成加密体
                  </Button>
                  <Button variant="flat" onPress={() => copyText(requestBody, '请求体已复制')} isDisabled={!requestBody} startContent={<HiClipboardCopy className="w-4 h-4" />}>
                    复制请求体
                  </Button>
                  <Button color="primary" onPress={handleSend} isLoading={loading} startContent={<HiPlay className="w-4 h-4" />}>
                    发送请求
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="pb-0 flex items-center justify-between gap-3">
              <h2 className="font-semibold">响应结果</h2>
              <div className="flex items-center gap-2">
                {responseStatus !== null && (
                  <Chip size="sm" variant="flat" color={responseStatus >= 200 && responseStatus < 300 ? 'success' : 'danger'}>
                    {responseStatus}
                  </Chip>
                )}
                <Button size="sm" variant="flat" onPress={() => copyText(rawResponseBody, '原始响应已复制')} isDisabled={!rawResponseBody} startContent={<HiClipboardCopy className="w-4 h-4" />}>
                  复制原文
                </Button>
                <Button size="sm" variant="flat" onPress={() => copyText(decryptedResponseBody, '解密响应已复制')} isDisabled={!decryptedResponseBody} startContent={<HiClipboardCopy className="w-4 h-4" />}>
                  复制解密
                </Button>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <Chip size="sm" variant="flat">Content-Type: {responseContentType || '-'}</Chip>
                {responseSignResult && <Chip size="sm" variant="flat" color={responseSignResult.includes('通过') ? 'success' : 'warning'}>{responseSignResult}</Chip>}
              </div>
              <Divider />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">原始响应</p>
                  <ScrollShadow className="max-h-[520px] rounded-xl border border-default-200 dark:border-default-100 bg-default-50 dark:bg-content2 p-4">
                    <pre className="whitespace-pre-wrap break-words text-xs leading-5 font-mono text-default-700 dark:text-default-200">
                      {rawResponseBody || '还没有响应内容'}
                    </pre>
                  </ScrollShadow>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">解密后的响应数据</p>
                  <ScrollShadow className="max-h-[520px] rounded-xl border border-default-200 dark:border-default-100 bg-default-50 dark:bg-content2 p-4">
                    <pre className="whitespace-pre-wrap break-words text-xs leading-5 font-mono text-default-700 dark:text-default-200">
                      {decryptedResponseBody || '暂无解密结果，请先发送请求'}
                    </pre>
                  </ScrollShadow>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-0 flex items-center justify-between gap-2">
            <h2 className="font-semibold">历史记录</h2>
            <Button size="sm" variant="flat" color="danger" onPress={clearHistory} startContent={<HiTrash className="w-4 h-4" />}>
              清空
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">暂无历史记录</p>
            ) : (
              <ScrollShadow className="max-h-[760px] pr-1">
                <div className="space-y-2">
                  {history.map((item) => {
                    const historyEndpoint = presetByKey(item.endpointKey)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => loadHistoryItem(item)}
                        className="w-full text-left rounded-lg border border-default-200 dark:border-default-100 px-2.5 py-2 hover:bg-default-100 dark:hover:bg-content2 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Chip size="sm" variant="flat" className="h-5 text-[10px]">POST</Chip>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1"><HiClock className="w-3 h-3" />{new Date(item.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-xs font-medium text-default-700 truncate mt-1">{historyEndpoint.label}</p>
                        <p className="text-[10px] font-mono text-default-500 truncate">{historyEndpoint.path}</p>
                      </button>
                    )
                  })}
                </div>
              </ScrollShadow>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
