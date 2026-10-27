import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  AppData,
  AssignmentPlatform,
  Course,
  CourseDraft,
  CoursePatch,
  DeadlineDraft,
  DeadlineItem,
  DeadlinePatch,
  HduCoursePreview,
  HduSyncPreview,
  PlatformAssignment,
  Settings,
  SourceKey,
  SyncCommitResult,
  SyncMeta,
  SyncPlatform,
  Weekday
} from '@shared/types'
import {
  createEmptyData,
  normalizeSettings,
  SCHEMA_VERSION
} from '@shared/defaults'
import { normalizeWeeks } from '@shared/schedule'
import { hashText, colorIndexFor } from '@shared/colors'
import { buildDemoData } from '@shared/demo'
import { toDateOnly } from '@shared/date'

const SAVE_DEBOUNCE_MS = 250
const AUTO_BACKUP_INTERVAL_MS = 12 * 60 * 60 * 1000
const MAX_BACKUPS = 24
const SOURCES: SourceKey[] = ['manual', 'hdu', 'chaoxing', 'yuketang', 'pta', 'import']

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asWeekday(value: unknown, fallback: Weekday = 1): Weekday {
  const number = asNumber(value, fallback)
  return (number >= 1 && number <= 7 ? number : fallback) as Weekday
}

function asSource(value: unknown, fallback: SourceKey = 'manual'): SourceKey {
  return SOURCES.includes(value as SourceKey) ? (value as SourceKey) : fallback
}

function asIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function asIsoOrUndefined(value: unknown): string | undefined {
  return asIsoOrNull(value) ?? undefined
}

function normalizeReminderState(value: unknown): DeadlineItem['reminder'] {
  const record = isRecord(value) ? value : {}
  const sentRaw = isRecord(record.sent) ? record.sent : {}
  const sent: Record<string, string> = {}
  for (const [key, timestamp] of Object.entries(sentRaw)) {
    const iso = asIsoOrNull(timestamp)
    if (iso) sent[key] = iso
  }
  return {
    sent,
    snoozedUntil: asIsoOrNull(record.snoozedUntil)
  }
}

function normalizeCourse(raw: unknown): Course | null {
  if (!isRecord(raw)) return null
  const name = asString(raw.name).trim()
  if (!name) return null
  const createdAt = asIsoOrNull(raw.createdAt) ?? new Date().toISOString()
  const weekday = asWeekday(raw.weekday)
  let startPeriod = Math.round(asNumber(raw.startPeriod, 1))
  let endPeriod = Math.round(asNumber(raw.endPeriod, startPeriod))
  if (startPeriod > endPeriod) [startPeriod, endPeriod] = [endPeriod, startPeriod]
  if (startPeriod < 1 || endPeriod > 20) return null
  const weeks = normalizeWeeks(Array.isArray(raw.weeks) ? raw.weeks.map(Number) : [])
  return {
    id: asString(raw.id) || randomUUID(),
    name,
    teacher: asString(raw.teacher).trim(),
    location: asString(raw.location).trim(),
    weekday,
    startPeriod,
    endPeriod,
    weeks: weeks.length > 0 ? weeks : Array.from({ length: 16 }, (_, index) => index + 1),
    note: asString(raw.note) || undefined,
    source: asSource(raw.source),
    sourceKey: asString(raw.sourceKey) || undefined,
    color:
      typeof raw.color === 'number' && Number.isFinite(raw.color)
        ? Math.abs(Math.round(raw.color)) % 8
        : colorIndexFor(name),
    createdAt,
    updatedAt: asIsoOrNull(raw.updatedAt) ?? createdAt
  }
}

function normalizeDeadline(raw: unknown): DeadlineItem | null {
  if (!isRecord(raw)) return null
  const title = asString(raw.title).trim()
  if (!title) return null
  const createdAt = asIsoOrNull(raw.createdAt) ?? new Date().toISOString()
  const priority = raw.priority === 'low' || raw.priority === 'high' ? raw.priority : 'normal'
  const reminderOffsets = Array.isArray(raw.reminderOffsets)
    ? [...new Set(raw.reminderOffsets.map(Number).filter((value) => Number.isFinite(value) && value > 0))]
    : undefined
  return {
    id: asString(raw.id) || randomUUID(),
    title,
    courseId: asString(raw.courseId) || undefined,
    courseName: asString(raw.courseName) || undefined,
    dueAt: asIsoOrNull(raw.dueAt),
    notes: asString(raw.notes) || undefined,
    completedAt: asIsoOrNull(raw.completedAt),
    source: asSource(raw.source),
    sourceKey: asString(raw.sourceKey) || undefined,
    sourceUrl: asString(raw.sourceUrl) || undefined,
    createdAt,
    updatedAt: asIsoOrNull(raw.updatedAt) ?? createdAt,
    reminderOffsets,
    reminder: normalizeReminderState(raw.reminder),
    priority,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean).slice(0, 12) : undefined
  }
}

export function normalizeData(raw: unknown): AppData {
  const fallback = createEmptyData()
  if (!isRecord(raw)) return fallback
  const metaRaw = isRecord(raw.meta) ? raw.meta : {}
  const coursesRaw = Array.isArray(raw.courses) ? raw.courses : []
  const deadlinesRaw = Array.isArray(raw.deadlines) ? raw.deadlines : []
  const courses: Course[] = []
  const seenCourseIds = new Set<string>()
  for (const item of coursesRaw) {
    const course = normalizeCourse(item)
    if (!course || seenCourseIds.has(course.id)) continue
    seenCourseIds.add(course.id)
    courses.push(course)
  }
  const deadlines: DeadlineItem[] = []
  const seenDeadlineIds = new Set<string>()
  for (const item of deadlinesRaw) {
    const deadline = normalizeDeadline(item)
    if (!deadline || seenDeadlineIds.has(deadline.id)) continue
    seenDeadlineIds.add(deadline.id)
    deadlines.push(deadline)
  }
  const createdAt = asIsoOrNull(metaRaw.createdAt) ?? new Date().toISOString()
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      createdAt,
      updatedAt: asIsoOrNull(metaRaw.updatedAt) ?? createdAt,
      lastBackupAt: asIsoOrNull(metaRaw.lastBackupAt)
    },
    courses,
    deadlines,
    settings: normalizeSettings(isRecord(raw.settings) ? (raw.settings as Partial<Settings>) : undefined)
  }
}

export function hduCourseKey(course: Pick<HduCoursePreview, 'name' | 'teacher' | 'weekday' | 'startPeriod' | 'endPeriod'>): string {
  return `hdu:${course.name}|${course.teacher}|${course.weekday}|${course.startPeriod}|${course.endPeriod}`
}

export class DataStore extends EventEmitter {
  private dataValue: AppData = createEmptyData()
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private writeChain: Promise<void> = Promise.resolve()
  private initialized = false

  constructor(
    private readonly filePath: string,
    private readonly backupDir: string
  ) {
    super()
  }

  get data(): AppData {
    return this.dataValue
  }

  get file(): string {
    return this.filePath
  }

  get backups(): string {
    return this.backupDir
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.mkdir(this.backupDir, { recursive: true })

    let rawText: string | null = null
    let needsRewrite = false
    try {
      rawText = await fs.readFile(this.filePath, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') console.error('读取数据文件失败', error)
    }

    if (rawText) {
      try {
        this.dataValue = normalizeData(JSON.parse(rawText))
      } catch (error) {
        console.error('数据文件损坏，尝试最近备份', error)
        const restored = await this.tryRestoreLatestBackup()
        this.dataValue = restored ?? createEmptyData()
        needsRewrite = true
      }
    } else {
      this.dataValue = createEmptyData()
      needsRewrite = true
    }

    if (needsRewrite || !(await this.fileExists(this.filePath))) {
      this.queueWrite()
      await this.flush()
    }

    const lastBackup = this.dataValue.meta.lastBackupAt
      ? new Date(this.dataValue.meta.lastBackupAt).getTime()
      : 0
    if (rawText && Date.now() - lastBackup > AUTO_BACKUP_INTERVAL_MS) {
      await this.createBackup('auto')
    }
    this.emit('changed', this.dataValue)
  }

  private async tryRestoreLatestBackup(): Promise<AppData | null> {
    try {
      const entries = await fs.readdir(this.backupDir)
      const candidates = entries
        .filter((name) => name.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
      for (const name of candidates) {
        try {
          const text = await fs.readFile(path.join(this.backupDir, name), 'utf8')
          const data = normalizeData(JSON.parse(text))
          if (data.courses.length > 0 || data.deadlines.length > 0) return data
        } catch {
          // try next backup
        }
      }
    } catch {
      // no backups
    }
    return null
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  subscribe(listener: (data: AppData) => void): () => void {
    this.on('changed', listener)
    return () => this.off('changed', listener)
  }

  async mutate(recipe: (draft: AppData) => void, backupReason?: string): Promise<AppData> {
    if (backupReason) await this.createBackup(backupReason)
    const draft = structuredClone(this.dataValue)
    recipe(draft)
    draft.meta.updatedAt = new Date().toISOString()
    this.dataValue = draft
    this.emit('changed', draft)
    this.scheduleSave()
    return draft
  }

  async replaceData(next: AppData, backupReason = 'import'): Promise<AppData> {
    await this.createBackup(backupReason)
    const normalized = normalizeData(next)
    normalized.meta.updatedAt = new Date().toISOString()
    this.dataValue = normalized
    this.emit('changed', normalized)
    this.scheduleSave()
    await this.flush()
    return normalized
  }

  async createBackup(reason: string): Promise<string> {
    await fs.mkdir(this.backupDir, { recursive: true })
    const safeReason = reason.replace(/[^\w-]+/g, '-')
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '')
      .replace('T', '-')
    const target = path.join(this.backupDir, `backup-${stamp}-${safeReason}.json`)
    await fs.writeFile(target, JSON.stringify(this.dataValue, null, 2), 'utf8')
    this.dataValue.meta.lastBackupAt = new Date().toISOString()
    this.scheduleSave()
    await this.pruneBackups()
    return target
  }

  private async pruneBackups(): Promise<void> {
    try {
      const entries = (await fs.readdir(this.backupDir))
        .filter((name) => name.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
      await Promise.all(
        entries.slice(MAX_BACKUPS).map((name) => fs.unlink(path.join(this.backupDir, name)).catch(() => undefined))
      )
    } catch {
      // ignore
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.queueWrite()
    }, SAVE_DEBOUNCE_MS)
  }

  private queueWrite(): void {
    const payload = JSON.stringify(this.dataValue, null, 2)
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => this.writePayload(payload))
  }

  private async writePayload(payload: string): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temp = `${this.filePath}.${process.pid}.tmp`
    await fs.writeFile(temp, payload, 'utf8')
    try {
      await fs.rename(temp, this.filePath)
    } catch (error) {
      await fs.unlink(this.filePath).catch(() => undefined)
      await fs.rename(temp, this.filePath).catch(async () => {
        await fs.unlink(temp).catch(() => undefined)
        throw error
      })
    }
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      this.queueWrite()
    }
    await this.writeChain
  }

  async updateSettings(patch: Partial<Settings>): Promise<AppData> {
    return this.mutate((draft) => {
      draft.settings = normalizeSettings({ ...draft.settings, ...patch }, new Date())
    })
  }

  async addCourse(input: CourseDraft): Promise<Course> {
    const now = new Date().toISOString()
    const course: Course = {
      id: randomUUID(),
      name: input.name.trim(),
      teacher: input.teacher?.trim() ?? '',
      location: input.location?.trim() ?? '',
      weekday: input.weekday,
      startPeriod: Math.min(input.startPeriod, input.endPeriod),
      endPeriod: Math.max(input.startPeriod, input.endPeriod),
      weeks: normalizeWeeks(input.weeks),
      note: input.note?.trim() || undefined,
      source: input.source ?? 'manual',
      sourceKey: input.sourceKey,
      color: input.color ?? colorIndexFor(input.name),
      createdAt: now,
      updatedAt: now
    }
    const data = await this.mutate((draft) => {
      draft.courses.push(course)
    })
    return data.courses.find((item) => item.id === course.id) ?? course
  }

  async updateCourse(id: string, patch: CoursePatch): Promise<Course | null> {
    let result: Course | null = null
    let oldName = ''
    await this.mutate((draft) => {
      const course = draft.courses.find((item) => item.id === id)
      if (!course) return
      oldName = course.name
      if (patch.name !== undefined) course.name = patch.name.trim()
      if (patch.teacher !== undefined) course.teacher = patch.teacher.trim()
      if (patch.location !== undefined) course.location = patch.location.trim()
      if (patch.weekday !== undefined) course.weekday = patch.weekday
      if (patch.startPeriod !== undefined) course.startPeriod = patch.startPeriod
      if (patch.endPeriod !== undefined) course.endPeriod = patch.endPeriod
      if (course.startPeriod > course.endPeriod) {
        ;[course.startPeriod, course.endPeriod] = [course.endPeriod, course.startPeriod]
      }
      if (patch.weeks !== undefined) course.weeks = normalizeWeeks(patch.weeks)
      if (patch.note !== undefined) course.note = patch.note.trim() || undefined
      if (patch.color !== undefined) course.color = patch.color
      course.updatedAt = new Date().toISOString()
      result = course
      if (oldName && oldName !== course.name) {
        for (const deadline of draft.deadlines) {
          if (deadline.courseId === course.id) deadline.courseName = course.name
        }
      }
    })
    return result
  }

  async removeCourse(id: string): Promise<void> {
    await this.mutate((draft) => {
      const course = draft.courses.find((item) => item.id === id)
      if (!course) return
      draft.courses = draft.courses.filter((item) => item.id !== id)
      for (const deadline of draft.deadlines) {
        if (deadline.courseId === id) {
          deadline.courseId = undefined
          deadline.courseName = course.name
        }
      }
    })
  }

  async addDeadline(input: DeadlineDraft): Promise<DeadlineItem> {
    const now = new Date().toISOString()
    let created: DeadlineItem | null = null
    await this.mutate((draft) => {
      const course = input.courseId
        ? draft.courses.find((item) => item.id === input.courseId)
        : undefined
      const deadline: DeadlineItem = {
        id: randomUUID(),
        title: input.title.trim(),
        courseId: course?.id ?? input.courseId,
        courseName: course?.name ?? input.courseName?.trim() ?? undefined,
        dueAt: asIsoOrNull(input.dueAt),
        notes: input.notes?.trim() || undefined,
        completedAt: null,
        source: input.source ?? 'manual',
        sourceKey: input.sourceKey,
        sourceUrl: input.sourceUrl,
        createdAt: now,
        updatedAt: now,
        reminderOffsets: input.reminderOffsets,
        reminder: { sent: {}, snoozedUntil: null },
        priority: input.priority ?? 'normal',
        tags: input.tags
      }
      draft.deadlines.push(deadline)
      created = deadline
    })
    if (!created) throw new Error('创建作业失败')
    return created
  }

  async updateDeadline(id: string, patch: DeadlinePatch): Promise<DeadlineItem | null> {
    let result: DeadlineItem | null = null
    await this.mutate((draft) => {
      const deadline = draft.deadlines.find((item) => item.id === id)
      if (!deadline) return
      const oldDue = deadline.dueAt
      if (patch.title !== undefined) deadline.title = patch.title.trim()
      if (patch.notes !== undefined) deadline.notes = patch.notes.trim() || undefined
      if (patch.priority !== undefined) deadline.priority = patch.priority
      if (patch.tags !== undefined) deadline.tags = patch.tags
      if (patch.sourceUrl !== undefined) deadline.sourceUrl = patch.sourceUrl
      if (patch.reminderOffsets !== undefined) {
        deadline.reminderOffsets = patch.reminderOffsets.length ? patch.reminderOffsets : undefined
      }
      if (patch.courseId !== undefined || patch.courseName !== undefined) {
        const course = patch.courseId
          ? draft.courses.find((item) => item.id === patch.courseId)
          : undefined
        deadline.courseId = course?.id ?? (patch.courseId || undefined)
        deadline.courseName = course?.name ?? patch.courseName ?? deadline.courseName
      }
      if (patch.dueAt !== undefined) deadline.dueAt = asIsoOrNull(patch.dueAt)
      if (patch.completed !== undefined) {
        deadline.completedAt = patch.completed ? new Date().toISOString() : null
        if (patch.completed) {
          deadline.reminder.snoozedUntil = null
        } else {
          deadline.reminder = { sent: {}, snoozedUntil: null }
        }
      }
      if (patch.dueAt !== undefined && deadline.dueAt !== oldDue) {
        deadline.reminder = { sent: {}, snoozedUntil: null }
      }
      if (!deadline.completedAt && oldDue && !deadline.dueAt) {
        deadline.reminder = { sent: {}, snoozedUntil: null }
      }
      deadline.updatedAt = new Date().toISOString()
      result = deadline
    })
    return result
  }

  async removeDeadline(id: string): Promise<void> {
    await this.mutate((draft) => {
      draft.deadlines = draft.deadlines.filter((item) => item.id !== id)
    })
  }

  async toggleDeadline(id: string, completed?: boolean): Promise<DeadlineItem | null> {
    const current = this.dataValue.deadlines.find((item) => item.id === id)
    if (!current) return null
    const nextCompleted = completed ?? !current.completedAt
    return this.updateDeadline(id, { completed: nextCompleted })
  }

  async snoozeDeadline(id: string, minutes: number): Promise<DeadlineItem | null> {
    const safeMinutes = Math.max(1, Math.min(24 * 60, Math.round(minutes)))
    let result: DeadlineItem | null = null
    await this.mutate((draft) => {
      const deadline = draft.deadlines.find((item) => item.id === id)
      if (!deadline || deadline.completedAt) return
      deadline.reminder.snoozedUntil = new Date(Date.now() + safeMinutes * 60 * 1000).toISOString()
      deadline.updatedAt = new Date().toISOString()
      result = deadline
    })
    return result
  }

  async markDeadlineNotifications(id: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await this.mutate((draft) => {
      const deadline = draft.deadlines.find((item) => item.id === id)
      if (!deadline) return
      const now = new Date().toISOString()
      for (const key of keys) deadline.reminder.sent[key] = now
    })
  }

  async markDailySummary(date: string): Promise<void> {
    await this.mutate((draft) => {
      draft.settings.lastDailySummaryDate = date
    })
  }

  async setSyncMeta(platform: SyncPlatform, meta: SyncMeta): Promise<void> {
    await this.mutate((draft) => {
      draft.settings.sync[platform] = { ...draft.settings.sync[platform], ...meta }
    })
  }

  async applyHduCourses(
    preview: HduSyncPreview,
    mode: 'merge' | 'replace'
  ): Promise<SyncCommitResult> {
    let added = 0
    let updated = 0
    let skipped = 0
    let removed = 0
    await this.mutate(
      (draft) => {
        const now = new Date().toISOString()
        const existing = new Map<string, Course>()
        for (const course of draft.courses) {
          if (course.source === 'hdu' && course.sourceKey) existing.set(course.sourceKey, course)
        }
        const keep = new Set<string>()
        const oldIdToNewId = new Map<string, string>()
        const newByName = new Map<string, Course>()

        for (const item of preview.courses) {
          const key = hduCourseKey(item)
          keep.add(key)
          const old = existing.get(key)
          const color = old?.color ?? colorIndexFor(item.name)
          if (old) {
            const oldName = old.name
            const changed =
              old.name !== item.name ||
              old.teacher !== item.teacher ||
              old.location !== item.location ||
              old.weeks.join(',') !== item.weeks.join(',')
            old.name = item.name
            old.teacher = item.teacher
            old.location = item.location
            old.weekday = item.weekday
            old.startPeriod = item.startPeriod
            old.endPeriod = item.endPeriod
            old.weeks = item.weeks
            old.color = color
            old.updatedAt = now
            if (changed) updated += 1
            else skipped += 1
            if (oldName !== old.name) {
              for (const deadline of draft.deadlines) {
                if (deadline.courseId === old.id) deadline.courseName = old.name
              }
            }
            newByName.set(old.name, old)
          } else {
            const course: Course = {
              id: randomUUID(),
              name: item.name,
              teacher: item.teacher,
              location: item.location,
              weekday: item.weekday,
              startPeriod: item.startPeriod,
              endPeriod: item.endPeriod,
              weeks: item.weeks,
              source: 'hdu',
              sourceKey: key,
              color,
              createdAt: now,
              updatedAt: now
            }
            draft.courses.push(course)
            added += 1
            newByName.set(course.name, course)
          }
        }

        if (mode === 'replace') {
          const removedCourses = draft.courses.filter(
            (course) => course.source === 'hdu' && course.sourceKey && !keep.has(course.sourceKey)
          )
          removed = removedCourses.length
          for (const course of removedCourses) {
            if (course.sourceKey) oldIdToNewId.set(course.id, '')
          }
          draft.courses = draft.courses.filter(
            (course) => !(course.source === 'hdu' && course.sourceKey && !keep.has(course.sourceKey))
          )
          for (const deadline of draft.deadlines) {
            if (!deadline.courseId) continue
            const mapped = oldIdToNewId.get(deadline.courseId)
            if (mapped !== undefined) {
              const replacement = deadline.courseName ? newByName.get(deadline.courseName) : undefined
              deadline.courseId = replacement?.id
              if (replacement) deadline.courseName = replacement.name
            }
          }
        }

        draft.settings.sync.hdu = {
          lastSyncAt: new Date().toISOString(),
          accountLabel: preview.studentName ?? draft.settings.sync.hdu.accountLabel,
          semesterLabel: preview.semesterLabel ?? draft.settings.sync.hdu.semesterLabel,
          warning: preview.warnings.length ? preview.warnings.join('；') : undefined
        }
      },
      'before-hdu-sync'
    )
    return {
      added,
      updated,
      skipped,
      removed,
      total: preview.courses.length
    }
  }

  async upsertPlatformDeadlines(
    platform: AssignmentPlatform,
    items: PlatformAssignment[],
    meta: SyncMeta
  ): Promise<SyncCommitResult> {
    let added = 0
    let updated = 0
    let skipped = 0
    await this.mutate(
      (draft) => {
        const now = new Date().toISOString()
        const existing = new Map<string, DeadlineItem>()
        for (const deadline of draft.deadlines) {
          if (deadline.source === platform && deadline.sourceKey) {
            existing.set(deadline.sourceKey, deadline)
          }
        }
        const seen = new Set<string>()
        for (const item of items) {
          if (!item.title.trim()) continue
          const sourceKey = `${platform}:${
            item.externalId?.trim() ||
            hashText(`${item.title}|${item.courseName}|${item.dueAt ?? item.dueText ?? ''}`)
          }`
          if (seen.has(sourceKey)) continue
          seen.add(sourceKey)
          const old = existing.get(sourceKey)
          if (old) {
            const oldDue = old.dueAt
            const oldTitle = old.title
            const oldCourse = old.courseName
            const oldUrl = old.sourceUrl
            const oldCompleted = old.completedAt
            old.title = item.title.trim()
            old.courseName = item.courseName.trim() || old.courseName
            old.dueAt = asIsoOrNull(item.dueAt)
            old.sourceUrl = item.sourceUrl ?? old.sourceUrl
            if (old.dueAt !== oldDue) old.reminder = { sent: {}, snoozedUntil: null }
            if (item.completed) old.completedAt = old.completedAt ?? now
            old.updatedAt = now
            const changed =
              oldTitle !== old.title ||
              oldCourse !== old.courseName ||
              oldDue !== old.dueAt ||
              oldUrl !== old.sourceUrl ||
              oldCompleted !== old.completedAt
            if (changed) updated += 1
            else skipped += 1
          } else {
            if (item.completed) {
              skipped += 1
              continue
            }
            draft.deadlines.push({
              id: randomUUID(),
              title: item.title.trim(),
              courseName: item.courseName.trim() || undefined,
              dueAt: asIsoOrNull(item.dueAt),
              completedAt: null,
              source: platform,
              sourceKey,
              sourceUrl: item.sourceUrl,
              createdAt: now,
              updatedAt: now,
              reminder: { sent: {}, snoozedUntil: null },
              priority: 'normal'
            })
            added += 1
          }
        }
        draft.settings.sync[platform] = {
          ...draft.settings.sync[platform],
          ...meta,
          lastSyncAt: new Date().toISOString()
        }
      },
      `before-${platform}-sync`
    )
    return { added, updated, skipped, removed: 0, total: items.length }
  }

  async clearContent(): Promise<void> {
    await this.mutate((draft) => {
      draft.courses = []
      draft.deadlines = []
      draft.settings.sync = {
        hdu: {},
        chaoxing: {},
        yuketang: {},
        pta: {}
      }
    }, 'before-clear')
  }

  async loadDemo(): Promise<void> {
    const demo = buildDemoData()
    await this.replaceData(demo, 'before-demo')
  }

  get todayKey(): string {
    return toDateOnly(new Date())
  }
}
