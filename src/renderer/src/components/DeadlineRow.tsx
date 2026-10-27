import { Check, Clock3, ExternalLink, Trash2 } from 'lucide-react'
import type { DeadlineItem } from '@shared/types'
import { formatCountdown, formatDueLabel } from '@shared/date'
import { useApp } from '../lib/appContext'
import { dueText, getDeadlineBucket, SOURCE_LABELS } from '../lib/format'
import { Dropdown } from './ui'

export function DeadlineRow({
  deadline,
  now,
  compact = false,
  highlight = false,
  onEdit,
  onToggle,
  onDelete,
  onSnooze
}: {
  deadline: DeadlineItem
  now: Date
  compact?: boolean
  highlight?: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onSnooze: (minutes: number) => void
}): React.JSX.Element {
  const { notify } = useApp()
  const bucket = getDeadlineBucket(deadline, now)
  const completed = Boolean(deadline.completedAt)
  const due = dueText(deadline, now)
  const countdown = deadline.dueAt && !completed ? formatCountdown(deadline.dueAt, now) : ''
  const tomorrowMorning = (() => {
    const target = new Date(now)
    target.setDate(target.getDate() + 1)
    target.setHours(8, 0, 0, 0)
    return Math.max(1, Math.round((target.getTime() - now.getTime()) / 60_000))
  })()

  const openSource = (): void => {
    if (!deadline.sourceUrl) return
    void window.classboard.app.openExternal(deadline.sourceUrl).catch(() => {
      notify('无法打开来源链接', 'error')
    })
  }

  return (
    <article
      id={`deadline-${deadline.id}`}
      className={`deadline-row due-${bucket} ${completed ? 'is-completed' : ''} ${
        compact ? 'is-compact' : ''
      } ${highlight ? 'is-highlight' : ''}`}
      onClick={onEdit}
    >
      <button
        type="button"
        className={`todo-check ${completed ? 'is-checked' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        aria-label={completed ? '标记为未完成' : '标记为完成'}
      >
        {completed ? <Check size={13} strokeWidth={3} /> : null}
      </button>

      <div className="deadline-main">
        <div className="deadline-title-line">
          <span className="deadline-title">{deadline.title}</span>
          {deadline.priority === 'high' && !completed ? <span className="priority-pin">重点</span> : null}
          {deadline.source !== 'manual' ? (
            <span className={`source-badge source-${deadline.source}`}>
              {SOURCE_LABELS[deadline.source]}
            </span>
          ) : null}
        </div>
        <div className="deadline-meta">
          {deadline.courseName ? <span className="deadline-course">{deadline.courseName}</span> : null}
          <span className="deadline-due">{due}</span>
          {countdown ? <span className="deadline-countdown">{countdown}</span> : null}
        </div>
      </div>

      {!compact ? (
        <div className="deadline-tail">
          {deadline.sourceUrl ? (
            <button
              type="button"
              className="row-icon-button"
              onClick={(event) => {
                event.stopPropagation()
                openSource()
              }}
              aria-label="打开来源"
              title="打开来源"
            >
              <ExternalLink size={15} />
            </button>
          ) : null}
          <Dropdown
            items={[
              {
                label: '稍后 10 分钟',
                icon: <Clock3 size={15} />,
                onClick: () => onSnooze(10),
                disabled: completed
              },
              {
                label: '稍后 1 小时',
                icon: <Clock3 size={15} />,
                onClick: () => onSnooze(60),
                disabled: completed
              },
              {
                label: '明天早上提醒',
                icon: <Clock3 size={15} />,
                onClick: () => onSnooze(tomorrowMorning),
                disabled: completed
              },
              {
                label: '删除这条作业',
                icon: <Trash2 size={15} />,
                danger: true,
                onClick: onDelete
              }
            ]}
          />
        </div>
      ) : null}
    </article>
  )
}

export function DeadlineMetaLine({
  deadline,
  now
}: {
  deadline: DeadlineItem
  now: Date
}): React.JSX.Element {
  return (
    <div className="deadline-meta">
      {deadline.courseName ? <span className="deadline-course">{deadline.courseName}</span> : null}
      <span className="deadline-due">
        {deadline.dueAt ? formatDueLabel(deadline.dueAt, now) : '未设截止'}
      </span>
    </div>
  )
}
