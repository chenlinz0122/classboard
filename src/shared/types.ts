export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type SourceKey = 'manual' | 'hdu' | 'chaoxing' | 'yuketang' | 'pta' | 'import'
export type SyncPlatform = 'hdu' | 'chaoxing' | 'yuketang' | 'pta'
export type AssignmentPlatform = 'chaoxing' | 'yuketang' | 'pta'
export type MainView = 'today' | 'week' | 'deadlines' | 'sync' | 'settings'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface Period {
  index: number
  /** HH:mm */
  start: string
  /** HH:mm */
  end: string
}

export interface Course {
  id: string
  name: string
  teacher: string
  location: string
  weekday: Weekday
  startPeriod: number
  endPeriod: number
  /** Explicit teaching weeks, e.g. [1,2,3,...,16] */
  weeks: number[]
  note?: string
  source: SourceKey
  /** Stable identity used when syncing from a platform. */
  sourceKey?: string
  /** Palette slot, 0-7. */
  color?: number
  createdAt: string
  updatedAt: string
}

export interface ReminderState {
  /** notification key -> ISO timestamp sent */
  sent: Record<string, string>
  snoozedUntil?: string | null
}

export interface DeadlineItem {
  id: string
  title: string
  courseId?: string
  courseName?: string
  /** ISO instant. Null means the platform did not expose a deadline. */
  dueAt?: string | null
  notes?: string
  completedAt?: string | null
  source: SourceKey
  sourceKey?: string
  sourceUrl?: string
  createdAt: string
  updatedAt: string
  /** Per-item override, in minutes before due. */
  reminderOffsets?: number[]
  reminder: ReminderState
  priority: 'low' | 'normal' | 'high'
  tags?: string[]
}

export interface SyncMeta {
  lastSyncAt?: string
  accountLabel?: string
  semesterLabel?: string
  warning?: string
}

export interface Settings {
  /** YYYY-MM-DD, Monday of week 1 */
  semesterStart: string
  totalWeeks: number
  periods: Period[]
  reminderOffsets: number[]
  classRemindersEnabled: boolean
  classReminderMinutes: number
  dailySummaryEnabled: boolean
  closeToTray: boolean
  autoLaunch: boolean
  alwaysOnTop: boolean
  widgetOpacity: number
  theme: ThemeMode
  launchShowWidget: boolean
  widgetPosition?: { x: number; y: number } | null
  onboardingDone: boolean
  lastDailySummaryDate?: string | null
  sync: Record<SyncPlatform, SyncMeta>
}

export interface AppMeta {
  schemaVersion: number
  createdAt: string
  updatedAt: string
  lastBackupAt?: string | null
}

export interface AppData {
  meta: AppMeta
  courses: Course[]
  deadlines: DeadlineItem[]
  settings: Settings
}

export interface AppInfo {
  version: string
  isPackaged: boolean
  platform: string
  dataDir: string
  notificationSupported: boolean
  autoLaunchEnabled: boolean
  launchAtLoginSupported: boolean
}

export interface Bootstrap {
  data: AppData
  app: AppInfo
  initialSync: SyncEvent | null
}

export interface NavigateTarget {
  view: MainView
  focusDeadlineId?: string
  focusQuickAdd?: boolean
}

export interface CourseDraft {
  name: string
  teacher?: string
  location?: string
  weekday: Weekday
  startPeriod: number
  endPeriod: number
  weeks: number[]
  note?: string
  color?: number
  source?: SourceKey
  sourceKey?: string
}

export interface DeadlineDraft {
  title: string
  courseId?: string
  courseName?: string
  dueAt?: string | null
  notes?: string
  reminderOffsets?: number[]
  source?: SourceKey
  sourceKey?: string
  sourceUrl?: string
  priority?: 'low' | 'normal' | 'high'
  tags?: string[]
}

export type DeadlinePatch = Partial<
  Pick<
    DeadlineItem,
    | 'title'
    | 'courseId'
    | 'courseName'
    | 'dueAt'
    | 'notes'
    | 'reminderOffsets'
    | 'priority'
    | 'tags'
    | 'sourceUrl'
  >
> & {
  completed?: boolean
}

export type CoursePatch = Partial<Omit<Course, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'sourceKey'>>

export interface HduCoursePreview {
  name: string
  teacher: string
  location: string
  weekday: Weekday
  startPeriod: number
  endPeriod: number
  weeks: number[]
  rawTime: string
}

export interface HduSyncPreview {
  courses: HduCoursePreview[]
  studentName?: string
  semesterLabel?: string
  capturedAt: string
  warnings: string[]
  source: 'login' | 'html'
}

export interface PlatformAssignment {
  tempId: string
  externalId?: string
  title: string
  courseName: string
  dueAt: string | null
  dueText?: string
  sourceUrl?: string
  statusText?: string
  completed: boolean
  selected?: boolean
}

export interface PlatformSyncPreview {
  platform: AssignmentPlatform
  items: PlatformAssignment[]
  capturedAt: string
  warnings: string[]
  source: 'api' | 'page'
}

export type SyncPhase =
  | 'idle'
  | 'opening'
  | 'login'
  | 'ready'
  | 'scanning'
  | 'preview'
  | 'done'
  | 'error'
  | 'closed'

export interface SyncEvent {
  platform: SyncPlatform
  phase: SyncPhase
  message: string
  url?: string
  title?: string
  canCapture?: boolean
  error?: string
  hduPreview?: HduSyncPreview
  platformPreview?: PlatformSyncPreview
  commitResult?: SyncCommitResult
}

export interface SyncCommitResult {
  added: number
  updated: number
  skipped: number
  removed: number
  total: number
}

export interface ImportResult {
  canceled?: boolean
  coursesAdded: number
  deadlinesAdded: number
  warnings: string[]
  message: string
}

export interface ClassOccurrence {
  key: string
  course: Course
  date: string
  startAt: Date
  endAt: Date
  startPeriod: number
  endPeriod: number
}

export type DeadlineBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done'

export interface ClassboardApi {
  bootstrap: () => Promise<Bootstrap>
  onDataChanged: (listener: (data: AppData) => void) => () => void
  onNavigate: (listener: (target: NavigateTarget) => void) => () => void
  onSyncEvent: (listener: (event: SyncEvent) => void) => () => void
  getSyncState: () => Promise<SyncEvent | null>

  deadlines: {
    create: (draft: DeadlineDraft) => Promise<DeadlineItem>
    update: (id: string, patch: DeadlinePatch) => Promise<DeadlineItem | null>
    remove: (id: string) => Promise<void>
    toggle: (id: string, completed?: boolean) => Promise<DeadlineItem | null>
    snooze: (id: string, minutes: number) => Promise<DeadlineItem | null>
  }

  courses: {
    create: (draft: CourseDraft) => Promise<Course>
    update: (id: string, patch: CoursePatch) => Promise<Course | null>
    remove: (id: string) => Promise<void>
  }

  settings: {
    update: (patch: Partial<Settings>) => Promise<AppData>
    applyAutoLaunch: (enabled: boolean) => Promise<AppData>
  }

  data: {
    exportBackup: () => Promise<{ canceled: boolean; path?: string }>
    importBackup: () => Promise<ImportResult>
    exportCsv: () => Promise<{ canceled: boolean; path?: string }>
    importCsv: () => Promise<ImportResult>
    importHduHtml: () => Promise<{ canceled: boolean }>
    openDataFolder: () => Promise<void>
    clearAll: () => Promise<void>
    loadDemo: () => Promise<void>
  }

  sync: {
    open: (platform: SyncPlatform) => Promise<void>
    close: () => Promise<void>
    captureCurrent: () => Promise<void>
    goBack: () => Promise<void>
    goForward: () => Promise<void>
    refresh: () => Promise<void>
    clearSession: (platform: SyncPlatform) => Promise<void>
    commitHdu: (mode: 'merge' | 'replace') => Promise<SyncCommitResult>
    commitPlatform: (
      platform: AssignmentPlatform,
      items: PlatformAssignment[]
    ) => Promise<SyncCommitResult>
    discardPreview: () => Promise<void>
  }

  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    showMain: (target?: NavigateTarget) => void
    showWidget: () => void
    togglePin: () => Promise<boolean>
    hideWidget: () => void
    resetWidgetPosition: () => void
  }

  app: {
    testNotification: () => Promise<boolean>
    getAutoLaunch: () => Promise<boolean>
    openExternal: (url: string) => Promise<void>
    quit: () => void
  }
}
