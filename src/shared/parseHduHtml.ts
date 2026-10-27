import type { HduCoursePreview, HduSyncPreview, Weekday } from './types'
import { normalizeWeeks } from './schedule'

const WEEKDAY_MAP: Record<string, Weekday> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  middot: '·',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  times: '×'
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITY_MAP[name.toLowerCase()] ?? match)
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
}

export function decodeHtmlBuffer(input: Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const asciiHead = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096))
  const charsetMatch = asciiHead.match(/charset\s*=\s*["']?([\w-]+)/i)
  const charset = charsetMatch?.[1]?.toLowerCase() ?? ''

  if (/gbk|gb2312|gb18030/.test(charset)) {
    return decodeWith(bytes, 'gb18030')
  }
  if (/big5/.test(charset)) {
    return decodeWith(bytes, 'big5')
  }

  const utf8 = decodeWith(bytes, 'utf-8')
  if (utf8.includes('\uFFFD') && !/gbk|gb2312|gb18030/.test(charset)) {
    const fallback = decodeWith(bytes, 'gb18030')
    if (!fallback.includes('\uFFFD') || fallback.length > utf8.length) return fallback
  }
  return utf8
}

function decodeWith(bytes: Uint8Array, encoding: string): string {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
}

function htmlToText(html: string, splitInline = false): string {
  let value = html.replace(/<br\s*\/?>/gi, '\n').replace(/<hr\s*\/?>/gi, '\n')
  value = value.replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
  if (splitInline) {
    value = value.replace(/<\/(?:span|font|b|strong|em|a|label|td|th)>/gi, '\n')
  }
  return decodeEntities(value.replace(/<[^>]+>/g, ''))
}

function toLines(html: string, splitInline = false): string[] {
  return htmlToText(html, splitInline)
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0)
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[-—–_=·\s]+|[-—–_=·\s]+$/g, '').trim()
}

function isSeparatorLine(value: string): boolean {
  return /^[-—–_=·\s]{3,}$/.test(value)
}

function isHeaderLine(value: string): boolean {
  return /^(节次|星期|时间|上午|下午|晚上|备注|课程表|学生个人课表|个人课表查询|信息查询)$/.test(value)
}

function isWeekText(value: string): boolean {
  return /周/.test(value) && /\d/.test(value)
}

function isPeriodText(value: string): boolean {
  return /第?\s*\d{1,2}\s*(?:[-–—~至]\s*\d{1,2})?\s*节/.test(value)
}

function weekdayInText(value: string): Weekday | null {
  const match = value.match(/(?:星期|周)\s*([一二三四五六日天])/)
  if (!match) return null
  return WEEKDAY_MAP[match[1]] ?? null
}

export function parseWeeksText(value: string): number[] {
  const normalized = decodeEntities(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，、,；;]/g, ' ')
  if (!/\d/.test(normalized)) return []

  const hasOdd = /单/.test(normalized)
  const hasEven = /双/.test(normalized)
  const parity = hasOdd && !hasEven ? 'odd' : hasEven && !hasOdd ? 'even' : 'all'
  const result: number[] = []
  const consumedRanges: Array<[number, number]> = []

  for (const match of normalized.matchAll(/(\d{1,2})\s*[-–—~至]\s*(\d{1,2})/g)) {
    const start = Number(match[1])
    const end = Number(match[2])
    consumedRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length])
    const from = Math.max(1, Math.min(start, end))
    const to = Math.min(30, Math.max(start, end))
    for (let week = from; week <= to; week += 1) {
      if (parity === 'odd' && week % 2 === 0) continue
      if (parity === 'even' && week % 2 !== 0) continue
      result.push(week)
    }
  }

  let remainder = normalized
  for (const [start, end] of consumedRanges.reverse()) {
    remainder = `${remainder.slice(0, start)} ${remainder.slice(end)}`
  }
  for (const match of remainder.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)) {
    const week = Number(match[1])
    if (week < 1 || week > 30) continue
    if (parity === 'odd' && week % 2 === 0) continue
    if (parity === 'even' && week % 2 !== 0) continue
    result.push(week)
  }
  return normalizeWeeks(result)
}

function parsePeriods(value: string): { start: number; end: number } | null {
  const match = value.match(/第?\s*(\d{1,2})\s*(?:[-–—~至]\s*(\d{1,2}))?\s*节/)
  if (!match) return null
  const first = Number(match[1])
  const second = match[2] ? Number(match[2]) : first
  const start = Math.min(first, second)
  const end = Math.max(first, second)
  if (start < 1 || end > 20) return null
  return { start, end }
}

function pickFields(lines: string[]): { title: string; teacher: string; location: string } {
  const filtered = lines.filter(
    (line) =>
      !isSeparatorLine(line) &&
      !isHeaderLine(line) &&
      !isWeekText(line) &&
      !isPeriodText(line) &&
      !/(?:星期|周)\s*[一二三四五六日天]/.test(line) &&
      !/^\d{1,2}:\d{2}/.test(line) &&
      !/^(未安排|无)$/.test(line)
  )
  const title = filtered[0] ?? ''
  let teacher = ''
  let location = ''
  for (const line of filtered.slice(1)) {
    if (!location && /教|楼|室|馆|场|机房|校区|实验|中心/.test(line)) {
      location = line
    } else if (!teacher && line.length <= 16) {
      teacher = line
    } else if (!location && line.length <= 20) {
      location = line
    }
  }
  return { title, teacher, location }
}

function parseTimeInfo(value: string): {
  weekday: Weekday
  startPeriod: number
  endPeriod: number
  weeks: number[]
  hasWeeks: boolean
} | null {
  const weekdayMatch = value.match(/(?:周|星期)\s*([一二三四五六日天])/)
  if (!weekdayMatch) return null
  const weekday = WEEKDAY_MAP[weekdayMatch[1]]
  if (!weekday) return null

  const periodPart = value.split(/[{(（]/)[0]
  const periods = parsePeriods(periodPart)
  if (!periods) return null

  const weekPart = value.match(/[{(（]([^})）]+)[})）]/)?.[1] ?? value.slice(value.indexOf('节') + 1)
  const weeks = parseWeeksText(weekPart)
  return {
    weekday,
    startPeriod: periods.start,
    endPeriod: periods.end,
    weeks: weeks.length > 0 ? weeks : Array.from({ length: 16 }, (_, index) => index + 1),
    hasWeeks: weeks.length > 0
  }
}

/**
 * 新版教务页面常见：一行里放“星期一 / 第1-2节 / 1-16周”，字段被拆在不同行或 span 里。
 * 这里不要求时间信息在同一行，只要格子里同时存在星期、节次和周次即可识别。
 */
function parseCellFallback(lines: string[]): {
  weekday: Weekday
  startPeriod: number
  endPeriod: number
  weeks: number[]
  hasWeeks: boolean
  title: string
  teacher: string
  location: string
} | null {
  const combined = lines.join(' ')
  if (!/周/.test(combined)) return null
  const weekday = weekdayInText(combined)
  if (!weekday) return null
  const periods = parsePeriods(combined)
  if (!periods) return null
  const weeks = parseWeeksText(combined)
  const fields = pickFields(lines)
  if (!fields.title || fields.title.length < 2 || fields.title.length > 80) return null
  return {
    weekday,
    startPeriod: periods.start,
    endPeriod: periods.end,
    weeks: weeks.length > 0 ? weeks : Array.from({ length: 16 }, (_, index) => index + 1),
    hasWeeks: weeks.length > 0,
    title: fields.title,
    teacher: fields.teacher,
    location: fields.location
  }
}

interface GridCell {
  text: string
  lines: string[]
  row: number
  col: number
  rowSpan: number
  colSpan: number
  origin: boolean
}

function buildGrid(tableHtml: string): { grid: Array<Array<GridCell | null>>; rows: number; cols: number } {
  const rowMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
  const grid: Array<Array<GridCell | null>> = []
  let maxCols = 0

  rowMatches.forEach((rowMatch, rowIndex) => {
    grid[rowIndex] = grid[rowIndex] ?? []
    let col = 0
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      const attrs = cellMatch[1]
      const rowSpan = Math.max(1, Math.min(20, Number(attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1)))
      const colSpan = Math.max(1, Math.min(12, Number(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1)))
      while (grid[rowIndex][col]) col += 1
      const lines = toLines(cellMatch[2], true)
      const cell: GridCell = {
        text: lines.join(' '),
        lines,
        row: rowIndex,
        col,
        rowSpan,
        colSpan,
        origin: true
      }
      for (let dr = 0; dr < rowSpan; dr += 1) {
        const targetRow = rowIndex + dr
        grid[targetRow] = grid[targetRow] ?? []
        for (let dc = 0; dc < colSpan; dc += 1) {
          grid[targetRow][col + dc] = dr === 0 && dc === 0 ? cell : { ...cell, origin: false }
        }
      }
      col += colSpan
      maxCols = Math.max(maxCols, col)
    }
  })

  return { grid, rows: rowMatches.length, cols: maxCols }
}

/**
 * 新版正方/教务页面的课表是“行=节次、列=星期”的合并单元格表格，
 * 课程格子里不一定带“周一第1-2节”。这里按表头和行列位置推断星期与节次。
 */
function parseGridTable(html: string): { courses: HduCoursePreview[]; warnings: string[] } {
  const warnings: string[] = []
  const courses: HduCoursePreview[] = []
  const seen = new Set<string>()
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0])
  if (tables.length === 0) tables.push(html)

  for (const tableHtml of tables) {
    const { grid, rows, cols } = buildGrid(tableHtml)
    let headerRow = -1
    let columnWeekdays = new Map<number, Weekday>()

    for (let row = 0; row < Math.min(rows, 8); row += 1) {
      const mapping = new Map<number, Weekday>()
      for (let col = 0; col < cols; col += 1) {
        const cell = grid[row]?.[col]
        if (!cell || !cell.origin) continue
        const weekday = weekdayInText(cell.lines[0] ?? cell.text)
        if (weekday) mapping.set(col, weekday)
      }
      if (mapping.size > columnWeekdays.size) {
        columnWeekdays = mapping
        headerRow = row
      }
    }
    if (columnWeekdays.size < 3 || headerRow < 0) continue

    const firstWeekdayCol = Math.min(...columnWeekdays.keys())
    let timeCol = Math.max(0, firstWeekdayCol - 1)
    for (let col = 0; col < firstWeekdayCol; col += 1) {
      const samples = grid
        .slice(headerRow + 1, Math.min(rows, headerRow + 6))
        .map((rowCells) => rowCells?.[col]?.text ?? '')
        .join(' ')
      if (isPeriodText(samples) || /\d{1,2}:\d{2}/.test(samples)) {
        timeCol = col
        break
      }
    }

    const periodByRow = new Map<number, number>()
    let autoPeriod = 0
    for (let row = headerRow + 1; row < rows; row += 1) {
      const cell = grid[row]?.[timeCol]
      const text = cell?.text ?? ''
      const periods = parsePeriods(text)
      if (periods) {
        periodByRow.set(row, periods.start)
      } else {
        autoPeriod += 1
        periodByRow.set(row, autoPeriod)
      }
    }

    for (let row = headerRow + 1; row < rows; row += 1) {
      for (let col = firstWeekdayCol; col < cols; col += 1) {
        const cell = grid[row]?.[col]
        if (!cell || !cell.origin) continue
        const weekday = columnWeekdays.get(col)
        if (!weekday) continue
        const startPeriod = periodByRow.get(row) ?? row - headerRow
        const endPeriod = Math.min(20, startPeriod + Math.max(1, cell.rowSpan) - 1)
        const weeks = parseWeeksText(cell.text)
        const fields = pickFields(cell.lines)
        if (!fields.title || fields.title.length < 2 || fields.title.length > 80) continue
        if (isHeaderLine(fields.title) || /^\d+$/.test(fields.title)) continue
        if (!weeks.length) warnings.push(`${fields.title} 未识别到周次，已暂按 1-16 周处理`)
        const preview: HduCoursePreview = {
          name: fields.title,
          teacher: fields.teacher,
          location: fields.location,
          weekday,
          startPeriod,
          endPeriod,
          weeks: weeks.length > 0 ? weeks : Array.from({ length: 16 }, (_, index) => index + 1),
          rawTime: `第 ${startPeriod}-${endPeriod} 节`
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
    }
    if (courses.length > 0) break
  }

  return { courses, warnings }
}

function extractSelectedOption(html: string, id: string): string | undefined {
  const select = html.match(new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'))
  if (!select) return undefined
  const options = [...select[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
  if (options.length === 0) return undefined
  const selected = options.find((option) => /\bselected\b/i.test(option[1]))
  const value = (selected ?? options.find((option) => cleanLine(htmlToText(option[2])) !== ''))?.[2]
  return value ? cleanLine(htmlToText(value)) : undefined
}

export function parseHduHtml(html: string): HduSyncPreview {
  const warnings: string[] = []
  const courses: HduCoursePreview[] = []
  const seen = new Set<string>()
  const cells = [...html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]

  const pushCourse = (preview: HduCoursePreview, missingWeeks = false): void => {
    if (!preview.name || preview.name.length < 2 || preview.name.length > 80) return
    if (!/[一-龥A-Za-z]/.test(preview.name)) return
    if (missingWeeks) warnings.push(`${preview.name} 未识别到周次，已暂按 1-16 周处理`)
    const key = [
      preview.name,
      preview.teacher,
      preview.location,
      preview.weekday,
      preview.startPeriod,
      preview.endPeriod,
      preview.weeks.join(',')
    ].join('|')
    if (seen.has(key)) return
    seen.add(key)
    courses.push(preview)
  }

  for (const cell of cells) {
    const lines = toLines(cell[1])
    if (lines.length < 2) continue

    let matchedTimeLine = false
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!/(?:周|星期)\s*[一二三四五六日天]/.test(line)) continue
      const info = parseTimeInfo(line)
      if (!info) continue
      matchedTimeLine = true
      const title = lines[index - 1] ?? ''
      if (
        !title ||
        isSeparatorLine(title) ||
        isHeaderLine(title) ||
        /(?:周|星期)\s*[一二三四五六日天]/.test(title)
      ) {
        continue
      }
      let teacher = lines[index + 1] ?? ''
      let location = lines[index + 2] ?? ''
      if (isSeparatorLine(teacher) || /(?:周|星期)\s*[一二三四五六日天]/.test(teacher)) teacher = ''
      if (isSeparatorLine(location) || /(?:周|星期)\s*[一二三四五六日天]/.test(location)) location = ''
      if (teacher === '无') teacher = ''
      if (location === '无' || location === '-') location = ''
      pushCourse(
        {
          name: title,
          teacher,
          location,
          weekday: info.weekday,
          startPeriod: info.startPeriod,
          endPeriod: info.endPeriod,
          weeks: info.weeks,
          rawTime: line
        },
        !info.hasWeeks
      )
    }

    if (matchedTimeLine) continue
    const richLines = toLines(cell[1], true)
    const fallback = parseCellFallback(richLines)
    if (fallback) {
      pushCourse(
        {
          name: fallback.title,
          teacher: fallback.teacher,
          location: fallback.location,
          weekday: fallback.weekday,
          startPeriod: fallback.startPeriod,
          endPeriod: fallback.endPeriod,
          weeks: fallback.weeks,
          rawTime: `${fallback.startPeriod}-${fallback.endPeriod} 节`
        },
        !fallback.hasWeeks
      )
    }
  }

  if (courses.length === 0) {
    const gridResult = parseGridTable(html)
    if (gridResult.courses.length > 0) {
      courses.push(...gridResult.courses)
      warnings.push(...gridResult.warnings)
      warnings.push('已按新版课表的行列结构识别，建议核对星期与节次')
    }
  }

  courses.sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.startPeriod - b.startPeriod ||
      a.name.localeCompare(b.name, 'zh-CN')
  )

  const nameMatch = html.match(/id=["']xhxm["'][^>]*>([\s\S]*?)<\//i)
  const studentName = nameMatch
    ? cleanLine(htmlToText(nameMatch[1])).replace(/同学$/, '')
    : undefined
  const xnd = extractSelectedOption(html, 'xnd')
  const xqd = extractSelectedOption(html, 'xqd')
  const semesterLabel = xnd ? `${xnd}${xqd ? ` · ${xqd}学期` : ''}` : undefined

  if (courses.length === 0) {
    warnings.push('没有识别到课程。请确认已打开「信息查询 → 个人课表查询」，或把该页面保存成 HTML 后导入。')
  }

  return {
    courses,
    studentName,
    semesterLabel,
    capturedAt: new Date().toISOString(),
    warnings: [...new Set(warnings)],
    source: 'html'
  }
}