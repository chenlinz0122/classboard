import type {
  ClassOccurrence,
  Course,
  Period,
  Settings,
  Weekday
} from './types'
import {
  addDays,
  calendarDayDiff,
  combineDateAndClock,
  DAY_MS,
  getDateForWeek,
  getSemesterWeek,
  isSameDay,
  parseDateOnly,
  startOfDay,
  startOfWeek,
  toDateOnly,
  weekdayLabel
} from './date'

export function normalizeWeeks(weeks: number[], maxWeeks = 30): number[] {
  return [...new Set(weeks.map(Number))]
    .filter((week) => Number.isFinite(week) && week >= 1 && week <= maxWeeks)
    .map((week) => Math.round(week))
    .sort((a, b) => a - b)
}

export function expandWeeks(start: number, end: number, parity: 'all' | 'odd' | 'even' = 'all'): number[] {
  const result: number[] = []
  const from = Math.max(1, Math.min(start, end))
  const to = Math.max(1, Math.max(start, end))
  for (let week = from; week <= to; week += 1) {
    if (parity === 'odd' && week % 2 === 0) continue
    if (parity === 'even' && week % 2 !== 0) continue
    result.push(week)
  }
  return result
}

export function formatWeeks(weeks: number[]): string {
  const normalized = normalizeWeeks(weeks)
  if (normalized.length === 0) return '未设周次'
  if (normalized.length === 1) return `${normalized[0]}周`

  const parity = normalized.every((week) => week % 2 === 1)
    ? 'odd'
    : normalized.every((week) => week % 2 === 0)
      ? 'even'
      : null
  const expectedParityGap = parity ? 2 : 1
  const isArithmetic = normalized.every(
    (week, index) => index === 0 || week - normalized[index - 1] === expectedParityGap
  )
  if (isArithmetic && normalized.length > 2) {
    const suffix = parity === 'odd' ? '(单)' : parity === 'even' ? '(双)' : ''
    return `${normalized[0]}-${normalized[normalized.length - 1]}周${suffix}`
  }

  const parts: string[] = []
  let runStart = normalized[0]
  let previous = normalized[0]
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index]
    if (current === previous + 1) {
      previous = current
      continue
    }
    parts.push(runStart === previous ? `${runStart}` : `${runStart}-${previous}`)
    runStart = current
    previous = current
  }
  parts.push(runStart === previous ? `${runStart}` : `${runStart}-${previous}`)
  return `${parts.join(',')}周`
}

export function formatPeriodRange(start: number, end: number): string {
  return start === end ? `第 ${start} 节` : `第 ${start}-${end} 节`
}

export function courseTimeLabel(course: Course, periods: Period[]): string {
  const start = periods.find((period) => period.index === course.startPeriod)
  const end = periods.find((period) => period.index === course.endPeriod)
  if (!start || !end) return formatPeriodRange(course.startPeriod, course.endPeriod)
  return `${start.start}–${end.end}`
}

export function getPeriodsForCourse(
  course: Pick<Course, 'startPeriod' | 'endPeriod'>,
  periods: Period[]
): { start: Period | undefined; end: Period | undefined } {
  return {
    start: periods.find((period) => period.index === course.startPeriod),
    end: periods.find((period) => period.index === course.endPeriod)
  }
}

export function getWeekNumberForDate(
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks'>,
  date: Date
): number | null {
  const info = getSemesterWeek(settings.semesterStart, settings.totalWeeks, date)
  return info.phase === 'active' ? info.week : null
}

export function getClassesForDate(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  date: Date
): ClassOccurrence[] {
  const day = startOfDay(date)
  const week = getWeekNumberForDate(settings, day)
  if (!week) return []
  const weekday = (day.getDay() === 0 ? 7 : day.getDay()) as Weekday
  const occurrences: ClassOccurrence[] = []

  for (const course of courses) {
    if (course.weekday !== weekday) continue
    if (!course.weeks.includes(week)) continue
    const startPeriod = settings.periods.find((period) => period.index === course.startPeriod)
    const endPeriod = settings.periods.find((period) => period.index === course.endPeriod)
    if (!startPeriod || !endPeriod) continue
    const startAt = combineDateAndClock(day, startPeriod.start)
    const endAt = combineDateAndClock(day, endPeriod.end)
    occurrences.push({
      key: `${course.id}:${toDateOnly(day)}`,
      course,
      date: toDateOnly(day),
      startAt,
      endAt,
      startPeriod: course.startPeriod,
      endPeriod: course.endPeriod
    })
  }

  return occurrences.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}

export function getTodayClasses(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  now: Date = new Date()
): ClassOccurrence[] {
  return getClassesForDate(courses, settings, now)
}

export function getCurrentClass(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  now: Date = new Date()
): ClassOccurrence | null {
  return (
    getTodayClasses(courses, settings, now).find(
      (occurrence) => occurrence.startAt.getTime() <= now.getTime() && occurrence.endAt.getTime() > now.getTime()
    ) ?? null
  )
}

export function getNextClass(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  now: Date = new Date(),
  maxDays = 21
): ClassOccurrence | null {
  for (let offset = 0; offset <= maxDays; offset += 1) {
    const day = addDays(now, offset)
    const occurrences = getClassesForDate(courses, settings, day)
    const next = occurrences.find((occurrence) => occurrence.startAt.getTime() > now.getTime())
    if (next) return next
  }
  return null
}

export function getCurrentAndNextClasses(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  now: Date = new Date()
): { current: ClassOccurrence | null; next: ClassOccurrence | null } {
  const today = getTodayClasses(courses, settings, now)
  const current =
    today.find(
      (occurrence) => occurrence.startAt.getTime() <= now.getTime() && occurrence.endAt.getTime() > now.getTime()
    ) ?? null
  const next = today.find((occurrence) => occurrence.startAt.getTime() > now.getTime()) ?? null
  return {
    current,
    next: next ?? (current ? getNextClassAfterToday(courses, settings, now) : getNextClass(courses, settings, now))
  }
}

function getNextClassAfterToday(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  now: Date
): ClassOccurrence | null {
  for (let offset = 1; offset <= 21; offset += 1) {
    const occurrences = getClassesForDate(courses, settings, addDays(now, offset))
    if (occurrences.length > 0) return occurrences[0]
  }
  return null
}

export type ClassState = 'upcoming' | 'ongoing' | 'ended'

export function getClassState(occurrence: ClassOccurrence, now: Date = new Date()): ClassState {
  if (now.getTime() < occurrence.startAt.getTime()) return 'upcoming'
  if (now.getTime() > occurrence.endAt.getTime()) return 'ended'
  return 'ongoing'
}

export function getClassProgress(occurrence: ClassOccurrence, now: Date = new Date()): number {
  const total = occurrence.endAt.getTime() - occurrence.startAt.getTime()
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, (now.getTime() - occurrence.startAt.getTime()) / total))
}

export function getWeekOccurrences(
  courses: Course[],
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'>,
  week: number
): Record<Weekday, ClassOccurrence[]> {
  const result = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: []
  } as Record<Weekday, ClassOccurrence[]>

  for (let weekday = 1 as Weekday; weekday <= 7; weekday = (weekday + 1) as Weekday) {
    const date = getDateForWeek(settings.semesterStart, week, weekday)
    const occurrences = getClassesForDate(courses, settings, date)
    result[weekday] = occurrences
  }
  return result
}

export function getTodayDateLabel(now: Date = new Date()): string {
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekdayLabel(
    (now.getDay() === 0 ? 7 : now.getDay()) as Weekday
  )}`
}

export function countPendingDeadlines(deadlines: { dueAt?: string | null; completedAt?: string | null }[]): number {
  return deadlines.filter((deadline) => !deadline.completedAt).length
}

export function isDateInCurrentWeek(date: Date, now: Date = new Date()): boolean {
  const current = startOfWeek(now)
  return calendarDayDiff(current, date) >= 0 && calendarDayDiff(current, date) < 7
}

export function dateFromTimeOnDay(day: Date, clock: string): Date {
  return combineDateAndClock(day, clock)
}

export function isSemesterActive(settings: Pick<Settings, 'semesterStart' | 'totalWeeks'>, now = new Date()): boolean {
  return getSemesterWeek(settings.semesterStart, settings.totalWeeks, now).phase === 'active'
}

export function getSemesterWeekStart(settings: Pick<Settings, 'semesterStart'>, week: number): Date {
  return addDays(startOfWeek(parseDateOnly(settings.semesterStart)), (week - 1) * 7)
}

export function getSemesterProgress(
  settings: Pick<Settings, 'semesterStart' | 'totalWeeks'>,
  now = new Date()
): number {
  const start = startOfWeek(parseDateOnly(settings.semesterStart))
  const total = settings.totalWeeks * 7 * DAY_MS
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, (startOfDay(now).getTime() - start.getTime()) / total))
}

export function sameClass(a: ClassOccurrence, b: ClassOccurrence): boolean {
  return a.course.id === b.course.id && isSameDay(a.startAt, b.startAt)
}
