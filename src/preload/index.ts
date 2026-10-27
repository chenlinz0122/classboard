import { contextBridge, ipcRenderer } from 'electron'
import type {
  AssignmentPlatform,
  ClassboardApi,
  CourseDraft,
  CoursePatch,
  DeadlineDraft,
  DeadlinePatch,
  NavigateTarget,
  PlatformAssignment,
  Settings,
  SyncPlatform
} from '@shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: ClassboardApi = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  onDataChanged: (listener) => subscribe('data:changed', listener),
  onNavigate: (listener: (target: NavigateTarget) => void) => subscribe('navigate', listener),
  onSyncEvent: (listener) => subscribe('sync:event', listener),
  getSyncState: () => ipcRenderer.invoke('sync:get-state'),

  deadlines: {
    create: (draft: DeadlineDraft) => ipcRenderer.invoke('deadlines:create', draft),
    update: (id: string, patch: DeadlinePatch) => ipcRenderer.invoke('deadlines:update', id, patch),
    remove: (id: string) => ipcRenderer.invoke('deadlines:remove', id),
    toggle: (id: string, completed?: boolean) =>
      ipcRenderer.invoke('deadlines:toggle', id, completed),
    snooze: (id: string, minutes: number) => ipcRenderer.invoke('deadlines:snooze', id, minutes)
  },

  courses: {
    create: (draft: CourseDraft) => ipcRenderer.invoke('courses:create', draft),
    update: (id: string, patch: CoursePatch) => ipcRenderer.invoke('courses:update', id, patch),
    remove: (id: string) => ipcRenderer.invoke('courses:remove', id)
  },

  settings: {
    update: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:update', patch),
    applyAutoLaunch: (enabled: boolean) =>
      ipcRenderer.invoke('settings:apply-auto-launch', enabled)
  },

  data: {
    exportBackup: () => ipcRenderer.invoke('data:export-backup'),
    importBackup: () => ipcRenderer.invoke('data:import-backup'),
    exportCsv: () => ipcRenderer.invoke('data:export-csv'),
    importCsv: () => ipcRenderer.invoke('data:import-csv'),
    importHduHtml: () => ipcRenderer.invoke('data:import-hdu-html'),
    openDataFolder: () => ipcRenderer.invoke('data:open-data-folder'),
    clearAll: () => ipcRenderer.invoke('data:clear-all'),
    loadDemo: () => ipcRenderer.invoke('data:load-demo')
  },

  sync: {
    open: (platform: SyncPlatform) => ipcRenderer.invoke('sync:open', platform),
    close: () => ipcRenderer.invoke('sync:close'),
    captureCurrent: () => ipcRenderer.invoke('sync:capture-current'),
    goBack: () => ipcRenderer.invoke('sync:go-back'),
    goForward: () => ipcRenderer.invoke('sync:go-forward'),
    refresh: () => ipcRenderer.invoke('sync:refresh'),
    clearSession: (platform: SyncPlatform) => ipcRenderer.invoke('sync:clear-session', platform),
    commitHdu: (mode: 'merge' | 'replace') => ipcRenderer.invoke('sync:commit-hdu', mode),
    commitPlatform: (platform: AssignmentPlatform, items: PlatformAssignment[]) =>
      ipcRenderer.invoke('sync:commit-platform', platform, items),
    discardPreview: () => ipcRenderer.invoke('sync:discard-preview')
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    showMain: (target?: NavigateTarget) => ipcRenderer.invoke('window:show-main', target),
    showWidget: () => ipcRenderer.invoke('window:show-widget'),
    togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
    hideWidget: () => ipcRenderer.invoke('window:hide-widget'),
    resetWidgetPosition: () => ipcRenderer.invoke('window:reset-widget-position')
  },

  app: {
    testNotification: () => ipcRenderer.invoke('app:test-notification'),
    getAutoLaunch: () => ipcRenderer.invoke('app:get-auto-launch'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    quit: () => ipcRenderer.invoke('app:quit')
  }
}

contextBridge.exposeInMainWorld('classboard', api)
