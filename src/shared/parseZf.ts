import type { HduCoursePreview } from './types'
import { parseWeeksText } from './parseHduHtml'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

export interface ZfScheduleParseResult {
  courses: HduCoursePreview[]
  warnings: string[]
}

/**
 * 新版正方 jwglxt 的课程数据：
 * POST /jwglxt/kbcx/xskbcx_cxXsgrkb.html → { kbList: [{ kcmc, xm, cdmc, xqj, jcs, zcd }] }
 * zcd 是真正的周次段，例如 "1-16周" / "1-8周(单)" / "1-8,10-16周"。
 */
export function parseZfKbList(payload: unknown): ZfScheduleParseResult {
  const warnings: string[] = []
  const courses: HduCoursePreview[] = []
  const seen = new Set<string>()
  const root = isRecord(payload) ? payload : {}
  const list = Array.isArray(root.kbList) ? root.kbList : []
  let skipped = 0

  for (const raw of list) {
    if (!isRecord(raw)) continue
    const name = text(raw.kcmc)
    const weekday = Number(raw.xqj)
    const periodText = text(raw.jcs) || text(raw.jc)
    const periods = (periodText.match(/\d+/g) ?? []).map(Number).filter((n) => Number.isFinite(n))
    const weeks = parseWeeksText(text(raw.zcd))
    if (
      !name ||
      !(weekday >= 1 && weekday <= 7) ||
      periods.length === 0 ||
      weeks.length === 0
    ) {
      skipped += 1
      continue
    }
    const startPeriod = Math.min(...periods)
    const endPeriod = Math.max(...periods)
    const preview: HduCoursePreview = {
      name,
      teacher: text(raw.xm),
      location: text(raw.cdmc) || text(raw.cdbh),
      weekday: weekday as HduCoursePreview['weekday'],
      startPeriod,
      endPeriod,
      weeks,
      rawTime: text(raw.zcd)
    }
    const key = [
      preview.name,
      preview.teacher,
      preview.location,
      preview.weekday,
      preview.startPeriod,
      preview.endPeriod,
      preview.weeks.join(',')
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    courses.push(preview)
  }

  if (skipped > 0) warnings.push(`${skipped} 条课程缺少课程名、节次或周次，已跳过`)
  courses.sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.startPeriod - b.startPeriod ||
      a.name.localeCompare(b.name, 'zh-CN')
  )
  return { courses, warnings }
}