import { describe, expect, it } from 'vitest'
import { createEmptyData } from '@shared/defaults'
import { buildReminderPlan } from './reminderPlan'
import type { DeadlineItem } from '@shared/types'
import { addMinutes, addDays, startOfDay } from '@shared/date'

function withDeadline(due: Date, offsets = [1440, 360, 60]): ReturnType<typeof createEmptyData> {
  const data = createEmptyData(new Date(2026, 9, 27, 16, 0))
  data.settings.onboardingDone = true
  data.settings.reminderOffsets = offsets
  data.settings.dailySummaryEnabled = false
  const deadline: DeadlineItem = {
    id: 'd1',
    title: '计组实验3',
    courseName: '计算机组成原理',
    dueAt: due.toISOString(),
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reminder: { sent: {}, snoozedUntil: null },
    priority: 'normal'
  }
  data.deadlines.push(deadline)
  return data
}

describe('reminder plan', () => {
  it('fires a 24h reminder and marks all triggered buckets', () => {
    const now = new Date(2026, 9, 27, 16, 0)
    const data = withDeadline(addMinutes(now, 24 * 60))
    const plan = buildReminderPlan(data, now)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].kind).toBe('deadline')
    expect(plan.actions[0].sentKeys).toContain(`${data.deadlines[0].dueAt}|1440`)
  })

  it('does not duplicate a reminder', () => {
    const now = new Date(2026, 9, 27, 16, 0)
    const data = withDeadline(addMinutes(now, 60))
    const first = buildReminderPlan(data, now)
    expect(first.actions).toHaveLength(1)
    data.deadlines[0].reminder.sent[`${data.deadlines[0].dueAt}|60`] = now.toISOString()
    const second = buildReminderPlan(data, addMinutes(now, 1))
    expect(second.actions).toHaveLength(0)
  })

  it('does not fire for a completed deadline', () => {
    const now = new Date(2026, 9, 27, 16, 0)
    const data = withDeadline(addMinutes(now, 60))
    data.deadlines[0].completedAt = now.toISOString()
    expect(buildReminderPlan(data, now).actions).toHaveLength(0)
  })

  it('fires an overdue notice within the grace window', () => {
    const now = new Date(2026, 9, 27, 16, 0)
    const data = withDeadline(addMinutes(now, -30))
    const plan = buildReminderPlan(data, now)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].title).toContain('已截止')
  })

  it('builds a daily summary once per day', () => {
    const now = new Date(2026, 9, 27, 9, 0)
    const data = withDeadline(addDays(startOfDay(now), 1))
    data.settings.dailySummaryEnabled = true
    const plan = buildReminderPlan(data, now)
    expect(plan.actions.some((action) => action.kind === 'daily')).toBe(true)
    expect(plan.dailyDate).toBe('2026-10-27')
  })

  it('supports snooze', () => {
    const now = new Date(2026, 9, 27, 16, 0)
    const data = withDeadline(addMinutes(now, 60))
    data.deadlines[0].reminder.snoozedUntil = addMinutes(now, 10).toISOString()
    expect(buildReminderPlan(data, now).actions).toHaveLength(0)
    const later = buildReminderPlan(data, addMinutes(now, 11))
    expect(later.actions).toHaveLength(1)
    expect(later.actions[0].kind).toBe('snooze')
  })
})
