import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@heroui/react'
import { useSiteStore } from '../store'
import { configApi } from '../api'
import { HiShieldCheck, HiLightningBolt, HiCode, HiCloud, HiClock, HiKey, HiDeviceMobile, HiChartBar, HiGlobe, HiSupport } from 'react-icons/hi'

export default function Home() {
  const siteConfig = useSiteStore((state) => state.config)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    document.title = siteConfig.site_name || '极客验证'
    configApi.getAnnouncements().then((res: any) => {
      setAnnouncements((res.data || []).filter((a: any) => a.status === 1).slice(0, 3))
    }).catch(() => {})

    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [siteConfig.site_name])

  const brandName = siteConfig.site_name?.trim() || '极客验证'

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-background text-foreground">
      {/* 导航栏 */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/85 dark:bg-content1/90 backdrop-blur-xl shadow-sm border-b border-black/[0.06] dark:border-white/10'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2.5 min-w-0">
            {siteConfig.site_logo && (
              <img src={siteConfig.site_logo} alt="" className="h-8 w-auto max-w-[140px] object-contain shrink-0 dark:hidden" />
            )}
            {siteConfig.site_logo_dark && (
              <img src={siteConfig.site_logo_dark} alt="" className="h-8 w-auto max-w-[140px] object-contain shrink-0 hidden dark:block" />
            )}
            <span className="text-lg sm:text-xl font-bold tracking-tight truncate text-foreground">
              {brandName}
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button as={Link} to="/login" variant="light" size="sm" className="font-medium text-default-600">
              登录
            </Button>
            <Button as={Link} to="/register" color="primary" size="sm" radius="full" className="font-semibold px-4 sm:px-5">
              免费注册
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 sm:pt-28 pb-20 sm:pb-28 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 right-0 w-[min(100vw,520px)] h-[520px] rounded-full bg-primary/[0.07] blur-3xl" />
          <div className="absolute top-40 -left-24 w-96 h-96 rounded-full bg-blue-500/[0.06] blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] rounded-[100%] bg-gradient-to-t from-primary/[0.04] to-transparent blur-2xl" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-6 sm:mb-8 border border-primary/15">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
            专业的软件授权验证平台
          </div>

          <h1 className="text-[1.75rem] sm:text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold mb-5 sm:mb-6 leading-[1.15] tracking-tight px-1">
            为您提供{' '}
            <span className="bg-gradient-to-r from-primary via-blue-600 to-cyan-600 bg-clip-text text-transparent">
              安全可靠
            </span>
            <br className="sm:hidden" />
            <span className="sm:ml-1">的授权保护</span>
          </h1>

          <p className="text-default-500 text-base sm:text-lg md:text-xl mb-9 sm:mb-11 max-w-xl mx-auto leading-relaxed">
            {siteConfig.site_subtitle || '简单好用的验证系统'}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-md sm:max-w-none mx-auto">
            <Button
              as={Link}
              to="/register"
              color="primary"
              size="lg"
              radius="full"
              className="font-semibold px-8 h-12 text-base shadow-lg shadow-primary/25 w-full sm:w-auto min-w-[200px]"
            >
              免费开始使用
            </Button>
            <Button
              as={Link}
              to="/login"
              variant="bordered"
              size="lg"
              radius="full"
              className="font-semibold px-8 h-12 text-base border-default-300 bg-white/80 dark:bg-content1/80 backdrop-blur-sm w-full sm:w-auto min-w-[200px]"
            >
              登录控制台
            </Button>
          </div>

          <div className="mt-12 sm:mt-16 max-w-lg mx-auto rounded-2xl bg-white/90 dark:bg-content1/70 backdrop-blur-md border border-black/[0.06] dark:border-white/10 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] px-4 py-6 sm:py-7">
            <div className="grid grid-cols-3 divide-x divide-default-200 dark:divide-default-100">
              {[
                { num: 'AES-256', label: '通讯加密' },
                { num: '99.9%', label: '服务可用性' },
                { num: '<10ms', label: '响应延迟' },
              ].map((s, i) => (
                <div key={i} className="text-center px-1 sm:px-2">
                  <div className="text-lg sm:text-2xl font-bold text-primary tabular-nums">{s.num}</div>
                  <div className="text-[11px] sm:text-xs text-default-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 核心功能 */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-white dark:bg-content1/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 tracking-tight">强大的核心功能</h2>
            <p className="text-default-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              覆盖软件授权验证的全部场景，开箱即用
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              { icon: <HiShieldCheck className="w-6 h-6" />, title: '通讯加密', desc: 'AES-256-CBC 加密 + SHA-256 签名双重保护，防抓包防篡改', color: 'bg-blue-500/12 text-blue-600 dark:text-blue-400' },
              { icon: <HiKey className="w-6 h-6" />, title: '卡密系统', desc: '支持充值卡和登录卡两种模式，灵活的卡种配置和批量制卡', color: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' },
              { icon: <HiClock className="w-6 h-6" />, title: '多种计费', desc: '免费模式、计时收费、计点收费，满足不同商业模式需求', color: 'bg-amber-500/12 text-amber-600 dark:text-amber-400' },
              { icon: <HiDeviceMobile className="w-6 h-6" />, title: '设备绑定', desc: '特征码绑定、多设备管理、解绑次数控制，防止账号共享', color: 'bg-purple-500/12 text-purple-600 dark:text-purple-400' },
              { icon: <HiChartBar className="w-6 h-6" />, title: '实时监控', desc: '在线会话管理、心跳检测、WebSocket 实时通讯', color: 'bg-rose-500/12 text-rose-600 dark:text-rose-400' },
              { icon: <HiGlobe className="w-6 h-6" />, title: '代理分销', desc: '多级代理体系、独立制卡权限、自动结算返利', color: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400' },
            ].map((f, i) => (
              <div
                key={i}
                className="group rounded-2xl p-6 sm:p-7 bg-[#F9FAFB] dark:bg-content1 border border-black/[0.04] dark:border-white/10 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300"
              >
                <div
                  className={`w-12 h-12 rounded-2xl ${f.color} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300`}
                >
                  {f.icon}
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-default-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 技术优势 */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-[#F9FAFB] dark:bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 tracking-tight">为什么选择我们</h2>
            <p className="text-default-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              专注软件授权验证领域，提供专业可靠的技术服务
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {[
              { icon: <HiCode className="w-5 h-5" />, title: '多语言 SDK', desc: '提供 Go、Node.js 等多语言 SDK，完善的接口文档和示例代码，5 分钟快速接入' },
              { icon: <HiLightningBolt className="w-5 h-5" />, title: '高性能架构', desc: '基于 Go 语言构建，毫秒级响应，支持高并发场景，稳定运行无压力' },
              { icon: <HiCloud className="w-5 h-5" />, title: '云端数据', desc: '用户标识数据、云端存储、数据池等丰富的数据管理能力，满足各种业务需求' },
              { icon: <HiSupport className="w-5 h-5" />, title: '完善服务', desc: '工单系统、活动营销、推广返利、Webhook 回调，一站式运营管理' },
            ].map((f, i) => (
              <div
                key={i}
                className="flex gap-4 sm:gap-5 p-5 sm:p-6 rounded-2xl bg-white dark:bg-content1 border border-black/[0.05] dark:border-white/10 shadow-sm"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {f.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-lg mb-1.5">{f.title}</h3>
                  <p className="text-sm text-default-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 公告 */}
      {announcements.length > 0 && (
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-white dark:bg-content1/40">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">最新公告</h2>
            <div className="space-y-3 sm:space-y-4">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl p-5 bg-[#F9FAFB] dark:bg-content2 border border-black/[0.04] dark:border-white/10 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <span className="text-xs text-default-400 shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-default-500 line-clamp-2 leading-relaxed">{a.content}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl p-10 sm:p-14 md:p-16 bg-gradient-to-br from-primary/[0.08] via-blue-500/[0.06] to-cyan-500/[0.05] border border-primary/15 dark:border-primary/20 shadow-[0_20px_60px_-20px_rgba(37,99,235,0.25)]">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 tracking-tight">准备好开始了吗？</h2>
            <p className="text-default-500 text-base sm:text-lg mb-8 max-w-md mx-auto">
              注册即可免费使用，无需信用卡，几分钟即可完成接入
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
              <Button
                as={Link}
                to="/register"
                color="primary"
                size="lg"
                radius="full"
                className="font-semibold px-10 h-12 text-base shadow-lg shadow-primary/30 w-full sm:w-auto"
              >
                立即注册
              </Button>
              {siteConfig.service_qq && (
                <Button
                  variant="bordered"
                  size="lg"
                  radius="full"
                  className="font-semibold px-8 h-12 text-base bg-white/70 dark:bg-content1/80 w-full sm:w-auto"
                  onPress={() =>
                    window.open(`https://wpa.qq.com/msgrd?v=3&uin=${siteConfig.service_qq}&site=qq&menu=yes`, '_blank')
                  }
                >
                  联系客服
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.06] dark:border-white/10 bg-white/50 dark:bg-content1/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <div className="flex items-center gap-2">
              {siteConfig.site_logo && <img src={siteConfig.site_logo} alt="" className="h-6 dark:hidden opacity-70" />}
              {siteConfig.site_logo_dark && <img src={siteConfig.site_logo_dark} alt="" className="h-6 hidden dark:block opacity-70" />}
              <span className="text-sm font-medium text-default-400">{brandName}</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6 text-sm text-default-400">
              {siteConfig.service_qq && <span>客服 QQ：{siteConfig.service_qq}</span>}
              <span>© {new Date().getFullYear()} {brandName}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
