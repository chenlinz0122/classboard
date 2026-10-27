import { describe, expect, it } from 'vitest'
import { parseCsv, stringifyCsv } from './csv'

describe('csv helpers', () => {
  it('parses quoted commas, quotes and newlines', () => {
    const rows = parseCsv('\uFEFF标题,截止,备注\r\n"实验, 3",2026-10-30 23:59,"第一行\n第二行"\r\n普通,明天,')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(['标题', '截止', '备注'])
    expect(rows[1]).toEqual(['实验, 3', '2026-10-30 23:59', '第一行\n第二行'])
    expect(rows[2][0]).toBe('普通')
  })

  it('escapes fields for Excel', () => {
    const text = stringifyCsv([
      ['标题', '备注'],
      ['实验, 3', '包含"引号"']
    ])
    expect(text).toContain('"实验, 3"')
    expect(text).toContain('"包含""引号"""')
  })
})
