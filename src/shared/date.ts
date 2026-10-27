import type { Weekday } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

const WEEKDAY_LONG: Record<number, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六'
}

const WEEKDAY_SHORT: Record<number, string> = {
  0: '日',
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六'
}

export function startOfDay(value: Date | number | string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function endOfDay(value: Date | number | string): Date {
  const date = startOfDay(value)
  date.setHours(23, 59, 59, 999)
  return date
}

export function startOfWeek(value: Date | number | string = new Date()): Date {
  const date = startOfDay(value)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  return date
}

export function addDays(value: Date | number | string, days: number): Date {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

export function addMinutes(value: Date | number | string, minutes: number): Date {
  return new Date(new Date(value).getTime() + minutes * MINUTE_MS)
}

export function addMonths(value: Date | number | string, months: number): Date {
  const date = new Date(value)
  date.setMonth(date.getMonth() + months)
  return date
}

export function firstMondayOnOrAfter(value: Date): Date {
  const date = startOfDay(value)
  const offset = (8 - date.getDay()) % 7
  date.setDate(date.getDate() + offset)
  return date
}

export function toDateOnly(value: Date | number | string): string {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return startOfDay(new Date())
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0)
}

export function combineDateAndClock(date: Date, clock: string): Date {
  const [hours, minutes] = clock.split(':').map(Number)
  const result = new Date(date)
  result.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return result
}

export function timeToMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number)
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export function minutesToClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

export function getWeekday(value: Date | number | string): Weekday {
  const day = new Date(value).getDay()
  return (day === 0 ? 7 : day) as Weekday
}

export function isSameDay(a: Date | number | string, b: Date | number | string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export function calendarDayDiff(from: Date | number | string, to: Date | number | string): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

export function weekdayCN(value: Date | number | string): string {
  return WEEKDAY_LONG[new Date(value).getDay()]
}

export function weekdayShort(value: Date | number | string): string {
  return WEEKDAY_SHORT[new Date(value).getDay()]
}

export function weekdayLabel(weekday: Weekday): string {
  return WEEKDAY_LONG[weekday === 7 ? 0 : weekday]
}

export function weekdayShortLabel(weekday: Weekday): string {
  return WEEKDAY_SHORT[weekday === 7 ? 0 : weekday]
}

export function formatDateCN(value: Date | number | string): string {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatDateWithWeekday(value: Date | number | string): string {
  return `${formatDateCN(value)} ${weekdayCN(value)}`
}

export function formatDateFullCN(value: Date | number | string): string {
  const date = new Date(value)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatClock(value: Date | number | string, withSeconds = false): string {
  const date = new Date(value)
  const base = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return withSeconds ? `${base}:${String(date.getSeconds()).padStart(2, '0')}` : base
}

export function formatDateTimeCN(value: Date | number | string): string {
  return `${formatDateWithWeekday(value)} ${formatClock(value)}`
}

export function formatDateTimeVerbose(value: Date | number | string): string {
  return `${formatDateFullCN(value)} ${weekdayCN(value)} ${formatClock(value)}`
}

export function formatMonthDayFromDate(value: Date | number | string): string {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatDueLabel(
  dueAt: string | null | undefined,
  now: Date = new Date()
): string {
  if (!dueAt) return '未设截止'
  const due = new Date(dueAt)
  if (!Number.isFinite(due.getTime())) return '未设截止'
  const diff = calendarDayDiff(now, due)
  if (due.getTime() < now.getTime() && diff <= 0) {
    return `已逾期 · ${formatDateCN(due)} ${formatClock(due)}`
  }
  if (diff === 0) return `今天 ${formatClock(due)}`
  if (diff === 1) return `明天 ${formatClock(due)}`
  if (diff === 2) return `后天 ${formatClock(due)}`
  if (diff > 2 && diff < 7) return `${weekdayCN(due)} ${formatClock(due)}`
  if (due.getFullYear() === now.getFullYear()) {
    return `${formatDateCN(due)} ${formatClock(due)}`
  }
  return `${formatDateFullCN(due)} ${formatClock(due)}`
}

export function formatCountdown(
  dueAt: string | null | undefined,
  now: Date = new Date()
): string {
  if (!dueAt) return '未设截止'
  const due = new Date(dueAt).getTime()
  if (!Number.isFinite(due)) return '未设截止'
  const diff = due - now.getTime()
  if (diff < 0) return `已逾期 ${formatCompactDuration(-diff)}`
  if (diff < MINUTE_MS) return '不到 1 分钟'
  return `还有 ${formatCompactDuration(diff)}`
}

export function formatCompactDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
  return `${minutes} 分钟`
}

export function formatDurationBrief(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE_MS))
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
}

export interface SemesterWeekInfo {
  week: number | null
  phase: 'before' | 'active' | 'after'
  weekStart: Date
  weekEnd: Date
  totalWeeks: number
  daysUntilStart: number
}

export function getSemesterWeek(
  semesterStart: string,
  totalWeeks: number,
  now: Date = new Date()
): SemesterWeekInfo {
  const start = startOfWeek(parseDateOnly(semesterStart))
  const today = startOfDay(now)
  const diffDays = Math.floor((today.getTime() - start.getTime()) / DAY_MS)
  const week = Math.floor(diffDays / 7) + 1
  if (diffDays < 0) {
    return {
      week: null,
      phase: 'before',
      weekStart: start,
      weekEnd: addDays(start, 6),
      totalWeeks,
      daysUntilStart: Math.ceil(-diffDays)
    }
  }
  if (week > totalWeeks) {
    const weekStart = addDays(start, totalWeeks * 7)
    return {
      week: null,
      phase: 'after',
      weekStart,
      weekEnd: addDays(weekStart, 6),
      totalWeeks,
      daysUntilStart: 0
    }
  }
  const weekStart = addDays(start, (week - 1) * 7)
  return {
    week,
    phase: 'active',
    weekStart,
    weekEnd: addDays(weekStart, 6),
    totalWeeks,
    daysUntilStart: 0
  }
}

export function getDateForWeek(
  semesterStart: string,
  week: number,
  weekday: Weekday
): Date {
  const start = startOfWeek(parseDateOnly(semesterStart))
  return addDays(start, (week - 1) * 7 + (weekday - 1))
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6)
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${weekEnd.getDate()}日`
  }
  return `${formatDateCN(weekStart)} – ${formatDateCN(weekEnd)}`
}

export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function formatWeekCount(week: number | null): string {
  return week ? `第 ${week} 周` : '假期'
}

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
