import type { AppData, ClassOccurrence, DeadlineItem, NavigateTarget } from '@shared/types'
import {
  formatClock,
  formatCompactDuration,
  formatCountdown,
  formatDateTimeCN,
  formatDueLabel,
  toDateOnly
} from '@shared/date'
import { getTodayClasses, getClassState } from '@shared/schedule'

const OVERDUE_GRACE_MS = 12 * 60 * 60 * 1000

export interface PlannedNotification {
  key: string
  kind: 'deadline' | 'snooze' | 'class' | 'daily'
  title: string
  body: string
  deadlineId?: string
  sentKeys?: string[]
  navigation?: NavigateTarget
  priority?: 'normal' | 'high'
}

export interface ReminderPlan {
  actions: PlannedNotification[]
  dailyDate?: string
}

function deadlineSentKeys(deadline: DeadlineItem, offsets: number[], now: Date): string[] {
  const keys = offsets
    .filter((offset) => now.getTime() >= new Date(deadline.dueAt as string).getTime() - offset * 60_000)
    .map((offset) => `${deadline.dueAt}|${offset}`)
  return keys
}

function describeDeadline(deadline: DeadlineItem, now: Date): { title: string; body: string } {
  const due = deadline.dueAt as string
  const course = deadline.courseName ? `${deadline.courseName} · ` : ''
  if (new Date(due).getTime() <= now.getTime()) {
    return {
      title: `已截止：${deadline.title}`,
      body: `${course}${formatDateTimeCN(due)} 已过截止时间`
    }
  }
  return {
    title: `作业提醒：${deadline.title}`,
    body: `${course}${formatCountdown(due, now)} · ${formatDueLabel(due, now)}`
  }
}

function classAction(occurrence: ClassOccurrence, now: Date): PlannedNotification {
  const minutes = Math.max(1, Math.ceil((occurrence.startAt.getTime() - now.getTime()) / 60_000))
  const location = occurrence.course.location || '地点待定'
  const teacher = occurrence.course.teacher ? ` · ${occurrence.course.teacher}` : ''
  return {
    key: `class:${occurrence.key}`,
    kind: 'class',
    title: `${occurrence.course.name} 即将上课`,
    body: `${formatClock(occurrence.startAt)} 开始 · ${location}${teacher} · ${minutes} 分钟后`,
    navigation: { view: 'week' },
    priority: 'normal'
  }
}

export function buildReminderPlan(
  data: AppData,
  now = new Date(),
  classSent: Set<string> = new Set()
): ReminderPlan {
  const { settings, deadlines } = data
  if (!settings.onboardingDone) return { actions: [] }

  const actions: PlannedNotification[] = []
  const offsets = [...settings.reminderOffsets].filter((offset) => offset > 0).sort((a, b) => a - b)
  const pending = deadlines
    .filter((deadline) => !deadline.completedAt && deadline.dueAt)
    .sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime())

  for (const deadline of pending) {
    const due = new Date(deadline.dueAt as string)
    if (!Number.isFinite(due.getTime())) continue
    if (now.getTime() > due.getTime() + OVERDUE_GRACE_MS) continue
    const sent = deadline.reminder.sent ?? {}
    const effectiveOffsets = deadline.reminderOffsets?.length ? deadline.reminderOffsets : offsets
    const snoozedUntil = deadline.reminder.snoozedUntil
      ? new Date(deadline.reminder.snoozedUntil)
      : null

    if (snoozedUntil && Number.isFinite(snoozedUntil.getTime())) {
      if (now.getTime() < snoozedUntil.getTime()) continue
      const key = `${deadline.dueAt}|snooze|${snoozedUntil.toISOString()}`
      if (!sent[key]) {
        const info = describeDeadline(deadline, now)
        actions.push({
          key,
          kind: 'snooze',
          title: info.title,
          body: info.body,
          deadlineId: deadline.id,
          sentKeys: [key],
          navigation: { view: 'deadlines', focusDeadlineId: deadline.id },
          priority: 'high'
        })
      }
      continue
    }

    const triggered = effectiveOffsets
      .filter((offset) => now.getTime() >= due.getTime() - offset * 60_000)
      .sort((a, b) => a - b)
    if (triggered.length === 0) continue

    const smallestOffset = triggered[0]
    const dueKey = `${deadline.dueAt}|${smallestOffset}`
    if (sent[dueKey]) continue

    const info = describeDeadline(deadline, now)
    const allKeys = deadlineSentKeys(
      deadline,
      effectiveOffsets,
      now
    )
    if (now.getTime() > due.getTime()) {
      allKeys.push(`overdue:${deadline.dueAt}`)
    }
    actions.push({
      key: dueKey,
      kind: 'deadline',
      title: info.title,
      body: info.body,
      deadlineId: deadline.id,
      sentKeys: [...new Set(allKeys)],
      navigation: { view: 'deadlines', focusDeadlineId: deadline.id },
      priority: new Date(deadline.dueAt as string).getTime() - now.getTime() <= 60 * 60 * 1000 ? 'high' : 'normal'
    })
  }

  if (settings.classRemindersEnabled) {
    const today = getTodayClasses(data.courses, settings, now)
    for (const occurrence of today) {
      if (getClassState(occurrence, now) !== 'upcoming') continue
      const minutesUntil = (occurrence.startAt.getTime() - now.getTime()) / 60_000
      if (minutesUntil > settings.classReminderMinutes) continue
      if (minutesUntil <= 0) continue
      if (classSent.has(occurrence.key)) continue
      actions.push(classAction(occurrence, now))
    }
  }

  actions.sort((a, b) => {
    if (a.kind === 'daily') return 1
    if (b.kind === 'daily') return -1
    const order: Record<PlannedNotification['kind'], number> = {
      deadline: 0,
      snooze: 0,
      class: 1,
      daily: 2
    }
    const orderDiff = order[a.kind] - order[b.kind]
    if (orderDiff !== 0) return orderDiff
    if (a.deadlineId && b.deadlineId) {
      const aDue = pending.find((item) => item.id === a.deadlineId)?.dueAt ?? ''
      const bDue = pending.find((item) => item.id === b.deadlineId)?.dueAt ?? ''
      return aDue.localeCompare(bDue)
    }
    return a.key.localeCompare(b.key)
  })

  const todayKey = toDateOnly(now)
  let dailyDate: string | undefined
  if (
    settings.dailySummaryEnabled &&
    now.getHours() >= 8 &&
    settings.lastDailySummaryDate !== todayKey
  ) {
    const classes = getTodayClasses(data.courses, settings, now)
    const pendingCount = pending.length
    const nearest = pending.find((deadline) => new Date(deadline.dueAt as string).getTime() >= now.getTime())
    const parts: string[] = []
    parts.push(classes.length > 0 ? `今天 ${classes.length} 节课` : '今天没课')
    parts.push(pendingCount > 0 ? `${pendingCount} 个作业待交` : '暂时没有待交作业')
    const body = nearest
      ? `${parts.join(' · ')}。最近：${nearest.title}（${formatDueLabel(nearest.dueAt, now)}）`
      : parts.join(' · ')
    actions.push({
      key: `daily:${todayKey}`,
      kind: 'daily',
      title: '今天的安排',
      body,
      navigation: { view: 'today' },
      priority: 'normal'
    })
    dailyDate = todayKey
  }

  return { actions, dailyDate }
}

export function formatSnoozeLabel(minutes: number): string {
  return `已推迟 ${formatCompactDuration(minutes * 60_000)}`
}
