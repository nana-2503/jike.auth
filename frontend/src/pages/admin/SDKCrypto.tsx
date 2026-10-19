import { useEffect, useState } from 'react'
import { Card, CardBody, CardHeader, Button, Switch, Select, SelectItem, Textarea, Spinner, Chip } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

const defaultPipelineConfig = `{
  "encrypt": [
    { "op": "aes-256-cbc-encrypt", "key": "app_secret" }
  ],
  "decrypt": [
    { "op": "aes-256-cbc-decrypt", "key": "app_secret" }
  ]
}`

const multiStepPipelineConfig = `{
  "encrypt": [
    { "op": "aes-256-cbc-encrypt", "key": "app_secret" },
    { "op": "base64-encode" },
    { "op": "reverse" },
    { "op": "hex-encode" }
  ],
  "decrypt": [
    { "op": "hex-decode" },
    { "op": "reverse" },
    { "op": "base64-decode" },
    { "op": "aes-256-cbc-decrypt", "key": "app_secret" }
  ]
}`

const defaultEncryptScript = `function encrypt(input, ctx) {
  return aesCbcEncrypt(input, ctx.app_secret);
}`

const defaultDecryptScript = `function decrypt(input, ctx) {
  return aesCbcDecrypt(input, ctx.app_secret);
}`

const pipelineSteps = [
  { name: 'Base64 编码', steps: 'base64_encode / base64-encode' },
  { name: 'Base64 解码', steps: 'base64_decode / base64-decode' },
  { name: 'Hex 编码', steps: 'hex_encode / hex-encode' },
  { name: 'Hex 解码', steps: 'hex_decode / hex-decode' },
  { name: '字符串反转', steps: 'reverse' },
  { name: 'XOR 异或', steps: 'xor / xor_key / xor-key' },
  { name: 'RC4 加密', steps: 'rc4_encrypt / rc4-encrypt' },
  { name: 'RC4 解密', steps: 'rc4_decrypt / rc4-decrypt' },
  { name: 'SHA256 摘要', steps: 'sha256 / sha256_hex / sha256-hex' },
  { name: 'AES-256-CBC 加密', steps: 'aes_256_cbc_encrypt / aes-256-cbc-encrypt' },
  { name: 'AES-256-CBC 解密', steps: 'aes_256_cbc_decrypt / aes-256-cbc-decrypt' },
  { name: 'ECC/ECIES 加密', steps: 'ecc_encrypt / ecc-encrypt / ecies_encrypt / ecies-encrypt' },
  { name: 'ECC/ECIES 解密', steps: 'ecc_decrypt / ecc-decrypt / ecies_decrypt / ecies-decrypt' },
]

const keyOptions = ['app_secret', 'app_key', 'app_code', 'custom_fields.字段名', 'custom.字段名', 'custom:字段名', '自定义固定字符串']

const customJSExample = `function rot13(s) {
  return s.replace(/[a-zA-Z]/g, function (c) {
    var base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
  });
}

function encrypt(input, ctx) {
  return base64Encode(rot13(input + ctx.app_key));
}

function decrypt(input, ctx) {
  var plain = rot13(base64Decode(input));
  return plain.slice(0, plain.length - ctx.app_key.length);
}`

type SDKCryptoConfig = {
  enabled: number
  type: 'pipeline' | 'js'
  config: string
  encrypt_script: string
  decrypt_script: string
}

export default function AdminSDKCrypto() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SDKCryptoConfig>({
    enabled: 0,
    type: 'pipeline',
    config: defaultPipelineConfig,
    encrypt_script: defaultEncryptScript,
    decrypt_script: defaultDecryptScript,
  })

  useEffect(() => {
    adminApi.getSDKCryptoConfig().then((res: any) => {
      const data = res.data || {}
      setConfig({
        enabled: data.enabled || 0,
        type: data.type === 'js' ? 'js' : 'pipeline',
        config: data.config || defaultPipelineConfig,
        encrypt_script: data.encrypt_script || defaultEncryptScript,
        decrypt_script: data.decrypt_script || defaultDecryptScript,
      })
    }).catch((e: any) => {
      toast.error(e.message || '加载失败')
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (config.type === 'pipeline') {
      try {
        JSON.parse(config.config)
      } catch {
        toast.error('步骤组合 JSON 格式错误')
        return
      }
    }

    setSaving(true)
    try {
      await adminApi.saveSDKCryptoConfig(config)
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
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">SDK 通讯加密</h2>
          <p className="text-sm text-gray-500 mt-1">全局控制客户端接口数据通讯加解密，影响所有 SDK HTTP 和 WebSocket 请求。</p>
        </div>
        <Chip color={config.enabled === 1 ? 'success' : 'default'} variant="flat">
          {config.enabled === 1 ? '自定义已启用' : '使用内置 AES'}
        </Chip>
      </div>

      <Card>
        <CardBody className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">启用自定义加解密</p>
              <p className="text-sm text-gray-500">关闭时继续使用系统内置 AES-256-CBC，不影响现有客户端。</p>
            </div>
            <Switch
              isSelected={config.enabled === 1}
              onValueChange={(v) => setConfig({ ...config, enabled: v ? 1 : 0 })}
            />
          </div>

          <Select
            label="配置方式"
            selectedKeys={[config.type]}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0]
              setConfig({ ...config, type: value === 'js' ? 'js' : 'pipeline' })
            }}
            className="max-w-xs"
            variant="bordered"
          >
            <SelectItem key="pipeline">步骤组合</SelectItem>
            <SelectItem key="js">JavaScript 沙箱</SelectItem>
          </Select>
        </CardBody>
      </Card>

      {config.type === 'pipeline' ? (
        <Card>
          <CardHeader className="pb-0">
            <div>
              <h3 className="font-semibold">步骤组合配置</h3>
              <p className="text-sm text-gray-500 mt-1">支持多步骤模式，后端会按顺序执行 encrypt/decrypt 数组里的每一步。解密流程通常要按加密的反向步骤编写，SHA256 是单向摘要，通常不要放在需要还原原文的通讯加密流程里。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">内置算法</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">步骤名 op</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pipelineSteps.map((item) => (
                    <tr key={item.name}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-200">{item.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-300">{item.steps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>key 支持：</span>
              {keyOptions.map((item) => <Chip key={item} size="sm" variant="flat">{item}</Chip>)}
            </div>
            <p className="text-xs text-gray-500">应用自定义字段可用作 key：custom_fields.字段名、custom.字段名 或 custom:字段名。RC4 key 可使用普通字符串、Base64 或 Hex。ECC 使用 P-256 ECIES 风格封装：加密步骤 key 填 P-256 公钥，解密步骤 key 填 P-256 私钥，支持 Base64/Hex 原始密钥。</p>
            <Textarea
              label="JSON 配置"
              minRows={14}
              value={config.config}
              onChange={(e) => setConfig({ ...config, config: e.target.value })}
              classNames={{ input: 'font-mono text-xs' }}
              variant="bordered"
            />
            <div className="flex justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="flat" onPress={() => setConfig({ ...config, config: defaultPipelineConfig })}>恢复默认示例</Button>
                <Button variant="flat" onPress={() => setConfig({ ...config, config: multiStepPipelineConfig })}>填入多步骤示例</Button>
              </div>
              <Button color="primary" onPress={handleSave} isLoading={saving}>保存配置</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <div>
              <h3 className="font-semibold">JavaScript 沙箱脚本</h3>
              <p className="text-sm text-gray-500 mt-1">可以在脚本里自己写纯 JS 算法函数，再由 encrypt(input, ctx) 和 decrypt(input, ctx) 调用。脚本不能访问文件、网络或系统命令。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Textarea
              label="加密脚本"
              minRows={8}
              value={config.encrypt_script}
              onChange={(e) => setConfig({ ...config, encrypt_script: e.target.value })}
              classNames={{ input: 'font-mono text-xs' }}
              variant="bordered"
            />
            <Textarea
              label="解密脚本"
              minRows={8}
              value={config.decrypt_script}
              onChange={(e) => setConfig({ ...config, decrypt_script: e.target.value })}
              classNames={{ input: 'font-mono text-xs' }}
              variant="bordered"
            />
            <div className="text-xs text-gray-500 leading-6">
              可用 ctx 字段：app_key、app_secret、app_code、custom_fields。读取应用自定义字段示例：ctx.custom_fields.salt。可用函数：base64Encode、base64Decode、hexEncode、hexDecode、reverse、xor、sha256Hex、aesCbcEncrypt、aesCbcDecrypt。
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-2">
              <p className="text-sm font-medium">自定义算法函数示例</p>
              <pre className="overflow-x-auto whitespace-pre text-xs leading-5 font-mono text-gray-600 dark:text-gray-300">{customJSExample}</pre>
            </div>
            <div className="flex justify-between gap-3">
              <Button variant="flat" onPress={() => setConfig({ ...config, encrypt_script: defaultEncryptScript, decrypt_script: defaultDecryptScript })}>恢复默认示例</Button>
              <Button color="primary" onPress={handleSave} isLoading={saving}>保存配置</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
