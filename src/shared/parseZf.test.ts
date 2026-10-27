import { describe, expect, it } from 'vitest'
import { parseZfKbList } from './parseZf'

describe('new Zhengfang kbList parser', () => {
  it('uses zcd for exact week ranges instead of the page week selector', () => {
    const result = parseZfKbList({
      kbList: [
        {
          kcmc: '数据结构',
          xm: '王老师',
          cdmc: '6教-206',
          xqj: '1',
          jcs: '1-2节',
          zcd: '1-16周'
        },
        {
          kcmc: '大学物理实验',
          xm: '赵老师',
          cdmc: '3教-202',
          xqj: '2',
          jcs: '3-4节',
          zcd: '2-16周(双)'
        },
        {
          kcmc: '概率论',
          xm: '陈老师',
          cdmc: '5教-401',
          xqj: '4',
          jcs: '5-6节',
          zcd: '1-8周,10-12周'
        },
        {
          kcmc: '缺少周次的课',
          xqj: '3',
          jcs: '1-2节',
          zcd: ''
        }
      ]
    })
    expect(result.courses).toHaveLength(3)
    expect(result.courses.find((course) => course.name === '数据结构')?.weeks).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1)
    )
    expect(result.courses.find((course) => course.name === '大学物理实验')?.weeks).toEqual([
      2, 4, 6, 8, 10, 12, 14, 16
    ])
    expect(result.courses.find((course) => course.name === '概率论')?.weeks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12
    ])
    expect(result.warnings.join(' ')).toContain('缺少课程名')
  })
})