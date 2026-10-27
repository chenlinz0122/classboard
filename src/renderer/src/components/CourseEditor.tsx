import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Course, Weekday } from '@shared/types'
import { formatWeeks } from '@shared/schedule'
import { parseWeeksText } from '@shared/parseHduHtml'
import { weekdayLabel } from '@shared/date'
import { useApp } from '../lib/appContext'
import { colors } from '../lib/colors'
import { FieldLabel, Modal, SelectChevron } from './ui'

export function CourseEditor({
  course,
  defaultWeekday = 1,
  defaultStartPeriod = 1,
  onClose,
  onDeleted
}: {
  course?: Course | null
  defaultWeekday?: Weekday
  defaultStartPeriod?: number
  onClose: () => void
  onDeleted?: () => void
}): React.JSX.Element {
  const { data, notify } = useApp()
  const periods = data.settings.periods
  const [name, setName] = useState(course?.name ?? '')
  const [teacher, setTeacher] = useState(course?.teacher ?? '')
  const [location, setLocation] = useState(course?.location ?? '')
  const [weekday, setWeekday] = useState<Weekday>(course?.weekday ?? defaultWeekday)
  const [startPeriod, setStartPeriod] = useState(course?.startPeriod ?? defaultStartPeriod)
  const [endPeriod, setEndPeriod] = useState(course?.endPeriod ?? Math.min(periods.length, defaultStartPeriod + 1))
  const [weeksText, setWeeksText] = useState(course ? formatWeeks(course.weeks) : '1-16周')
  const [note, setNote] = useState(course?.note ?? '')
  const [color, setColor] = useState<number | undefined>(course?.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const weeks = useMemo(() => parseWeeksText(weeksText), [weeksText])
  const weeksPreview = weeks.length > 0 ? formatWeeks(weeks) : '未识别'

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('课程名不能为空')
      return
    }
    if (weeks.length === 0) {
      setError('请填写有效周次，例如 1-16周 或 1-16周(单)')
      return
    }
    if (startPeriod > endPeriod) {
      setError('开始节次不能晚于结束节次')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        teacher: teacher.trim(),
        location: location.trim(),
        weekday,
        startPeriod,
        endPeriod,
        weeks,
        note: note.trim() || undefined,
        color
      }
      if (course) {
        await window.classboard.courses.update(course.id, payload)
        notify('课程已更新', 'success')
      } else {
        await window.classboard.courses.create(payload)
        notify('课程已添加', 'success')
      }
      onClose()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '保存失败'
      setError(message)
      notify(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!course) return
    if (!window.confirm(`删除「${course.name}」？关联作业会保留，但不再显示课程名。`)) return
    try {
      await window.classboard.courses.remove(course.id)
      notify('课程已删除', 'success')
      onDeleted?.()
      onClose()
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '删除失败', 'error')
    }
  }

  return (
    <Modal
      title={course ? '编辑课程' : '添加课程'}
      subtitle={course ? `${weekdayLabel(course.weekday)} · 第 ${course.startPeriod}-${course.endPeriod} 节` : '手动补充一门课'}
      onClose={onClose}
      width="640px"
      footer={
        <div className="modal-footer-row">
          <div>
            {course ? (
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => void remove()}>
                <Trash2 size={15} />
                删除
              </button>
            ) : null}
          </div>
          <div className="modal-footer-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
              {saving ? '保存中…' : '保存课程'}
            </button>
          </div>
        </div>
      }
    >
      <div className="form-stack">
        <label className="form-field">
          <FieldLabel>课程名称</FieldLabel>
          <input
            className="text-input"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：计算机组成原理"
          />
        </label>

        <div className="form-grid form-grid-2">
          <label className="form-field">
            <FieldLabel hint="可选">教师</FieldLabel>
            <input
              className="text-input"
              value={teacher}
              onChange={(event) => setTeacher(event.target.value)}
              placeholder="例如：周老师"
            />
          </label>
          <label className="form-field">
            <FieldLabel hint="可选">地点</FieldLabel>
            <input
              className="text-input"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="例如：3教-302"
            />
          </label>
        </div>

        <div className="form-grid form-grid-3">
          <label className="form-field">
            <FieldLabel>星期</FieldLabel>
            <div className="select-wrap">
              <select
                className="text-input"
                value={weekday}
                onChange={(event) => setWeekday(Number(event.target.value) as Weekday)}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                  <option key={value} value={value}>
                    {weekdayLabel(value as Weekday)}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </label>
          <label className="form-field">
            <FieldLabel>开始节次</FieldLabel>
            <div className="select-wrap">
              <select
                className="text-input"
                value={startPeriod}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setStartPeriod(value)
                  if (value > endPeriod) setEndPeriod(value)
                }}
              >
                {periods.map((period) => (
                  <option key={period.index} value={period.index}>
                    第 {period.index} 节 · {period.start}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </label>
          <label className="form-field">
            <FieldLabel>结束节次</FieldLabel>
            <div className="select-wrap">
              <select
                className="text-input"
                value={endPeriod}
                onChange={(event) => setEndPeriod(Number(event.target.value))}
              >
                {periods
                  .filter((period) => period.index >= startPeriod)
                  .map((period) => (
                    <option key={period.index} value={period.index}>
                      第 {period.index} 节 · {period.end}
                    </option>
                  ))}
              </select>
              <SelectChevron />
            </div>
          </label>
        </div>

        <label className="form-field">
          <FieldLabel hint={`识别结果：${weeksPreview}`}>上课周次</FieldLabel>
          <input
            className="text-input"
            value={weeksText}
            onChange={(event) => setWeeksText(event.target.value)}
            placeholder="1-16周  /  1-8,10-16周  /  1-16周(单)"
          />
        </label>

        <div className="form-field">
          <FieldLabel>课程颜色</FieldLabel>
          <div className="color-swatches">
            {colors.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={`color-swatch ${color === index ? 'is-selected' : ''}`}
                style={{ background: item.hex }}
                onClick={() => setColor(index)}
                aria-label={item.name}
                title={item.name}
              />
            ))}
          </div>
        </div>

        <label className="form-field">
          <FieldLabel hint="可选">备注</FieldLabel>
          <textarea
            className="text-area"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="考试安排、调课说明、课程群…"
          />
        </label>

        {error ? <div className="form-error">{error}</div> : null}
      </div>
    </Modal>
  )
}
