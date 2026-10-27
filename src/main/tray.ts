import { Menu, Tray, nativeImage } from 'electron'
import type { SyncPlatform } from '@shared/types'
import type { DataStore } from './store'
import type { WindowManager } from './windows'
import { getTodayClasses } from '@shared/schedule'
import { resourcePath } from './paths'

export interface TrayManagerOptions {
  store: DataStore
  windows: WindowManager
  openSync: (platform: SyncPlatform) => void
  toggleAutoLaunch: () => Promise<boolean>
  quit: () => void
}

export class TrayManager {
  private tray: Tray | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null

  constructor(private readonly options: TrayManagerOptions) {}

  create(): void {
    const icon = nativeImage.createFromPath(resourcePath('tray.png'))
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createFromPath(resourcePath('icon.png')) : icon)
    this.tray.setToolTip('课表与DDL看板')
    this.tray.on('click', () => {
      if (this.options.windows.isWidgetVisible()) this.options.windows.showMain({ view: 'today' })
      else this.options.windows.showWidget('show')
    })
    this.tray.on('double-click', () => this.options.windows.showMain({ view: 'today' }))
    this.rebuild()
    this.unsubscribe = this.options.store.subscribe(() => this.scheduleRebuild())
  }

  private scheduleRebuild(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      this.rebuild()
    }, 250)
  }

  private rebuild(): void {
    if (!this.tray) return
    const data = this.options.store.data
    const classes = getTodayClasses(data.courses, data.settings, new Date())
    const pending = data.deadlines.filter((deadline) => !deadline.completedAt).length
    const todayLabel =
      classes.length > 0
        ? `今天 ${classes.length} 节课 · ${pending} 个待交`
        : `今天没课 · ${pending} 个待交`
    const autoLaunch = this.options.store.data.settings.autoLaunch
    const menu = Menu.buildFromTemplate([
      {
        label: '打开看板',
        click: () => this.options.windows.showMain({ view: 'today' })
      },
      {
        label: '显示桌面小部件',
        click: () => this.options.windows.showWidget('show')
      },
      {
        label: '快速记作业',
        click: () => this.options.windows.showMain({ view: 'today', focusQuickAdd: true })
      },
      { type: 'separator' },
      { label: todayLabel, enabled: false },
      { type: 'separator' },
      {
        label: '同步',
        submenu: [
          { label: '杭电教务课表…', click: () => this.options.openSync('hdu') },
          { label: '学习通作业…', click: () => this.options.openSync('chaoxing') },
          { label: 'PTA 题目集…', click: () => this.options.openSync('pta') },
          { label: '雨课堂作业…', click: () => this.options.openSync('yuketang') }
        ]
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autoLaunch,
        click: () => {
          void this.options.toggleAutoLaunch().then(() => this.rebuild())
        }
      },
      {
        label: '设置',
        click: () => this.options.windows.showMain({ view: 'settings' })
      },
      { type: 'separator' },
      { label: '退出课表与DDL看板', click: () => this.options.quit() }
    ])
    this.tray.setContextMenu(menu)
    this.tray.setToolTip(`课表与DDL看板 · ${todayLabel}`)
  }

  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.tray?.destroy()
    this.tray = null
  }
}
