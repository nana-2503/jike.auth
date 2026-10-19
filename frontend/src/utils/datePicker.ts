import { CalendarDateTime, parseAbsoluteToLocal } from '@internationalized/date'

export function currentCalendarDateTime() {
  const now = new Date()
  return new CalendarDateTime(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  )
}

export function dateValueToLocalDateTimeString(value: unknown) {
  if (!value) return ''
  const v = value as {
    year?: number
    month?: number
    day?: number
    hour?: number
    minute?: number
    second?: number
    toDate?: (timezone?: string) => Date
  }
  if (typeof v.year === 'number' && typeof v.month === 'number' && typeof v.day === 'number') {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.year}-${pad(v.month)}-${pad(v.day)} ${pad(v.hour || 0)}:${pad(v.minute || 0)}:${pad(v.second || 0)}`
  }
  if (typeof v.toDate === 'function') {
    const date = v.toDate()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
  return ''
}

export function currentZonedDateTime() {
  return parseAbsoluteToLocal(new Date().toISOString())
}
