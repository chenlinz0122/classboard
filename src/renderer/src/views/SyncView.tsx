import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  FileUp,
  GraduationCap,
  Info,
  LoaderCircle,
  LogOut,
  Presentation,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Terminal
} from 'lucide-react'
import type {
  PlatformAssignment,
  SyncEvent,
  SyncPlatform
} from '@shared/types'
import {
  formatDateTimeCN,
  formatDueLabel,
  formatWeekCount,
  fromDateTimeLocalValue,
  getSemesterWeek,
  toDateTimeLocalValue,
  weekdayLabel
} from '@shared/date'
import { formatPeriodRange, formatWeeks } from '@shared/schedule'
import { useApp } from '../lib/appContext'
import { Badge, EmptyState, Spinner } from '../components/ui'

const PLATFORM_META: Record<
  SyncPlatform,
  {
    title: string
    monogram: string
    description: string
    tone: string
    icon: React.ReactNode
    experimental?: boolean
  }
> = {
  hdu: {
    title: '杭电教务',
    monogram: '教',
    description: '登录数字杭电，读取教务系统课表',
    tone: 'jade',
    icon: <GraduationCap size={20} />
  },
  chaoxing: {
    title: '学习通',
    monogram: '学',
    description: '登录杭电泛雅，读取未交作业',
    tone: 'blue',
    icon: <BookOpen size={20} />,
    experimental: true
  },
  yuketang: {
    title: '雨课堂',
    monogram: '雨',
    description: '扫描当前作业页面',
    tone: 'coral',
    icon: <Presentation size={20} />,
    experimental: true
  },
  pta: {
    title: 'PTA',
    monogram: 'P',
    description: '读取未截止的题目集',
    tone: 'amber',
    icon: <Terminal size={20} />,
    experimental: true
  }
}

const PHASE_LABEL: Record<SyncEvent['phase'], string> = {
  idle: '待机',
  opening: '正在打开',
  login: '等待登录',
  ready: '可以读取',
  scanning: '正在读取',
  preview: '待确认',
  done: '已完成',
  error: '遇到问题',
  closed: '窗口已关闭'
}

export function SyncView(): React.JSX.Element {
  const { data, info, now, notify, navigate } = useApp()
  const [state, setState] = useState<SyncEvent | null>(null)
  const [items, setItems] = useState<PlatformAssignment[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.classboard.getSyncState().then((value) => {
      if (alive && value) setState(value)
    })
    const unsubscribe = window.classboard.onSyncEvent((event) => setState(event))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!state?.platformPreview) return
    setItems(
      state.platformPreview.items.map((item) => ({
        ...item,
        selected: item.selected !== false && !item.completed
      }))
    )
  }, [state?.platformPreview?.capturedAt, state?.platformPreview])

  const semester = getSemesterWeek(data.settings.semesterStart, data.settings.totalWeeks, now)
  const hduPreview = state?.platform === 'hdu' ? state.hduPreview : undefined
  const platformPreview = state?.platformPreview
  const currentPlatform = state?.platform

  const action = async (name: string, work: () => Promise<unknown>, success?: string): Promise<void> => {
    if (busy) return
    setBusy(name)
    try {
      await work()
      if (success) notify(success, 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const openPlatform = (platform: SyncPlatform): void => {
    if (
      (state?.hduPreview || state?.platformPreview) &&
      !window.confirm('重新打开登录窗口会放弃当前预览，确定继续？')
    ) {
      return
    }
    void action(`open-${platform}`, () => window.classboard.sync.open(platform))
  }

  const clearSession = (platform: SyncPlatform): void => {
    if (!window.confirm(`清除 ${PLATFORM_META[platform].title} 的本地登录状态？`)) return
    void action(
      `clear-${platform}`,
      () => window.classboard.sync.clearSession(platform),
      '本地登录状态已清除'
    )
  }

  const commitHdu = (mode: 'merge' | 'replace'): void => {
    if (mode === 'replace') {
      const existing = data.courses.filter((course) => course.source === 'hdu').length
      if (
        existing > 0 &&
        !window.confirm('替换会移除本次预览中不存在的旧杭电课程，但会保留手动课程和作业。继续？')
      ) {
        return
      }
    }
    void action(
      `commit-hdu-${mode}`,
      async () => {
        const result = await window.classboard.sync.commitHdu(mode)
        notify(
          `课表已更新：新增 ${result.added} 门，更新 ${result.updated} 门`,
          'success'
        )
      }
    )
  }

  const commitPlatform = (): void => {
    if (!platformPreview) return
    const selected = items.filter((item) => item.selected !== false)
    if (selected.length === 0) {
      notify('至少选择一条作业', 'error')
      return
    }
    void action(
      'commit-platform',
      async () => {
        const result = await window.classboard.sync.commitPlatform(
          platformPreview.platform,
          items
        )
        notify(`作业已写入：新增 ${result.added} 条，更新 ${result.updated} 条`, 'success')
      }
    )
  }

  const toggleAll = (selected: boolean): void => {
    setItems((current) => current.map((item) => ({ ...item, selected })))
  }

  const selectedCount = items.filter((item) => item.selected !== false).length
  const allSelected = items.length > 0 && selectedCount === items.length
  const lastSync = (platform: SyncPlatform) => data.settings.sync[platform]?.lastSyncAt

  return (
    <div className="page sync-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <CloudDownload size={15} />
            同步与导入
          </div>
          <h1>把课表和作业带进来</h1>
          <p className="page-subtitle">
            只在主动同步时联网。账号密码不保存，提醒和看板始终离线可用。
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('today')}>
            回到今日
          </button>
        </div>
      </header>

      <div className="platform-grid">
        {(Object.keys(PLATFORM_META) as SyncPlatform[]).map((platform) => {
          const meta = PLATFORM_META[platform]
          const platformState = currentPlatform === platform ? state : null
          const isOpen = Boolean(
            platformState &&
              ['opening', 'login', 'ready', 'scanning', 'error'].includes(platformState.phase)
          )
          return (
            <section className={`platform-card platform-${meta.tone}`} key={platform}>
              <div className="platform-card-top">
                <div className={`platform-mark platform-mark-${meta.tone}`}>{meta.monogram}</div>
                <div className="platform-title">
                  <div>
                    <h2>{meta.title}</h2>
                    {meta.experimental ? <Badge tone="amber">实验性</Badge> : null}
                  </div>
                  <p>{meta.description}</p>
                </div>
              </div>

              <div className="platform-status">
                {platformState ? (
                  <>
                    <span
                      className={`status-dot status-${platformState.phase === 'error' ? 'error' : platformState.phase === 'preview' || platformState.phase === 'ready' ? 'ok' : 'wait'}`}
                    />
                    <span>{PHASE_LABEL[platformState.phase]}</span>
                    {platformState.error ? (
                      <em title={platformState.error}>{platformState.error}</em>
                    ) : (
                      <em title={platformState.message}>{platformState.message}</em>
                    )}
                  </>
                ) : lastSync(platform) ? (
                  <>
                    <span className="status-dot status-ok" />
                    <span>上次同步</span>
                    <em>{formatDateTimeCN(lastSync(platform) as string)}</em>
                  </>
                ) : (
                  <>
                    <span className="status-dot" />
                    <span>尚未连接</span>
                    <em>需要时再登录</em>
                  </>
                )}
              </div>

              {platformState?.error && platformState.phase === 'error' ? (
                <div className="platform-error">{platformState.error}</div>
              ) : null}

              <div className="platform-actions">
                <button
                  type="button"
                  className={`btn ${platform === 'hdu' ? 'btn-primary' : 'btn-soft'}`}
                  disabled={busy !== null}
                  onClick={() => openPlatform(platform)}
                >
                  {busy === `open-${platform}` ? <Spinner size={14} /> : isOpen ? <RefreshCw size={15} /> : <ExternalLink size={15} />}
                  {isOpen ? '重新打开登录窗口' : platform === 'hdu' ? '打开登录窗口' : '登录并读取'}
                </button>
                {platform === 'hdu' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    disabled={busy !== null}
                    onClick={() =>
                      void action(
                        'import-hdu',
                        () => window.classboard.data.importHduHtml(),
                        undefined
                      )
                    }
                  >
                    <FileUp size={14} />
                    导入 HTML
                  </button>
                ) : null}
                <button
                  type="button"
                  className="platform-clear"
                  onClick={() => clearSession(platform)}
                  title="清除本地登录状态"
                >
                  <LogOut size={13} />
                  清除登录
                </button>
              </div>

              {platform === 'hdu' ? (
                <details className="platform-help">
                  <summary>入口或网络有问题？</summary>
                  <p>
                    现行入口：数字杭电 → 教务系统 → 信息查询 → 个人课表查询。校外访问通常需要校园网/VPN。
                    如果内置窗口仍空白，请在 Edge 里走同样路径，按 Ctrl+S 保存课表页，再点「导入 HTML」。
                  </p>
                </details>
              ) : (
                <div className="platform-hint">
                  {platform === 'chaoxing'
                    ? '入口是杭电泛雅（hdu.fanya.chaoxing.com）。登录后会自动读取作业列表；若页面提示 404，请关闭窗口重新打开，不要使用 i.mooc.hdu.edu.cn 子域。'
                    : platform === 'pta'
                      ? '登录 PTA 后直接点「读取作业」。应用会读取所有未截止题目集的截止时间；题目集里的小题不会单独生成提醒。'
                      : '登录后进入具体课程的「作业 / 待办」列表，等页面加载完，再在登录窗口顶部点「扫描当前页」。'}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {state ? (
        <section className={`sync-status-card phase-${state.phase}`}>
          <div className="sync-status-head">
            <div className="sync-status-icon">
              {state.phase === 'scanning' || state.phase === 'opening' ? (
                <Spinner size={18} />
              ) : state.phase === 'error' ? (
                <AlertCircle size={20} />
              ) : state.phase === 'done' ? (
                <CheckCircle2 size={20} />
              ) : (
                <ScanLine size={20} />
              )}
            </div>
            <div className="sync-status-copy">
              <div>
                <strong>{PLATFORM_META[state.platform].title}</strong>
                <Badge tone={state.phase === 'error' ? 'red' : state.phase === 'done' ? 'jade' : 'neutral'}>
                  {PHASE_LABEL[state.phase]}
                </Badge>
              </div>
              <p>{state.message}</p>
              {state.url ? <em>{state.url}</em> : null}
            </div>
            <div className="sync-status-actions">
              {state.canCapture ? (
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  disabled={busy !== null}
                  onClick={() =>
                    void action('capture', () => window.classboard.sync.captureCurrent())
                  }
                >
                  {busy === 'capture' ? <Spinner size={14} /> : <ScanLine size={14} />}
                  {state.platform === 'hdu'
                    ? '读取课表'
                    : state.platform === 'chaoxing'
                      ? '读取作业'
                      : state.platform === 'pta'
                        ? '读取题目集'
                        : '扫描当前页'}
                </button>
              ) : null}
              {!['closed', 'done'].includes(state.phase) ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void window.classboard.sync.refresh()}
                  >
                    刷新
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void window.classboard.sync.close()}
                  >
                    关闭窗口
                  </button>
                </>
              ) : null}
              {state.phase === 'error' ? (
                <button
                  type="button"
                  className="btn btn-soft btn-compact"
                  onClick={() => openPlatform(state.platform)}
                >
                  重新打开
                </button>
              ) : null}
            </div>
          </div>

          {state.phase === 'done' && state.commitResult ? (
            <div className="sync-done-strip">
              <CheckCircle2 size={16} />
              <span>
                新增 {state.commitResult.added} · 更新 {state.commitResult.updated} · 保留{' '}
                {state.commitResult.skipped}
              </span>
              <button type="button" className="text-button" onClick={() => navigate(state.platform === 'hdu' ? 'week' : 'deadlines')}>
                去看看
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {hduPreview ? (
        <HduPreview
          preview={hduPreview}
          busy={busy}
          existingHduCourses={data.courses.filter((course) => course.source === 'hdu').length}
          onReplace={() => commitHdu('replace')}
          onMerge={() => commitHdu('merge')}
          onDiscard={() =>
            void action('discard-hdu', () => window.classboard.sync.discardPreview(), '已放弃本次预览')
          }
        />
      ) : null}

      {platformPreview ? (
        <section className="card sync-preview-card">
          <div className="preview-head">
            <div>
              <div className="preview-kicker">
                <ScanLine size={15} />
                {PLATFORM_META[platformPreview.platform].title} · 待确认
              </div>
              <h2>{platformPreview.items.length} 条作业</h2>
              <p>
                已选 {selectedCount} 条。所有字段都可以直接修改，确认后才会写入看板。
              </p>
            </div>
            <div className="preview-head-actions">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
                全选
              </label>
            </div>
          </div>

          {platformPreview.warnings.length > 0 ? (
            <div className="inline-warnings">
              {platformPreview.warnings.map((warning) => (
                <div key={warning}>
                  <Info size={14} />
                  {warning}
                </div>
              ))}
            </div>
          ) : null}

          <div className="preview-table">
            <div className="preview-table-head">
              <span />
              <span>作业标题</span>
              <span>课程</span>
              <span>截止时间</span>
              <span>来源</span>
            </div>
            {items.map((item, index) => (
              <div
                className={`preview-row ${item.completed ? 'is-completed' : ''} ${
                  item.selected === false ? 'is-deselected' : ''
                }`}
                key={item.tempId || `${item.title}-${index}`}
              >
                <label className="preview-check">
                  <input
                    type="checkbox"
                    checked={item.selected !== false}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setItems((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === index ? { ...value, selected: checked } : value
                        )
                      )
                    }}
                  />
                </label>
                <div className="preview-title-cell">
                  <input
                    className="table-input"
                    value={item.title}
                    onChange={(event) => {
                      const value = event.target.value
                      setItems((current) =>
                        current.map((valueItem, itemIndex) =>
                          itemIndex === index ? { ...valueItem, title: value } : valueItem
                        )
                      )
                    }}
                  />
                  {item.completed ? <span className="completed-tag">平台已完成</span> : null}
                  {!item.dueAt ? <span className="no-due-tag">需补截止时间</span> : null}
                </div>
                <div>
                  <input
                    className="table-input"
                    value={item.courseName}
                    placeholder="课程名"
                    onChange={(event) => {
                      const value = event.target.value
                      setItems((current) =>
                        current.map((valueItem, itemIndex) =>
                          itemIndex === index ? { ...valueItem, courseName: value } : valueItem
                        )
                      )
                    }}
                  />
                </div>
                <div className="preview-due-cell">
                  <input
                    className={`table-input ${!item.dueAt ? 'is-warning' : ''}`}
                    type="datetime-local"
                    value={toDateTimeLocalValue(item.dueAt)}
                    onChange={(event) => {
                      const value = fromDateTimeLocalValue(event.target.value)
                      setItems((current) =>
                        current.map((valueItem, itemIndex) =>
                          itemIndex === index ? { ...valueItem, dueAt: value } : valueItem
                        )
                      )
                    }}
                  />
                  <em>{item.dueAt ? formatDueLabel(item.dueAt, now) : item.dueText || '未识别'}</em>
                </div>
                <div className="preview-source-cell">
                  {item.sourceUrl ? (
                    <button
                      type="button"
                      className="row-icon-button"
                      title="打开来源"
                      onClick={() => void window.classboard.app.openExternal(item.sourceUrl!)}
                    >
                      <ExternalLink size={14} />
                    </button>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="preview-footer">
            <div className="preview-footer-note">
              <Info size={14} />
              同来源、同任务的作业会更新而不是重复新增；手动备注和完成状态会保留。
            </div>
            <div className="preview-footer-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy !== null}
                onClick={() =>
                  void action('discard-platform', () => window.classboard.sync.discardPreview(), '已放弃本次预览')
                }
              >
                放弃
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || selectedCount === 0}
                onClick={commitPlatform}
              >
                {busy === 'commit-platform' ? <Spinner size={14} /> : <CheckCircle2 size={15} />}
                写入 {selectedCount} 条作业
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {!hduPreview && !platformPreview && !state ? (
        <div className="sync-bottom-grid">
          <section className="card sync-guide-card">
            <div className="card-head">
              <div>
                <h2>同步流程</h2>
                <p>整个过程由你触发，随时可以关闭登录窗口。</p>
              </div>
              <Sparkles size={18} />
            </div>
            <ol className="sync-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>打开内置登录窗口</strong>
                  <p>选择上面的杭电教务、学习通或雨课堂。登录页完全由官方页面处理。</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>到达课表 / 作业页面</strong>
                  <p>
                    杭电：登录数字杭电后点「教务系统」，进入 信息查询 → 个人课表查询；学习通自动读取；PTA 读取未截止题目集；雨课堂需进入课程作业列表。
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>读取、核对、写入</strong>
                  <p>扫描结果先进入预览，确认后才写入本地看板。</p>
                </div>
              </li>
            </ol>
          </section>
          <section className="card privacy-card">
            <div className="privacy-icon">
              <ShieldCheck size={24} />
            </div>
            <h2>本地优先</h2>
            <p>
              课表、作业和提醒都保存在本机。同步时只访问对应平台，不经过任何第三方服务器，也不会上传你的数据。
            </p>
            <ul>
              <li>不保存账号密码</li>
              <li>登录 Cookie 仅保存在本机，可一键清除</li>
              <li>看板与提醒不需要网络</li>
            </ul>
            <div className="privacy-foot">
              <span>{formatWeekCount(semester.week)}</span>
              <span>·</span>
              <span>{info.isPackaged ? '安装版' : '开发版'}</span>
            </div>
          </section>
        </div>
      ) : null}

      {!hduPreview && !platformPreview && state && ['error', 'closed', 'done'].includes(state.phase) ? (
        <div className="sync-tip-strip">
          <Info size={15} />
          <span>
            遇到问题？可以重新打开登录窗口，或使用手动录入 / HTML 导入。同步失败不会影响已有数据。
          </span>
        </div>
      ) : null}

      {info.isPackaged ? null : (
        <div className="dev-note">开发模式：同步窗口使用独立会话；打包后会写入开始菜单与登录启动项。</div>
      )}
    </div>
  )
}

function HduPreview({
  preview,
  busy,
  existingHduCourses,
  onReplace,
  onMerge,
  onDiscard
}: {
  preview: NonNullable<SyncEvent['hduPreview']>
  busy: string | null
  existingHduCourses: number
  onReplace: () => void
  onMerge: () => void
  onDiscard: () => void
}): React.JSX.Element {
  const sorted = useMemo(
    () =>
      [...preview.courses].sort(
        (a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod
      ),
    [preview.courses]
  )
  return (
    <section className="card sync-preview-card">
      <div className="preview-head">
        <div>
          <div className="preview-kicker">
            <GraduationCap size={15} />
            杭电课表 · 待确认
          </div>
          <h2>{preview.courses.length} 门课程</h2>
          <p>
            {preview.studentName ? `${preview.studentName} · ` : ''}
            {preview.semesterLabel ?? '当前学期'} · 来源：
            {preview.source === 'html' ? '保存的 HTML' : '教务系统'}
          </p>
        </div>
        <div className="preview-head-actions">
          <Badge tone="jade">已读取</Badge>
        </div>
      </div>

      {preview.warnings.length > 0 ? (
        <div className="inline-warnings">
          {preview.warnings.map((warning) => (
            <div key={warning}>
              <Info size={14} />
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <div className="hdu-preview-grid">
        {sorted.map((course, index) => (
          <div className="hdu-preview-row" key={`${course.name}-${course.weekday}-${course.startPeriod}-${index}`}>
            <div className="hdu-preview-day">
              <span>{weekdayLabel(course.weekday)}</span>
              <em>{formatPeriodRange(course.startPeriod, course.endPeriod)}</em>
            </div>
            <div className="hdu-preview-main">
              <strong>{course.name}</strong>
              <span>
                {[course.location, course.teacher].filter(Boolean).join(' · ') || '地点待定'}
              </span>
            </div>
            <div className="hdu-preview-weeks">{formatWeeks(course.weeks)}</div>
          </div>
        ))}
      </div>

      <div className="preview-footer">
        <div className="preview-footer-note">
          <Info size={14} />
          {existingHduCourses > 0
            ? '已存在杭电课程：合并会更新同名课程，替换会移除本次未出现的旧杭电课程。'
            : '这是第一次写入杭电课表，建议选择替换。'}
        </div>
        <div className="preview-footer-actions">
          <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={onDiscard}>
            放弃
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={onMerge}>
            仅合并
          </button>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={onReplace}>
            {busy === 'commit-hdu-replace' ? <Spinner size={14} /> : <CheckCircle2 size={15} />}
            写入课表
          </button>
        </div>
      </div>
    </section>
  )
}
