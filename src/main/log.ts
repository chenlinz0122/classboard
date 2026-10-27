import fs from 'node:fs'
import { logFilePath } from './paths'

const MAX_LOG_BYTES = 1024 * 1024

export function logLine(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`
  console.log(message)
  try {
    const file = logFilePath()
    try {
      const stats = fs.statSync(file)
      if (stats.size > MAX_LOG_BYTES) {
        fs.writeFileSync(file, line, 'utf8')
        return
      }
    } catch {
      // file does not exist yet
    }
    fs.appendFileSync(file, line, 'utf8')
  } catch {
    // logging must never break the app
  }
}