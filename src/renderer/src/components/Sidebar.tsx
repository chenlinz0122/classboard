import {
  CalendarCheck2,
  CalendarDays,
  ListTodo,
  RefreshCw,
  Settings2,
  ShieldCheck
} from 'lucide-react'
import type { MainView } from '@shared/types'
import {
  formatClock,
  formatMonthDayFromDate,
  formatWeekRange,
  formatWeekCount,
  getSemesterWeek,
  isSameDay
} from '@shared/date'
import {
  getCurrentAndNextClasses,
  getSemesterProgress,
  getTodayClasses
} from '@shared/schedule'
import { useApp } from '../lib/appContext'
import { courseColorClass, pendingDeadlines } from '../lib/format'

const NAV_ITEMS: Array<{
  view: MainView
  label: string
  icon: React.ReactNode
}> = [
  { view: 'today', label: '今日', icon: <CalendarCheck2 size={18} /> },
  { view: 'week', label: '周课表', icon: <CalendarDays size={18} /> },
  { view: 'deadlines', label: '作业', icon: <ListTodo size={18} /> },
  { view: 'sync', label: '同步', icon: <RefreshCw size={17} /> },
  { view: 'settings', label: '设置', icon: <Settings2 size={18} /> }
]

export function Sidebar({
  activeView,
  onNavigate
}: {
  activeView: MainView
  onNavigate: (view: MainView) => void
}): React.JSX.Element {
  const { data, info, now } = useApp()
  const semester = getSemesterWeek(data.settings.semesterStart, data.settings.totalWeeks, now)
  const progress = getSemesterProgress(data.settings, now)
  const pending = pendingDeadlines(data.deadlines)
  const { current, next } = getCurrentAndNextClasses(data.courses, data.settings, now)
  const nextToday = getTodayClasses(data.courses, data.settings, now).find(
    (occurrence) => occurrence.startAt.getTime() > now.getTime()
  )
  const focusClass = current ?? nextToday ?? next
  const focusIsToday = focusClass ? isSameDay(focusClass.startAt, now) : false

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <div className="sidebar-label">看板</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`nav-item ${activeView === item.view ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.view)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">{item.label}</span>
            {item.view === 'deadlines' && pending.length > 0 ? (
              <span className="nav-count">{pending.length}</span>
            ) : null}
            {activeView === item.view ? <span className="nav-indicator" /> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="semester-card">
        <div className="semester-top">
          <span>{formatWeekCount(semester.week)}</span>
          <em>
            {semester.phase === 'before'
              ? `${semester.daysUntilStart} 天后开学`
              : semester.phase === 'after'
                ? '学期已结束'
                : `共 ${semester.totalWeeks} 周`}
          </em>
        </div>
        <div className="semester-range">
          {formatWeekRange(semester.weekStart)} · {now.getFullYear()}
        </div>
        <div className="semester-progress">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>

      <div className={`next-class-mini ${focusClass ? '' : 'is-empty'}`}>
        <div className="next-class-label">
          <span>
            {current ? '正在上课' : focusIsToday ? '下一节' : focusClass ? '下次课' : '今日课程'}
          </span>
          {focusClass ? (
            <em>
              {focusIsToday
                ? formatClock(focusClass.startAt)
                : `${formatMonthDayFromDate(focusClass.startAt)} ${formatClock(focusClass.startAt)}`}
            </em>
          ) : null}
        </div>
        {focusClass ? (
          <>
            <div className="next-class-name">
              <span
                className={`course-dot ${courseColorClass(
                  focusClass.course.color,
                  focusClass.course.name
                )}`}
              />
              {focusClass.course.name}
            </div>
            <div className="next-class-meta">
              {[focusClass.course.location, focusClass.course.teacher].filter(Boolean).join(' · ') ||
                '地点待定'}
            </div>
          </>
        ) : (
          <div className="next-class-empty">今天的课结束了，好好休息。</div>
        )}
      </div>

      <div className="sidebar-footer">
        <span className="offline-pill">
          <ShieldCheck size={13} />
          本地离线
        </span>
        <span className="sidebar-version">v{info.version}</span>
      </div>
    </aside>
  )
}
