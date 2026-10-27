import type { DataStore } from './store'
import { launchAtLoginSupported, setAutoLaunchEnabled } from './autostart'

export async function applyAutoLaunchPreference(
  store: DataStore,
  enabled: boolean
): Promise<boolean> {
  if (!launchAtLoginSupported()) {
    if (store.data.settings.autoLaunch) {
      await store.updateSettings({ autoLaunch: false })
    }
    return false
  }
  const actual = setAutoLaunchEnabled(enabled)
  await store.updateSettings({ autoLaunch: actual })
  return actual
}

export async function syncAutoLaunchOnStartup(store: DataStore): Promise<void> {
  if (!store.data.settings.onboardingDone) return
  if (!launchAtLoginSupported()) return
  const actual = setAutoLaunchEnabled(store.data.settings.autoLaunch)
  if (actual !== store.data.settings.autoLaunch) {
    await store.updateSettings({ autoLaunch: actual })
  }
}
