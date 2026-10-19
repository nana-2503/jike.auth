import { useState, useEffect } from 'react'
import { Card, CardBody, Input, Button } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'

const colorPresets = [
  { name: '默认蓝', value: '#006FEE' },
  { name: '翠绿', value: '#17C964' },
  { name: '紫罗兰', value: '#7828C8' },
  { name: '玫红', value: '#F31260' },
  { name: '橙色', value: '#F5A524' },
  { name: '青色', value: '#06B6D4' },
  { name: '粉色', value: '#EC4899' },
  { name: '靛蓝', value: '#4F46E5' },
]

const animationEffects = [
  { value: 'blur-in', label: '模糊淡入', description: '从模糊到清晰的淡入效果' },
  { value: 'fade-in', label: '淡入', description: '简单的淡入效果' },
  { value: 'slide-in-left', label: '左侧滑入', description: '从左侧滑入' },
  { value: 'slide-in-right', label: '右侧滑入', description: '从右侧滑入' },
  { value: 'fade-in-up', label: '上浮淡入', description: '从下往上浮动淡入' },
  { value: 'zoom-in', label: '缩放淡入', description: '从小到大缩放淡入' },
  { value: 'bounce-in', label: '弹跳进入', description: '带弹跳效果的进入' },
  { value: 'flip-in', label: '翻转进入', description: '3D翻转进入效果' },
  { value: 'expand-down', label: '展开下拉', description: '从上到下展开' },
  { value: 'wave-in', label: '波浪进入', description: '波浪式进入效果' },
  { value: 'none', label: '无动画', description: '关闭页面切换动画' },
]

export default function Theme() {
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    primary_color: '',
    page_animation: 'blur-in',
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res: any = await adminApi.getSecurityConfig()
      setConfig({ 
        primary_color: res.data.primary_color || '',
        page_animation: res.data.page_animation || 'blur-in',
      })
    } catch (e: any) {
      toast.error(e.message || '获取配置失败')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 获取完整的安全配置
      const securityRes: any = await adminApi.getSecurityConfig()
      const fullConfig = { 
        ...securityRes.data, 
        primary_color: config.primary_color,
        page_animation: config.page_animation,
      }
      
      await adminApi.saveSecurityConfig(fullConfig)
      toast.success('保存成功，刷新页面后生效')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">主题设置</h1>

      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-bold mb-4">主题色</h3>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-2">预设颜色</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {colorPresets.map((color) => (
                  <button
                    key={color.value}
                    className={`w-10 h-10 rounded-lg border-2 transition-all ${
                      config.primary_color === color.value ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setConfig({ ...config, primary_color: color.value })}
                    title={color.name}
                  />
                ))}
                <button
                  className={`w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center bg-gray-100 dark:bg-gray-800 ${
                    !config.primary_color ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  onClick={() => setConfig({ ...config, primary_color: '' })}
                  title="默认"
                >
                  <span className="text-xs">默认</span>
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  label="自定义颜色"
                  placeholder="#006FEE"
                  value={config.primary_color}
                  onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                  className="max-w-xs"
                />
                {config.primary_color && (
                  <div
                    className="w-10 h-10 rounded-lg border"
                    style={{ backgroundColor: config.primary_color }}
                  />
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                设置网站主题色，留空使用默认蓝色。修改后需要刷新页面生效。
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-6">
          <h3 className="text-lg font-bold mb-4">页面动画</h3>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-3">页面切换动画效果</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {animationEffects.map((effect) => (
                  <button
                    key={effect.value}
                    onClick={() => setConfig({ ...config, page_animation: effect.value })}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      config.page_animation === effect.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                        config.page_animation === effect.value
                          ? 'border-primary bg-primary'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {config.page_animation === effect.value && (
                          <div className="w-2 h-2 rounded-full bg-white"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{effect.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{effect.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-3">
                设置页面切换时的动画效果，修改后需要刷新页面生效。
              </p>
            </div>
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
