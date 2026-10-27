import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import type { MessageBoxOptions, OpenDialogOptions, SaveDialogOptions } from 'electron'
import type {
  AppInfo,
  AssignmentPlatform,
  Bootstrap,
  CourseDraft,
  CoursePatch,
  DeadlineDraft,
  DeadlinePatch,
  ImportResult,
  NavigateTarget,
  PlatformAssignment,
  Settings,
  SyncPlatform
} from '@shared/types'
import { normalizeData, type DataStore } from './store'
import type { WindowManager } from './windows'
import type { ReminderScheduler } from './reminderScheduler'
import type { SyncManager } from './syncManager'
import { getAutoLaunchEnabled, launchAtLoginSupported } from './autostart'
import { applyAutoLaunchPreference } from './autoLaunchController'
import { notificationsSupported, showTestNotification } from './notifications'
import { parseCsv, stringifyCsv } from './csv'
import { parseDueText } from '@shared/parseQuickAdd'

interface IpcContext {
  store: DataStore
  windows: WindowManager
  scheduler: ReminderScheduler
  sync: SyncManager
}

const SETTINGS_KEYS = new Set([
  'semesterStart',
  'totalWeeks',
  'periods',
  'reminderOffsets',
  'classRemindersEnabled',
  'classReminderMinutes',
  'dailySummaryEnabled',
  'closeToTray',
  'autoLaunch',
  'alwaysOnTop',
  'widgetOpacity',
  'theme',
  'launchShowWidget',
  'onboardingDone'
])

function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    dataDir: app.getPath('userData'),
    notificationSupported: notificationsSupported(),
    autoLaunchEnabled: getAutoLaunchEnabled(),
    launchAtLoginSupported: launchAtLoginSupported()
  }
}

function windowForDialog(context: IpcContext): BrowserWindow | null {
  const win = context.windows.getMainWindow()
  return win && !win.isDestroyed() ? win : null
}

function showOpenDialog(context: IpcContext, options: OpenDialogOptions) {
  const parent = windowForDialog(context)
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)
}

function showSaveDialog(context: IpcContext, options: SaveDialogOptions) {
  const parent = windowForDialog(context)
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)
}

function showMessageBox(context: IpcContext, options: MessageBoxOptions) {
  const parent = windowForDialog(context)
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
}

function asPlatform(value: unknown): SyncPlatform {
  if (value === 'hdu' || value === 'chaoxing' || value === 'yuketang' || value === 'pta') return value
  throw new Error('未知同步平台')
}

function pickSettingsPatch(input: unknown): Partial<Settings> {
  if (typeof input !== 'object' || input === null) return {}
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (SETTINGS_KEYS.has(key)) patch[key] = value
  }
  return patch as Partial<Settings>
}

function formatCsvDue(dueAt: string | null | undefined): string {
  if (!dueAt) return ''
  const date = new Date(dueAt)
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function registerIpcHandlers(context: IpcContext): void {
  const { store, windows, scheduler, sync } = context

  const afterMutation = (): void => {
    scheduler.requestCheck(600)
  }

  ipcMain.handle('app:bootstrap', async (): Promise<Bootstrap> => ({
    data: store.data,
    app: appInfo(),
    initialSync: sync.getState()
  }))

  ipcMain.handle('app:test-notification', async () => {
    return showTestNotification(() => windows.showMain({ view: 'today' }))
  })

  ipcMain.handle('app:get-auto-launch', async () => getAutoLaunchEnabled())

  ipcMain.handle('app:open-external', async (_event, raw: unknown) => {
    if (typeof raw !== 'string') throw new Error('链接无效')
    const url = new URL(raw)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('不支持的链接类型')
    await shell.openExternal(url.toString())
  })

  ipcMain.handle('app:quit', async () => {
    windows.setQuitting(true)
    app.quit()
  })

  ipcMain.handle('deadlines:create', async (_event, draft: DeadlineDraft) => {
    if (!draft || typeof draft.title !== 'string' || !draft.title.trim()) {
      throw new Error('作业标题不能为空')
    }
    const created = await store.addDeadline(draft)
    afterMutation()
    return created
  })

  ipcMain.handle('deadlines:update', async (_event, id: unknown, patch: DeadlinePatch) => {
    if (typeof id !== 'string') throw new Error('无效的作业 ID')
    if (!patch || typeof patch !== 'object') throw new Error('无效的更新内容')
    if (patch.title !== undefined && !String(patch.title).trim()) throw new Error('作业标题不能为空')
    const updated = await store.updateDeadline(id, patch)
    afterMutation()
    return updated
  })

  ipcMain.handle('deadlines:remove', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的作业 ID')
    await store.removeDeadline(id)
    afterMutation()
  })

  ipcMain.handle('deadlines:toggle', async (_event, id: unknown, completed?: boolean) => {
    if (typeof id !== 'string') throw new Error('无效的作业 ID')
    const result = await store.toggleDeadline(id, typeof completed === 'boolean' ? completed : undefined)
    afterMutation()
    return result
  })

  ipcMain.handle('deadlines:snooze', async (_event, id: unknown, minutes: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的作业 ID')
    const value = Number(minutes)
    if (!Number.isFinite(value) || value <= 0) throw new Error('无效的稍后提醒时间')
    const result = await store.snoozeDeadline(id, value)
    afterMutation()
    return result
  })

  ipcMain.handle('courses:create', async (_event, draft: CourseDraft) => {
    if (!draft || typeof draft.name !== 'string' || !draft.name.trim()) throw new Error('课程名不能为空')
    const created = await store.addCourse(draft)
    afterMutation()
    return created
  })

  ipcMain.handle('courses:update', async (_event, id: unknown, patch: CoursePatch) => {
    if (typeof id !== 'string') throw new Error('无效的课程 ID')
    if (!patch || typeof patch !== 'object') throw new Error('无效的更新内容')
    const result = await store.updateCourse(id, patch)
    afterMutation()
    return result
  })

  ipcMain.handle('courses:remove', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的课程 ID')
    await store.removeCourse(id)
    afterMutation()
  })

  ipcMain.handle('settings:update', async (_event, rawPatch: unknown) => {
    const patch = pickSettingsPatch(rawPatch)
    const autoLaunchRequested = Object.prototype.hasOwnProperty.call(patch, 'autoLaunch')
      ? Boolean(patch.autoLaunch)
      : undefined
    const { autoLaunch: _ignored, ...rest } = patch
    if (Object.keys(rest).length > 0) await store.updateSettings(rest)
    if (autoLaunchRequested !== undefined) {
      await applyAutoLaunchPreference(store, autoLaunchRequested)
    }
    return store.data
  })

  ipcMain.handle('settings:apply-auto-launch', async (_event, enabled: unknown) => {
    await applyAutoLaunchPreference(store, Boolean(enabled))
    return store.data
  })

  ipcMain.handle('window:minimize', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) windows.toggleMaximize(win)
  })

  ipcMain.handle('window:close', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) windows.closeWindow(win)
  })

  ipcMain.handle('window:show-main', async (_event, target?: NavigateTarget) => {
    const safeTarget =
      target && typeof target === 'object' && typeof target.view === 'string'
        ? target
        : { view: 'today' as const }
    windows.showMain(safeTarget)
  })

  ipcMain.handle('window:show-widget', async () => {
    windows.showWidget('show')
  })

  ipcMain.handle('window:hide-widget', async () => {
    windows.hideWidget()
  })

  ipcMain.handle('window:toggle-pin', async () => windows.togglePin())

  ipcMain.handle('window:reset-widget-position', async () => {
    windows.resetWidgetPosition()
  })

  ipcMain.handle('data:export-backup', async () => {
    const date = new Date()
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
      date.getDate()
    ).padStart(2, '0')}`
    const picked = await showSaveDialog(context, {
      title: '导出完整备份',
      defaultPath: `ClassBoard-backup-${stamp}.json`,
      filters: [{ name: 'ClassBoard 备份', extensions: ['json'] }]
    })
    if (picked.canceled || !picked.filePath) return { canceled: true }
    await fs.writeFile(picked.filePath, JSON.stringify(store.data, null, 2), 'utf8')
    return { canceled: false, path: picked.filePath }
  })

  ipcMain.handle('data:import-backup', async (): Promise<ImportResult> => {
    const picked = await showOpenDialog(context, {
      title: '恢复 ClassBoard 备份',
      properties: ['openFile'],
      filters: [{ name: 'ClassBoard 备份', extensions: ['json'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true, coursesAdded: 0, deadlinesAdded: 0, warnings: [], message: '已取消' }
    }
    const text = await fs.readFile(picked.filePaths[0], 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('备份文件不是有效 JSON')
    }
    const data = normalizeData(parsed)
    const confirm = await showMessageBox(context, {
      type: 'warning',
      title: '恢复备份',
      message: `将用备份覆盖当前数据：${data.courses.length} 门课程、${data.deadlines.length} 条作业。`,
      detail: '当前数据会自动备份到 backups 目录。是否继续？',
      buttons: ['取消', '恢复'],
      defaultId: 0,
      cancelId: 0
    })
    if (confirm.response !== 1) {
      return { canceled: true, coursesAdded: 0, deadlinesAdded: 0, warnings: [], message: '已取消' }
    }
    await store.replaceData(data, 'before-import-backup')
    scheduler.requestCheck(1000)
    return {
      canceled: false,
      coursesAdded: data.courses.length,
      deadlinesAdded: data.deadlines.length,
      warnings: [],
      message: `已恢复 ${data.courses.length} 门课程、${data.deadlines.length} 条作业`
    }
  })

  ipcMain.handle('data:export-csv', async () => {
    const rows: string[][] = [['课程', '作业', '截止时间', '备注', '状态', '来源']]
    const sorted = [...store.data.deadlines].sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      return aDue - bDue
    })
    for (const deadline of sorted) {
      rows.push([
        deadline.courseName ?? '',
        deadline.title,
        formatCsvDue(deadline.dueAt),
        deadline.notes ?? '',
        deadline.completedAt ? '已完成' : '未完成',
        deadline.source
      ])
    }
    const picked = await showSaveDialog(context, {
      title: '导出作业 CSV',
      defaultPath: `ClassBoard-作业-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
    })
    if (picked.canceled || !picked.filePath) return { canceled: true }
    await fs.writeFile(picked.filePath, `\uFEFF${stringifyCsv(rows)}`, 'utf8')
    return { canceled: false, path: picked.filePath }
  })

  ipcMain.handle('data:import-csv', async (): Promise<ImportResult> => {
    const picked = await showOpenDialog(context, {
      title: '导入作业 CSV',
      properties: ['openFile'],
      filters: [{ name: 'CSV 文件', extensions: ['csv', 'txt'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true, coursesAdded: 0, deadlinesAdded: 0, warnings: [], message: '已取消' }
    }
    const text = await fs.readFile(picked.filePaths[0], 'utf8')
    const rows = parseCsv(text)
    if (rows.length === 0) throw new Error('CSV 内容为空')
    const normalizedHeader = rows[0].map((cell) => cell.trim().toLowerCase())
    const headerMap: Record<string, number> = {}
    const aliases: Record<string, string[]> = {
      title: ['title', '标题', '作业', '作业名称', '任务', '任务名称'],
      due: ['due', '截止', '截止时间', 'deadline', 'ddl'],
      course: ['course', '课程', '课程名'],
      notes: ['notes', '备注', '说明', 'note']
    }
    for (const [field, names] of Object.entries(aliases)) {
      const found = normalizedHeader.findIndex((header) => names.includes(header))
      if (found >= 0) headerMap[field] = found
    }
    const hasHeader = Object.keys(headerMap).length > 0
    const dataRows = hasHeader ? rows.slice(1) : rows
    const titleIndex = headerMap.title ?? 0
    const dueIndex = headerMap.due ?? 1
    const courseIndex = headerMap.course ?? 2
    const notesIndex = headerMap.notes ?? 3
    const warnings: string[] = []
    let added = 0
    let skipped = 0

    for (let index = 0; index < dataRows.length; index += 1) {
      const row = dataRows[index]
      const title = (row[titleIndex] ?? '').trim()
      if (!title) continue
      const dueText = (row[dueIndex] ?? '').trim()
      if (!dueText) {
        skipped += 1
        warnings.push(`第 ${index + (hasHeader ? 2 : 1)} 行缺少截止时间`)
        continue
      }
      const due = parseDueText(dueText, new Date())
      if (!due.dueAt) {
        skipped += 1
        warnings.push(`第 ${index + (hasHeader ? 2 : 1)} 行截止时间无法识别：${dueText}`)
        continue
      }
      const courseName = (row[courseIndex] ?? '').trim()
      const course = courseName
        ? store.data.courses.find((item) => item.name.trim() === courseName)
        : undefined
      await store.addDeadline({
        title,
        dueAt: due.dueAt,
        courseId: course?.id,
        courseName: courseName || undefined,
        notes: (row[notesIndex] ?? '').trim() || undefined,
        source: 'import'
      })
      added += 1
    }
    scheduler.requestCheck(800)
    return {
      canceled: false,
      coursesAdded: 0,
      deadlinesAdded: added,
      warnings: [...warnings, ...(skipped > 0 ? [`跳过 ${skipped} 行`] : [])],
      message: `已导入 ${added} 条作业`
    }
  })

  ipcMain.handle('data:import-hdu-html', async () => sync.importHduHtml())

  ipcMain.handle('data:open-data-folder', async () => {
    const error = await shell.openPath(app.getPath('userData'))
    if (error) throw new Error(error)
  })

  ipcMain.handle('data:clear-all', async () => {
    const confirm = await showMessageBox(context, {
      type: 'warning',
      title: '清空课表和作业',
      message: '确定清空所有课程、作业和同步记录吗？',
      detail: '设置会保留；清空前的数据会自动备份到 backups 目录。',
      buttons: ['取消', '清空'],
      defaultId: 0,
      cancelId: 0
    })
    if (confirm.response !== 1) return
    await store.clearContent()
    scheduler.requestCheck(800)
  })

  ipcMain.handle('data:load-demo', async () => {
    const confirm = await showMessageBox(context, {
      type: 'question',
      title: '载入示例数据',
      message: '示例数据会替换当前的课表和作业。',
      detail: '用于快速体验。原始数据会自动备份。',
      buttons: ['取消', '载入示例'],
      defaultId: 0,
      cancelId: 0
    })
    if (confirm.response !== 1) return
    await store.loadDemo()
    scheduler.requestCheck(800)
  })

  ipcMain.handle('sync:open', async (_event, platform: unknown) => {
    await sync.open(asPlatform(platform))
  })

  ipcMain.handle('sync:close', async () => sync.close())
  ipcMain.handle('sync:capture-current', async () => sync.captureCurrent())
  ipcMain.handle('sync:go-back', async () => sync.goBack())
  ipcMain.handle('sync:go-forward', async () => sync.goForward())
  ipcMain.handle('sync:refresh', async () => sync.refresh())
  ipcMain.handle('sync:get-state', async () => sync.getState())
  ipcMain.handle('sync:clear-session', async (_event, platform: unknown) => {
    await sync.clearSession(asPlatform(platform))
  })
  ipcMain.handle('sync:commit-hdu', async (_event, mode: unknown) => {
    const result = await sync.commitHdu(mode === 'replace' ? 'replace' : 'merge')
    scheduler.requestCheck(1000)
    return result
  })
  ipcMain.handle('sync:commit-platform', async (_event, platform: unknown, items: unknown) => {
    if (!Array.isArray(items)) throw new Error('无效的作业列表')
    const result = await sync.commitPlatform(
      asPlatform(platform) as AssignmentPlatform,
      items as PlatformAssignment[]
    )
    scheduler.requestCheck(1000)
    return result
  })
  ipcMain.handle('sync:discard-preview', async () => sync.discardPreview())

}
