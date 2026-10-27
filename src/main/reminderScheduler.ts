import { powerMonitor } from 'electron'
import type { AppData, NavigateTarget } from '@shared/types'
import type { DataStore } from './store'
import type { WindowManager } from './windows'
import { buildReminderPlan, type PlannedNotification } from './reminderPlan'
import { notificationsSupported, showToast } from './notifications'

const TICK_MS = 30_000
const FIRST_CHECK_DELAY_MS = 2_500
const BETWEEN_TOASTS_MS = 900

export class ReminderScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private firstTimer: ReturnType<typeof setTimeout> | null = null
  private askTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private stopped = false
  private classSent = new Set<string>()
  private unsupportedWarned = false

  constructor(
    private readonly store: DataStore,
    private readonly windows: WindowManager
  ) {}

  start(): void {
    if (this.timer) return
    this.stopped = false
    this.firstTimer = setTimeout(() => void this.checkNow(), FIRST_CHECK_DELAY_MS)
    this.timer = setInterval(() => void this.checkNow(), TICK_MS)
    powerMonitor.on('resume', this.onResume)
    powerMonitor.on('unlock-screen', this.onResume)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    if (this.firstTimer) clearTimeout(this.firstTimer)
    if (this.askTimer) clearTimeout(this.askTimer)
    this.timer = null
    this.firstTimer = null
    this.askTimer = null
    powerMonitor.off('resume', this.onResume)
    powerMonitor.off('unlock-screen', this.onResume)
  }

  private onResume = (): void => {
    this.requestCheck(1200)
  }

  requestCheck(delay = 350): void {
    if (this.stopped) return
    if (this.askTimer) clearTimeout(this.askTimer)
    this.askTimer = setTimeout(() => {
      this.askTimer = null
      void this.checkNow()
    }, delay)
  }

  async checkNow(): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    try {
      const data = this.store.data
      const plan = buildReminderPlan(data, new Date(), this.classSent)
      if (plan.actions.length === 0) return
      if (!notificationsSupported()) {
        if (!this.unsupportedWarned) {
          this.unsupportedWarned = true
          console.warn('系统通知不可用，跳过本轮外发提醒。')
        }
        return
      }
      for (const action of plan.actions) {
        if (this.stopped) break
        await this.deliver(action, data, plan.dailyDate)
        await delay(BETWEEN_TOASTS_MS)
        if (this.stopped) break
      }
    } catch (error) {
      console.error('提醒调度失败', error)
    } finally {
      this.running = false
    }
  }

  private async deliver(
    action: PlannedNotification,
    _data: AppData,
    dailyDate?: string
  ): Promise<void> {
    const shown = showToast({
      title: action.title,
      body: action.body,
      urgency: action.priority === 'high' ? 'critical' : 'normal',
      onClick: () => this.focus(action.navigation)
    })
    if (!shown) return

    if (action.kind === 'class') {
      this.classSent.add(action.key.replace(/^class:/, ''))
      return
    }
    if (action.kind === 'daily') {
      if (dailyDate) await this.store.markDailySummary(dailyDate)
      return
    }
    if (action.deadlineId) {
      await this.store.markDeadlineNotifications(action.deadlineId, action.sentKeys ?? [action.key])
    }
  }

  private focus(target?: NavigateTarget): void {
    this.windows.showMain(target ?? { view: 'today' })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
