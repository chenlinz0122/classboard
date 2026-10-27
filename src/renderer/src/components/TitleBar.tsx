import { Cloud, Minus, Square, X } from 'lucide-react'
import { useApp } from '../lib/appContext'
import { formatDateWithWeekday, formatWeekCount, getSemesterWeek } from '@shared/date'
import { BrandMark, IconButton } from './ui'

export function TitleBar({ showSync = true }: { showSync?: boolean }): React.JSX.Element {
  const { data, now, navigate } = useApp()
  const semester = getSemesterWeek(data.settings.semesterStart, data.settings.totalWeeks, now)

  const onDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return
    void window.classboard.window.maximize()
  }

  return (
    <header className="titlebar" onDoubleClick={onDoubleClick}>
      <div className="titlebar-brand">
        <BrandMark size={26} />
        <div className="titlebar-name">
          <span>课表与DDL</span>
          <em>CLASSBOARD</em>
        </div>
      </div>

      <div className="titlebar-center">
        <span className="titlebar-week">{formatWeekCount(semester.week)}</span>
        <span className="titlebar-dot" />
        <span>{formatDateWithWeekday(now)}</span>
      </div>

      <div className="titlebar-actions">
        {showSync ? (
          <button type="button" className="titlebar-sync" onClick={() => navigate('sync')}>
            <Cloud size={15} />
            同步
          </button>
        ) : null}
        <div className="window-controls">
          <IconButton
            className="window-control"
            aria-label="最小化"
            onClick={() => void window.classboard.window.minimize()}
          >
            <Minus size={16} />
          </IconButton>
          <IconButton
            className="window-control"
            aria-label="最大化"
            onClick={() => void window.classboard.window.maximize()}
          >
            <Square size={13} />
          </IconButton>
          <IconButton
            className="window-control window-close"
            aria-label="关闭"
            onClick={() => void window.classboard.window.close()}
          >
            <X size={16} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
