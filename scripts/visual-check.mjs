import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const shots = path.join(root, '.screenshots')
fs.mkdirSync(shots, { recursive: true })

function envFor(dataDir, demo) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.CLASSBOARD_DATA_DIR = dataDir
  if (demo) env.CLASSBOARD_DEMO = '1'
  return env
}

async function launch(dataDir, demo) {
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
    cwd: root,
    env: envFor(dataDir, demo),
    timeout: 30_000
  })
  await new Promise((resolve) => setTimeout(resolve, 1800))
  return app
}

async function findPage(app, view) {
  const pages = app.windows()
  for (const page of pages) {
    const url = page.url()
    if (url.includes(`view=${view}`)) return page
  }
  return null
}

async function close(app) {
  try {
    await app.close()
  } catch {
    // app already gone
  }
  await new Promise((resolve) => setTimeout(resolve, 400))
}

async function main() {
  console.log('launch onboarding')
  let app = await launch(path.join(root, '.testdata', 'onboarding'), false)
  let main = await findPage(app, 'main')
  if (!main) throw new Error('main window not found')
  main.on('pageerror', (error) => console.error('PAGE ERROR', error.message))
  main.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE ERROR', message.text())
  })
  await main.waitForSelector('.onboarding', { timeout: 10_000 })
  await main.screenshot({ path: path.join(shots, '01-onboarding.png') })
  console.log('onboarding captured', await main.title())
  await close(app)

  console.log('launch demo')
  app = await launch(path.join(root, '.testdata', 'demo'), true)
  main = await findPage(app, 'main')
  const widget = await findPage(app, 'widget')
  if (!main) throw new Error('demo main window not found')
  main.on('pageerror', (error) => console.error('PAGE ERROR', error.message))
  main.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE ERROR', message.text())
  })
  await main.waitForSelector('.today-page', { timeout: 10_000 })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await main.screenshot({ path: path.join(shots, '02-today.png') })
  console.log('today captured')

  const views = [
    ['周课表', '.week-page', '03-week'],
    ['作业', '.deadlines-page', '04-deadlines'],
    ['同步', '.sync-page', '05-sync'],
    ['设置', '.settings-page', '06-settings']
  ]
  for (const [label, selector, name] of views) {
    await main.locator('.nav-item').filter({ hasText: label }).click()
    await main.waitForSelector(selector, { timeout: 8_000 })
    await new Promise((resolve) => setTimeout(resolve, 350))
    await main.screenshot({ path: path.join(shots, `${name}.png`) })
    console.log(name, 'captured')
  }

  await main.locator('.nav-item').filter({ hasText: '今日' }).click()
  await main.waitForSelector('.today-page', { timeout: 8_000 })
  await main.evaluate(() => window.classboard.settings.update({ theme: 'dark' }))
  await new Promise((resolve) => setTimeout(resolve, 500))
  await main.screenshot({ path: path.join(shots, '07-today-dark.png') })
  await main.evaluate(() => window.classboard.settings.update({ theme: 'light' }))

  if (widget) {
    widget.on('pageerror', (error) => console.error('WIDGET PAGE ERROR', error.message))
    await widget.waitForSelector('.widget-frame', { timeout: 10_000 })
    await widget.screenshot({ path: path.join(shots, '08-widget.png') })
    console.log('widget captured')
  } else {
    console.warn('widget window not found')
  }

  await close(app)
  console.log('done')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
