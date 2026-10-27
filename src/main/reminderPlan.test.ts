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
    // 首轮会把所有已到达的节点一并标记，之后不再重复提醒
    for (const key of first.actions[0].sentKeys ?? []) {
      data.deadlines[0].reminder.sent[key] = now.toISOString()
    }
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

  it('fires a clock rule before the due time instead of midnight', () => {
    // 截止 10 月 30 日 23:59，前一天 20:00 应在 10 月 29 日 20:00 触发
    const now = new Date(2026, 9, 29, 20, 1)
    const data = withDeadline(new Date(2026, 9, 30, 23, 59), [60])
    data.settings.reminderClockRules = [{ daysBefore: 1, time: '20:00' }]
    const plan = buildReminderPlan(data, now)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].kind).toBe('deadline')
    expect(plan.actions[0].sentKeys).toContain(`${data.deadlines[0].dueAt}|clock:1:20:00`)
  })

  it('does not fire a clock rule before its scheduled time', () => {
    const now = new Date(2026, 9, 29, 19, 0)
    const data = withDeadline(new Date(2026, 9, 30, 23, 59), [60])
    data.settings.reminderClockRules = [{ daysBefore: 1, time: '20:00' }]
    expect(buildReminderPlan(data, now).actions).toHaveLength(0)
  })

  it('fires a 3-day offset reminder', () => {
    // 截止 10 月 30 日 16:00，提前 3 天 = 10 月 27 日 16:00
    const now = new Date(2026, 9, 27, 16, 0)
    const data = withDeadline(new Date(2026, 9, 30, 16, 0), [4320, 60])
    data.settings.reminderClockRules = []
    const plan = buildReminderPlan(data, now)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].sentKeys).toContain(`${data.deadlines[0].dueAt}|4320`)
  })
})
