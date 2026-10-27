import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron'
import type { AppData, MainView, NavigateTarget, Settings } from '@shared/types'
import type { DataStore } from './store'
import { preloadPath, rendererHtmlPath } from './paths'

const WIDGET_WIDTH = 404
const WIDGET_HEIGHT = 646
const WIDGET_MARGIN = 22

type ShowMode = 'show' | 'inactive' | 'hidden'

export interface WindowManagerOptions {
  store: DataStore
  rendererUrl?: string
  iconPath: string
}

export class WindowManager {
  readonly store: DataStore
  private readonly rendererUrl?: string
  private readonly iconPath: string
  private mainWindow: BrowserWindow | null = null
  private widgetWindow: BrowserWindow | null = null
  private isQuitting = false
  private mainShouldShow = false
  private widgetShouldShow: ShowMode = 'hidden'
  private widgetPositionSaving = false
  private widgetPositionTimer: ReturnType<typeof setTimeout> | null = null
  private positionGuard = false
  private lastSettings: Settings
  private unsubscribeStore: (() => void) | null = null

  constructor(options: WindowManagerOptions) {
    this.store = options.store
    this.rendererUrl = options.rendererUrl
    this.iconPath = options.iconPath
    this.lastSettings = options.store.data.settings
    this.unsubscribeStore = this.store.subscribe((data) => this.handleDataChanged(data))
  }

  setQuitting(value = true): void {
    this.isQuitting = value
  }

  get quitting(): boolean {
    return this.isQuitting
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  getWidgetWindow(): BrowserWindow | null {
    return this.widgetWindow && !this.widgetWindow.isDestroyed() ? this.widgetWindow : null
  }

  private loadView(win: BrowserWindow, view: 'main' | 'widget' | 'sync', extra?: Record<string, string>): void {
    if (this.rendererUrl) {
      const url = new URL(this.rendererUrl)
      url.searchParams.set('view', view)
      for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value)
      void win.loadURL(url.toString())
    } else {
      void win.loadFile(rendererHtmlPath(), {
        query: { view, ...(extra ?? {}) }
      })
    }
  }

  private attachNavigationGuards(win: BrowserWindow): void {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      const devOrigin = this.rendererUrl ? new URL(this.rendererUrl).origin : ''
      const internal = url.startsWith('file://') || (devOrigin && url.startsWith(devOrigin))
      if (!internal) {
        event.preventDefault()
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      }
    })
  }

  ensureMain(show: boolean): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainShouldShow = this.mainShouldShow || show
      return this.mainWindow
    }
    const win = new BrowserWindow({
      width: 1220,
      height: 820,
      minWidth: 980,
      minHeight: 680,
      show: false,
      frame: false,
      title: '课表与DDL看板',
      backgroundColor: '#f6f2e8',
      autoHideMenuBar: true,
      icon: this.iconPath,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        webviewTag: false,
        backgroundThrottling: false
      }
    })
    this.mainWindow = win
    this.mainShouldShow = show
    this.attachNavigationGuards(win)
    win.setMenuBarVisibility(false)
    this.loadView(win, 'main')
    win.on('ready-to-show', () => {
      if (this.mainShouldShow && !win.isDestroyed()) {
        win.show()
        win.focus()
      }
    })
    win.on('close', (event) => {
      if (this.isQuitting) return
      if (this.store.data.settings.closeToTray) {
        event.preventDefault()
        win.hide()
      } else {
        this.isQuitting = true
        app.quit()
      }
    })
    win.on('closed', () => {
      this.mainWindow = null
      this.mainShouldShow = false
    })
    win.on('maximize', () => win.webContents.send('window:maximized', true))
    win.on('unmaximize', () => win.webContents.send('window:maximized', false))
    if (process.env.CLASSBOARD_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
    return win
  }

  ensureWidget(mode: ShowMode): BrowserWindow {
    if (this.widgetWindow && !this.widgetWindow.isDestroyed()) {
      this.widgetShouldShow = mode
      this.applyWidgetSettings(this.store.data.settings)
      if (mode === 'show') this.widgetWindow.show()
      else if (mode === 'inactive') this.widgetWindow.showInactive()
      else this.widgetWindow.hide()
      return this.widgetWindow
    }
    const win = new BrowserWindow({
      width: WIDGET_WIDTH,
      height: WIDGET_HEIGHT,
      minWidth: WIDGET_WIDTH,
      maxWidth: WIDGET_WIDTH,
      minHeight: WIDGET_HEIGHT,
      maxHeight: WIDGET_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      focusable: true,
      autoHideMenuBar: true,
      icon: this.iconPath,
      title: '课表与DDL看板',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        webviewTag: false,
        backgroundThrottling: false
      }
    })
    this.widgetWindow = win
    this.widgetShouldShow = mode
    this.attachNavigationGuards(win)
    win.setMenuBarVisibility(false)
    win.setAlwaysOnTop(this.store.data.settings.alwaysOnTop, 'floating')
    win.setSkipTaskbar(true)
    this.positionWidget(win, this.store.data.settings)
    this.loadView(win, 'widget')
    win.on('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.setOpacity(this.store.data.settings.widgetOpacity)
      if (this.widgetShouldShow === 'show') win.show()
      else if (this.widgetShouldShow === 'inactive') win.showInactive()
    })
    win.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault()
        win.hide()
      }
    })
    win.on('moved', () => {
      if (this.positionGuard) return
      this.scheduleWidgetPositionSave()
    })
    win.on('closed', () => {
      this.widgetWindow = null
    })
    return win
  }

  private positionWidget(win: BrowserWindow, settings: Settings): void {
    const saved = settings.widgetPosition
    const displays = screen.getAllDisplays()
    const valid =
      saved &&
      displays.some((display) => {
        const area = display.workArea
        return (
          saved.x + WIDGET_WIDTH > area.x + 24 &&
          saved.x < area.x + area.width - 24 &&
          saved.y + WIDGET_HEIGHT > area.y + 24 &&
          saved.y < area.y + area.height - 24
        )
      })
    let position: { x: number; y: number }
    if (valid && saved) {
      position = { x: saved.x, y: saved.y }
    } else {
      const area = screen.getPrimaryDisplay().workArea
      position = {
        x: Math.round(area.x + area.width - WIDGET_WIDTH - WIDGET_MARGIN),
        y: Math.round(area.y + area.height - WIDGET_HEIGHT - WIDGET_MARGIN)
      }
    }
    this.positionGuard = true
    win.setPosition(Math.round(position.x), Math.round(position.y), false)
    setTimeout(() => {
      this.positionGuard = false
    }, 500)
  }

  private scheduleWidgetPositionSave(): void {
    if (this.widgetPositionSaving) return
    this.widgetPositionSaving = true
    if (this.widgetPositionTimer) clearTimeout(this.widgetPositionTimer)
    this.widgetPositionTimer = setTimeout(() => {
      this.widgetPositionTimer = null
      this.widgetPositionSaving = false
      const win = this.getWidgetWindow()
      if (!win) return
      const [x, y] = win.getPosition()
      const current = this.store.data.settings.widgetPosition
      if (current && Math.abs(current.x - x) < 2 && Math.abs(current.y - y) < 2) return
      void this.store.updateSettings({ widgetPosition: { x, y } })
    }, 450)
  }

  private applyWidgetSettings(settings: Settings): void {
    const win = this.getWidgetWindow()
    if (!win) return
    win.setAlwaysOnTop(settings.alwaysOnTop, 'floating')
    if (win.isVisible()) win.setOpacity(settings.widgetOpacity)
  }

  private handleDataChanged(data: AppData): void {
    const previous = this.lastSettings
    const next = data.settings
    this.lastSettings = next
    if (
      previous.alwaysOnTop !== next.alwaysOnTop ||
      previous.widgetOpacity !== next.widgetOpacity
    ) {
      this.applyWidgetSettings(next)
    }
    this.broadcast('data:changed', data)
  }

  broadcast(channel: string, payload?: unknown): void {
    for (const win of [this.mainWindow, this.widgetWindow]) {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  }

  showMain(target?: NavigateTarget): void {
    const win = this.ensureMain(true)
    const send = (): void => {
      if (target && !win.isDestroyed()) win.webContents.send('navigate', target)
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send)
    } else {
      send()
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  showMainView(view: MainView): void {
    this.showMain({ view })
  }

  showWidget(mode: ShowMode = 'show'): void {
    this.ensureWidget(mode)
  }

  hideWidget(): void {
    const win = this.getWidgetWindow()
    if (win) win.hide()
  }

  closeWindow(win: BrowserWindow): void {
    if (win === this.widgetWindow) {
      win.hide()
      return
    }
    win.close()
  }

  toggleMaximize(win: BrowserWindow): void {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }

  async togglePin(): Promise<boolean> {
    const next = !this.store.data.settings.alwaysOnTop
    await this.store.updateSettings({ alwaysOnTop: next })
    this.applyWidgetSettings(this.store.data.settings)
    return next
  }

  resetWidgetPosition(): void {
    void this.store.updateSettings({ widgetPosition: null })
    const win = this.getWidgetWindow()
    if (win) this.positionWidget(win, { ...this.store.data.settings, widgetPosition: null })
  }

  widgetBounds(): Rectangle | null {
    const win = this.getWidgetWindow()
    return win ? win.getBounds() : null
  }

  isWidgetVisible(): boolean {
    const win = this.getWidgetWindow()
    return Boolean(win && win.isVisible())
  }

  destroy(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    if (this.widgetPositionTimer) clearTimeout(this.widgetPositionTimer)
  }

  dataDir(): string {
    return app.getPath('userData')
  }

  defaultIconPath(): string {
    return this.iconPath
  }
}
