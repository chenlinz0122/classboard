import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const dataDir = path.join(root, '.testdata', 'e2e')
const shots = path.join(root, '.screenshots')
fs.mkdirSync(shots, { recursive: true })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errors = []

function envFor(demo) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.CLASSBOARD_DATA_DIR = dataDir
  if (demo) env.CLASSBOARD_DEMO = '1'
  return env
}

async function launch(demo) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
    cwd: root,
    env: envFor(demo),
    timeout: 30_000
  })
  await wait(1600)
  return app
}

async function pageByView(app, view) {
  return app.windows().find((page) => page.url().includes(`view=${view}`)) ?? null
}

async function close(app) {
  try {
    await app.close()
  } catch {
    // already closed
  }
  await wait(500)
}

async function main() {
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })

  let app = await launch(true)
  let main = await pageByView(app, 'main')
  if (!main) throw new Error('main window missing')
  main.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  main.on('dialog', (dialog) => void dialog.accept())
  await main.waitForSelector('.today-page', { timeout: 10_000 })

  const pendingBefore = await main.locator('.nav-count').first().textContent()
  console.log('pending before', pendingBefore)

  const quick = main.locator('.quick-input')
  await quick.fill('线代作业 周五 23:59')
  await main.waitForSelector('.quick-preview')
  const preview = await main.locator('.quick-preview-title').textContent()
  console.log('quick preview', preview)
  await main.screenshot({ path: path.join(shots, '09-quick-preview.png') })
  await quick.press('Enter')
  await main.waitForSelector('.toast-success', { timeout: 8000 })
  console.log('quick add toast ok')

  await main.locator('.nav-item').filter({ hasText: '作业' }).click()
  await main.waitForSelector('.deadlines-page')
  const row = main.locator('.deadline-row').filter({ hasText: '线代作业' }).first()
  await row.waitFor({ timeout: 8000 })
  console.log('created deadline visible')

  await row.locator('.deadline-title').click()
  await main.waitForSelector('.modal-card')
  const titleInput = main.locator('.modal-card .text-input').first()
  await titleInput.fill('线代作业（已修改）')
  await main.screenshot({ path: path.join(shots, '10-deadline-editor.png') })
  await main.locator('.modal-footer .btn-primary').click()
  await main.waitForSelector('.modal-card', { state: 'detached' })
  await main.locator('.deadline-row').filter({ hasText: '线代作业（已修改）' }).first().waitFor()
  console.log('edit deadline ok')

  await main.locator('.segmented-item').filter({ hasText: '全部' }).click()
  await wait(250)
  const edited = main.locator('.deadline-row').filter({ hasText: '线代作业（已修改）' }).first()
  await edited.locator('.todo-check').click()
  await wait(300)
  if (!(await edited.evaluate((el) => el.classList.contains('is-completed')))) {
    throw new Error('toggle complete failed')
  }
  await edited.locator('.todo-check').click()
  await wait(300)
  console.log('toggle complete ok')

  await edited.locator('.deadline-title').click()
  await main.waitForSelector('.modal-card')
  await main.locator('.modal-footer .btn-danger-text').click()
  await wait(500)
  if (await main.locator('.deadline-row').filter({ hasText: '线代作业（已修改）' }).count()) {
    throw new Error('delete deadline failed')
  }
  console.log('delete deadline ok')

  await main.locator('.nav-item').filter({ hasText: '周课表' }).click()
  await main.waitForSelector('.week-page')
  await main.locator('.week-course').first().click()
  await main.waitForSelector('.modal-card')
  await main.screenshot({ path: path.join(shots, '11-course-editor.png') })
  await main.keyboard.press('Escape')
  await main.waitForSelector('.modal-card', { state: 'detached' })
  console.log('course editor ok')

  await main.locator('.nav-item').filter({ hasText: '设置' }).click()
  await main.waitForSelector('.settings-page')
  await main.locator('.segmented-item').filter({ hasText: '深色' }).click()
  await wait(500)
  await main.screenshot({ path: path.join(shots, '12-settings-dark.png') })
  await main.locator('.segmented-item').filter({ hasText: '浅色' }).click()
  await wait(300)
  console.log('theme switch ok')

  await main.locator('.nav-item').filter({ hasText: '同步' }).click()
  await main.waitForSelector('.sync-page')
  await main.locator('.platform-card').filter({ hasText: '杭电教务' }).getByRole('button', { name: /打开登录窗口/ }).click()
  await wait(2600)
  const toolbar = (await pageByView(app, 'sync')) ?? null
  if (toolbar) {
    await toolbar.waitForSelector('.sync-chrome', { timeout: 10_000 })
    await toolbar.locator('.sync-chrome').screenshot({ path: path.join(shots, '13-sync-toolbar.png') })
    const state = await toolbar.evaluate(() => window.classboard.getSyncState())
    console.log('sync state', JSON.stringify(state))
    await main.evaluate(() => window.classboard.sync.close())
    await wait(700)
  } else {
    console.warn('sync toolbar window missing')
  }
  if (await main.locator('.sync-status-card').count()) {
    await main.screenshot({ path: path.join(shots, '14-sync-status.png') })
  }

  const notificationSupported = await main.evaluate(() => window.classboard.app.testNotification())
  console.log('notification supported', notificationSupported)

  const persistent = await main.evaluate(async () => {
    const due = new Date()
    due.setDate(due.getDate() + 2)
    due.setHours(21, 30, 0, 0)
    return window.classboard.deadlines.create({
      title: 'E2E 持久化测试',
      dueAt: due.toISOString(),
      source: 'manual'
    })
  })
  console.log('persistent deadline created', persistent.id)
  await close(app)

  app = await launch(false)
  main = await pageByView(app, 'main')
  if (!main) throw new Error('relaunched main window missing')
  main.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  await main.waitForSelector('.today-page', { timeout: 10_000 })
  await main.locator('.nav-item').filter({ hasText: '作业' }).click()
  await main.waitForSelector('.deadlines-page')
  const search = main.locator('.search-box input')
  await search.fill('E2E 持久化测试')
  await main.locator('.deadline-row').filter({ hasText: 'E2E 持久化测试' }).first().waitFor({ timeout: 8000 })
  console.log('persistence ok')
  await main.screenshot({ path: path.join(shots, '15-persistence.png') })

  await main.evaluate(async () => {
    const boot = await window.classboard.bootstrap()
    const item = boot.data.deadlines.find((deadline) => deadline.title === 'E2E 持久化测试')
    if (item) await window.classboard.deadlines.remove(item.id)
  })
  await close(app)

  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('e2e ok')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
