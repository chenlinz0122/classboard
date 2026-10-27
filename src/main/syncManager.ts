import { BrowserWindow, dialog, session as electronSession, WebContentsView } from 'electron'
import fs from 'node:fs/promises'
import type {
  AssignmentPlatform,
  HduSyncPreview,
  PlatformAssignment,
  PlatformSyncPreview,
  SyncCommitResult,
  SyncEvent,
  SyncPlatform
} from '@shared/types'
import { decodeHtmlBuffer, parseHduHtml } from '@shared/parseHduHtml'
import { parseZfKbList } from '@shared/parseZf'
import { looksLikeLoginPage, parseChaoxingWorks } from '@shared/parseChaoxing'
import { parsePtaProblemSets } from '@shared/parsePta'
import { parseDueText } from '@shared/parseQuickAdd'
import { hashText } from '@shared/colors'
import type { DataStore } from './store'
import type { WindowManager } from './windows'
import { buildAssignmentScanScript } from './pageExtract'
import { preloadPath, rendererHtmlPath, resourcePath } from './paths'

const TOOLBAR_HEIGHT = 54
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

const PLATFORM_INFO: Record<
  SyncPlatform,
  { label: string; loginUrl: string; partition: string; accent: string }
> = {
  hdu: {
    label: '杭电教务',
    // 现行入口：数字杭电 → 教务系统 → 信息查询 → 个人课表查询。
    loginUrl: 'https://i.hdu.edu.cn/',
    partition: 'persist:sync-hdu',
    accent: '#176b53'
  },
  chaoxing: {
    label: '学习通',
    // 杭电的网页端是泛雅平台（机构 fid=1001），不是通用 i.mooc.chaoxing.com 空间。
    loginUrl: 'https://hdu.fanya.chaoxing.com/portal',
    partition: 'persist:sync-chaoxing',
    accent: '#2471a3'
  },
  yuketang: {
    label: '雨课堂',
    loginUrl: 'https://www.yuketang.cn/web',
    partition: 'persist:sync-yuketang',
    accent: '#b3543c'
  },
  pta: {
    label: 'PTA',
    loginUrl: 'https://pintia.cn/',
    partition: 'persist:sync-pta',
    accent: '#8a6b2f'
  }
}

export class SyncManager {
  private syncWindow: BrowserWindow | null = null
  private contentView: WebContentsView | null = null
  private current: SyncPlatform | null = null
  private state: SyncEvent | null = null
  private pendingHdu: HduSyncPreview | null = null
  private pendingPlatform: PlatformSyncPreview | null = null
  private hduAutoTried = false
  private hduPortalTried = false
  private hduPortalRetries = 0
  private scanBusy = false

  constructor(
    private readonly store: DataStore,
    private readonly windows: WindowManager
  ) {}

  getState(): SyncEvent | null {
    return this.state
  }

  async open(platform: SyncPlatform): Promise<void> {
    this.destroyWindow()
    this.current = platform
    this.pendingHdu = null
    this.pendingPlatform = null
    this.hduAutoTried = false
    this.hduPortalTried = false
    this.hduPortalRetries = 0
    this.scanBusy = false
    this.windows.showMain({ view: 'sync' })
    this.setState({
      platform,
      phase: 'opening',
      message: `正在打开${PLATFORM_INFO[platform].label}登录页…`,
      canCapture: false
    })
    this.createWindow(platform)
  }

  private createWindow(platform: SyncPlatform): void {
    const info = PLATFORM_INFO[platform]
    const win = new BrowserWindow({
      width: 1180,
      height: 860,
      minWidth: 860,
      minHeight: 620,
      show: false,
      title: `登录 · ${info.label}`,
      backgroundColor: '#f7f3ea',
      autoHideMenuBar: true,
      icon: resourcePath('icon.png'),
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        webviewTag: false
      }
    })
    this.syncWindow = win
    win.setMenuBarVisibility(false)
    this.loadToolbar(win, platform)

    const ses = electronSession.fromPartition(info.partition)
    ses.setUserAgent(UA)
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })
    this.contentView = view
    win.contentView.addChildView(view)
    view.setBackgroundColor('#ffffff')
    this.layoutContent()

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        void view.webContents.loadURL(url)
      }
      return { action: 'deny' }
    })
    view.webContents.on('will-navigate', (event, url) => {
      if (!/^https?:\/\//i.test(url)) event.preventDefault()
    })
    view.webContents.on('did-start-loading', () => {
      if (!this.state) return
      this.setState({
        ...this.state,
        message: `页面加载中…`,
        canCapture: false
      })
    })
    view.webContents.on('did-finish-load', () => {
      void this.onContentLoaded()
    })
    view.webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) void this.onContentLoaded()
    })
    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return
      if (!this.state) return
      const hint = /(?:jxgl|i)\.hdu\.edu\.cn/.test(validatedURL)
        ? '教务页面没有打开。请确认已连接校园网/VPN；现行入口是 数字杭电 → 教务系统 → 信息查询 → 个人课表查询，也可以保存课表 HTML 后导入。'
        : '页面加载失败，请检查网络后重试。'
      this.setState({
        ...this.state,
        phase: 'error',
        message: hint,
        error: `${errorDescription} (${errorCode})`
      })
    })
    view.webContents.on('page-title-updated', (_event, title) => {
      if (this.state) this.setState({ ...this.state, title })
    })
    view.webContents.on('render-process-gone', (_event, details) => {
      if (this.state) {
        this.setState({
          ...this.state,
          phase: 'error',
          message: `页面进程异常退出（${details.reason}），请关闭后重试。`
        })
      }
    })

    win.on('resize', () => this.layoutContent())
    win.on('ready-to-show', () => {
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
      }
    })
    win.on('closed', () => {
      const stillPreview = Boolean(this.pendingHdu || this.pendingPlatform)
      const leftoverView = this.contentView
      this.contentView = null
      this.syncWindow = null
      this.disposeContentView(leftoverView)
      if (!stillPreview && this.state && !['done', 'preview', 'error'].includes(this.state.phase)) {
        this.setState({ ...this.state, phase: 'closed', message: '同步窗口已关闭。' })
      }
    })

    if (platform === 'pta') {
      view.webContents.on('did-stop-loading', () => {
        void this.onContentLoaded()
      })
      setTimeout(() => {
        if (this.current === 'pta' && this.state?.phase === 'opening') {
          void this.onContentLoaded()
        }
      }, 2200)
    }
    void view.webContents.loadURL(info.loginUrl)
  }

  private loadToolbar(win: BrowserWindow, platform: SyncPlatform): void {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl) {
      const url = new URL(rendererUrl)
      url.searchParams.set('view', 'sync')
      url.searchParams.set('platform', platform)
      void win.loadURL(url.toString())
    } else {
      void win.loadFile(rendererHtmlPath(), {
        query: { view: 'sync', platform }
      })
    }
  }

  private layoutContent(): void {
    const win = this.syncWindow
    const view = this.contentView
    if (!win || win.isDestroyed() || !view) return
    const { width, height } = win.getContentBounds()
    view.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, width),
      height: Math.max(0, height - TOOLBAR_HEIGHT)
    })
  }

  private async onContentLoaded(): Promise<void> {
    const view = this.contentView
    if (!view || view.webContents.isDestroyed() || !this.current) return
    const url = view.webContents.getURL()
    const title = view.webContents.getTitle()
    if (this.current === 'hdu') {
      await this.onHduPage(url, title)
    } else if (this.current === 'chaoxing') {
      const loginPage = /passport2\.chaoxing\.com\/login/i.test(url) || /登录/i.test(title)
      this.setState({
        platform: 'chaoxing',
        phase: loginPage ? 'login' : 'ready',
        message: loginPage
          ? '请完成学习通登录。登录后点【读取作业】，会自动读取全部未交作业。'
          : '登录后点【读取作业】。应用会直接读取学习通作业列表，不保存密码。',
        url,
        title,
        canCapture: !loginPage,
        error: undefined
      })
    } else if (this.current === 'pta') {
      const loginPage = /\/auth\/login|\/login/i.test(url) || /登录/i.test(title)
      this.setState({
        platform: 'pta',
        phase: loginPage ? 'login' : 'ready',
        message: loginPage
          ? '请在窗口内登录 PTA。登录后点【读取作业】，会读取所有未截止的题目集。'
          : '登录后点【读取作业】。应用会按题目集的截止时间生成 DDL，不读取题目内容。',
        url,
        title,
        canCapture: true,
        error: undefined
      })
    } else {
      const loginPage = /passport|login/i.test(url) && /登录/i.test(title)
      this.setState({
        platform: 'yuketang',
        phase: loginPage ? 'login' : 'ready',
        message: loginPage
          ? '请完成雨课堂登录，然后进入课程的“作业 / 待办”列表。'
          : '请进入课程的“作业 / 待办”列表，再点【扫描当前页】。扫描结果需要你核对。',
        url,
        title,
        canCapture: !loginPage,
        error: undefined
      })
    }
  }

  private async onHduPage(url: string, title: string): Promise<void> {
    let host = ''
    let pathName = ''
    try {
      const parsed = new URL(url)
      host = parsed.hostname
      pathName = parsed.pathname
    } catch {
      // ignore
    }

    if (host.includes('sso.hdu.edu.cn') || host.includes('cas.hdu.edu.cn')) {
      this.setState({
        platform: 'hdu',
        phase: 'login',
        message: '请在窗口内完成杭电统一认证登录。应用不会保存账号密码。',
        url,
        title,
        canCapture: false,
        error: undefined
      })
      return
    }

    if (host.includes('i.hdu.edu.cn')) {
      const looksLikeLogin =
        /\/login/i.test(pathName) || (/登录/.test(title) && !/数字杭电|办事大厅|智慧杭电/.test(title))
      if (looksLikeLogin) {
        this.setState({
          platform: 'hdu',
          phase: 'login',
          message: '请在窗口内登录数字杭电。登录后会尝试自动寻找「教务系统」。',
          url,
          title,
          canCapture: false,
          error: undefined
        })
        return
      }
      this.setState({
        platform: 'hdu',
        phase: 'ready',
        message: this.hduPortalTried
          ? '请在数字杭电页面点击「教务系统」，进入后打开 信息查询 → 个人课表查询。'
          : '已登录数字杭电，正在寻找「教务系统」入口…',
        url,
        title,
        canCapture: true,
        error: undefined
      })
      if (!this.hduPortalTried) {
        this.hduPortalTried = true
        await this.tryNavigateHduPortal()
      }
      return
    }

    if (host.includes('jxgl.hdu.edu.cn')) {
      if (/xskbcx\.aspx/i.test(pathName)) {
        this.setState({
          platform: 'hdu',
          phase: 'ready',
          message: '已打开旧版「学生个人课表」，点【读取课表】。',
          url,
          title,
          canCapture: true,
          error: undefined
        })
        return
      }
      this.setState({
        platform: 'hdu',
        phase: 'ready',
        message: this.hduAutoTried
          ? '请在页面中打开 信息查询 → 学生个人课表，然后点【读取课表】。'
          : '正在定位旧版「学生个人课表」…',
        url,
        title,
        canCapture: true,
        error: undefined
      })
      if (!this.hduAutoTried) {
        this.hduAutoTried = true
        await this.tryNavigateHduTimetable()
      }
      return
    }

    this.setState({
      platform: 'hdu',
      phase: 'ready',
      message: host.includes('newjw.hdu.edu.cn')
        ? '已进入新版教务。直接点【读取课表】即可读取接口（周次取自 zcd）；如果失败，再打开 信息查询 → 个人课表查询。'
        : '已进入教务系统。请打开 信息查询 → 个人课表查询，等课表加载完成后点【读取课表】。',
      url,
      title,
      canCapture: true,
      error: undefined
    })
  }

  private async tryNavigateHduPortal(): Promise<void> {
    const view = this.contentView
    if (!view) return
    try {
      const result = (await view.webContents.executeJavaScript(
        `(() => {
          const candidates = [];
          const visit = (win) => {
            try {
              const doc = win.document;
              const nodes = doc.querySelectorAll('a,button,[role="button"],li,div,span');
              for (const el of nodes) {
                const text = (el.textContent || '').replace(/\\s+/g, '').trim();
                if (!text || text.length > 24) continue;
                if (!/教务系统|教务管理|教学管理|选课系统/.test(text)) continue;
                if (/教务处|使用说明|帮助|通知|公告/.test(text)) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width < 8 || rect.height < 8) continue;
                const rawHref = el.getAttribute ? (el.getAttribute('href') || '') : '';
                const href = el.href || rawHref;
                if (/^https?:/i.test(href) && !/^javascript:/i.test(href)) {
                  candidates.push({ kind: 'link', href, text });
                } else {
                  candidates.push({ kind: 'click', href: '', text, element: el });
                }
              }
              for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
            } catch (e) {}
          };
          visit(window);
          const link = candidates.find((item) => item.kind === 'link');
          if (link) return { href: link.href, clicked: false, text: link.text };
          const button = candidates.find((item) => item.element && item.element.click);
          if (button) {
            button.element.click();
            return { href: '', clicked: true, text: button.text };
          }
          return { href: '', clicked: false, text: '' };
        })()`,
        true
      )) as { href: string; clicked: boolean; text: string }

      if (result.href) {
        this.setState({
          ...(this.state as SyncEvent),
          message: '已找到「教务系统」入口，正在打开…',
          canCapture: false
        })
        await view.webContents.loadURL(result.href)
        return
      }
      if (result.clicked) {
        this.setState({
          ...(this.state as SyncEvent),
          message: '正在打开「教务系统」…',
          canCapture: false
        })
        return
      }
      if (this.hduPortalRetries < 2) {
        this.hduPortalRetries += 1
        setTimeout(() => {
          const currentUrl = this.contentView?.webContents.getURL() ?? ''
          if (this.current === 'hdu' && this.syncWindow && currentUrl.includes('i.hdu.edu.cn')) {
            void this.tryNavigateHduPortal()
          }
        }, 1600)
      }
      if (this.state) {
        this.setState({
          ...this.state,
          message:
            '已登录数字杭电。请在页面中点击「教务系统」，进入后打开 信息查询 → 个人课表查询。'
        })
      }
    } catch (error) {
      console.warn('自动寻找教务系统入口失败', error)
      if (this.state) {
        this.setState({
          ...this.state,
          message:
            '已登录数字杭电。请手动点击「教务系统」，进入后打开 信息查询 → 个人课表查询。'
        })
      }
    }
  }

  private async tryNavigateHduTimetable(): Promise<void> {
    const view = this.contentView
    if (!view) return
    try {
      const result = (await view.webContents.executeJavaScript(
        `(() => {
          const links = [];
          const ids = [];
          const names = [];
          const visit = (win) => {
            try {
              const doc = win.document;
              for (const a of doc.querySelectorAll('a')) {
                const href = a.href || '';
                const text = (a.textContent || '').replace(/\\s+/g, '');
                if (href) links.push({ href, text });
              }
              for (const el of doc.querySelectorAll('input')) {
                if (el.name === 'xh' || el.id === 'xh' || el.id === 'xh_id') ids.push(el.value || '');
              }
              const nameEl = doc.querySelector('#xhxm');
              if (nameEl) names.push((nameEl.textContent || '').trim());
              for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
            } catch (e) {}
          };
          visit(window);
          return { links, ids, names };
        })()`,
        true
      )) as { links: Array<{ href: string; text: string }>; ids: string[]; names: string[] }

      const direct = result.links.find(
        (link) => /xskbcx\.aspx/i.test(link.href) || /学生个人课表|个人课表/.test(link.text)
      )
      if (direct?.href) {
        this.setState({
          ...(this.state as SyncEvent),
          message: '已定位课表入口，正在打开…',
          canCapture: false
        })
        await view.webContents.loadURL(direct.href)
        return
      }
      const xh = result.ids.find(Boolean)
      if (xh) {
        this.setState({
          ...(this.state as SyncEvent),
          message: '正在直接打开学生个人课表…',
          canCapture: false
        })
        await view.webContents.loadURL(
          `http://jxgl.hdu.edu.cn/xskbcx.aspx?xh=${encodeURIComponent(xh)}&gnmkdm=N121603`
        )
        return
      }
      if (this.state) {
        this.setState({
          ...this.state,
          message: '登录成功。请在页面中打开 信息查询 → 学生个人课表，然后点【读取课表】。'
        })
      }
    } catch (error) {
      console.warn('自动定位课表失败', error)
      if (this.state) {
        this.setState({
          ...this.state,
          message: '登录成功。请在页面中打开 信息查询 → 学生个人课表，然后点【读取课表】。'
        })
      }
    }
  }

  async captureCurrent(): Promise<void> {
    if (!this.current || this.scanBusy) return
    this.scanBusy = true
    try {
      if (this.current === 'hdu') await this.captureHdu()
      else if (this.current === 'chaoxing') await this.captureChaoxing()
      else if (this.current === 'pta') await this.capturePta()
      else await this.captureYuketang()
    } finally {
      this.scanBusy = false
    }
  }

  private async captureNewZfSchedule(): Promise<void> {
    const view = this.contentView
    if (!view) {
      this.fail('登录窗口已经关闭，请重新打开。')
      return
    }
    this.setScanning('正在读取新版教务课表接口…')
    try {
      const result = (await view.webContents.executeJavaScript(
        `(async () => {
          try {
            const pickValue = (doc, selector) => {
              const el = doc.querySelector(selector);
              if (!el) return '';
              const selected = el.querySelector('option[selected]');
              return String(
                (selected && selected.value) ||
                el.value ||
                (el.options && el.options[0] && el.options[0].value) ||
                ''
              ).trim();
            };
            const readTerm = (doc) => ({
              xnm: pickValue(doc, '#xnm'),
              xqm: pickValue(doc, '#xqm')
            });
            let term = { xnm: '', xqm: '' };
            if (location.pathname.includes('/kbcx/xskbcx_cxXskbcxIndex.html')) {
              term = readTerm(document);
            }
            if (!term.xnm || !term.xqm) {
              const html = await fetch(
                '/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default',
                { credentials: 'include' }
              ).then((response) => response.text());
              const doc = new DOMParser().parseFromString(html, 'text/html');
              term = readTerm(doc);
            }
            if (!term.xnm || !term.xqm) {
              return { ok: false, reason: '没有读到学年学期，请先打开 信息查询 → 个人课表查询。' };
            }
            const body = new URLSearchParams();
            body.set('xnm', term.xnm);
            body.set('xqm', term.xqm);
            body.set('kzlx', 'ck');
            body.set('xsdm', '');
            body.set('kclbdm', '');
            body.set('kclxdm', '');
            const response = await fetch('/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
              },
              body: body.toString()
            });
            const text = await response.text();
            if (!response.ok) {
              return { ok: false, reason: '接口返回 HTTP ' + response.status + '，登录可能已失效。' };
            }
            let data;
            try {
              data = JSON.parse(text);
            } catch (error) {
              return { ok: false, reason: '接口返回的不是 JSON，登录可能已失效。' };
            }
            return {
              ok: true,
              data,
              xnm: term.xnm,
              xqm: term.xqm,
              url: location.href,
              title: document.title
            };
          } catch (error) {
            return { ok: false, reason: String(error && error.message ? error.message : error) };
          }
        })()`,
        true
      )) as {
        ok: boolean
        reason?: string
        data?: unknown
        xnm?: string
        xqm?: string
        url?: string
        title?: string
      }

      if (!result.ok) {
        this.fail(
          `新版教务接口读取失败：${result.reason ?? '未知错误'}。请确认已登录，并在页面中打开 信息查询 → 个人课表查询。`,
          true
        )
        return
      }
      const parsed = parseZfKbList(result.data)
      if (parsed.courses.length === 0) {
        this.fail(
          `新版教务接口没有返回可识别课程。${parsed.warnings.join('；')} 请确认学年学期和个人课表已加载。`,
          true
        )
        return
      }
      const preview: HduSyncPreview = {
        courses: parsed.courses,
        semesterLabel: result.xnm ? `${result.xnm} · 学期 ${result.xqm}` : undefined,
        capturedAt: new Date().toISOString(),
        warnings: [...parsed.warnings, '已从新版教务接口读取；课程周次取自 zcd 字段'],
        source: 'login'
      }
      this.pendingHdu = preview
      this.pendingPlatform = null
      this.setState({
        platform: 'hdu',
        phase: 'preview',
        message: `已读取 ${preview.courses.length} 门课程（含精确周次），请核对后写入看板。`,
        url: result.url,
        title: result.title,
        canCapture: true,
        hduPreview: preview,
        error: undefined
      })
      setTimeout(() => {
        this.destroyWindow()
        this.windows.showMain({ view: 'sync' })
      }, 220)
    } catch (error) {
      this.fail(
        `读取新版教务接口失败：${error instanceof Error ? error.message : String(error)}`,
        true
      )
    }
  }

  private async captureHdu(): Promise<void> {
    const view = this.contentView
    if (!view) {
      this.fail('登录窗口已经关闭，请重新打开。')
      return
    }
    const currentUrl = view.webContents.getURL()
    if (/newjw\.hdu\.edu\.cn|\/jwglxt\//i.test(currentUrl)) {
      await this.captureNewZfSchedule()
      return
    }
    this.setScanning('正在读取课表 HTML…')
    try {
      const result = (await view.webContents.executeJavaScript(
        `(() => {
          const docs = [];
          const visit = (win) => {
            try {
              docs.push(win.document.documentElement.outerHTML);
              for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
            } catch (e) {}
          };
          visit(window);
          const tables = document.querySelectorAll('table, .kb, .timetable, [class*="kbtable"], [class*="schedule"]');
          return {
            ok: true,
            html: docs.join('\\n<!-- frame -->\\n'),
            url: location.href,
            title: document.title,
            hasTable: tables.length > 0
          };
        })()`,
        true
      )) as {
        ok: boolean
        message?: string
        html?: string
        url?: string
        title?: string
        hasTable?: boolean
      }

      if (!result.ok || !result.html) {
        this.fail(result.message ?? '当前页面没有内容，请先打开个人课表查询。', true)
        return
      }
      const frameParts = [result.html]
      try {
        const mainFrame = view.webContents.mainFrame
        for (const frame of mainFrame.framesInSubtree) {
          if (frame === mainFrame || frame.detached) continue
          try {
            const frameHtml = (await frame.executeJavaScript(
              'document.documentElement ? document.documentElement.outerHTML : ""',
              true
            )) as string
            if (frameHtml) frameParts.push(frameHtml)
          } catch {
            // cross-origin frames sometimes refuse script injection
          }
        }
      } catch {
        // frame tree may be gone
      }
      const preview = parseHduHtml(frameParts.join('\n<!-- frame -->\n'))
      preview.source = 'login'
      if (preview.courses.length === 0) {
        this.fail(
          `没有从当前页面识别到课表。请确认已经打开「信息查询 → 个人课表查询」并等表格加载完成。如果页面已经改版，请在浏览器里 Ctrl+S 保存该页，再用「导入 HTML」并把文件反馈给我适配。${
            preview.warnings.length ? `（${preview.warnings.join('；')}）` : ''
          }`,
          true
        )
        return
      }
      this.pendingHdu = preview
      this.pendingPlatform = null
      this.setState({
        platform: 'hdu',
        phase: 'preview',
        message: `已读取 ${preview.courses.length} 门课程，请核对后写入看板。`,
        url: result.url,
        title: result.title,
        canCapture: true,
        hduPreview: preview,
        error: undefined
      })
      setTimeout(() => {
        this.destroyWindow()
        this.windows.showMain({ view: 'sync' })
      }, 220)
    } catch (error) {
      this.fail(`读取课表失败：${error instanceof Error ? error.message : String(error)}`, true)
    }
  }

  private async captureChaoxing(): Promise<void> {
    const info = PLATFORM_INFO.chaoxing
    const ses = electronSession.fromPartition(info.partition)
    const view = this.contentView
    if (!view) {
      this.fail('登录窗口已经关闭，请重新打开。')
      return
    }
    this.setScanning('正在读取学习通作业列表…')
    try {
      const cookies = await ses.cookies.get({})
      if (cookies.length === 0) {
        this.fail('还没有检测到学习通登录态，请先在窗口内完成登录。', true)
        return
      }
      const url = 'https://mooc1-api.chaoxing.com/work/stu-work'
      const headers: Record<string, string> = {
        'User-Agent': UA,
        Referer: 'https://i.chaoxing.com/',
        Accept: 'text/html,application/xhtml+xml'
      }
      const first = await ses.fetch(url, { method: 'GET', headers })
      let text = await first.text()
      if (looksLikeLoginPage(text) || first.status === 401) {
        const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
        const second = await ses.fetch(url, {
          method: 'GET',
          headers: { ...headers, Cookie: cookieHeader }
        })
        text = await second.text()
        if (looksLikeLoginPage(text) || second.status === 401) {
          this.fail('学习通登录态已失效，请在窗口内重新登录后再试。', true)
          return
        }
      }
      if (first.status >= 400) throw new Error(`接口返回 HTTP ${first.status}`)
      const now = new Date()
      const items = parseChaoxingWorks(text, now)
      if (items.length > 0) {
        const warnings: string[] = []
        const withoutDue = items.filter((item) => !item.dueAt).length
        if (withoutDue > 0) warnings.push(`${withoutDue} 条作业没有读到剩余时间，导入后需要手动补截止时间`)
        this.finishPlatformPreview('chaoxing', items, warnings, 'api')
        return
      }
      await this.pageFallback(
        'chaoxing',
        '学习通接口没有返回作业，正在扫描当前页面…',
        '学习通接口没有返回作业。'
      )
    } catch (error) {
      await this.pageFallback(
        'chaoxing',
        '接口读取失败，正在尝试扫描当前页面…',
        `读取学习通失败：${error instanceof Error ? error.message : String(error)}。`
      )
    }
  }

  private async capturePta(): Promise<void> {
    if (!this.contentView) {
      this.fail('登录窗口已经关闭，请重新打开。')
      return
    }
    this.setScanning('正在读取 PTA 题目集…')
    try {
      const parsed = await this.fetchPtaAssignments()
      if (parsed.items.length === 0) {
        await this.pageFallback(
          'pta',
          'PTA 接口没有返回未截止题目集，正在扫描当前页面…',
          'PTA 没有返回未截止题目集。'
        )
        return
      }
      this.finishPlatformPreview('pta', parsed.items, parsed.warnings, 'api')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('PTA_NOT_LOGGED_IN')) {
        this.fail('PTA 还没有登录或登录已失效。请先在窗口内登录，再点【读取作业】。', true)
        return
      }
      await this.pageFallback(
        'pta',
        '接口读取失败，正在尝试扫描当前页面…',
        `读取 PTA 失败：${message}。`
      )
    }
  }

  private async fetchPtaAssignments(): Promise<{
    items: PlatformAssignment[]
    warnings: string[]
  }> {
    const ses = electronSession.fromPartition(PLATFORM_INFO.pta.partition)
    const cookies = await ses.cookies.get({})
    if (!cookies.some((cookie) => cookie.name === 'PTASession')) {
      throw new Error('PTA_NOT_LOGGED_IN')
    }
    const filter = encodeURIComponent(JSON.stringify({ endAtAfter: new Date().toISOString() }))
    const url = `https://pintia.cn/api/problem-sets?filter=${filter}`
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: 'https://pintia.cn/problem-sets'
    }
    let response = await ses.fetch(url, { method: 'GET', headers })
    let text = await response.text()
    if (response.status === 404 && /USER_NOT_FOUND/i.test(text)) {
      // 某些 Electron 会话不会自动带上 HttpOnly cookie，显式重试一次。
      const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
      response = await ses.fetch(url, {
        method: 'GET',
        headers: { ...headers, Cookie: cookieHeader }
      })
      text = await response.text()
    }
    if (response.status === 404 && /USER_NOT_FOUND/i.test(text)) {
      throw new Error('PTA_NOT_LOGGED_IN')
    }
    if (!response.ok) throw new Error(`接口返回 HTTP ${response.status}`)
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error('PTA 返回的不是有效 JSON')
    }
    return parsePtaProblemSets(payload, new Date())
  }

  private async captureYuketang(): Promise<void> {
    try {
      const scanned = await this.scanPageAssignments('yuketang', '正在扫描当前作业页面…')
      if (scanned.items.length === 0) {
        this.fail(scanned.emptyMessage, true)
        return
      }
      this.finishPlatformPreview(
        'yuketang',
        scanned.items,
        scanned.warnings,
        'page',
        scanned.url,
        scanned.title
      )
    } catch (error) {
      this.fail(`扫描当前页失败：${error instanceof Error ? error.message : String(error)}`, true)
    }
  }

  private async pageFallback(
    platform: AssignmentPlatform,
    scanningMessage: string,
    reason: string
  ): Promise<void> {
    try {
      const scanned = await this.scanPageAssignments(platform, scanningMessage)
      if (scanned.items.length === 0) {
        this.fail(
          `${reason} 页面扫描也没有识别到作业。请先打开具体课程的作业列表，再点一次读取。`,
          true
        )
        return
      }
      this.finishPlatformPreview(
        platform,
        scanned.items,
        [reason, ...scanned.warnings],
        'page',
        scanned.url,
        scanned.title
      )
    } catch (error) {
      this.fail(
        `${reason} 页面扫描失败：${error instanceof Error ? error.message : String(error)}`,
        true
      )
    }
  }

  private async scanPageAssignments(
    platform: AssignmentPlatform,
    scanningMessage: string
  ): Promise<{
    items: PlatformAssignment[]
    warnings: string[]
    title: string
    url: string
    emptyMessage: string
  }> {
    const view = this.contentView
    if (!view) throw new Error('登录窗口已经关闭，请重新打开。')
    this.setScanning(scanningMessage)
    const result = (await view.webContents.executeJavaScript(
      buildAssignmentScanScript(),
      true
    )) as {
      items: Array<{
        title: string
        dueText?: string
        courseName?: string
        sourceUrl?: string
        statusText?: string
        completed?: boolean
      }>
      title?: string
      url?: string
      warning?: string
    }
    const scannedAt = new Date()
    const items: PlatformAssignment[] = (result.items ?? []).map((item, index) => {
      const due = item.dueText ? parseDueText(item.dueText, scannedAt) : null
      const externalId = `page-${hashText(
        [item.title, item.courseName ?? '', item.dueText ?? '', item.sourceUrl ?? ''].join('|')
      )}`
      return {
        tempId: `${platform}-${index}`,
        externalId,
        title: item.title.trim(),
        courseName: item.courseName?.trim() ?? '',
        dueAt: due?.dueAt ?? null,
        dueText: item.dueText,
        sourceUrl: item.sourceUrl,
        statusText: item.statusText,
        completed: Boolean(item.completed),
        selected: !item.completed
      }
    })
    const warnings = ['页面扫描为实验性功能，请在下方逐条核对标题、课程和截止时间后再导入。']
    const withoutDue = items.filter((item) => !item.dueAt).length
    if (withoutDue > 0) warnings.push(`${withoutDue} 条作业没有识别到截止时间，需要手动补充`)
    return {
      items,
      warnings,
      title: result.title ?? view.webContents.getTitle(),
      url: result.url ?? view.webContents.getURL(),
      emptyMessage:
        result.warning ||
        '当前页没有识别到作业。请先进入具体课程的“作业 / 待办”列表，等页面加载完成后重试。'
    }
  }

  private finishPlatformPreview(
    platform: AssignmentPlatform,
    items: PlatformAssignment[],
    warnings: string[],
    source: 'api' | 'page',
    url?: string,
    title?: string
  ): void {
    if (items.length === 0) {
      this.fail('没有可写入的作业。', true)
      return
    }
    const view = this.contentView
    const preview: PlatformSyncPreview = {
      platform,
      items,
      capturedAt: new Date().toISOString(),
      warnings: [...new Set(warnings)],
      source
    }
    this.pendingPlatform = preview
    this.pendingHdu = null
    this.setState({
      platform,
      phase: 'preview',
      message:
        platform === 'chaoxing'
          ? `已读取 ${items.filter((item) => !item.completed).length} 条未交作业，请核对后写入。`
          : platform === 'pta'
            ? `已读取 ${items.length} 个未截止题目集，请核对后写入。`
            : `已扫描到 ${items.length} 条候选作业，请核对后写入。`,
      url: url ?? view?.webContents.getURL(),
      title: title ?? view?.webContents.getTitle(),
      canCapture: true,
      platformPreview: preview,
      error: undefined
    })
    setTimeout(() => {
      this.destroyWindow()
      this.windows.showMain({ view: 'sync' })
    }, 220)
  }

  private setScanning(message: string): void {
    if (!this.current) return
    this.setState({
      platform: this.current,
      phase: 'scanning',
      message,
      canCapture: false
    })
  }

  private fail(message: string, keepWindow = false): void {
    if (!this.current) return
    this.setState({
      platform: this.current,
      phase: 'error',
      message,
      error: message,
      canCapture: keepWindow
    })
  }

  async commitHdu(mode: 'merge' | 'replace'): Promise<SyncCommitResult> {
    if (!this.pendingHdu) throw new Error('没有待确认的课表')
    const result = await this.store.applyHduCourses(this.pendingHdu, mode)
    this.pendingHdu = null
    this.setState({
      platform: 'hdu',
      phase: 'done',
      message: `课表已更新：新增 ${result.added} 门，更新 ${result.updated} 门，保留 ${result.skipped} 门。`,
      canCapture: false,
      commitResult: result
    })
    return result
  }

  async commitPlatform(
    platform: AssignmentPlatform,
    items: PlatformAssignment[]
  ): Promise<SyncCommitResult> {
    if (!this.pendingPlatform || this.pendingPlatform.platform !== platform) {
      throw new Error('没有待确认的作业列表')
    }
    const selected = items.filter((item) => item.selected !== false && item.title.trim())
    const result = await this.store.upsertPlatformDeadlines(
      platform,
      selected,
      {
        accountLabel: PLATFORM_INFO[platform].label,
        warning: this.pendingPlatform.warnings.join('；') || undefined
      }
    )
    this.pendingPlatform = null
    this.setState({
      platform,
      phase: 'done',
      message: `作业已写入：新增 ${result.added} 条，更新 ${result.updated} 条。`,
      canCapture: false,
      commitResult: result
    })
    return result
  }

  async discardPreview(): Promise<void> {
    this.pendingHdu = null
    this.pendingPlatform = null
    if (!this.current) return
    this.setState({
      platform: this.current,
      phase: 'idle',
      message: '已放弃本次读取结果。',
      canCapture: false
    })
  }

  async importHduHtml(): Promise<{ canceled: boolean }> {
    const parent = this.windows.getMainWindow()
    const options = {
      title: '导入已保存的杭电课表 HTML',
      properties: ['openFile' as const],
      filters: [
        { name: '网页文件', extensions: ['html', 'htm'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    const picked = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }
    try {
      const buffer = await fs.readFile(picked.filePaths[0])
      const html = decodeHtmlBuffer(buffer)
      const preview = parseHduHtml(html)
      preview.source = 'html'
      this.current = 'hdu'
      this.pendingHdu = preview
      this.pendingPlatform = null
      this.windows.showMain({ view: 'sync' })
      if (preview.courses.length === 0) {
        this.setState({
          platform: 'hdu',
          phase: 'error',
          message: preview.warnings.join('；') || '没有从 HTML 中识别到课程。',
          error: preview.warnings.join('；'),
          hduPreview: preview,
          canCapture: false
        })
      } else {
        this.setState({
          platform: 'hdu',
          phase: 'preview',
          message: `已从 HTML 读取 ${preview.courses.length} 门课程，请核对后写入看板。`,
          hduPreview: preview,
          canCapture: false
        })
      }
      return { canceled: false }
    } catch (error) {
      this.setState({
        platform: 'hdu',
        phase: 'error',
        message: `导入 HTML 失败：${error instanceof Error ? error.message : String(error)}`,
        error: String(error),
        canCapture: false
      })
      return { canceled: false }
    }
  }

  async clearSession(platform: SyncPlatform): Promise<void> {
    const info = PLATFORM_INFO[platform]
    const ses = electronSession.fromPartition(info.partition)
    await ses.clearStorageData()
    await ses.clearCache()
    try {
      await ses.clearAuthCache()
    } catch {
      // not available on all platforms
    }
    if (this.current === platform) {
      this.hduAutoTried = false
      if (this.contentView && !this.contentView.webContents.isDestroyed()) {
        await this.contentView.webContents.loadURL(info.loginUrl)
      } else {
        this.setState({
          platform,
          phase: 'login',
          message: '登录信息已清除，重新打开同步窗口即可重新登录。',
          canCapture: false
        })
      }
    }
  }

  async goBack(): Promise<void> {
    const history = this.contentView?.webContents.navigationHistory
    if (history?.canGoBack()) history.goBack()
  }

  async goForward(): Promise<void> {
    const history = this.contentView?.webContents.navigationHistory
    if (history?.canGoForward()) history.goForward()
  }

  async refresh(): Promise<void> {
    this.contentView?.webContents.reload()
  }

  async close(): Promise<void> {
    const hadPreview = Boolean(this.pendingHdu || this.pendingPlatform)
    this.destroyWindow()
    if (!hadPreview && this.state) {
      this.setState({
        ...this.state,
        phase: 'closed',
        message: '同步窗口已关闭。'
      })
    }
  }

  private disposeContentView(view: WebContentsView | null): void {
    if (!view) return
    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close({ waitForBeforeUnload: false })
      }
    } catch {
      // webContents may already be gone
    }
  }

  private destroyWindow(): void {
    const win = this.syncWindow
    const view = this.contentView
    this.syncWindow = null
    this.contentView = null
    if (win && !win.isDestroyed()) {
      try {
        if (view) win.contentView.removeChildView(view)
      } catch {
        // window may already be disposing
      }
      this.disposeContentView(view)
      win.destroy()
    } else {
      this.disposeContentView(view)
    }
  }

  private setState(next: SyncEvent): void {
    this.state = next
    this.windows.broadcast('sync:event', next)
    const toolbar = this.syncWindow?.webContents
    if (toolbar && !toolbar.isDestroyed()) toolbar.send('sync:event', next)
  }

  destroy(): void {
    this.destroyWindow()
  }
}

export function syncPlatformLabel(platform: SyncPlatform): string {
  return PLATFORM_INFO[platform].label
}

export function syncPlatformAccent(platform: SyncPlatform): string {
  return PLATFORM_INFO[platform].accent
}
