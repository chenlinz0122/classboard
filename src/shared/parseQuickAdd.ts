import {
  addDays,
  calendarDayDiff,
  isSameDay,
  startOfDay,
  startOfWeek
} from './date'

export interface QuickAddResult {
  title: string
  dueAt: string
  dueDate: Date
  hasDate: boolean
  hasTime: boolean
  matchedDateText?: string
  matchedTimeText?: string
}

export interface DueTextResult {
  dueAt: string | null
  dueDate: Date | null
  hasDate: boolean
  hasTime: boolean
  matchedText?: string
}

interface DateMatch {
  date: Date
  hasDate: boolean
  text: string
  priority: number
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7
}

export function normalizeInput(input: string): string {
  return input
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .replace(/－/g, '-')
    .replace(/～/g, '~')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildDate(year: number, month: number, day: number, hours: number, minutes: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

function normalizeHour(hour: number, period?: string): number {
  let value = hour
  if (!period) return value
  if (/下午|傍晚|晚上|晚/.test(period) && value < 12) value += 12
  if (/中午/.test(period) && value < 11) value += 12
  if (/凌晨/.test(period) && value === 12) value = 0
  if (/上午|早上|早晨/.test(period) && value === 12) value = 0
  return value
}

function resolveWeekdayDate(
  now: Date,
  targetWeekday: number,
  modifier: 'this' | 'next' | 'next2' | 'bare',
  minutesOfDay: number
): Date {
  const monday = startOfWeek(now)
  let candidate: Date
  if (modifier === 'next') {
    candidate = addDays(monday, 7 + targetWeekday - 1)
  } else if (modifier === 'next2') {
    candidate = addDays(monday, 14 + targetWeekday - 1)
  } else if (modifier === 'this') {
    candidate = addDays(monday, targetWeekday - 1)
  } else {
    candidate = addDays(monday, targetWeekday - 1)
    if (calendarDayDiff(now, candidate) < 0) {
      candidate = addDays(candidate, 7)
    } else if (isSameDay(candidate, now)) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      if (minutesOfDay <= nowMinutes) {
        candidate = addDays(candidate, 7)
      }
    }
  }
  return startOfDay(candidate)
}

function consume(text: string, token: string): string {
  if (!token) return text
  const index = text.indexOf(token)
  if (index < 0) return text
  return `${text.slice(0, index)} ${text.slice(index + token.length)}`
}

function cleanupTitle(value: string): string {
  let title = value
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，。.;；:：\-—_]+/, '')
    .replace(/[\s,，。.;；:：\-—_]+$/, '')
    .replace(/^(截止到|截止|在|于)\s*/, '')
    .replace(/\s*(截止|之前|以前)$/, '')
    .trim()
  title = title.replace(/^[\s,，。.;；:：\-—_]+|[\s,，。.;；:：\-—_]+$/g, '')
  return title || '未命名作业'
}

export function parseQuickAdd(input: string, now = new Date()): QuickAddResult {
  let working = normalizeInput(input)
  const matchedTokens: string[] = []
  const dateCandidates: DateMatch[] = []

  // 1) 完整年月日
  const fullDate = working.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?/)
  if (fullDate) {
    const date = new Date(
      Number(fullDate[1]),
      Number(fullDate[2]) - 1,
      Number(fullDate[3]),
      0,
      0,
      0,
      0
    )
    if (Number.isFinite(date.getTime())) {
      dateCandidates.push({ date, hasDate: true, text: fullDate[0], priority: 100 })
      matchedTokens.push(fullDate[0])
      working = consume(working, fullDate[0])
    }
  }

  // 2) 月日（不带年份）
  if (!fullDate) {
    const monthDay = working.match(/(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
    if (monthDay) {
      const month = Number(monthDay[1])
      const day = Number(monthDay[2])
      let date = buildDate(now.getFullYear(), month, day, 0, 0)
      if (date && calendarDayDiff(now, date) < -1) {
        date = buildDate(now.getFullYear() + 1, month, day, 0, 0)
      }
      if (date) {
        dateCandidates.push({ date, hasDate: true, text: monthDay[0], priority: 90 })
        matchedTokens.push(monthDay[0])
        working = consume(working, monthDay[0])
      }
    } else {
      const slashDate = working.match(/(?<!\d)(\d{1,2})\s*[/-]\s*(\d{1,2})(?!\d)/)
      if (slashDate) {
        const month = Number(slashDate[1])
        const day = Number(slashDate[2])
        let date = buildDate(now.getFullYear(), month, day, 0, 0)
        if (date && calendarDayDiff(now, date) < -1) {
          date = buildDate(now.getFullYear() + 1, month, day, 0, 0)
        }
        if (date) {
          dateCandidates.push({ date, hasDate: true, text: slashDate[0], priority: 85 })
          matchedTokens.push(slashDate[0])
          working = consume(working, slashDate[0])
        }
      }
    }
  }

  // 3) 相对日期词
  const relative = working.match(/(今天|今日|明天|明日|后天|大后天)/)
  let relativeDate: Date | null = null
  if (relative) {
    const offset = relative[1].includes('大后')
      ? 3
      : relative[1].includes('后')
        ? 2
        : relative[1].includes('明')
          ? 1
          : 0
    relativeDate = addDays(startOfDay(now), offset)
    dateCandidates.push({ date: relativeDate, hasDate: true, text: relative[0], priority: 80 })
    matchedTokens.push(relative[0])
    working = consume(working, relative[0])
  }

  // 4) 周几 / 下周几
  const weekdayMatch = working.match(/(下下|下个|下|本|这|这个)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/)
  let weekdayInfo:
    | { target: number; modifier: 'this' | 'next' | 'next2' | 'bare'; text: string }
    | null = null
  if (weekdayMatch) {
    const prefix = weekdayMatch[1] ?? ''
    const modifier: 'this' | 'next' | 'next2' | 'bare' = prefix.includes('下下')
      ? 'next2'
      : prefix.includes('下')
        ? 'next'
        : prefix.includes('本') || prefix.includes('这')
          ? 'this'
          : 'bare'
    weekdayInfo = {
      target: WEEKDAY_MAP[weekdayMatch[2]],
      modifier,
      text: weekdayMatch[0]
    }
    matchedTokens.push(weekdayMatch[0])
    working = consume(working, weekdayMatch[0])
  }

  // 5) N 天后 / N 周后
  let relativeDays: { days: number; text: string } | null = null
  const dayLater = working.match(/(?<!\d)(\d{1,3})\s*天\s*(?:后|以后)/)
  if (dayLater) {
    relativeDays = { days: Number(dayLater[1]), text: dayLater[0] }
    matchedTokens.push(dayLater[0])
    working = consume(working, dayLater[0])
  } else {
    const weekLater = working.match(/(?<!\d)(\d{1,2})\s*周\s*(?:后|以后)/)
    if (weekLater) {
      relativeDays = { days: Number(weekLater[1]) * 7, text: weekLater[0] }
      matchedTokens.push(weekLater[0])
      working = consume(working, weekLater[0])
    }
  }

  // 6) 单独“下周”
  let nextWeekOnly: { text: string } | null = null
  if (!weekdayInfo) {
    const nextWeek = working.match(/(下下|下周|下个星期)\s*(?:一|周一|星期一)?/)
    if (nextWeek) {
      nextWeekOnly = { text: nextWeek[0] }
      matchedTokens.push(nextWeek[0])
      working = consume(working, nextWeek[0])
    }
  }

  // 7) 时间
  let hour = 23
  let minute = 59
  let hasTime = false
  let timeText: string | undefined
  const colonTime = working.match(/(凌晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚)?\s*(\d{1,2})\s*:\s*(\d{1,2})/)
  const pointTime = working.match(
    /(凌晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚)?\s*(\d{1,2})\s*(?:点|时)\s*(半|\d{1,2}\s*分?)?/
  )
  if (colonTime) {
    const candidateHour = normalizeHour(Number(colonTime[2]), colonTime[1])
    const candidateMinute = Number(colonTime[3])
    if (candidateHour >= 0 && candidateHour <= 23 && candidateMinute >= 0 && candidateMinute <= 59) {
      hour = candidateHour
      minute = candidateMinute
      hasTime = true
      timeText = colonTime[0]
      matchedTokens.push(colonTime[0])
      working = consume(working, colonTime[0])
    }
  } else if (pointTime) {
    const candidateHour = normalizeHour(Number(pointTime[2]), pointTime[1])
    let candidateMinute = 0
    if (pointTime[3] === '半') candidateMinute = 30
    else if (pointTime[3]) candidateMinute = Number(pointTime[3].replace(/\D/g, '')) || 0
    if (candidateHour >= 0 && candidateHour <= 23 && candidateMinute >= 0 && candidateMinute <= 59) {
      hour = candidateHour
      minute = candidateMinute
      hasTime = true
      timeText = pointTime[0]
      matchedTokens.push(pointTime[0])
      working = consume(working, pointTime[0])
    }
  }

  // 8) 选择日期
  let date: Date
  let hasDate = true
  const explicit = dateCandidates
    .filter((candidate) => candidate.priority >= 85)
    .sort((a, b) => b.priority - a.priority)[0]

  if (explicit) {
    date = startOfDay(explicit.date)
  } else if (weekdayInfo) {
    date = resolveWeekdayDate(now, weekdayInfo.target, weekdayInfo.modifier, hour * 60 + minute)
  } else if (relativeDate) {
    date = startOfDay(relativeDate)
  } else if (relativeDays) {
    date = addDays(startOfDay(now), relativeDays.days)
  } else if (nextWeekOnly) {
    date = addDays(startOfWeek(now), nextWeekOnly.text.startsWith('下下') ? 14 : 7)
  } else {
    hasDate = false
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    date = startOfDay(now)
    if (hour * 60 + minute <= nowMinutes) {
      date = addDays(date, 1)
    }
  }

  const dueDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0
  )

  return {
    title: cleanupTitle(working),
    dueAt: dueDate.toISOString(),
    dueDate,
    hasDate,
    hasTime,
    matchedDateText: matchedTokens.find((token) => /周|星期|礼拜|今天|明天|后天|月|日|\d{4}/.test(token)),
    matchedTimeText: timeText
  }
}

/**
 * 解析平台页面上的一句话截止时间。优先处理“剩余 2 天 3 小时”这类相对文本，
 * 再回退到绝对日期解析。
 */
export function parseDueText(text: string, now = new Date()): DueTextResult {
  const normalized = normalizeInput(text)
  if (!normalized) return { dueAt: null, dueDate: null, hasDate: false, hasTime: false }
  if (/已截止|已过期|已结束|已失效/.test(normalized)) {
    return { dueAt: null, dueDate: null, hasDate: false, hasTime: false, matchedText: normalized }
  }

  const remainingMatch =
    normalized.match(
      /(?:剩余(?:时间)?|还剩|还有)\s*(?:(\d+)\s*天)?\s*(?:(\d+)\s*(?:小时|时))?\s*(?:(\d+)\s*分(?:钟)?)?/
    ) ??
    normalized.match(/^(?:(\d+)\s*天)?\s*(?:(\d+)\s*(?:小时|时))?\s*(?:(\d+)\s*分(?:钟)?)?$/)
  if (remainingMatch && (remainingMatch[1] || remainingMatch[2] || remainingMatch[3])) {
    const days = Number(remainingMatch[1] ?? 0)
    const hours = Number(remainingMatch[2] ?? 0)
    const minutes = Number(remainingMatch[3] ?? 0)
    const dueDate = new Date(now.getTime() + ((days * 24 + hours) * 60 + minutes) * 60 * 1000)
    return {
      dueAt: dueDate.toISOString(),
      dueDate,
      hasDate: true,
      hasTime: true,
      matchedText: remainingMatch[0].trim()
    }
  }

  const onlyAbsolute = normalized.match(
    /(?:截止(?:时间|日期)?|deadline)\s*[:：]?\s*(.+)/
  )
  const source = onlyAbsolute?.[1] ?? normalized
  const parsed = parseQuickAdd(source, now)
  if (parsed.hasDate || parsed.hasTime) {
    return {
      dueAt: parsed.dueAt,
      dueDate: parsed.dueDate,
      hasDate: parsed.hasDate,
      hasTime: parsed.hasTime,
      matchedText: source
    }
  }
  return { dueAt: null, dueDate: null, hasDate: false, hasTime: false }
}
