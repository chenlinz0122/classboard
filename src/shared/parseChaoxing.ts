import type { PlatformAssignment } from './types'
import { decodeEntities } from './parseHduHtml'
import { parseDueText } from './parseQuickAdd'

function clean(value: string): string {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTaskId(url: string): string | undefined {
  const match = url.match(/[?&]taskrefId=(\d+)/)
  return match?.[1]
}

function extractLabel(block: string): string | null {
  const label = block.match(/aria-label=(?:"([^"]*)"|'([^']*)')/i)
  if (!label) return null
  return clean(label[1] ?? label[2] ?? '')
}

/**
 * 学习通 /work/stu-work 页面解析器。
 * 页面是服务端渲染 HTML，每条作业是一个 li[data=...]，aria-label 里带着
 * 标题、状态、课程和“剩余时间”。这里不猜日期：能解析出剩余时间才生成绝对截止。
 */
export function parseChaoxingWorks(html: string, now = new Date()): PlatformAssignment[] {
  const liMatches = [...html.matchAll(/<li\b[^>]*data="(https:\/\/mooc1-api\.chaoxing\.com\/mooc-ans\/android\/mtaskmsgspecial[^"]*)"[^>]*>/gi)]
  const items: PlatformAssignment[] = []
  const seen = new Set<string>()

  liMatches.forEach((match, index) => {
    const start = match.index ?? 0
    const nextStart = liMatches[index + 1]?.index ?? html.length
    const block = html.slice(start, Math.min(nextStart, start + 6000))
    const label = extractLabel(block)
    if (!label) return
    const normalizedLabel = label.replace(/[；;]\s*(?=作业状态|所属课程|剩余时间)/g, ' ')
    const parsed = normalizedLabel.match(
      /^(?:作业名称\s*[:：]?\s*)?([\s\S]*?)\s*作业状态\s*[:：]?\s*([\s\S]*?)\s*所属课程\s*[:：]?\s*([\s\S]*?)(?:\s*剩余时间\s*[:：]?\s*([\s\S]*?))?\s*$/i
    )
    if (!parsed) return
    const title = clean(parsed[1]).replace(/[；;，,]\s*$/, '')
    const status = clean(parsed[2]).replace(/[；;，,]\s*$/, '')
    const course = clean(parsed[3])
      .replace(/[；;，,]\s*$/, '')
      .replace(/^《|》$/g, '')
      .trim()
    if (!title) return
    const remainingText = parsed[4] ? clean(parsed[4]) : undefined
    const due = remainingText ? parseDueText(remainingText, now) : null
    const sourceUrl = match[1]
    const externalId = extractTaskId(sourceUrl)
    const dedupeKey = externalId ?? `${title}|${course}|${remainingText ?? ''}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    const completed = /已完成|已批阅|已提交|已结束/.test(status)
    items.push({
      tempId: `cx-${externalId ?? index}`,
      externalId,
      title,
      courseName: course,
      dueAt: due?.dueAt ?? null,
      dueText: remainingText,
      sourceUrl,
      statusText: status,
      completed,
      selected: !completed
    })
  })

  return items
}

export function looksLikeLoginPage(html: string): boolean {
  return (
    /<title>\s*登录\s*<\/title>/i.test(html) ||
    /passport2\.chaoxing\.com\/login/i.test(html) ||
    /name=["']fid["'][^>]*id=["']fid["']/i.test(html)
  )
}
