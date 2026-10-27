import { describe, expect, it } from 'vitest'
import { parseChaoxingWorks, looksLikeLoginPage } from './parseChaoxing'

const now = new Date(2026, 9, 27, 16, 0)

const html = `
<ul>
  <li data="https://mooc1-api.chaoxing.com/mooc-ans/android/mtaskmsgspecial?taskrefId=1001&courseId=88&clazzId=9">
    <div aria-label="作业名称第三章作业作业状态未提交所属课程《数据结构》剩余时间2天3小时">
      第三章作业
    </div>
  </li>
  <li data="https://mooc1-api.chaoxing.com/mooc-ans/android/mtaskmsgspecial?taskrefId=1002&courseId=88&clazzId=9">
    <div aria-label='实验二实验结果作业状态已完成所属课程计算机组成原理剩余时间已截止'>
      实验二
    </div>
  </li>
  <li data="https://mooc1-api.chaoxing.com/mooc-ans/android/mtaskmsgspecial?taskrefId=1003&courseId=88&clazzId=9">
    <div aria-label="作业名称课程设计选题作业状态未提交所属课程《数据结构》">
      课程设计选题
    </div>
  </li>
</ul>`

describe('chaoxing work parser', () => {
  it('parses pending and completed works', () => {
    const items = parseChaoxingWorks(html, now)
    expect(items).toHaveLength(3)
    expect(items[0].title).toBe('第三章作业')
    expect(items[0].courseName).toBe('数据结构')
    expect(items[0].dueAt).not.toBeNull()
    expect(items[0].selected).toBe(true)
    expect(items[1].completed).toBe(true)
    expect(items[1].selected).toBe(false)
    expect(items[2].dueAt).toBeNull()
  })

  it('detects a login page', () => {
    expect(looksLikeLoginPage('<html><head><title>登录</title></head></html>')).toBe(true)
    expect(looksLikeLoginPage('<html><head><title>作业</title></head></html>')).toBe(false)
  })
})
