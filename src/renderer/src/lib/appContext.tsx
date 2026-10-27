import { createContext, useContext } from 'react'
import type { AppData, AppInfo, MainView } from '@shared/types'

export type ToastTone = 'info' | 'success' | 'error'

export interface NavigateOptions {
  focusDeadlineId?: string
  focusQuickAdd?: boolean
}

export interface AppContextValue {
  data: AppData
  info: AppInfo
  now: Date
  notify: (message: string, tone?: ToastTone) => void
  navigate: (view: MainView, options?: NavigateOptions) => void
  openSync: (platform: 'hdu' | 'chaoxing' | 'yuketang' | 'pta') => void
  quickAddSignal: number
  focusDeadlineId?: string
  layout: 'main' | 'widget'
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppContext')
  return value
}
