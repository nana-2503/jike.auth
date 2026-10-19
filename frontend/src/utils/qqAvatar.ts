/** 从填写内容中提取 QQ 号（连续 5–15 位数字） */
export function extractQQUin(qq: string | undefined | null): string | null {
  if (!qq || typeof qq !== 'string') return null
  const m = qq.replace(/\s/g, '').match(/\d{5,15}/)
  return m ? m[0] : null
}

/** 腾讯 QQ 公开头像（HTTPS，可直接用于 img / Avatar src） */
export function qqAvatarUrl(qq: string | undefined | null): string | undefined {
  const uin = extractQQUin(qq)
  if (!uin) return undefined
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=160`
}
