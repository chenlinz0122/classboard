import { describe, expect, it } from 'vitest'
import { parseDueText, parseQuickAdd } from './parseQuickAdd'

const now = new Date(2026, 9, 27, 16, 0, 0) // 2026-10-27 Tue 16:00

function local(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

describe('parseQuickAdd', () => {
  it('parses a weekday with time', () => {
    const result = parseQuickAdd('计组实验3 周五 23:59', now)
    expect(result.title).toBe('计组实验3')
    expect(local(result.dueAt)).toContain('2026/10/30 23:59')
    expect(result.hasDate).toBe(true)
    expect(result.hasTime).toBe(true)
  })

  it('parses month/day with time', () => {
    const result = parseQuickAdd('大物报告 10月30日 18:00', now)
    expect(result.title).toBe('大物报告')
    expect(local(result.dueAt)).toContain('2026/10/30 18:00')
  })

  it('parses next week and evening time', () => {
    const result = parseQuickAdd('高数 下周三晚上8点', now)
    expect(result.title).toBe('高数')
    expect(local(result.dueAt)).toContain('2026/11/4 20:00')
  })

  it('parses relative day words', () => {
    const result = parseQuickAdd('数据结构作业 明天 23:59', now)
    expect(result.title).toBe('数据结构作业')
    expect(local(result.dueAt)).toContain('2026/10/28 23:59')
  })

  it('parses N days later', () => {
    const result = parseQuickAdd('实验3 3天后', now)
    expect(result.title).toBe('实验3')
    expect(local(result.dueAt)).toContain('2026/10/30 23:59')
  })

  it('parses a full date and removes tokens from title', () => {
    const result = parseQuickAdd('2026-11-05 09:00 期中考试', now)
    expect(result.title).toBe('期中考试')
    expect(local(result.dueAt)).toContain('2026/11/5 09:00')
  })

  it('defaults to today 23:59 when no date is supplied', () => {
    const result = parseQuickAdd('写实验报告', now)
    expect(result.title).toBe('写实验报告')
    expect(result.hasDate).toBe(false)
    expect(result.hasTime).toBe(false)
    expect(local(result.dueAt)).toContain('2026/10/27 23:59')
  })

  it('rolls a passed time without a date to tomorrow', () => {
    const late = new Date(2026, 9, 27, 23, 30, 0)
    const result = parseQuickAdd('写报告 20:00', late)
    expect(local(result.dueAt)).toContain('2026/10/28 20:00')
  })

  it('supports full-width characters', () => {
    const result = parseQuickAdd('１０月３０日 １８：００ 大物报告', now)
    expect(result.title).toBe('大物报告')
    expect(local(result.dueAt)).toContain('2026/10/30 18:00')
  })

  it('supports next-next week', () => {
    const result = parseQuickAdd('下下周一 10:00 交报告', now)
    expect(local(result.dueAt)).toContain('2026/11/9 10:00')
  })
})

describe('parseDueText', () => {
  it('parses remaining duration', () => {
    const result = parseDueText('剩余 2 天 3 小时', now)
    expect(result.dueAt).not.toBeNull()
    expect(local(result.dueAt!)).toContain('2026/10/29 19:00')
  })

  it('parses an absolute deadline label', () => {
    const result = parseDueText('截止时间：2026-10-30 23:59', now)
    expect(result.dueAt).not.toBeNull()
    expect(local(result.dueAt!)).toContain('2026/10/30 23:59')
  })

  it('does not invent a deadline for expired text', () => {
    const result = parseDueText('已截止', now)
    expect(result.dueAt).toBeNull()
  })
})
