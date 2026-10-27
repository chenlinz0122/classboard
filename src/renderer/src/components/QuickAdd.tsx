import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Plus, Sparkles } from 'lucide-react'
import type { DeadlineItem } from '@shared/types'
import { formatDueLabel } from '@shared/date'
import { parseQuickAdd } from '@shared/parseQuickAdd'
import { useApp } from '../lib/appContext'
import { matchCourseInText } from '../lib/format'
import { SelectChevron } from './ui'

export function QuickAdd({
  variant = 'card',
  focusSignal = 0,
  onAdded
}: {
  variant?: 'card' | 'bar' | 'widget'
  focusSignal?: number
  onAdded?: (deadline: DeadlineItem) => void
}): React.JSX.Element {
  const { data, now, notify } = useApp()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [manualCourseId, setManualCourseId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus()
  }, [focusSignal])

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, now) : null), [text, now])
  const matchedCourse = useMemo(
    () => (text.trim() ? matchCourseInText(text, data.courses) : undefined),
    [text, data.courses]
  )
  const selectedCourseId =
    manualCourseId !== null ? manualCourseId : matchedCourse?.id ?? ''
  const duePast = parsed ? new Date(parsed.dueAt).getTime() < now.getTime() : false
  const titleMissing = Boolean(parsed && parsed.title === '未命名作业')

  const submit = async (): Promise<void> => {
    if (!parsed || saving) return
    if (titleMissing) {
      notify('先写一个作业名称，例如“计组实验3 周五 23:59”', 'error')
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const created = await window.classboard.deadlines.create({
        title: parsed.title,
        dueAt: parsed.dueAt,
        courseId: selectedCourseId || undefined,
        source: 'manual'
      })
      notify(`已记下「${created.title}」`, 'success')
      setText('')
      setManualCourseId(null)
      onAdded?.(created)
      inputRef.current?.focus()
    } catch (error) {
      notify(error instanceof Error ? error.message : '添加失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`quick-add quick-add-${variant}`}>
      <div className="quick-input-wrap">
        <Sparkles className="quick-spark" size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          className="quick-input"
          value={text}
          placeholder="记一个作业，如：计组实验3 周五 23:59"
          onChange={(event) => {
            setText(event.target.value)
            setManualCourseId(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
          spellCheck={false}
        />
        <button
          type="button"
          className="quick-submit"
          disabled={!parsed || saving || titleMissing}
          onClick={() => void submit()}
          aria-label="添加作业"
        >
          {variant === 'widget' ? <CornerDownLeft size={15} /> : <Plus size={16} />}
          <span>{saving ? '保存中' : '加入'}</span>
        </button>
      </div>

      {parsed ? (
        <div className={`quick-preview ${duePast ? 'is-past' : ''}`}>
          <div className="quick-preview-title" title={parsed.title}>
            {parsed.title}
          </div>
          <div className="quick-preview-due">
            {parsed.hasDate || parsed.hasTime ? '截止' : '默认'}{' '}
            {formatDueLabel(parsed.dueAt, now)}
          </div>
          {data.courses.length > 0 ? (
            <label className="quick-course">
              <select
                value={selectedCourseId}
                onChange={(event) => setManualCourseId(event.target.value)}
                aria-label="关联课程"
              >
                <option value="">不关联课程</option>
                {data.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </label>
          ) : null}
        </div>
      ) : (
        <div className="quick-hint">
          支持“明天 23:59”“下周五晚上8点”“10月30日 18:00”
        </div>
      )}
    </div>
  )
}
