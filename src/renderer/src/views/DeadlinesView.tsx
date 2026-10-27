import { useEffect, useMemo, useState } from 'react'
import { CloudDownload, ListTodo, Plus, Search, Sparkles } from 'lucide-react'
import type { DeadlineItem } from '@shared/types'
import { formatDateFullCN } from '@shared/date'
import { DeadlineEditor } from '../components/DeadlineEditor'
import { DeadlineRow } from '../components/DeadlineRow'
import { QuickAdd } from '../components/QuickAdd'
import { EmptyState, Segmented } from '../components/ui'
import { useApp } from '../lib/appContext'
import {
  groupDeadlines,
  pendingDeadlines,
  sortDeadlines
} from '../lib/format'

type Filter = 'pending' | 'done' | 'all'

export function DeadlinesView(): React.JSX.Element {
  const { data, now, navigate, notify, quickAddSignal, focusDeadlineId } = useApp()
  const [filter, setFilter] = useState<Filter>('pending')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<DeadlineItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [highlightId, setHighlightId] = useState<string | undefined>()

  useEffect(() => {
    if (!focusDeadlineId) return
    setFilter('all')
    setQuery('')
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`deadline-${focusDeadlineId}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(focusDeadlineId)
      window.setTimeout(() => setHighlightId(undefined), 2600)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [focusDeadlineId])

  const pending = pendingDeadlines(data.deadlines)
  const done = data.deadlines.filter((deadline) => deadline.completedAt)
  const total = data.deadlines.length

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.deadlines.filter((deadline) => {
      if (filter === 'pending' && deadline.completedAt) return false
      if (filter === 'done' && !deadline.completedAt) return false
      if (!needle) return true
      return [deadline.title, deadline.courseName, deadline.notes]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(needle))
    })
  }, [data.deadlines, filter, query])

  const groups = useMemo(() => {
    if (filter === 'done') {
      return [{ bucket: 'done' as const, label: '已完成', items: sortDeadlines(filtered) }]
    }
    const sorted = sortDeadlines(filtered)
    if (filter === 'all') return groupDeadlines(sorted, now)
    return groupDeadlines(sorted.filter((deadline) => !deadline.completedAt), now)
  }, [filter, filtered, now])

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
    if (!window.confirm(`删除「${deadline.title}」？此操作不可撤销。`)) return
    try {
      await window.classboard.deadlines.remove(deadline.id)
      notify('作业已删除', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败', 'error')
    }
  }

  return (
    <div className="page deadlines-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <ListTodo size={15} />
            作业与截止
          </div>
          <h1>把截止日期放在看得见的地方</h1>
          <p className="page-subtitle">
            {pending.length > 0
              ? `${pending.length} 个待交，${pending.filter((item) => item.dueAt && new Date(item.dueAt) < now).length} 个已逾期。`
              : '清单已经清空，给自己倒杯水。'}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('sync')}>
            <CloudDownload size={15} />
            同步作业
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            新增作业
          </button>
        </div>
      </header>

      <section className="card deadline-quick-card">
        <div className="quick-card-title">
          <Sparkles size={16} />
          一句话记下作业
          <span>中文日期、晚自习、下周五都能识别</span>
        </div>
        <QuickAdd variant="bar" focusSignal={quickAddSignal} />
      </section>

      <div className="list-toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: '未完成', count: pending.length },
            { value: 'done', label: '已完成', count: done.length },
            { value: 'all', label: '全部', count: total }
          ]}
        />
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索作业、课程或备注"
            spellCheck={false}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')}>
              清除
            </button>
          ) : null}
        </label>
        <span className="list-toolbar-meta">
          {filtered.length} 条{query ? '匹配' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ListTodo size={28} />}
          title={query ? '没有匹配的作业' : filter === 'done' ? '还没有完成记录' : '清单是空的'}
          description={
            query
              ? '换个关键词试试，或者清除搜索。'
              : filter === 'done'
                ? '完成一项作业后，它会出现在这里。'
                : '在上方输入一句话，或者点右上角新增作业。'
          }
          actions={
            query ? (
              <button type="button" className="btn btn-soft" onClick={() => setQuery('')}>
                清除搜索
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={15} />
                新增作业
              </button>
            )
          }
        />
      ) : (
        <div className="deadline-groups">
          {groups.map((group) => (
            <section className="deadline-group" key={group.bucket}>
              <div className="deadline-group-head">
                <h2 className={`group-title group-${group.bucket}`}>{group.label}</h2>
                <span>{group.items.length}</span>
              </div>
              <div className="deadline-group-list">
                {group.items.map((deadline) => (
                  <DeadlineRow
                    key={deadline.id}
                    deadline={deadline}
                    now={now}
                    highlight={highlightId === deadline.id}
                    onEdit={() => setEditing(deadline)}
                    onToggle={() => void toggle(deadline)}
                    onSnooze={(minutes) => void snooze(deadline, minutes)}
                    onDelete={() => void remove(deadline)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {filter === 'done' && done.length > 0 ? (
        <div className="done-footnote">
          最近完成：{formatDateFullCN(done[0].completedAt as string)}
        </div>
      ) : null}

      {editing ? <DeadlineEditor deadline={editing} onClose={() => setEditing(null)} /> : null}
      {creating ? <DeadlineEditor onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
