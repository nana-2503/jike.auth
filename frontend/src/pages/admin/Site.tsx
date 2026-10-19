import { useEffect, useState, useRef } from 'react'
import { Input, Button, Card, CardBody, Spinner } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { useSiteStore } from '../../store'

export default function AdminSite() {
  const setSiteConfig = useSiteStore((state) => state.setConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [config, setConfig] = useState({
    site_name: '',
    site_subtitle: '',
    site_logo: '',
    site_logo_dark: '',
    site_favicon: '',
    service_qq: '',
  })
  const logoInputRef = useRef<HTMLInputElement>(null)
  const logoDarkInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res: any = await adminApi.getSiteConfig()
      const data = res.data || {}
      setConfig({
        site_name: data.site_name || '',
        site_subtitle: data.site_subtitle || '',
        site_logo: data.site_logo || '',
        site_logo_dark: data.site_logo_dark || '',
        site_favicon: data.site_favicon || '',
        service_qq: data.service_qq || '',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'logo_dark' | 'favicon') => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(type)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type === 'logo_dark' ? 'logo' : type)
      const res: any = await adminApi.uploadSiteAsset(formData)
      if (type === 'logo') {
        setConfig({ ...config, site_logo: res.data.url })
      } else if (type === 'logo_dark') {
        setConfig({ ...config, site_logo_dark: res.data.url })
      } else {
        setConfig({ ...config, site_favicon: res.data.url })
      }
      toast.success('上传成功')
    } catch (err: any) {
      toast.error(err.message || '上传失败')
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.saveSiteConfig(config)
      // 更新全局状态
      setSiteConfig(config)
      // 更新页面标题
      if (config.site_name) {
        document.title = `后台管理 - ${config.site_name}`
      }
      // 更新 favicon
      if (config.site_favicon) {
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link')
        link.type = 'image/x-icon'
        link.rel = 'shortcut icon'
        link.href = config.site_favicon
        document.head.appendChild(link)
      }
      toast.success('保存成功')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="p-4 md:p-6 space-y-4">
          <Input 
            label="网站名称" 
            value={config.site_name} 
            onChange={(e) => setConfig({ ...config, site_name: e.target.value })}
            placeholder="极客验证"
          />

          <Input 
            label="网站副标题" 
            value={config.site_subtitle} 
            onChange={(e) => setConfig({ ...config, site_subtitle: e.target.value })}
            placeholder="简单好用的网络验证系统"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium mb-2">网站Logo (亮色模式)</p>
              <div className="flex items-center gap-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg min-h-[60px]">
                {config.site_logo && (
                  <img src={config.site_logo} alt="Logo" className="h-10 object-contain" />
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleUpload(e, 'logo')}
                />
                <Button 
                  size="sm" 
                  onPress={() => logoInputRef.current?.click()}
                  isLoading={uploading === 'logo'}
                >
                  {config.site_logo ? '更换' : '上传'}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">网站Logo (暗色模式)</p>
              <div className="flex items-center gap-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg min-h-[60px]">
                {config.site_logo_dark && (
                  <img src={config.site_logo_dark} alt="Logo Dark" className="h-10 object-contain" />
                )}
                <input
                  ref={logoDarkInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleUpload(e, 'logo_dark')}
                />
                <Button 
                  size="sm" 
                  onPress={() => logoDarkInputRef.current?.click()}
                  isLoading={uploading === 'logo_dark'}
                >
                  {config.site_logo_dark ? '更换' : '上传'}
                </Button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">网站图标 (favicon)</p>
            <div className="flex items-center gap-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              {config.site_favicon && (
                <img src={config.site_favicon} alt="Favicon" className="h-8 w-8 object-contain" />
              )}
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/*,.ico"
                hidden
                onChange={(e) => handleUpload(e, 'favicon')}
              />
              <Button 
                size="sm" 
                onPress={() => faviconInputRef.current?.click()}
                isLoading={uploading === 'favicon'}
              >
                {config.site_favicon ? '更换图标' : '上传图标'}
              </Button>
            </div>
          </div>

          <Input 
            label="客服QQ" 
            value={config.service_qq} 
            onChange={(e) => setConfig({ ...config, service_qq: e.target.value })}
            placeholder="客服QQ号码"
          />

          <div className="pt-4">
            <Button color="primary" onPress={handleSave} isLoading={saving}>
              保存配置
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
