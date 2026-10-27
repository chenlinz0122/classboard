import { useEffect, useState } from 'react'
import {
  Bell,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  Laptop,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  WifiOff
} from 'lucide-react'
import type { Period } from '@shared/types'
import {
  formatWeekCount,
  formatWeekRange,
  getSemesterWeek
} from '@shared/date'
import {
  DEFAULT_PERIODS,
  formatOffsetLabel,
  sanitizeClock
} from '@shared/defaults'
import { useApp } from '../lib/appContext'
import { Badge, FieldLabel, Segmented, Spinner, SwitchRow, Switch } from '../components/ui'

function Section({
  icon,
  title,
  description,
  children,
  tone
}: {
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
  tone?: string
}): React.JSX.Element {
  return (
    <section className={`settings-section ${tone ? `settings-${tone}` : ''}`}>
      <div className="settings-section-head">
        <div className="settings-section-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}

export function SettingsView(): React.JSX.Element {
  const { data, info, now, notify, navigate } = useApp()
  const settings = data.settings
  const [semesterStart, setSemesterStart] = useState(settings.semesterStart)
  const [totalWeeks, setTotalWeeks] = useState(settings.totalWeeks)
  const [periods, setPeriods] = useState<Period[]>(settings.periods)
  const [opacity, setOpacity] = useState(Math.round(settings.widgetOpacity * 100))
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setOpacity(Math.round(data.settings.widgetOpacity * 100))
  }, [data.settings.widgetOpacity])

  const semester = getSemesterWeek(semesterStart, totalWeeks, now)
  const pendingOffsets = new Set(settings.reminderOffsets)

  const update = async (
    patch: Partial<typeof settings>,
    message?: string,
    key = 'settings'
  ): Promise<void> => {
    if (busy) return
    setBusy(key)
    try {
      await window.classboard.settings.update(patch)
      if (message) notify(message, 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const saveSemester = async (): Promise<void> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semesterStart)) {
      notify('请选择第 1 周周一的日期', 'error')
      return
    }
    if (!Number.isFinite(totalWeeks) || totalWeeks < 1 || totalWeeks > 30) {
      notify('总周数应在 1 到 30 之间', 'error')
      return
    }
    await update({ semesterStart, totalWeeks }, '学期设置已保存', 'semester')
  }

  const savePeriods = async (): Promise<void> => {
    const cleaned = periods.map((period, index) => ({
      index: index + 1,
      start: sanitizeClock(period.start, DEFAULT_PERIODS[index]?.start ?? '08:00'),
      end: sanitizeClock(period.end, DEFAULT_PERIODS[index]?.end ?? '08:45')
    }))
    setPeriods(cleaned)
    await update({ periods: cleaned }, '作息时间已保存', 'periods')
  }

  const toggleOffset = async (offset: number): Promise<void> => {
    const next = new Set(settings.reminderOffsets)
    if (next.has(offset)) {
      if (next.size === 1) {
        notify('至少保留一个提醒节点', 'error')
        return
      }
      next.delete(offset)
    } else {
      next.add(offset)
    }
    await update(
      { reminderOffsets: [...next].sort((a, b) => b - a) },
      undefined,
      'reminders'
    )
  }

  const applyAutoLaunch = async (enabled: boolean): Promise<void> => {
    if (!info.launchAtLoginSupported) {
      notify('开发模式下不可用，安装版会自动生效', 'info')
      return
    }
    setBusy('auto-launch')
    try {
      const updated = await window.classboard.settings.applyAutoLaunch(enabled)
      const actual = updated.settings.autoLaunch
      notify(actual ? '已开启开机自启' : '已关闭开机自启', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '设置失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const runDataAction = async (
    key: string,
    work: () => Promise<{ canceled?: boolean; message?: string; warnings?: string[] } | void | { canceled: boolean }>,
    successFallback?: string
  ): Promise<void> => {
    if (busy) return
    setBusy(key)
    try {
      const result = await work()
      if (result && 'canceled' in result && result.canceled) return
      if (result && 'message' in result && result.message) {
        notify(result.message, result.warnings?.length ? 'info' : 'success')
        if (result.warnings?.length) {
          notify(result.warnings.slice(0, 2).join('；'), 'info')
        }
      } else if (successFallback) {
        notify(successFallback, 'success')
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const importHdu = async (): Promise<void> => {
    if (busy) return
    setBusy('import-hdu')
    try {
      const result = await window.classboard.data.importHduHtml()
      if (!result.canceled) {
        navigate('sync')
        notify('已读取 HTML，请核对后写入', 'success')
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const copyDataPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(info.dataDir)
      notify('数据目录已复制', 'success')
    } catch {
      notify(info.dataDir, 'info')
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <Settings2 size={15} />
            设置
          </div>
          <h1>让看板按你的节奏工作</h1>
          <p className="page-subtitle">所有设置和数据都保存在本机，不需要账号，也不会上传。</p>
        </div>
        <div className="page-actions">
          <Badge tone="jade">
            <ShieldCheck size={13} />
            本地存储
          </Badge>
        </div>
      </header>

      <div className="settings-layout">
        <Section
          icon={<CalendarDays size={19} />}
          title="学期与课表"
          description="周次是从第 1 周周一推算的，单双周和课程周次都会跟着变化。"
        >
          <div className="form-grid form-grid-2">
            <label className="form-field">
              <FieldLabel hint="必须是周一">第 1 周周一</FieldLabel>
              <input
                className="text-input"
                type="date"
                value={semesterStart}
                onChange={(event) => setSemesterStart(event.target.value)}
              />
            </label>
            <label className="form-field">
              <FieldLabel hint="1–30">学期总周数</FieldLabel>
              <input
                className="text-input"
                type="number"
                min={1}
                max={30}
                value={totalWeeks}
                onChange={(event) => setTotalWeeks(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="semester-inline-preview">
            <span className={`semester-preview-week ${semester.phase !== 'active' ? 'is-muted' : ''}`}>
              {semester.phase === 'before'
                ? '尚未开学'
                : semester.phase === 'after'
                  ? '学期已结束'
                  : formatWeekCount(semester.week)}
            </span>
            <span>{formatWeekRange(semester.weekStart)}</span>
            <button
              type="button"
              className="btn btn-soft btn-compact"
              disabled={busy !== null}
              onClick={() => void saveSemester()}
            >
              {busy === 'semester' ? <Spinner size={13} /> : null}
              保存学期
            </button>
          </div>

          <div className="settings-divider" />

          <div className="subsection-head">
            <div>
              <h3>作息时间</h3>
              <p>默认按杭电 12 节课的参考时间，可逐节修改。</p>
            </div>
            <div className="subsection-actions">
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setPeriods(DEFAULT_PERIODS.map((period) => ({ ...period })))}
              >
                <RotateCcw size={13} />
                恢复默认
              </button>
              <button
                type="button"
                className="btn btn-soft btn-compact"
                disabled={busy !== null}
                onClick={() => void savePeriods()}
              >
                {busy === 'periods' ? <Spinner size={13} /> : null}
                保存作息
              </button>
            </div>
          </div>
          <div className="period-editor">
            {periods.map((period, index) => (
              <div className="period-row" key={period.index}>
                <span className="period-index">第 {index + 1} 节</span>
                <input
                  className="time-input"
                  type="time"
                  value={period.start}
                  onChange={(event) =>
                    setPeriods((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, start: event.target.value } : item
                      )
                    )
                  }
                />
                <span className="period-dash">–</span>
                <input
                  className="time-input"
                  type="time"
                  value={period.end}
                  onChange={(event) =>
                    setPeriods((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, end: event.target.value } : item
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </Section>

        <Section
          icon={<BellRing size={19} />}
          title="提醒"
          description="提醒由本机调度，应用开着就能按时收到 Windows 通知。"
        >
          <div className="subsection-head compact">
            <div>
              <h3>作业提醒节点</h3>
              <p>可多选；至少保留一个。点击立即保存。</p>
            </div>
          </div>
          <div className="offset-chips">
            {[1440, 360, 60, 30, 10].map((offset) => {
              const active = pendingOffsets.has(offset)
              return (
                <button
                  type="button"
                  key={offset}
                  className={`offset-chip ${active ? 'is-active' : ''}`}
                  disabled={busy !== null}
                  onClick={() => void toggleOffset(offset)}
                >
                  {formatOffsetLabel(offset)}
                  {active ? <CheckCircle2 size={13} /> : null}
                </button>
              )
            })}
          </div>

          <div className="settings-divider" />

          <SwitchRow
            title="上课前提醒"
            description="在课程开始前收到一条短通知，避免走错教室。"
            checked={settings.classRemindersEnabled}
            onChange={(checked) =>
              void update({ classRemindersEnabled: checked }, undefined, 'class-reminder')
            }
          />
          {settings.classRemindersEnabled ? (
            <div className="inline-number-setting">
              <span>提前</span>
              <input
                className="number-input"
                type="number"
                min={1}
                max={120}
                value={settings.classReminderMinutes}
                onChange={(event) =>
                  void update(
                    { classReminderMinutes: Math.max(1, Math.min(120, Number(event.target.value))) },
                    undefined,
                    'class-reminder'
                  )
                }
              />
              <span>分钟</span>
            </div>
          ) : null}

          <SwitchRow
            title="每日摘要"
            description="当天第一次打开应用时，汇总课程和最近的作业。"
            checked={settings.dailySummaryEnabled}
            onChange={(checked) =>
              void update({ dailySummaryEnabled: checked }, undefined, 'daily-summary')
            }
          />

          <div className="settings-inline-actions">
            <button
              type="button"
              className="btn btn-soft btn-compact"
              onClick={async () => {
                const supported = await window.classboard.app.testNotification()
                notify(
                  supported ? '已发送测试通知，请查看 Windows 通知中心' : '当前系统不支持通知',
                  supported ? 'success' : 'error'
                )
              }}
            >
              <Bell size={14} />
              发送测试通知
            </button>
            <span className="settings-muted-note">
              <WifiOff size={13} />
              通知不依赖网络
            </span>
          </div>
        </Section>

        <Section
          icon={<Laptop size={19} />}
          title="启动与窗口"
          description="开机看到今日安排，同时让提醒在后台保持运行。"
        >
          <SwitchRow
            title="开机自启"
            description={
              info.launchAtLoginSupported
                ? '登录 Windows 后自动启动，并显示桌面小部件。'
                : '开发模式下不写入启动项；打包安装后可用。'
            }
            checked={settings.autoLaunch}
            disabled={!info.launchAtLoginSupported || busy !== null}
            onChange={(checked) => void applyAutoLaunch(checked)}
            trailing={info.launchAtLoginSupported ? null : <Badge tone="neutral">安装版可用</Badge>}
          />
          <SwitchRow
            title="启动时显示桌面小部件"
            description="手动打开应用时也显示右下角小部件。开机自启时始终显示。"
            checked={settings.launchShowWidget}
            onChange={(checked) =>
              void update({ launchShowWidget: checked }, undefined, 'launch-widget')
            }
          />
          <SwitchRow
            title="关闭窗口时隐藏到托盘"
            description="关闭后应用继续在托盘运行，提醒不会中断。关闭此项后，关闭窗口会直接退出。"
            checked={settings.closeToTray}
            onChange={(checked) => void update({ closeToTray: checked }, undefined, 'tray')}
          />
          <SwitchRow
            title="小部件始终置顶"
            description="让看板浮在其他窗口上方；也可以在桌面小部件标题栏随时切换。"
            checked={settings.alwaysOnTop}
            onChange={(checked) => void update({ alwaysOnTop: checked }, undefined, 'pin')}
          />

          <div className="opacity-row">
            <div>
              <div className="opacity-label">
                <span>小部件不透明度</span>
                <em>{opacity}%</em>
              </div>
              <input
                className="range-input"
                type="range"
                min={65}
                max={100}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                onPointerUp={() => void update({ widgetOpacity: opacity / 100 }, undefined, 'opacity')}
                onKeyUp={() => void update({ widgetOpacity: opacity / 100 }, undefined, 'opacity')}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => {
                window.classboard.window.resetWidgetPosition()
                notify('小部件已回到右下角', 'success')
              }}
            >
              <RefreshCw size={13} />
              重置位置
            </button>
          </div>
        </Section>

        <Section
          icon={<Palette size={19} />}
          title="外观"
          description="主题会同步应用到完整窗口和桌面小部件。"
        >
          <div className="theme-picker">
            <Segmented
              value={settings.theme}
              onChange={(value) => void update({ theme: value }, undefined, 'theme')}
              options={[
                { value: 'light', label: '浅色', icon: <Sun size={14} /> },
                { value: 'dark', label: '深色', icon: <Moon size={14} /> },
                { value: 'system', label: '跟随系统', icon: <Laptop size={14} /> }
              ]}
            />
          </div>
          <div className="settings-note">
            <Info size={14} />
            <span>小部件可以拖动到桌面任意位置，位置会被记住。</span>
          </div>
        </Section>

        <Section
          icon={<Database size={19} />}
          title="数据"
          description="JSON 备份包含课表、作业和设置；CSV 适合查看和批量编辑作业。"
        >
          <div className="data-path-row">
            <div>
              <span>数据目录</span>
              <code>{info.dataDir}</code>
            </div>
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => void copyDataPath()}>
              <Copy size={13} />
              复制
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => void runDataAction('open-folder', () => window.classboard.data.openDataFolder())}
            >
              <FolderOpen size={13} />
              打开
            </button>
          </div>

          <div className="data-action-grid">
            <button
              type="button"
              className="data-action"
              disabled={busy !== null}
              onClick={() =>
                void runDataAction(
                  'export-backup',
                  () => window.classboard.data.exportBackup(),
                  '备份已导出'
                )
              }
            >
              <Download size={17} />
              <span>导出完整备份</span>
              <em>JSON · 可恢复</em>
            </button>
            <button
              type="button"
              className="data-action"
              disabled={busy !== null}
              onClick={() =>
                void runDataAction(
                  'import-backup',
                  () => window.classboard.data.importBackup(),
                  '备份已恢复'
                )
              }
            >
              <Upload size={17} />
              <span>恢复备份</span>
              <em>覆盖当前数据</em>
            </button>
            <button
              type="button"
              className="data-action"
              disabled={busy !== null}
              onClick={() =>
                void runDataAction(
                  'export-csv',
                  () => window.classboard.data.exportCsv(),
                  'CSV 已导出'
                )
              }
            >
              <HardDrive size={17} />
              <span>导出作业 CSV</span>
              <em>适合 Excel</em>
            </button>
            <button
              type="button"
              className="data-action"
              disabled={busy !== null}
              onClick={() =>
                void runDataAction(
                  'import-csv',
                  () => window.classboard.data.importCsv(),
                  'CSV 已导入'
                )
              }
            >
              <Upload size={17} />
              <span>导入作业 CSV</span>
              <em>表头：标题, 截止</em>
            </button>
            <button type="button" className="data-action" disabled={busy !== null} onClick={() => void importHdu()}>
              <CalendarDays size={17} />
              <span>导入杭电 HTML</span>
              <em>离线兜底</em>
            </button>
            <button
              type="button"
              className="data-action"
              disabled={busy !== null}
              onClick={() =>
                void runDataAction('demo', () => window.classboard.data.loadDemo(), '示例数据已载入')
              }
            >
              <Settings2 size={17} />
              <span>载入示例数据</span>
              <em>用于体验界面</em>
            </button>
          </div>

          <div className="danger-zone">
            <div>
              <strong>清空课表和作业</strong>
              <span>设置保留；清空前的数据会自动备份。</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-danger-text btn-compact"
              disabled={busy !== null}
              onClick={() =>
                void runDataAction('clear', () => window.classboard.data.clearAll(), '数据已清空')
              }
            >
              <Trash2 size={14} />
              清空
            </button>
          </div>
        </Section>

        <Section icon={<Info size={19} />} title="关于" description="课表与DDL看板 · 本地优先的 Windows 学习看板">
          <div className="about-grid">
            <div>
              <span>版本</span>
              <strong>v{info.version}</strong>
            </div>
            <div>
              <span>运行方式</span>
              <strong>{info.isPackaged ? '安装版' : '开发模式'}</strong>
            </div>
            <div>
              <span>快捷键</span>
              <strong>Ctrl + Alt + D</strong>
            </div>
            <div>
              <span>数据</span>
              <strong>仅本机</strong>
            </div>
          </div>
          <p className="about-copy">
            提醒依赖 Windows 通知。若系统开启了专注助手或勿扰模式，通知可能被静默；看板内仍会保留逾期与临近状态。
          </p>
        </Section>
      </div>
    </div>
  )
}
