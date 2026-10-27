import { app } from 'electron'
import path from 'node:path'
import { APP_NAME } from '@shared/defaults'

export function configureAppPaths(): void {
  app.setName(APP_NAME)
  const override = process.env.CLASSBOARD_DATA_DIR
  if (override) {
    app.setPath('userData', path.resolve(override))
    return
  }
  const base = path.join(app.getPath('appData'), app.isPackaged ? 'ClassBoard' : 'ClassBoardDev')
  app.setPath('userData', base)
}

export function dataFilePath(): string {
  return path.join(app.getPath('userData'), 'data.json')
}

export function backupDirPath(): string {
  return path.join(app.getPath('userData'), 'backups')
}

export function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

export function rendererHtmlPath(): string {
  return path.join(__dirname, '../renderer/index.html')
}

export function resourcePath(name: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources', name)
    : path.join(app.getAppPath(), 'resources', name)
}

export function logFilePath(): string {
  return path.join(app.getPath('userData'), 'classboard.log')
}

export function isDev(): boolean {
  return !app.isPackaged
}
