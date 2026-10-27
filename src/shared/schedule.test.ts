import { describe, expect, it } from 'vitest'
import type { Course, Settings } from './types'
import { DEFAULT_PERIODS } from './defaults'
import {
  formatWeeks,
  getClassesForDate,
  getCurrentAndNextClasses,
  getWeekOccurrences
} from './schedule'
import { getSemesterWeek } from './date'

const settings: Pick<Settings, 'semesterStart' | 'totalWeeks' | 'periods'> = {
  semesterStart: '2026-09-07',
  totalWeeks: 19,
  periods: DEFAULT_PERIODS
}

const baseCourse: Course = {
  id: 'course-1',
  name: '数据结构',
  teacher: '王老师',
  location: '6教-206',
  weekday: 2,
  startPeriod: 1,
  endPeriod: 2,
  weeks: Array.from({ length: 16 }, (_, index) => index + 1),
  source: 'manual',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
}

describe('semester and schedule calculations', () => {
  it('computes the current week', () => {
    const info = getSemesterWeek('2026-09-07', 19, new Date(2026, 9, 27, 16, 0))
    expect(info.phase).toBe('active')
    expect(info.week).toBe(8)
    expect(info.weekStart).toEqual(new Date(2026, 9, 26))
  })

  it('expands the current day courses', () => {
    const classes = getClassesForDate([baseCourse], settings, new Date(2026, 9, 27, 8, 30))
    expect(classes).toHaveLength(1)
    expect(classes[0].startAt).toEqual(new Date(2026, 9, 27, 8, 5))
    expect(classes[0].endAt).toEqual(new Date(2026, 9, 27, 9, 40))
  })

  it('respects teaching weeks and odd/even weeks', () => {
    const oddCourse: Course = {
      ...baseCourse,
      id: 'odd',
      name: '仅单周',
      weeks: [1, 3, 5, 7, 9]
    }
    const week8 = getClassesForDate([oddCourse], settings, new Date(2026, 9, 27, 8, 30))
    expect(week8).toHaveLength(0)
    const week9 = getClassesForDate([oddCourse], settings, new Date(2026, 10, 3, 8, 30))
    expect(week9).toHaveLength(1)
  })

  it('finds the current and next class', () => {
    const second: Course = {
      ...baseCourse,
      id: 'course-2',
      name: '大学英语',
      startPeriod: 3,
      endPeriod: 4
    }
    const during = getCurrentAndNextClasses([baseCourse, second], settings, new Date(2026, 9, 27, 8, 30))
    expect(during.current?.course.name).toBe('数据结构')
    expect(during.next?.course.name).toBe('大学英语')

    const after = getCurrentAndNextClasses([baseCourse, second], settings, new Date(2026, 9, 27, 9, 45))
    expect(after.current).toBeNull()
    expect(after.next?.course.name).toBe('大学英语')
  })

  it('builds a week grid', () => {
    const grid = getWeekOccurrences([baseCourse], settings, 8)
    expect(grid[2]).toHaveLength(1)
    expect(grid[1]).toHaveLength(0)
  })

  it('formats week lists', () => {
    expect(formatWeeks([1, 2, 3, 4, 5, 6])).toBe('1-6周')
    expect(formatWeeks([1, 3, 5, 7])).toBe('1-7周(单)')
    expect(formatWeeks([2, 4, 6, 8])).toBe('2-8周(双)')
    expect(formatWeeks([1, 2, 4, 5, 8])).toBe('1-2,4-5,8周')
  })
})
