import { useMemo, useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { DeadlineItem } from '@shared/types'
import {
  formatDateFullCN,
  formatDueLabel,
  fromDateTimeLocalValue,
  toDateTimeLocalValue
} from '@shared/date'
import { formatClockRuleLabel, formatOffsetLabel } from '@shared/defaults'
import { useApp } from '../lib/appContext'
import { FieldLabel, Modal, SelectChevron } from './ui'

function defaultDueLocal(): string {
  const due = new Date()
  due.setDate(due.getDate() + 1)
  due.setHours(23, 59, 0, 0)
  return toDateTimeLocalValue(due.toISOString())
}

export function DeadlineEditor({
  deadline,
  initialDueAt,
  initialCourseId,
  onClose,
  onDeleted
}: {
  deadline?: DeadlineItem | null
  initialDueAt?: string
  initialCourseId?: string
  onClose: () => void
  onDeleted?: () => void
}): React.JSX.Element {
  const { data, now, notify } = useApp()
  const [title, setTitle] = useState(deadline?.title ?? '')
  const [courseId, setCourseId] = useState(deadline?.courseId ?? initialCourseId ?? '')
  const [dueLocal, setDueLocal] = useState(
    deadline ? toDateTimeLocalValue(deadline.dueAt) : initialDueAt ? toDateTimeLocalValue(initialDueAt) : defaultDueLocal()
  )
  const [noDue, setNoDue] = useState(deadline ? !deadline.dueAt : false)
  const [notes, setNotes] = useState(deadline?.notes ?? '')
  const [important, setImportant] = useState(deadline?.priority === 'high')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const effectiveOffsets = useMemo(() => {
    const offsets = deadline?.reminderOffsets?.length
      ? deadline.reminderOffsets
      : data.settings.reminderOffsets
    return [...offsets].sort((a, b) => b - a)
  }, [deadline?.reminderOffsets, data.settings.reminderOffsets])

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('作业标题不能为空')
      return
    }
    const dueAt = noDue ? null : fromDateTimeLocalValue(dueLocal)
    if (!noDue && !dueAt) {
      setError('请选择有效的截止时间')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (deadline) {
        await window.classboard.deadlines.update(deadline.id, {
          title: trimmed,
          courseId: courseId || undefined,
          dueAt,
          notes,
          priority: important ? 'high' : 'normal'
        })
        notify('作业已更新', 'success')
      } else {
        await window.classboard.deadlines.create({
          title: trimmed,
          courseId: courseId || undefined,
          dueAt,
          notes,
          priority: important ? 'high' : 'normal',
          source: 'manual'
        })
        notify('已添加作业', 'success')
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
    if (!deadline) return
    if (!window.confirm(`删除「${deadline.title}」？此操作不可撤销。`)) return
    try {
      await window.classboard.deadlines.remove(deadline.id)
      notify('作业已删除', 'success')
      onDeleted?.()
      onClose()
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '删除失败', 'error')
    }
  }

  const duePast = dueLocal && !noDue ? new Date(dueLocal).getTime() < now.getTime() : false

  return (
    <Modal
      title={deadline ? '编辑作业' : '新增作业'}
      subtitle={deadline ? `创建于 ${formatDateFullCN(deadline.createdAt)}` : '记下截止时间，剩下的交给提醒'}
      onClose={onClose}
      width="590px"
      footer={
        <div className="modal-footer-row">
          <div>
            {deadline ? (
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
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      }
    >
      <div className="form-stack">
        <label className="form-field">
          <FieldLabel>作业标题</FieldLabel>
          <input
            className="text-input"
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：计组实验 3 · 流水线"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) void submit()
            }}
          />
        </label>

        <div className="form-grid form-grid-2">
          <label className="form-field">
            <FieldLabel hint="可选">关联课程</FieldLabel>
            <div className="select-wrap">
              <select className="text-input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                <option value="">不关联课程</option>
                {data.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </label>

          <label className="form-field">
            <FieldLabel hint={duePast ? '这个时间已经过去' : '本地时间'}>截止时间</FieldLabel>
            <input
              className={`text-input ${duePast ? 'is-warning' : ''}`}
              type="datetime-local"
              value={dueLocal}
              disabled={noDue}
              onChange={(event) => setDueLocal(event.target.value)}
            />
          </label>
        </div>

        <div className="inline-options">
          <label className="check-inline">
            <input
              type="checkbox"
              checked={noDue}
              onChange={(event) => setNoDue(event.target.checked)}
            />
            暂无明确截止时间
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={important}
              onChange={(event) => setImportant(event.target.checked)}
            />
            标记为重点作业
          </label>
        </div>

        {dueLocal && !noDue ? (
          <div className="form-note">
            截止预览：{formatDueLabel(fromDateTimeLocalValue(dueLocal) ?? undefined, now)}
            {' · '}
            提醒节点：
            {effectiveOffsets.map((offset) => formatOffsetLabel(offset)).join(' / ')}
            {data.settings.reminderClockRules.length > 0
              ? `；${data.settings.reminderClockRules
                  .map((rule) => formatClockRuleLabel(rule))
                  .join(' / ')}`
              : ''}
          </div>
        ) : null}

        <label className="form-field">
          <FieldLabel hint="可选">备注</FieldLabel>
          <textarea
            className="text-area"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="提交位置、文件命名要求、老师补充说明…"
          />
        </label>

        {deadline?.sourceUrl ? (
          <button
            type="button"
            className="source-link"
            onClick={() => void window.classboard.app.openExternal(deadline.sourceUrl!)}
          >
            <ExternalLink size={14} />
            打开来源页面
          </button>
        ) : null}

        {error ? <div className="form-error">{error}</div> : null}
      </div>
    </Modal>
  )
}
