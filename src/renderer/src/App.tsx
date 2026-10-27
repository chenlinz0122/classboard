import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData, AppInfo, MainView } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { BrandMark, ToastViewport, type ToastItem } from './components/ui'
import { Onboarding } from './Onboarding'
import { SyncToolbar } from './SyncToolbar'
import { Widget } from './Widget'
import { AppContext, type NavigateOptions } from './lib/appContext'
import { useNow } from './lib/useNow'
import { TodayView } from './views/TodayView'
import { WeekView } from './views/WeekView'
import { DeadlinesView } from './views/DeadlinesView'
import { SyncView } from './views/SyncView'
import { SettingsView } from './views/SettingsView'

type Layout = 'main' | 'widget' | 'sync'

export default function App({ view }: { view: Layout }): React.JSX.Element {
  if (view === 'sync') return <SyncToolbar />
  return <BoardApp layout={view} />
}

function BoardApp({ layout }: { layout: 'main' | 'widget' }): React.JSX.Element {
  const [data, setData] = useState<AppData | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [bootError, setBootError] = useState('')
  const [mainView, setMainView] = useState<MainView>('today')
  const [focusDeadlineId, setFocusDeadlineId] = useState<string | undefined>()
  const [quickAddSignal, setQuickAddSignal] = useState(0)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastId = useRef(0)
  const now = useNow(30_000)

  const notify = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, tone === 'error' ? 5200 : 3800)
  }, [])

  useEffect(() => {
    let alive = true
    window.classboard
      .bootstrap()
      .then((bootstrap) => {
        if (!alive) return
        setData(bootstrap.data)
        setInfo(bootstrap.app)
      })
      .catch((error) => {
        if (!alive) return
        setBootError(error instanceof Error ? error.message : String(error))
      })
    const unsubscribeData = window.classboard.onDataChanged((next) => setData(next))
    const unsubscribeNavigate = window.classboard.onNavigate((target) => {
      setMainView(target.view)
      setFocusDeadlineId(target.focusDeadlineId)
      if (target.focusQuickAdd) setQuickAddSignal((value) => value + 1)
    })
    return () => {
      alive = false
      unsubscribeData()
      unsubscribeNavigate()
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('is-widget', layout === 'widget')
    document.body.classList.toggle('is-main', layout === 'main')
  }, [layout])

  const theme = data?.settings.theme
  useEffect(() => {
    if (!theme) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (theme === 'system') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    return undefined
  }, [theme])

  const navigate = useCallback(
    (nextView: MainView, options?: NavigateOptions) => {
      if (layout === 'widget') {
        window.classboard.window.showMain({
          view: nextView,
          focusDeadlineId: options?.focusDeadlineId,
          focusQuickAdd: options?.focusQuickAdd
        })
        return
      }
      setMainView(nextView)
      setFocusDeadlineId(options?.focusDeadlineId)
      if (options?.focusQuickAdd) setQuickAddSignal((value) => value + 1)
    },
    [layout]
  )

  const openSync = useCallback(
    (platform: 'hdu' | 'chaoxing' | 'yuketang' | 'pta') => {
      navigate('sync')
      void window.classboard.sync.open(platform).catch((error) => {
        notify(error instanceof Error ? error.message : '无法打开同步窗口', 'error')
      })
    },
    [navigate, notify]
  )

  if (bootError) {
    return (
      <div className="boot-state">
        <BrandMark size={62} />
        <div className="boot-title">看板没能启动</div>
        <div className="boot-detail">{bootError}</div>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    )
  }

  if (!data || !info) {
    return (
      <div className={`boot-state ${layout === 'widget' ? 'is-widget-boot' : ''}`}>
        <BrandMark size={layout === 'widget' ? 54 : 66} />
        <div className="boot-title">正在翻开今天的看板…</div>
        <div className="boot-sub">本地数据载入中</div>
      </div>
    )
  }

  const contextValue = {
    data,
    info,
    now,
    notify,
    navigate,
    openSync,
    quickAddSignal,
    focusDeadlineId,
    layout: layout === 'widget' ? ('widget' as const) : ('main' as const)
  }

  return (
    <AppContext.Provider value={contextValue}>
      {layout === 'widget' ? (
        <Widget />
      ) : (
        <div className="app-frame">
          <TitleBar showSync={data.settings.onboardingDone} />
          {!data.settings.onboardingDone ? (
            <Onboarding />
          ) : (
            <div className="app-body">
              <Sidebar activeView={mainView} onNavigate={(next) => navigate(next)} />
              <main className="main-content">
                {mainView === 'today' ? <TodayView /> : null}
                {mainView === 'week' ? <WeekView /> : null}
                {mainView === 'deadlines' ? <DeadlinesView /> : null}
                {mainView === 'sync' ? <SyncView /> : null}
                {mainView === 'settings' ? <SettingsView /> : null}
              </main>
            </div>
          )}
        </div>
      )}
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </AppContext.Provider>
  )
}
