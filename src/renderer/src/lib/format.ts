import type {
  Course,
  DeadlineBucket,
  DeadlineItem,
  SourceKey,
  Weekday
} from '@shared/types'
import {
  calendarDayDiff,
  formatDueLabel,
  startOfWeek,
  toDateOnly
} from '@shared/date'
import { colorIndexFor } from '@shared/colors'

export const SOURCE_LABELS: Record<SourceKey, string> = {
  manual: '手动',
  hdu: '杭电',
  chaoxing: '学习通',
  yuketang: '雨课堂',
  pta: 'PTA',
  import: '导入'
}

export function sourceLabel(source: SourceKey): string {
  return SOURCE_LABELS[source] ?? '手动'
}

export function courseColorClass(color: number | undefined, name: string): string {
  const index = typeof color === 'number' ? color : colorIndexFor(name)
  return `course-tone-${((index % 8) + 8) % 8}`
}

export function courseColorIndex(course: Pick<Course, 'color' | 'name'>): number {
  return typeof course.color === 'number' ? course.color : colorIndexFor(course.name)
}

export function getDeadlineBucket(deadline: DeadlineItem, now: Date): DeadlineBucket {
  if (deadline.completedAt) return 'done'
  if (!deadline.dueAt) return 'none'
  const due = new Date(deadline.dueAt)
  if (!Number.isFinite(due.getTime())) return 'none'
  if (due.getTime() < now.getTime()) return 'overdue'
  const diff = calendarDayDiff(now, due)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'week'
  return 'later'
}

export const BUCKET_LABELS: Record<DeadlineBucket, string> = {
  overdue: '已逾期',
  today: '今天',
  tomorrow: '明天',
  week: '未来 7 天',
  later: '以后',
  none: '未设截止',
  done: '已完成'
}

export const BUCKET_ORDER: DeadlineBucket[] = [
  'overdue',
  'today',
  'tomorrow',
  'week',
  'later',
  'none',
  'done'
]

export function sortDeadlines(deadlines: DeadlineItem[], includeCompleted = true): DeadlineItem[] {
  return deadlines
    .filter((deadline) => includeCompleted || !deadline.completedAt)
    .sort((a, b) => {
      if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1
      if (a.completedAt && b.completedAt) {
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      }
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      if (aDue !== bDue) return aDue - bDue
      return a.title.localeCompare(b.title, 'zh-CN')
    })
}

export function pendingDeadlines(deadlines: DeadlineItem[]): DeadlineItem[] {
  return sortDeadlines(deadlines.filter((deadline) => !deadline.completedAt), false)
}

export function nextPendingDeadline(deadlines: DeadlineItem[], now: Date): DeadlineItem | null {
  const pending = pendingDeadlines(deadlines)
  return (
    pending.find((deadline) => deadline.dueAt && new Date(deadline.dueAt).getTime() >= now.getTime()) ??
    pending.find((deadline) => Boolean(deadline.dueAt)) ??
    pending[0] ??
    null
  )
}

export function groupDeadlines(
  deadlines: DeadlineItem[],
  now: Date
): Array<{ bucket: DeadlineBucket; label: string; items: DeadlineItem[] }> {
  const buckets = new Map<DeadlineBucket, DeadlineItem[]>()
  for (const deadline of deadlines) {
    const bucket = getDeadlineBucket(deadline, now)
    if (!buckets.has(bucket)) buckets.set(bucket, [])
    buckets.get(bucket)?.push(deadline)
  }
  return BUCKET_ORDER.filter((bucket) => (buckets.get(bucket)?.length ?? 0) > 0).map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    items: sortDeadlines(buckets.get(bucket) ?? [])
  }))
}

export function completedThisWeek(deadlines: DeadlineItem[], now: Date): number {
  const monday = startOfWeek(now).getTime()
  const sunday = monday + 7 * 24 * 60 * 60 * 1000
  return deadlines.filter((deadline) => {
    if (!deadline.completedAt) return false
    const time = new Date(deadline.completedAt).getTime()
    return time >= monday && time < sunday
  }).length
}

export function matchCourseInText(text: string, courses: Course[]): Course | undefined {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return undefined
  let best: Course | undefined
  for (const course of courses) {
    const name = course.name.trim().toLowerCase()
    if (!name) continue
    if (normalized.includes(name) && (!best || name.length > best.name.length)) best = course
  }
  return best
}

export function weekdayShort(weekday: Weekday): string {
  return ['一', '二', '三', '四', '五', '六', '日'][weekday - 1]
}

export function formatTeacherPlace(teacher: string | undefined, location: string | undefined): string {
  return [location, teacher].filter(Boolean).join(' · ')
}

export function dueTone(deadline: DeadlineItem, now: Date): string {
  const bucket = getDeadlineBucket(deadline, now)
  return `due-${bucket}`
}

export function todayKey(date: Date = new Date()): string {
  return toDateOnly(date)
}

export function courseNameById(courses: Course[], courseId?: string): string {
  if (!courseId) return ''
  return courses.find((course) => course.id === courseId)?.name ?? ''
}

export function dueText(deadline: DeadlineItem, now: Date): string {
  if (!deadline.dueAt) return '未设截止'
  return formatDueLabel(deadline.dueAt, now)
}

export function countDoneOnDay(deadlines: DeadlineItem[], date: Date): number {
  const key = toDateOnly(date)
  return deadlines.filter(
    (deadline) => deadline.completedAt && toDateOnly(new Date(deadline.completedAt)) === key
  ).length
}

export function classStatusText(
  state: 'upcoming' | 'ongoing' | 'ended',
  minutes: number
): string {
  if (state === 'ongoing') return '正在上课'
  if (state === 'ended') return '已结束'
  if (minutes <= 1) return '马上开始'
  return `还有 ${minutes} 分钟`
}
