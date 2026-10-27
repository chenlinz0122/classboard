import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudDownload,
  MapPin,
  Plus,
  Sparkles,
  Timer,
  User
} from 'lucide-react'
import type { Course, DeadlineItem, Weekday } from '@shared/types'
import {
  formatClock,
  formatDateWithWeekday,
  formatDueLabel,
  formatWeekRange,
  formatWeekCount,
  getDateForWeek,
  getGreeting,
  getSemesterWeek,
  isSameDay,
  weekdayShortLabel
} from '@shared/date'
import {
  getClassState,
  getCurrentAndNextClasses,
  getTodayClasses,
  getWeekOccurrences
} from '@shared/schedule'
import { CourseEditor } from '../components/CourseEditor'
import { DeadlineEditor } from '../components/DeadlineEditor'
import { DeadlineRow } from '../components/DeadlineRow'
import { QuickAdd } from '../components/QuickAdd'
import { EmptyState, IconButton } from '../components/ui'
import { useApp } from '../lib/appContext'
import {
  completedThisWeek,
  courseColorClass,
  nextPendingDeadline,
  pendingDeadlines
} from '../lib/format'

export function TodayView(): React.JSX.Element {
  const {
    data,
    now,
    navigate,
    notify,
    quickAddSignal
  } = useApp()
  const semester = getSemesterWeek(data.settings.semesterStart, data.settings.totalWeeks, now)
  const todayClasses = useMemo(
    () => getTodayClasses(data.courses, data.settings, now),
    [data.courses, data.settings, now]
  )
  const { current } = useMemo(
    () => getCurrentAndNextClasses(data.courses, data.settings, now),
    [data.courses, data.settings, now]
  )
  const nextToday = todayClasses.find((occurrence) => occurrence.startAt.getTime() > now.getTime())
  const pending = pendingDeadlines(data.deadlines)
  const upcoming = pending.slice(0, 4)
  const nearest = nextPendingDeadline(data.deadlines, now)
  const doneThisWeek = completedThisWeek(data.deadlines, now)
  const [editingDeadline, setEditingDeadline] = useState<DeadlineItem | null>(null)
  const [creatingDeadline, setCreatingDeadline] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)

  const weekOverview = useMemo(() => {
    if (!semester.week) return []
    const grid = getWeekOccurrences(data.courses, data.settings, semester.week)
    return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
      const date = getDateForWeek(
        data.settings.semesterStart,
        semester.week as number,
        weekday as Weekday
      )
      return {
        weekday: weekday as Weekday,
        date,
        count: grid[weekday as Weekday].length
      }
    })
  }, [data.courses, data.settings, semester.week])

  const toggle = async (deadline: DeadlineItem): Promise<void> => {
    try {
      await window.classboard.deadlines.toggle(deadline.id)
    } catch (error) {
      notify(error instanceof Error ? error.message : '更新失败', 'error')
    }
  }

  const snooze = async (deadline: DeadlineItem, minutes: number): Promise<void> => {
    try {
      await window.classboard.deadlines.snooze(deadline.id, minutes)
      notify('已设置稍后提醒', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '设置失败', 'error')
    }
  }

  const remove = async (deadline: DeadlineItem): Promise<void> => {
    if (!window.confirm(`删除「${deadline.title}」？`)) return
    try {
      await window.classboard.deadlines.remove(deadline.id)
      notify('作业已删除', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败', 'error')
    }
  }

  const focusClass = current ?? nextToday ?? null

  return (
    <div className="page today-page">
      <header className="page-header today-header">
        <div>
          <div className="eyebrow">
            <CalendarCheck2 size={15} />
            {formatWeekCount(semester.week)} · {formatDateWithWeekday(now)}
          </div>
          <h1>
            {getGreeting(now)}，今天有
            <span className="header-accent"> {todayClasses.length} 节课</span>
          </h1>
          <p className="page-subtitle">
            {pending.length > 0
              ? `还有 ${pending.length} 个作业没有完成，别让它们悄悄到期。`
              : '暂时没有待交作业，保持这个节奏。'}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('sync')}>
            <CloudDownload size={15} />
            同步
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreatingDeadline(true)}>
            <Plus size={16} />
            新增作业
          </button>
        </div>
      </header>

      <section className="stat-grid">
        <div className="stat-card stat-jade">
          <div className="stat-icon">
            <CalendarDays size={18} />
          </div>
          <div className="stat-copy">
            <span>今日课程</span>
            <strong>{todayClasses.length}</strong>
            <em>
              {focusClass
                ? `${current ? '正在上' : '下一节'} ${formatClock(focusClass.startAt)}`
                : todayClasses.length > 0
                  ? '今天的课结束了'
                  : '今天没有课'}
            </em>
          </div>
        </div>
        <div className="stat-card stat-coral">
          <div className="stat-icon">
            <CheckCircle2 size={18} />
          </div>
          <div className="stat-copy">
            <span>待交作业</span>
            <strong>{pending.length}</strong>
            <em>{pending.filter((item) => item.dueAt && new Date(item.dueAt) < now).length} 个已逾期</em>
          </div>
        </div>
        <div className="stat-card stat-amber">
          <div className="stat-icon">
            <Timer size={18} />
          </div>
          <div className="stat-copy">
            <span>最近截止</span>
            <strong className="stat-text">
              {nearest?.dueAt ? formatDueLabel(nearest.dueAt, now) : '无'}
            </strong>
            <em>{nearest?.title ?? '清单暂时是空的'}</em>
          </div>
        </div>
        <div className="stat-card stat-blue">
          <div className="stat-icon">
            <Sparkles size={18} />
          </div>
          <div className="stat-copy">
            <span>本周完成</span>
            <strong>{doneThisWeek}</strong>
            <em>每完成一项，就轻松一点</em>
          </div>
        </div>
      </section>

      <div className="today-grid">
        <section className="card schedule-card">
          <div className="card-head">
            <div>
              <h2>今天的课</h2>
              <p>{formatWeekRange(semester.weekStart)}</p>
            </div>
            <button type="button" className="text-button" onClick={() => navigate('week')}>
              周课表
              <ArrowRight size={14} />
            </button>
          </div>

          {focusClass ? (
            <div className={`next-up-banner ${current ? 'is-live' : ''}`}>
              <div className="next-up-time">
                <span>{current ? '正在进行' : '下一节'}</span>
                <strong>{formatClock(focusClass.startAt)}</strong>
                <em>{formatClock(focusClass.endAt)} 结束</em>
              </div>
              <div className="next-up-divider" />
              <div className="next-up-copy">
                <div className="next-up-name">
                  <span
                    className={`course-dot ${courseColorClass(
                      focusClass.course.color,
                      focusClass.course.name
                    )}`}
                  />
                  {focusClass.course.name}
                </div>
                <div className="next-up-meta">
                  {focusClass.course.location ? (
                    <span>
                      <MapPin size={13} />
                      {focusClass.course.location}
                    </span>
                  ) : null}
                  {focusClass.course.teacher ? (
                    <span>
                      <User size={13} />
                      {focusClass.course.teacher}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="next-up-count">
                <Clock3 size={15} />
                {current
                  ? `还剩 ${Math.max(
                      1,
                      Math.round((focusClass.endAt.getTime() - now.getTime()) / 60_000)
                    )} 分钟`
                  : `还有 ${Math.max(
                      1,
                      Math.round((focusClass.startAt.getTime() - now.getTime()) / 60_000)
                    )} 分钟`}
              </div>
            </div>
          ) : null}

          {todayClasses.length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarDays size={24} />}
              title="今天没有课"
              description="可以同步本学期课表，或去周课表手动添加。"
              actions={
                <>
                  <button type="button" className="btn btn-soft btn-compact" onClick={() => navigate('sync')}>
                    同步课表
                  </button>
                  <button type="button" className="btn btn-ghost btn-compact" onClick={() => navigate('week')}>
                    打开周课表
                  </button>
                </>
              }
            />
          ) : (
            <div className="class-timeline">
              {todayClasses.map((occurrence) => {
                const state = getClassState(occurrence, now)
                const minutes = Math.max(
                  1,
                  Math.round(
                    ((state === 'ongoing' ? occurrence.endAt : occurrence.startAt).getTime() -
                      now.getTime()) /
                      60_000
                  )
                )
                return (
                  <button
                    type="button"
                    key={occurrence.key}
                    className={`class-item is-${state}`}
                    onClick={() => setEditingCourse(occurrence.course)}
                  >
                    <div className="class-time">
                      <strong>{formatClock(occurrence.startAt)}</strong>
                      <span>{formatClock(occurrence.endAt)}</span>
                    </div>
                    <div className={`class-rail ${courseColorClass(occurrence.course.color, occurrence.course.name)}`}>
                      <span />
                    </div>
                    <div className="class-body">
                      <div className="class-name">
                        {occurrence.course.name}
                        {state === 'ongoing' ? <em>正在上</em> : null}
                      </div>
                      <div className="class-meta">
                        {occurrence.course.location ? (
                          <span>
                            <MapPin size={12} />
                            {occurrence.course.location}
                          </span>
                        ) : null}
                        {occurrence.course.teacher ? (
                          <span>
                            <User size={12} />
                            {occurrence.course.teacher}
                          </span>
                        ) : null}
                        <span>第 {occurrence.startPeriod}-{occurrence.endPeriod} 节</span>
                      </div>
                    </div>
                    <div className="class-status">
                      {state === 'ongoing'
                        ? `还剩 ${minutes} 分钟`
                        : state === 'upcoming'
                          ? `${minutes} 分钟后`
                          : '已结束'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <div className="today-side">
          <section className="card deadline-card">
            <div className="card-head">
              <div>
                <h2>快到截止</h2>
                <p>{pending.length > 0 ? `${pending.length} 个待交` : '暂无待交作业'}</p>
              </div>
              <button type="button" className="text-button" onClick={() => navigate('deadlines')}>
                全部
                <ArrowRight size={14} />
              </button>
            </div>
            {upcoming.length > 0 ? (
              <div className="deadline-list compact-list">
                {upcoming.map((deadline) => (
                  <DeadlineRow
                    key={deadline.id}
                    deadline={deadline}
                    now={now}
                    compact
                    onEdit={() => setEditingDeadline(deadline)}
                    onToggle={() => void toggle(deadline)}
                    onSnooze={(minutes) => void snooze(deadline, minutes)}
                    onDelete={() => void remove(deadline)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<CheckCircle2 size={24} />}
                title="暂时没有待交作业"
                description="把新作业记下来，截止前会收到提醒。"
              />
            )}
          </section>

          <section className="card quick-card">
            <div className="card-head">
              <div>
                <h2>随手记一个</h2>
                <p>中文日期会直接识别</p>
              </div>
              <IconButton onClick={() => setCreatingDeadline(true)} aria-label="打开完整新增表单">
                <Plus size={17} />
              </IconButton>
            </div>
            <QuickAdd variant="card" focusSignal={quickAddSignal} />
            <div className="quick-tip">
              <Sparkles size={13} />
              也可以在任意地方按 Ctrl + Alt + D 快速记录。
            </div>
          </section>
        </div>
      </div>

      {weekOverview.length > 0 ? (
        <section className="card week-peek">
          <div className="card-head">
            <div>
              <h2>这一周</h2>
              <p>{formatWeekRange(semester.weekStart)} · 点击某天查看周课表</p>
            </div>
            <button type="button" className="text-button" onClick={() => navigate('week')}>
              展开
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="week-peek-days">
            {weekOverview.map(({ weekday, date, count }) => (
              <button
                type="button"
                key={weekday}
                className={`week-peek-day ${isSameDay(date, now) ? 'is-today' : ''}`}
                onClick={() => navigate('week')}
              >
                <span>周{weekdayShortLabel(weekday)}</span>
                <strong>{date.getDate()}</strong>
                <em>{count > 0 ? `${count} 节课` : '没课'}</em>
                <div className={`week-peek-dots ${count > 4 ? 'is-dense' : ''}`}>
                  {Array.from({ length: Math.min(4, count) }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {editingDeadline ? (
        <DeadlineEditor deadline={editingDeadline} onClose={() => setEditingDeadline(null)} />
      ) : null}
      {creatingDeadline ? <DeadlineEditor onClose={() => setCreatingDeadline(false)} /> : null}
      {editingCourse ? (
        <CourseEditor course={editingCourse} onClose={() => setEditingCourse(null)} />
      ) : null}
    </div>
  )
}
