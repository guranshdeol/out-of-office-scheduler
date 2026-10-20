import { BrowserWindow, app, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type { ApplyDaysInput, NewAccountInput, Settings, StretchEdit } from '@shared/types'
import {
  addAccount,
  applyDays,
  applyLoginItem,
  cancelStretch,
  dismissCleanup,
  editStretch,
  reconnectAccount,
  removeAccount,
  runAccountTest,
  saveMessage,
  saveSettings,
  testUntestedAccounts,
  updateAccount
} from './actions'
import { setPwshPath } from './exo'
import { ensureRuntime } from './runtime'
import { refreshAuthStatuses, requestCheck, startScheduler } from './scheduler'
import { getConfig, initState, setRuntime, snapshot, subscribe } from './state'
import { createTray } from './tray'

let win: BrowserWindow | undefined
let quitting = false

const startHidden =
  process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)

const iconPath = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png')

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 880,
    minHeight: 620,
    show: false,
    title: 'OOO Scheduler',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    w.hide()
    if (process.platform === 'darwin') app.dock?.hide()
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

function show(view?: string): void {
  if (!win || win.isDestroyed()) win = createWindow()
  if (process.platform === 'darwin') void app.dock?.show()
  const reveal = (): void => {
    win?.show()
    win?.focus()
    if (view) win?.webContents.send('ooo:navigate', view)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal)
  else reveal()
}

const wrap =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  (_e: Electron.IpcMainInvokeEvent, ...args: A): Promise<R> =>
    fn(...args)

function registerIpc(): void {
  ipcMain.handle('ooo:getState', () => snapshot())
  ipcMain.handle('ooo:retrySetup', () => setup())
  ipcMain.handle('ooo:addAccount', wrap((input: NewAccountInput) => addAccount(input)))
  ipcMain.handle('ooo:reconnectAccount', wrap((id: string) => reconnectAccount(id)))
  ipcMain.handle('ooo:testAccount', wrap((id: string) => runAccountTest(id)))
  ipcMain.handle('ooo:updateAccount', wrap((id: string, patch: Parameters<typeof updateAccount>[1]) => updateAccount(id, patch)))
  ipcMain.handle('ooo:removeAccount', wrap((id: string) => removeAccount(id)))
  ipcMain.handle('ooo:saveMessage', wrap((message: string) => saveMessage(message)))
  ipcMain.handle('ooo:saveSettings', wrap((patch: Partial<Settings>) => saveSettings(patch)))
  ipcMain.handle('ooo:applyDays', wrap((input: ApplyDaysInput) => applyDays(input)))
  ipcMain.handle('ooo:editStretch', wrap((id: string, edit: StretchEdit) => editStretch(id, edit)))
  ipcMain.handle('ooo:cancelStretch', wrap((id: string) => cancelStretch(id)))
  ipcMain.handle('ooo:dismissCleanup', wrap((id: string) => dismissCleanup(id)))
  ipcMain.handle('ooo:runCheckNow', () => requestCheck('user'))
  subscribe((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('ooo:state', state)
  })
}

async function setup(): Promise<void> {
  try {
    const status = await ensureRuntime(setRuntime)
    setPwshPath(status.pwshPath!)
    await refreshAuthStatuses()
    await requestCheck('timer')
    await testUntestedAccounts()
  } catch (err) {
    setRuntime({ phase: 'error', message: (err as Error).message })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => show())
  app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => {
    // keep running in the menu bar so queued leave can be applied
  })
  app.on('activate', () => show())

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.ooo-scheduler.app')
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(iconPath())
    initState()
    registerIpc()
    applyLoginItem(getConfig().settings.launchAtLogin)
    createTray(show, snapshot())
    startScheduler(show)
    if (startHidden) {
      if (process.platform === 'darwin') app.dock?.hide()
    } else {
      show()
    }
    void setup()
  })
}
