import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  X
} from 'lucide-react'
import type { SyncEvent, SyncPlatform } from '@shared/types'
import { IconButton } from './components/ui'

const TITLES: Record<SyncPlatform, string> = {
  hdu: '杭电教务',
  chaoxing: '学习通',
  yuketang: '雨课堂',
  pta: 'PTA'
}

export function SyncToolbar(): React.JSX.Element {
  const params = new URLSearchParams(window.location.search)
  const initialPlatform = (params.get('platform') as SyncPlatform | null) ?? 'hdu'
  const [state, setState] = useState<SyncEvent | null>(null)

  useEffect(() => {
    let alive = true
    void window.classboard.getSyncState().then((value) => {
      if (alive && value) setState(value)
    })
    const unsubscribe = window.classboard.onSyncEvent((event) => setState(event))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  const platform = state?.platform ?? initialPlatform
  const scanning = state?.phase === 'scanning' || state?.phase === 'opening'
  const host = (() => {
    try {
      return state?.url ? new URL(state.url).hostname : ''
    } catch {
      return ''
    }
  })()
  const captureLabel =
    platform === 'hdu'
      ? '读取课表'
      : platform === 'chaoxing'
        ? '读取作业'
        : platform === 'pta'
          ? '读取题目集'
          : '扫描当前页'
  const hasError = state?.phase === 'error'
  const pageTitle =
    state?.title?.trim() || (hasError ? '同步遇到问题' : state?.phase === 'login' ? '等待登录' : '正在加载页面…')
  const pageSecondary = hasError
    ? state?.error || state?.message || '页面没有正常工作'
    : host || state?.message || '等待页面加载'

  return (
    <div className="sync-chrome">
      <div className="sync-nav">
        <IconButton
          className="sync-nav-button"
          onClick={() => void window.classboard.sync.goBack()}
          aria-label="后退"
        >
          <ChevronLeft size={17} />
        </IconButton>
        <IconButton
          className="sync-nav-button"
          onClick={() => void window.classboard.sync.goForward()}
          aria-label="前进"
        >
          <ChevronRight size={17} />
        </IconButton>
        <IconButton
          className="sync-nav-button"
          onClick={() => void window.classboard.sync.refresh()}
          aria-label="刷新"
        >
          <RefreshCw size={15} />
        </IconButton>
      </div>

      <div className="sync-center">
        <div className="sync-platform-pill">{TITLES[platform]}</div>
        <div className="sync-page-title">
          <span>{pageTitle}</span>
          <em className={hasError ? 'is-error' : ''} title={pageSecondary}>
            {pageSecondary}
          </em>
        </div>
      </div>

      <div className="sync-actions">
        {hasError ? (
          <button
            type="button"
            className="sync-detail"
            onClick={() => void window.classboard.window.showMain({ view: 'sync' })}
          >
            <AlertCircle size={13} />
            看板内详情
          </button>
        ) : (
          <span className="sync-privacy">
            <ShieldCheck size={13} />
            不保存密码
          </span>
        )}
        <button
          type="button"
          className="sync-capture"
          disabled={scanning}
          onClick={() => void window.classboard.sync.captureCurrent()}
        >
          {scanning ? <LoaderCircle size={15} className="spin" /> : <ScanLine size={15} />}
          {scanning ? '读取中…' : captureLabel}
        </button>
        <IconButton
          className="sync-close"
          onClick={() => void window.classboard.sync.close()}
          aria-label="关闭同步窗口"
        >
          <X size={17} />
        </IconButton>
      </div>
    </div>
  )
}
