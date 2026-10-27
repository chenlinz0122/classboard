export const COURSE_COLOR_COUNT = 8

/** 稳定的课程颜色槽位，避免同一次渲染前后跳色。 */
export function colorIndexFor(value: string, offset = 0): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (Math.abs(hash) + offset) % COURSE_COLOR_COUNT
}

export function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
