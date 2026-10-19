import type { ReactNode } from 'react'

export const authFieldClass = {
  inputWrapper:
    'h-12 min-h-12 bg-default-100/90 dark:bg-default-50/50 shadow-none border border-transparent data-[hover=true]:bg-default-100 data-[focus-within=true]:bg-white dark:data-[focus-within=true]:bg-content1 data-[focus-within=true]:border-default-300',
  input: 'text-sm placeholder:text-default-400',
  description: 'text-xs text-default-400 px-1 pt-1',
}

/** 顶部 Logo + 站点名横向排列（与 HeroUI Pro 一类布局一致） */
export function AuthBrandRow({
  site_name,
  site_logo,
  site_logo_dark,
}: {
  site_name: string
  site_logo?: string
  site_logo_dark?: string
}) {
  const name = (site_name || '').trim() || '验证服务'
  const hasLight = Boolean(site_logo)
  const hasDark = Boolean(site_logo_dark)

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-3.5 mb-6 flex-wrap">
      {hasLight && (
        <img
          src={site_logo}
          alt=""
          className={`h-10 sm:h-11 w-auto max-w-[min(120px,36vw)] object-contain shrink-0 ${hasDark ? 'dark:hidden' : ''}`}
        />
      )}
      {hasDark && (
        <img
          src={site_logo_dark}
          alt=""
          className={`h-10 sm:h-11 w-auto max-w-[min(120px,36vw)] object-contain shrink-0 ${hasLight ? 'hidden dark:block' : ''}`}
        />
      )}
      <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight text-left">
        {name}
      </span>
    </div>
  )
}

const panelClass =
  'w-full max-w-[420px] rounded-2xl bg-white dark:bg-content1 px-8 py-10 sm:px-10 sm:py-11 shadow-[0_24px_80px_-16px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_80px_-16px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.04] dark:ring-white/10'

export function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] dark:bg-background">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14 pb-12 sm:pb-16">
        <div className={panelClass}>{children}</div>
      </main>
    </div>
  )
}
