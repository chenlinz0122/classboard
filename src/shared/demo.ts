import type { AppData, Course, DeadlineItem } from './types'
import { addDays, startOfDay } from './date'
import { colorIndexFor } from './colors'
import { createEmptyData } from './defaults'

function course(
  id: string,
  name: string,
  teacher: string,
  location: string,
  weekday: Course['weekday'],
  startPeriod: number,
  endPeriod: number,
  weeks: number[]
): Course {
  return {
    id,
    name,
    teacher,
    location,
    weekday,
    startPeriod,
    endPeriod,
    weeks,
    source: 'import',
    color: colorIndexFor(name),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function deadline(
  id: string,
  title: string,
  courseId: string,
  courseName: string,
  dueAt: Date,
  notes: string,
  completed = false
): DeadlineItem {
  const now = new Date().toISOString()
  return {
    id,
    title,
    courseId,
    courseName,
    dueAt: dueAt.toISOString(),
    notes,
    completedAt: completed ? now : null,
    source: 'import',
    createdAt: now,
    updatedAt: now,
    reminder: { sent: {}, snoozedUntil: null },
    priority: 'normal'
  }
}

function at(dayOffset: number, hour: number, minute: number): Date {
  const date = addDays(startOfDay(new Date()), dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date
}

/** 仅用于首次体验和截图验收；显式从设置里载入，绝不自动写入。 */
export function buildDemoData(): AppData {
  const data = createEmptyData()
  data.settings.onboardingDone = true
  data.settings.autoLaunch = false
  data.courses = [
    course('demo-ds', '数据结构', '王老师', '6教-206', 1, 1, 2, Array.from({ length: 16 }, (_, i) => i + 1)),
    course('demo-co', '计算机组成原理', '周老师', '3教-302', 2, 3, 4, Array.from({ length: 16 }, (_, i) => i + 1)),
    course('demo-en', '大学英语', '李老师', '2教-108', 3, 6, 7, Array.from({ length: 16 }, (_, i) => i + 1)),
    course('demo-math', '概率论与数理统计', '陈老师', '5教-401', 4, 1, 2, Array.from({ length: 16 }, (_, i) => i + 1)),
    course('demo-phy', '大学物理', '赵老师', '3教-202', 5, 1, 2, Array.from({ length: 16 }, (_, i) => i + 1)),
    course('demo-lab', '数据结构实验', '王老师', '6教-306', 5, 8, 9, [2, 4, 6, 8, 10, 12, 14, 16]),
    course('demo-pe', '体育（篮球）', '赵老师', '体育馆', 2, 7, 8, Array.from({ length: 12 }, (_, i) => i + 1))
  ]
  data.deadlines = [
    deadline(
      'demo-ddl-1',
      '计组实验 3 · 流水线',
      'demo-co',
      '计算机组成原理',
      at(1, 23, 59),
      '提交实验报告与仿真截图，命名格式：学号_姓名_实验3。'
    ),
    deadline(
      'demo-ddl-2',
      '大物实验报告',
      'demo-phy',
      '大学物理',
      at(3, 18, 0),
      '包含误差分析，实验数据见群文件。'
    ),
    deadline(
      'demo-ddl-3',
      '数据结构课程设计选题',
      'demo-ds',
      '数据结构',
      at(7, 23, 59),
      '确定题目并在学习通提交开题说明。'
    ),
    deadline(
      'demo-ddl-4',
      '英语作文 2',
      'demo-en',
      '大学英语',
      at(-1, 23, 59),
      '已在课堂提交。',
      true
    )
  ]
  data.meta.updatedAt = new Date().toISOString()
  return data
}
