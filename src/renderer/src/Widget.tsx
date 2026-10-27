import { useMemo } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListTodo,
  MapPin,
  Minus,
  Pin,
  PinOff,
  Settings2,
  User,
  X
} from 'lucide-react'
import {
  formatClock,
  formatDateCN,
  formatWeekCount,
  getDateForWeek,
  getGreeting,
  getSemesterWeek,
  isSameDay,
  weekdayCN,
  weekdayShortLabel
} from '@shared/date'
import {
  getClassState,
  getCurrentAndNextClasses,
  getTodayClasses,
  getWeekOccurrences
} from '@shared/schedule'
import { DeadlineRow } from './components/DeadlineRow'
import { QuickAdd } from './components/QuickAdd'
import { EmptyState } from './components/ui'
import { useApp } from './lib/appContext'
import { courseColorClass, pendingDeadlines } from './lib/format'

export function Widget(): React.JSX.Element {
  const { data, now, notify } = useApp()
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
  const focusClass = current ?? nextToday ?? null
  const pending = pendingDeadlines(data.deadlines)
  const listedDeadlines = pending.slice(0, 5)
  const pin = data.settings.alwaysOnTop
  const weekGrid = semester.week
    ? getWeekOccurrences(data.courses, data.settings, semester.week)
    : null
  const weekDays = semester.week
    ? ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
        weekday,
        date: getDateForWeek(data.settings.semesterStart, semester.week as number, weekday),
        count: weekGrid?.[weekday].length ?? 0
      }))
    : []

  const openDeadline = (id: string): void => {
    window.classboard.window.showMain({ view: 'deadlines', focusDeadlineId: id })
  }

  const toggle = async (id: string): Promise<void> => {
    try {
      await window.classboard.deadlines.toggle(id)
    } catch (error) {
      notify(error instanceof Error ? error.message : '更新失败', 'error')
    }
  }

  if (!data.settings.onboardingDone) {
    return (
      <div className="widget-root">
        <div className="widget-frame widget-setup">
          <div className="widget-setup-mark">课</div>
          <h1>先完成一次设置</h1>
          <p>打开完整窗口，设置学期并同步课表。</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.classboard.window.showMain({ view: 'today' })}
          >
            打开看板
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="widget-root">
      <div className="widget-frame">
        <div
          className="widget-head"
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) return
            window.classboard.window.showMain({ view: 'today' })
          }}
        >
          <div className="widget-brand">
            <span className="widget-brand-mark">课</span>
            <span>课表与DDL</span>
          </div>
          <div className="widget-head-actions">
            <button
              type="button"
              className={`widget-tool ${pin ? 'is-active' : ''}`}
              onClick={() => void window.classboard.window.togglePin()}
              title={pin ? '取消置顶' : '始终置顶'}
              aria-label={pin ? '取消置顶' : '始终置顶'}
            >
              {pin ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <button
              type="button"
              className="widget-tool"
              onClick={() => window.classboard.window.hideWidget()}
              title="隐藏到托盘"
              aria-label="隐藏到托盘"
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              className="widget-tool widget-close"
              onClick={() => window.classboard.window.hideWidget()}
              title="隐藏到托盘"
              aria-label="隐藏到托盘"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="widget-scroll">
          <div className="widget-date-row">
            <div>
              <div className="widget-date">
                {formatDateCN(now)}
                <span>{weekdayCN(now)}</span>
              </div>
              <div className="widget-greeting">
                {getGreeting(now)} · {formatWeekCount(semester.week)}
              </div>
            </div>
            <div className="widget-summary-pills">
              <span>{todayClasses.length} 节课</span>
              <span className={pending.length > 0 ? 'is-warn' : ''}>{pending.length} 个待交</span>
            </div>
          </div>

          {focusClass ? (
            <button
              type="button"
              className={`widget-next ${courseColorClass(
                focusClass.course.color,
                focusClass.course.name
              )}`}
              onClick={() => window.classboard.window.showMain({ view: 'week' })}
            >
              <div className="widget-next-top">
                <span className={current ? 'is-live' : ''}>
                  {current ? '正在上课' : '下一节'}
                </span>
                <strong>{formatClock(focusClass.startAt)}</strong>
                <em>{formatClock(focusClass.endAt)} 结束</em>
              </div>
              <div className="widget-next-name">{focusClass.course.name}</div>
              <div className="widget-next-meta">
                {focusClass.course.location ? (
                  <span>
                    <MapPin size={12} />
                    {focusClass.course.location}
                  </span>
                ) : null}
                {focusClass.course.teacher ? (
                  <span>
                    <User size={12} />
                    {focusClass.course.teacher}
                  </span>
                ) : null}
              </div>
              <div className="widget-next-foot">
                <Clock3 size={13} />
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
            </button>
          ) : (
            <div className="widget-next is-empty">
              <div className="widget-next-name">
                {todayClasses.length > 0 ? '今天的课结束了' : '今天没有课'}
              </div>
              <div className="widget-next-meta">
                {data.courses.length === 0
                  ? '同步课表后，这里会显示下一节课。'
                  : '可以安心安排自己的时间。'}
              </div>
              {data.courses.length === 0 ? (
                <button
                  type="button"
                  className="widget-link"
                  onClick={() => window.classboard.window.showMain({ view: 'sync' })}
                >
                  去同步课表
                </button>
              ) : null}
            </div>
          )}

          <section className="widget-section">
            <div className="widget-section-head">
              <h2>
                <CalendarDays size={14} />
                今天的课
              </h2>
              <button
                type="button"
                className="widget-link"
                onClick={() => window.classboard.window.showMain({ view: 'week' })}
              >
                周课表
              </button>
            </div>
            {todayClasses.length === 0 ? (
              <div className="widget-empty-line">今天没有课程安排</div>
            ) : (
              <div className="widget-class-list">
                {todayClasses.map((occurrence) => {
                  const state = getClassState(occurrence, now)
                  return (
                    <button
                      type="button"
                      key={occurrence.key}
                      className={`widget-class is-${state}`}
                      onClick={() => window.classboard.window.showMain({ view: 'week' })}
                    >
                      <span className="widget-class-time">{formatClock(occurrence.startAt)}</span>
                      <span
                        className={`widget-class-bar ${courseColorClass(
                          occurrence.course.color,
                          occurrence.course.name
                        )}`}
                      />
                      <span className="widget-class-name">{occurrence.course.name}</span>
                      <span className="widget-class-room">
                        {occurrence.course.location || `第${occurrence.startPeriod}节`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="widget-section">
            <div className="widget-section-head">
              <h2>
                <ListTodo size={14} />
                待交作业
                {pending.length > 0 ? <em>{pending.length}</em> : null}
              </h2>
              <button
                type="button"
                className="widget-link"
                onClick={() => window.classboard.window.showMain({ view: 'deadlines' })}
              >
                全部
              </button>
            </div>
            {listedDeadlines.length > 0 ? (
              <div className="widget-deadline-list">
                {listedDeadlines.map((deadline) => (
                  <DeadlineRow
                    key={deadline.id}
                    deadline={deadline}
                    now={now}
                    compact
                    onEdit={() => openDeadline(deadline.id)}
                    onToggle={() => void toggle(deadline.id)}
                    onSnooze={() => openDeadline(deadline.id)}
                    onDelete={() => openDeadline(deadline.id)}
                  />
                ))}
                {pending.length > listedDeadlines.length ? (
                  <button
                    type="button"
                    className="widget-more"
                    onClick={() => window.classboard.window.showMain({ view: 'deadlines' })}
                  >
                    还有 {pending.length - listedDeadlines.length} 条待交作业
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="widget-empty-line">
                <CheckCircle2 size={14} />
                暂时没有待交作业
              </div>
            )}
          </section>

          {weekDays.length > 0 ? (
            <section className="widget-week">
              <div className="widget-week-head">
                <span>本周节奏</span>
                <em>
                  第 {semester.week} / {data.settings.totalWeeks} 周
                </em>
              </div>
              <div className="widget-week-days">
                {weekDays.map(({ weekday, date, count }) => (
                  <button
                    type="button"
                    key={weekday}
                    className={`widget-week-day ${isSameDay(date, now) ? 'is-today' : ''}`}
                    onClick={() => window.classboard.window.showMain({ view: 'week' })}
                    title={`${formatDateCN(date)} · ${count} 节课`}
                  >
                    <span>{weekdayShortLabel(weekday)}</span>
                    <em>{count > 0 ? count : '·'}</em>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="widget-quick">
          <QuickAdd variant="widget" />
        </div>

        <div className="widget-footer">
          <button
            type="button"
            onClick={() => window.classboard.window.showMain({ view: 'week' })}
          >
            <CalendarDays size={14} />
            周课表
          </button>
          <button
            type="button"
            onClick={() => window.classboard.window.showMain({ view: 'deadlines' })}
          >
            <ListTodo size={14} />
            作业
          </button>
          <button
            type="button"
            onClick={() => window.classboard.window.showMain({ view: 'settings' })}
          >
            <Settings2 size={14} />
            设置
          </button>
          <span className="widget-footer-week">本地离线</span>
        </div>
      </div>
    </div>
  )
}
