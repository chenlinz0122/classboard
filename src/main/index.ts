import { app, globalShortcut, Menu, session } from 'electron'
import { APP_ID } from '@shared/defaults'
import {
  configureAppPaths,
  dataFilePath,
  backupDirPath,
  resourcePath
} from './paths'
import { DataStore } from './store'
import { WindowManager } from './windows'
import { ReminderScheduler } from './reminderScheduler'
import { SyncManager } from './syncManager'
import { TrayManager } from './tray'
import { registerIpcHandlers } from './ipc'
import { isAutostartLaunch } from './autostart'
import { applyAutoLaunchPreference, syncAutoLaunchOnStartup } from './autoLaunchController'
import { logLine } from './log'

configureAppPaths()
app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath)

let store: DataStore | null = null
let windows: WindowManager | null = null
let scheduler: ReminderScheduler | null = null
let sync: SyncManager | null = null
let tray: TrayManager | null = null
let secondInstancePending = false
let shutdownRequested = false
let shutdownComplete = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (windows) windows.showMain({ view: 'today' })
    else secondInstancePending = true
  })

  app.on('window-all-closed', () => {
    // Keep the tray process alive so reminders continue to fire.
  })

  app.on('activate', () => {
    windows?.showMain({ view: 'today' })
  })

  app.on('before-quit', (event) => {
    if (shutdownComplete) return
    event.preventDefault()
    if (shutdownRequested) return
    shutdownRequested = true
    windows?.setQuitting(true)
    scheduler?.stop()
    sync?.destroy()
    tray?.destroy()
    globalShortcut.unregisterAll()
    const currentStore = store
    void (currentStore ? currentStore.flush() : Promise.resolve()).finally(() => {
      shutdownComplete = true
      app.quit()
    })
  })

  app.on('will-quit', () => {
    if (!shutdownComplete) {
      shutdownComplete = true
      app.quit()
    }
  })

  process.on('uncaughtException', (error) => {
    logLine(`未捕获的主进程异常：${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`)
  })
  process.on('unhandledRejection', (reason) => {
    logLine(`未处理的 Promise 拒绝：${reason instanceof Error ? reason.message : String(reason)}`)
  })

  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    store = new DataStore(dataFilePath(), backupDirPath())
    await store.init()
    if (process.env.CLASSBOARD_DEMO === '1' && !store.data.settings.onboardingDone) {
      await store.loadDemo()
    }

    windows = new WindowManager({
      store,
      rendererUrl: process.env['ELECTRON_RENDERER_URL'],
      iconPath: resourcePath('icon.png')
    })

    scheduler = new ReminderScheduler(store, windows)
    sync = new SyncManager(store, windows)

    tray = new TrayManager({
      store,
      windows,
      openSync: (platform) => {
        void sync?.open(platform)
      },
      toggleAutoLaunch: async () => {
        if (!store) return false
        return applyAutoLaunchPreference(store, !store.data.settings.autoLaunch)
      },
      quit: () => {
        windows?.setQuitting(true)
        app.quit()
      }
    })
    tray.create()

    registerIpcHandlers({ store, windows, scheduler, sync })

    await syncAutoLaunchOnStartup(store)
    scheduler.start()

    const firstRun = !store.data.settings.onboardingDone
    if (firstRun) {
      windows.showMain({ view: 'today' })
    } else {
      const autoStart = isAutostartLaunch()
      if (autoStart) {
        windows.showWidget('inactive')
      } else {
        if (store.data.settings.launchShowWidget) windows.showWidget('show')
        windows.showMain({ view: 'today' })
      }
    }

    try {
      const registered = globalShortcut.register('CommandOrControl+Alt+D', () => {
        windows?.showMain({ view: 'today', focusQuickAdd: true })
      })
      if (!registered) console.warn('快捷键 Ctrl+Alt+D 已被其他程序占用')
    } catch (error) {
      console.warn('注册快捷键失败', error)
    }

    if (secondInstancePending) {
      secondInstancePending = false
      windows.showMain({ view: 'today' })
    }

    logLine(`ClassBoard ready · ${app.getVersion()} · packaged=${app.isPackaged} · data=${dataFilePath()}`)
  })
}
