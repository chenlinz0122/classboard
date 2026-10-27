import { describe, expect, it } from 'vitest'
import { parseHduHtml, parseWeeksText } from './parseHduHtml'

const html = `
<html><head><title>学生个人课表</title></head><body>
<div id="xhxm">张三同学</div>
<select id="xnd"><option value="2026-2027" selected="selected">2026-2027</option></select>
<select id="xqd"><option value="1" selected="selected">1</option></select>
<table id="Table1">
  <tr><td>节次</td><td>星期一</td><td>星期二</td></tr>
  <tr>
    <td>上午</td>
    <td align="center">高等数学A<br>周一第1-2节{第1-16周}<br>李老师<br>6教-101</td>
    <td align="center">大学物理<br>周二第3-4节{第1-8周(单)}<br>赵老师<br>3教-202</td>
  </tr>
  <tr>
    <td>下午</td>
    <td align="center">数据结构<br>周三第5-6节{第1-16周}<br>王老师<br>6教-206<br>---------------------<br>数据结构实验<br>周三第5-6节{第2-16周(双)}<br>王老师<br>6教-306</td>
    <td align="center">体育<br>周四第7-8节{第1-12周}<br>陈老师<br>体育馆</td>
  </tr>
</table>
</body></html>`

describe('HDU timetable HTML parsing', () => {
  it('parses course fields, weeks and duplicate cells', () => {
    const result = parseHduHtml(html)
    expect(result.studentName).toBe('张三')
    expect(result.semesterLabel).toContain('2026-2027')
    expect(result.courses).toHaveLength(5)
    const physics = result.courses.find((course) => course.name === '大学物理')
    expect(physics?.weeks).toEqual([1, 3, 5, 7])
    expect(physics?.location).toBe('3教-202')
    const experiment = result.courses.find((course) => course.name === '数据结构实验')
    expect(experiment?.weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
    expect(experiment?.weekday).toBe(3)
    expect(result.warnings).toHaveLength(0)
  })

  it('supports common week text variants', () => {
    expect(parseWeeksText('{第1-16周}')).toEqual(Array.from({ length: 16 }, (_, index) => index + 1))
    expect(parseWeeksText('{第1-16周(单)}')).toEqual([1, 3, 5, 7, 9, 11, 13, 15])
    expect(parseWeeksText('1-8,10-12周')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12])
    expect(parseWeeksText('第3,5,7周')).toEqual([3, 5, 7])
  })

  it('warns when the page has no recognizable course table', () => {
    const result = parseHduHtml('<html><body><div>登录</div></body></html>')
    expect(result.courses).toHaveLength(0)
    expect(result.warnings[0]).toContain('没有识别到课程')
  })

  it('parses a new-style grid table without time text in each course cell', () => {
    const gridHtml = `
      <html><body>
      <table class="kb">
        <tr>
          <th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th>
        </tr>
        <tr>
          <td>第1节</td>
          <td rowspan="2"><div>数据结构</div><div>王老师</div><div>1-16周</div><div>6教-206</div></td>
          <td></td><td></td>
        </tr>
        <tr><td>第2节</td><td></td><td></td></tr>
        <tr>
          <td>第3节</td>
          <td></td>
          <td rowspan="2"><div>大学英语</div><div>李老师</div><div>1-8周(单)</div><div>2教-108</div></td>
          <td></td>
        </tr>
        <tr><td>第4节</td><td></td><td></td></tr>
      </table>
      </body></html>`
    const result = parseHduHtml(gridHtml)
    expect(result.courses).toHaveLength(2)
    const ds = result.courses.find((course) => course.name === '数据结构')
    expect(ds?.weekday).toBe(1)
    expect(ds?.startPeriod).toBe(1)
    expect(ds?.endPeriod).toBe(2)
    expect(ds?.location).toBe('6教-206')
    const en = result.courses.find((course) => course.name === '大学英语')
    expect(en?.weekday).toBe(2)
    expect(en?.startPeriod).toBe(3)
    expect(en?.endPeriod).toBe(4)
    expect(en?.weeks).toEqual([1, 3, 5, 7])
  })

  it('parses split weekday/period fields in one cell', () => {
    const splitHtml = `
      <html><body>
      <table><tr><td>
        <span>概率论</span>
        <span>星期四</span>
        <span>第5-6节</span>
        <span>1-12周</span>
        <span>5教-401</span>
        <span>陈老师</span>
      </td></tr></table>
      </body></html>`
    const result = parseHduHtml(splitHtml)
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0].name).toBe('概率论')
    expect(result.courses[0].weekday).toBe(4)
    expect(result.courses[0].startPeriod).toBe(5)
    expect(result.courses[0].endPeriod).toBe(6)
  })
})
