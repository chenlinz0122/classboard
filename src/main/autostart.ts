import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { logLine } from './log'

const AUTOSTART_ARG = '--autostart'
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const VALUE_NAME = 'ClassBoard'

export function isAutostartLaunch(): boolean {
  return process.argv.includes(AUTOSTART_ARG)
}

export function launchAtLoginSupported(): boolean {
  return app.isPackaged
}

function reg(args: string[]): string {
  return execFileSync('reg.exe', args, {
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

export function getAutoLaunchEnabled(): boolean {
  if (!app.isPackaged) return false
  try {
    const output = reg(['query', RUN_KEY, '/v', VALUE_NAME])
    const expected = process.execPath.toLowerCase()
    return output.toLowerCase().includes(expected)
  } catch {
    return false
  }
}

export function setAutoLaunchEnabled(enabled: boolean): boolean {
  if (!app.isPackaged) return false
  try {
    if (enabled) {
      const command = `"${process.execPath}" ${AUTOSTART_ARG}`
      reg(['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', command, '/f'])
    } else {
      try {
        reg(['delete', RUN_KEY, '/v', VALUE_NAME, '/f'])
      } catch {
        // value already absent
      }
    }
  } catch (error) {
    logLine(`设置开机自启失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return getAutoLaunchEnabled()
}