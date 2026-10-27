import { Plus } from 'lucide-react'
import type { ClassOccurrence, Course, Settings, Weekday } from '@shared/types'
import {
  formatDateCN,
  formatWeekRange,
  getDateForWeek,
  isSameDay,
  weekdayLabel,
  weekdayShortLabel
} from '@shared/date'
import { getWeekOccurrences, getSemesterWeekStart, getClassState } from '@shared/schedule'
import { courseColorClass } from '../lib/format'

export function WeekGrid({
  courses,
  settings,
  week,
  now,
  onEditCourse,
  onCreateCourse
}: {
  courses: Course[]
  settings: Settings
  week: number
  now: Date
  onEditCourse: (course: Course) => void
  onCreateCourse: (weekday: Weekday, period: number) => void
}): React.JSX.Element {
  const periods = settings.periods
  const grid = getWeekOccurrences(courses, settings, week)
  const weekStart = getSemesterWeekStart(settings, week)
  const days: Array<{ weekday: Weekday; date: Date }> = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday: weekday as Weekday,
    date: getDateForWeek(settings.semesterStart, week, weekday as Weekday)
  }))

  const blocks = (Object.entries(grid) as Array<[string, ClassOccurrence[]]>).flatMap(
    ([_, occurrences]) => occurrences
  )

  return (
    <div className="week-grid-shell">
      <div className="week-grid-scroll">
        <div
          className="week-grid"
          style={{
            gridTemplateColumns: '66px repeat(7, minmax(112px, 1fr))',
            gridTemplateRows: `54px repeat(${periods.length}, 58px)`
          }}
        >
          <div className="week-corner" style={{ gridColumn: 1, gridRow: 1 }}>
            <span>{formatWeekRange(weekStart)}</span>
          </div>
          {days.map(({ weekday, date }) => (
            <div
              key={weekday}
              className={`week-day-head ${isSameDay(date, now) ? 'is-today' : ''} ${
                weekday >= 6 ? 'is-weekend' : ''
              }`}
              style={{ gridColumn: weekday + 1, gridRow: 1 }}
            >
              <div className="week-day-name">
                <span>{weekdayLabel(weekday)}</span>
                {isSameDay(date, now) ? <em>今天</em> : null}
              </div>
              <div className="week-day-date">{formatDateCN(date)}</div>
            </div>
          ))}

          {periods.map((period) => (
            <div
              key={`time-${period.index}`}
              className="week-time-cell"
              style={{ gridColumn: 1, gridRow: period.index + 1 }}
            >
              <span className="week-period-index">{period.index}</span>
              <span className="week-period-time">{period.start}</span>
              <span className="week-period-end">{period.end}</span>
            </div>
          ))}

          {days.flatMap(({ weekday, date }) =>
            periods.map((period) => (
              <div
                key={`${weekday}-${period.index}`}
                className={`week-bg-cell ${isSameDay(date, now) ? 'is-today' : ''} ${
                  weekday >= 6 ? 'is-weekend' : ''
                }`}
                style={{ gridColumn: weekday + 1, gridRow: period.index + 1 }}
                onClick={() => onCreateCourse(weekday, period.index)}
                role="button"
                tabIndex={-1}
                aria-label={`${weekdayLabel(weekday)} 第${period.index}节，添加课程`}
              >
                <span className="cell-add">
                  <Plus size={13} />
                </span>
              </div>
            ))
          )}

          {blocks.map((occurrence) => {
            const { course } = occurrence
            const state = getClassState(occurrence, now)
            const rowSpan = occurrence.endPeriod - occurrence.startPeriod + 1
            return (
              <button
                type="button"
                key={`${occurrence.key}-${occurrence.startPeriod}`}
                className={`week-course ${courseColorClass(course.color, course.name)} ${
                  state === 'ongoing' ? 'is-live' : ''
                } ${state === 'ended' ? 'is-past' : ''}`}
                style={{
                  gridColumn: course.weekday + 1,
                  gridRow: `${course.startPeriod + 1} / span ${rowSpan}`
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onEditCourse(course)
                }}
                title={`${course.name} · ${course.location || '地点待定'}`}
              >
                <div className="week-course-line">
                  <span className="week-course-name">{course.name}</span>
                  {state === 'ongoing' ? <span className="live-dot" /> : null}
                </div>
                {rowSpan >= 2 && course.location ? (
                  <span className="week-course-meta">{course.location}</span>
                ) : null}
                {rowSpan >= 3 && course.teacher ? (
                  <span className="week-course-meta is-muted">{course.teacher}</span>
                ) : null}
                <span className="week-course-periods">
                  第 {course.startPeriod}-{course.endPeriod} 节
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="week-grid-hint">
        <span>点击空白格添加课程</span>
        <span>·</span>
        <span>点击课程编辑</span>
        <span className="week-grid-days">
          {days.map(({ weekday }) => weekdayShortLabel(weekday)).join(' ')}
        </span>
      </div>
    </div>
  )
}
