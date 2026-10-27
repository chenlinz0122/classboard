import { Notification } from 'electron'
import { resourcePath } from './paths'
import { logLine } from './log'

let warnedUnsupported = false

export function notificationsSupported(): boolean {
  return Notification.isSupported()
}

export interface ToastOptions {
  title: string
  body: string
  onClick?: () => void
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
}

export function showToast(options: ToastOptions): boolean {
  if (!Notification.isSupported()) {
    if (!warnedUnsupported) {
      warnedUnsupported = true
      logLine('当前系统不支持 Electron 通知，应用内仍会显示提醒。')
    }
    return false
  }
  try {
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: resourcePath('icon.png'),
      silent: options.silent ?? false,
      urgency: options.urgency ?? 'normal',
      // 紧急提醒（临近截止/已截止）保留在屏幕上，普通提醒按系统时长消失。
      timeoutType: options.urgency === 'critical' ? 'never' : 'default'
    })
    notification.on('click', () => {
      logLine(`[toast] click: ${options.title}`)
      options.onClick?.()
    })
    notification.on('failed', (_event, error) => {
      logLine(`[toast] failed: ${options.title} / ${String(error)}`)
    })
    notification.on('show', () => {
      logLine(`[toast] shown: ${options.title}`)
    })
    notification.show()
    return true
  } catch (error) {
    logLine(`通知创建失败：${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

export function showTestNotification(onClick?: () => void): boolean {
  return showToast({
    title: '课表与DDL看板',
    body: '通知通道正常。作业截止前，我会在这里提醒你。',
    onClick
  })
}
