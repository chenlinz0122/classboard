import { describe, expect, it } from 'vitest'
import { parsePtaProblemSets } from './parsePta'

const now = new Date('2026-10-27T08:00:00.000Z')

describe('PTA problem set parser', () => {
  it('maps active problem sets to deadlines with organization as course', () => {
    const result = parsePtaProblemSets(
      {
        problemSets: [
          {
            id: 'ps-1',
            name: '数据结构作业 3',
            type: 'EXERCISE',
            status: 'ONGOING',
            organizationName: '数据结构',
            ownerNickname: '陈老师',
            startAt: '2026-10-20T00:00:00.000Z',
            endAt: '2026-10-30T15:59:00.000Z'
          },
          {
            id: 'ps-2',
            name: '期中测试',
            type: 'EXAM',
            status: 'ONGOING',
            organizationName: '程序设计基础',
            endAt: '2026-11-01T10:00:00.000Z'
          },
          {
            id: 'ps-3',
            name: '无截止练习题',
            type: 'EXERCISE',
            organizationName: '数据结构',
            endAt: null
          },
          {
            id: 'ps-4',
            name: '已截止作业',
            type: 'EXERCISE',
            organizationName: '数据结构',
            endAt: '2026-10-01T00:00:00.000Z'
          }
        ]
      },
      now
    )
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe('数据结构作业 3')
    expect(result.items[0].courseName).toBe('数据结构')
    expect(new Date(result.items[0].dueAt as string).toISOString()).toBe('2026-10-30T15:59:00.000Z')
    expect(result.items[1].title).toBe('考试 · 期中测试')
    expect(result.items[1].courseName).toBe('程序设计基础')
    expect(result.warnings.join(' / ')).toContain('没有截止时间')
    expect(result.warnings.join(' / ')).toContain('已经截止')
  })

  it('handles an empty payload', () => {
    const result = parsePtaProblemSets({}, now)
    expect(result.items).toHaveLength(0)
    expect(result.warnings[0]).toContain('PTA')
  })
})