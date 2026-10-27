import type { PlatformAssignment } from './types'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * PTA（pintia.cn）「我的题目集」解析。
 * GET /api/problem-sets?filter={"endAtAfter":"..."} → { problemSets: [...] }
 * 每个题目集自带 endAt（UTC ISO），这就是整份作业的截止时间。
 */
export function parsePtaProblemSets(
  payload: unknown,
  now = new Date()
): { items: PlatformAssignment[]; warnings: string[] } {
  const warnings: string[] = []
  const items: PlatformAssignment[] = []
  const root = isRecord(payload) ? payload : {}
  const rawSets = Array.isArray(root.problemSets) ? root.problemSets : []
  let missingDeadline = 0
  let expired = 0

  for (const [index, raw] of rawSets.entries()) {
    if (!isRecord(raw)) continue
    const id = asText(raw.id)
    const name = asText(raw.name)
    if (!id || !name) continue
    const endAt = asText(raw.endAt)
    const end = endAt ? new Date(endAt) : null
    if (!end || !Number.isFinite(end.getTime())) {
      missingDeadline += 1
      continue
    }
    if (end.getTime() < now.getTime()) {
      expired += 1
      continue
    }
    const organizationName = asText(raw.organizationName)
    const ownerNickname = asText(raw.ownerNickname)
    const type = asText(raw.type)
    const status = asText(raw.status)
    const isExam = /EXAM/i.test(type)
    // PTA 的 organizationName 有时是学校名（如“杭州电子科技大学”）而不是课程名。
    const looksLikeSchool = /(大学|学院|学校)$/.test(organizationName)
    const courseName = organizationName && !looksLikeSchool ? organizationName : ''
    items.push({
      tempId: `pta-${id}-${index}`,
      externalId: id,
      title: isExam ? `考试 · ${name}` : name,
      courseName,
      dueAt: end.toISOString(),
      dueText: endAt,
      sourceUrl: `https://pintia.cn/problem-sets/${encodeURIComponent(id)}`,
      statusText: status || type,
      // PTA 列表接口不提供逐题完成状态；默认选中，由用户在预览里取消。
      completed: false,
      selected: true
    })
  }

  warnings.push('PTA 按整个题目集的截止时间生成一条 DDL；题目集内的小题不会单独提醒。')
  if (missingDeadline > 0) warnings.push(`${missingDeadline} 个题目集没有截止时间，已跳过`)
  if (expired > 0) warnings.push(`${expired} 个题目集已经截止，已跳过`)

  items.sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime())
  return { items, warnings }
}