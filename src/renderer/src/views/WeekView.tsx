import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Plus
} from 'lucide-react'
import type { Course, Weekday } from '@shared/types'
import { formatWeekRange, getSemesterWeek } from '@shared/date'
import { getSemesterWeekStart } from '@shared/schedule'
import { WeekGrid } from '../components/WeekGrid'
import { CourseEditor } from '../components/CourseEditor'
import { useApp } from '../lib/appContext'
import { SelectChevron } from '../components/ui'

export function WeekView(): React.JSX.Element {
  const { data, now, navigate } = useApp()
  const semester = getSemesterWeek(data.settings.semesterStart, data.settings.totalWeeks, now)
  const [week, setWeek] = useState(
    semester.week ?? (semester.phase === 'before' ? 1 : data.settings.totalWeeks)
  )
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [creating, setCreating] = useState<{
    weekday: Weekday
    period: number
  } | null>(null)

  useEffect(() => {
    if (week < 1) setWeek(1)
    if (week > data.settings.totalWeeks) setWeek(data.settings.totalWeeks)
  }, [data.settings.totalWeeks, week])

  const weekStart = getSemesterWeekStart(data.settings, week)

  const dayStats = useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
      const count = data.courses.filter(
        (course) => course.weekday === weekday && course.weeks.includes(week)
      ).length
      return { weekday, count }
    })
  }, [data.courses, week])

  return (
    <div className="page week-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <CalendarDays size={15} />
            周课表
          </div>
          <h1>第 {week} 周</h1>
          <p className="page-subtitle">{formatWeekRange(weekStart)} · 每一格都可以直接编辑</p>
        </div>
        <div className="page-actions">
          <div className="week-nav">
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => setWeek((value) => Math.max(1, value - 1))}
              disabled={week <= 1}
              aria-label="上一周"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="week-select-wrap">
              <select
                className="week-select"
                value={week}
                onChange={(event) => setWeek(Number(event.target.value))}
                aria-label="选择周次"
              >
                {Array.from({ length: data.settings.totalWeeks }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value} value={value}>
                      第 {value} 周
                    </option>
                  )
                )}
              </select>
              <SelectChevron />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => setWeek((value) => Math.min(data.settings.totalWeeks, value + 1))}
              disabled={week >= data.settings.totalWeeks}
              aria-label="下一周"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => {
                if (semester.week) setWeek(semester.week)
              }}
              disabled={!semester.week || semester.week === week}
            >
              本周
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('sync')}
          >
            <CloudDownload size={15} />
            同步课表
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating({ weekday: 1, period: 1 })}
          >
            <Plus size={16} />
            添加课程
          </button>
        </div>
      </header>

      <div className="week-summary-strip">
        <span className="week-summary-label">本周节奏</span>
        {dayStats.map(({ weekday, count }) => (
          <div
            key={weekday}
            className={`week-summary-day ${
              weekday === (now.getDay() === 0 ? 7 : now.getDay()) &&
              semester.week === week
                ? 'is-today'
                : ''
            }`}
          >
            <span>{['一', '二', '三', '四', '五', '六', '日'][weekday - 1]}</span>
            <em>{count > 0 ? `${count} 节` : '—'}</em>
          </div>
        ))}
      </div>

      {data.courses.length === 0 ? (
        <div className="inline-empty-banner">
          <div>
            <strong>还没有课程</strong>
            <span>同步杭电课表，或者点击下方任意空白格手动添加。</span>
          </div>
          <button type="button" className="btn btn-soft" onClick={() => navigate('sync')}>
            去同步
          </button>
        </div>
      ) : null}

      <WeekGrid
        courses={data.courses}
        settings={data.settings}
        week={week}
        now={now}
        onEditCourse={setEditingCourse}
        onCreateCourse={(weekday, period) => setCreating({ weekday, period })}
      />

      {editingCourse ? (
        <CourseEditor course={editingCourse} onClose={() => setEditingCourse(null)} />
      ) : null}
      {creating ? (
        <CourseEditor
          defaultWeekday={creating.weekday}
          defaultStartPeriod={creating.period}
          onClose={() => setCreating(null)}
        />
      ) : null}
    </div>
  )
}
