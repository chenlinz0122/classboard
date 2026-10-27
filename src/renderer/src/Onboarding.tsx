import { useState } from 'react'
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  CloudDownload,
  Sparkles,
  ShieldCheck
} from 'lucide-react'
import {
  formatDateWithWeekday,
  formatWeekCount,
  formatWeekRange,
  getSemesterWeek
} from '@shared/date'
import { useApp } from './lib/appContext'
import { BrandMark, SwitchRow, Badge } from './components/ui'

export function Onboarding(): React.JSX.Element {
  const { data, info, now, notify, openSync } = useApp()
  const [semesterStart, setSemesterStart] = useState(data.settings.semesterStart)
  const [totalWeeks, setTotalWeeks] = useState(data.settings.totalWeeks)
  const [autoLaunch, setAutoLaunch] = useState(data.settings.autoLaunch)
  const [busy, setBusy] = useState<'enter' | 'sync' | 'demo' | null>(null)
  const semester = getSemesterWeek(semesterStart, totalWeeks, now)

  const save = async (): Promise<void> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semesterStart)) {
      throw new Error('请选择第 1 周周一的日期')
    }
    if (!Number.isFinite(totalWeeks) || totalWeeks < 1 || totalWeeks > 30) {
      throw new Error('总周数应在 1 到 30 之间')
    }
    await window.classboard.settings.update({
      semesterStart,
      totalWeeks,
      autoLaunch,
      onboardingDone: true
    })
  }

  const enter = async (): Promise<void> => {
    setBusy('enter')
    try {
      await save()
      window.classboard.window.showWidget()
      notify('欢迎使用课表与DDL看板', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const syncHdu = async (): Promise<void> => {
    setBusy('sync')
    try {
      await save()
      openSync('hdu')
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const useDemo = async (): Promise<void> => {
    setBusy('demo')
    try {
      await window.classboard.data.loadDemo()
      window.classboard.window.showWidget()
      notify('示例数据已载入，可以随意修改', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '载入示例失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="onboarding">
      <section className="onboarding-hero">
        <div className="onboarding-brand">
          <BrandMark size={34} />
          <div>
            <strong>课表与DDL看板</strong>
            <span>CLASSBOARD · LOCAL FIRST</span>
          </div>
        </div>

        <div className="onboarding-copy">
          <div className="onboarding-kicker">
            <ShieldCheck size={14} />
            本地离线 · 不保存账号密码
          </div>
          <h1>
            让每个 DDL，
            <br />
            在截止前找到你。
          </h1>
          <p>
            一个常驻桌面的小看板：今天上什么课、哪些作业快到期，都在一眼之内。提醒由 Windows
            在本机发出。
          </p>
          <div className="onboarding-feature-list">
            <div>
              <span><CalendarDays size={16} /></span>
              <div>
                <strong>今天的课，不用翻教务</strong>
                <em>周课表、单双周、教室和教师都会保留。</em>
              </div>
            </div>
            <div>
              <span><BellRing size={16} /></span>
              <div>
                <strong>DDL 之前，提前叫你</strong>
                <em>1 天 / 6 小时 / 1 小时可组合，支持稍后提醒。</em>
              </div>
            </div>
            <div>
              <span><ShieldCheck size={16} /></span>
              <div>
                <strong>只属于你的本地数据</strong>
                <em>课表、作业和提醒全在本机，不上传第三方。</em>
              </div>
            </div>
          </div>
        </div>

        <div className="onboarding-preview" aria-hidden="true">
          <div className="preview-window">
            <div className="preview-window-head">
              <span className="preview-mark">课</span>
              <span>{formatDateWithWeekday(now)}</span>
              <Badge tone="jade">示例</Badge>
            </div>
            <div className="preview-next">
              <div>
                <span>下一节 · 13:30</span>
                <strong>数据结构</strong>
                <em>6教-206 · 王老师</em>
              </div>
              <span className="preview-count">42 分钟后</span>
            </div>
            <div className="preview-timeline">
              <div className="is-done">
                <span>08:05</span>
                <i />
                <em>高等数学</em>
              </div>
              <div className="is-live">
                <span>10:00</span>
                <i />
                <em>大学英语</em>
              </div>
              <div>
                <span>13:30</span>
                <i />
                <em>数据结构</em>
              </div>
            </div>
            <div className="preview-ddl">
              <div>
                <i />
                <span>计组实验 3</span>
                <em>明天 23:59</em>
              </div>
              <div>
                <i />
                <span>大物实验报告</span>
                <em>周五 18:00</em>
              </div>
            </div>
            <div className="preview-quick">＋ 记一个作业…</div>
          </div>
          <div className="preview-note">
            <Sparkles size={14} />
            这是桌面小部件的样子
          </div>
        </div>
      </section>

      <section className="onboarding-panel">
        <div className="onboarding-card">
          <div className="onboarding-step">
            <span>01</span>
            第一次使用 · 约 1 分钟
          </div>
          <h2>先把学期对齐</h2>
          <p>看板会用第 1 周周一推算当前周次，并把单双周课程排进正确的位置。</p>

          <div className="form-grid form-grid-2 onboarding-fields">
            <label className="form-field">
              <span className="field-label"><span>第 1 周周一</span></span>
              <input
                className="text-input"
                type="date"
                value={semesterStart}
                onChange={(event) => setSemesterStart(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span className="field-label"><span>学期总周数</span></span>
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

          <div className="onboarding-week-preview">
            <div>
              <span>{formatWeekCount(semester.week)}</span>
              <em>{formatWeekRange(semester.weekStart)}</em>
            </div>
            <span className="onboarding-week-dot" />
            <span>
              {semester.phase === 'before'
                ? `${semester.daysUntilStart} 天后开学`
                : semester.phase === 'after'
                  ? '学期已结束，可随时调整'
                  : '当前教学周已自动计算'}
            </span>
          </div>

          <div className="onboarding-switch">
            <SwitchRow
              title="开机自动启动"
              description={
                info.launchAtLoginSupported
                  ? '登录 Windows 后自动显示桌面小部件，提醒也会持续工作。'
                  : '开发模式下不写入启动项，安装版可用。'
              }
              checked={autoLaunch}
              onChange={setAutoLaunch}
              trailing={info.launchAtLoginSupported ? null : <Badge tone="neutral">安装版可用</Badge>}
            />
          </div>

          <div className="onboarding-actions">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy !== null}
              onClick={() => void syncHdu()}
            >
              <CloudDownload size={17} />
              {busy === 'sync' ? '正在打开登录窗口…' : '同步杭电课表'}
            </button>
            <button
              type="button"
              className="btn btn-soft btn-block"
              disabled={busy !== null}
              onClick={() => void enter()}
            >
              {busy === 'enter' ? '正在准备…' : '先进入看板'}
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="onboarding-meta">
            <span>
              <Check size={13} />
              同步只在此时联网
            </span>
            <span>
              <Check size={13} />
              内置官方登录页
            </span>
            <span>
              <Check size={13} />
              不保存密码
            </span>
          </div>

          <button type="button" className="onboarding-demo" disabled={busy !== null} onClick={() => void useDemo()}>
            <Sparkles size={14} />
            {busy === 'demo' ? '正在载入…' : '先看看示例数据'}
          </button>

          <div className="onboarding-footnote">
            作业来源：手动快速添加、学习通、PTA、雨课堂，或从 JSON / CSV 导入。
          </div>
        </div>
      </section>
    </div>
  )
}
