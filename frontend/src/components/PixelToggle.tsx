import { Tooltip } from '@heroui/react'
import { useThemeStore } from '../store'

// 像素风主题开关。开启后在 <html> 上挂 pixel class，
// 配合 index.css 中的全局样式实现像素字体 + 直角硬边框。
export default function PixelToggle() {
  const pixel = useThemeStore((state) => state.pixel)
  const togglePixel = useThemeStore((state) => state.togglePixel)

  return (
    <Tooltip content={pixel ? '关闭像素风主题' : '开启像素风主题'}>
      <button
        onClick={togglePixel}
        aria-pressed={pixel}
        className={`p-2.5 rounded-lg transition-colors ${
          pixel
            ? 'bg-primary/10 text-primary'
            : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-content2'
        }`}
      >
        <svg viewBox="0 0 20 20" className="w-5 h-5" aria-hidden="true">
          <g fill="currentColor">
            <rect x="4" y="4" width="5" height="5" opacity="1" />
            <rect x="11" y="4" width="5" height="5" opacity="0.6" />
            <rect x="4" y="11" width="5" height="5" opacity="0.6" />
            <rect x="11" y="11" width="5" height="5" opacity="0.25" />
          </g>
        </svg>
      </button>
    </Tooltip>
  )
}
