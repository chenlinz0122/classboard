import type { AppData, Period, Settings } from './types'
import { firstMondayOnOrAfter, startOfWeek, toDateOnly } from './date'

export const APP_NAME = '课表与DDL看板'
export const APP_ID = 'com.classboard.hdu'
export const SCHEMA_VERSION = 1

/** 杭电参考作息，全部可在设置里修改。 */
export const DEFAULT_PERIODS: Period[] = [
  { index: 1, start: '08:05', end: '08:50' },
  { index: 2, start: '08:55', end: '09:40' },
  { index: 3, start: '10:00', end: '10:45' },
  { index: 4, start: '10:50', end: '11:35' },
  { index: 5, start: '11:40', end: '12:25' },
  { index: 6, start: '13:30', end: '14:15' },
  { index: 7, start: '14:20', end: '15:05' },
  { index: 8, start: '15:15', end: '16:00' },
  { index: 9, start: '16:05', end: '16:50' },
  { index: 10, start: '18:30', end: '19:15' },
  { index: 11, start: '19:20', end: '20:05' },
  { index: 12, start: '20:10', end: '20:55' }
]

export const DEFAULT_REMINDER_OFFSETS = [1440, 360, 60]

export function suggestedSemesterStart(now = new Date()): string {
  const month = now.getMonth() // 0-11
  if (month >= 7 || month === 0) {
    const year = month === 0 ? now.getFullYear() - 1 : now.getFullYear()
    return toDateOnly(firstMondayOnOrAfter(new Date(year, 8, 1)))
  }
  return toDateOnly(firstMondayOnOrAfter(new Date(now.getFullYear(), 1, 20)))
}

export function defaultSettings(now = new Date()): Settings {
  return {
    semesterStart: suggestedSemesterStart(now),
    totalWeeks: 19,
    periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
    reminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
    classRemindersEnabled: false,
    classReminderMinutes: 10,
    dailySummaryEnabled: true,
    closeToTray: true,
    autoLaunch: true,
    alwaysOnTop: false,
    widgetOpacity: 1,
    theme: 'light',
    launchShowWidget: true,
    widgetPosition: null,
    onboardingDone: false,
    lastDailySummaryDate: null,
    sync: {
      hdu: {},
      chaoxing: {},
      yuketang: {},
      pta: {}
    }
  }
}

export function createEmptyData(now = new Date()): AppData {
  const iso = now.toISOString()
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      createdAt: iso,
      updatedAt: iso,
      lastBackupAt: null
    },
    courses: [],
    deadlines: [],
    settings: defaultSettings(now)
  }
}

export function normalizeSettings(
  input: Partial<Settings> | undefined,
  now = new Date()
): Settings {
  const base = defaultSettings(now)
  if (!input) return base
  const merged: Settings = {
    ...base,
    ...input,
    periods:
      Array.isArray(input.periods) && input.periods.length > 0
        ? input.periods.map((p, index) => ({
            index: index + 1,
            start: sanitizeClock(p.start, base.periods[index]?.start ?? '08:00'),
            end: sanitizeClock(p.end, base.periods[index]?.end ?? '08:45')
          }))
        : base.periods,
    reminderOffsets: normalizeOffsets(input.reminderOffsets, base.reminderOffsets),
    widgetOpacity: clamp(Number(input.widgetOpacity ?? 1), 0.65, 1),
    totalWeeks: clamp(Number(input.totalWeeks ?? 19), 1, 30),
    classReminderMinutes: clamp(Number(input.classReminderMinutes ?? 10), 1, 120),
    sync: {
      ...base.sync,
      ...(input.sync ?? {}),
      hdu: { ...base.sync.hdu, ...(input.sync?.hdu ?? {}) },
      chaoxing: { ...base.sync.chaoxing, ...(input.sync?.chaoxing ?? {}) },
      yuketang: { ...base.sync.yuketang, ...(input.sync?.yuketang ?? {}) },
      pta: { ...base.sync.pta, ...(input.sync?.pta ?? {}) }
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(merged.semesterStart)) {
    merged.semesterStart = toDateOnly(startOfWeek(now))
  }
  return merged
}

export function normalizeOffsets(input: unknown, fallback: number[]): number[] {
  const values = Array.isArray(input) ? input : fallback
  const cleaned = [...new Set(values.map((value) => Number(value)))]
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 60 * 24 * 30)
    .sort((a, b) => b - a)
  return cleaned.length > 0 ? cleaned : [...fallback]
}

export function sanitizeClock(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallback
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return fallback
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function formatOffsetLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440
    return d === 1 ? '提前 1 天' : `提前 ${d} 天`
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return h === 1 ? '提前 1 小时' : `提前 ${h} 小时`
  }
  return `提前 ${minutes} 分钟`
}
