import { Menu, Tray, app, nativeImage, shell, type NativeImage } from 'electron'
import { join } from 'node:path'
import { stretchEndMs, stretchStartMs } from '@shared/dates'
import type { AppState } from '@shared/types'
import { describeStretch, requestCheck } from './scheduler'
import { subscribe } from './state'
import { checkForUpdates } from './updates'

const trayDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'tray') : join(app.getAppPath(), 'resources', 'tray')

/** macOS gets a template image (tinted by the system for light/dark menu bars); other platforms get the coloured icon. */
function trayIcon(): NativeImage {
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(join(trayDir(), 'trayTemplate.png'))
    icon.setTemplateImage(true)
    return icon
  }
  return nativeImage.createFromPath(join(trayDir(), 'tray.png'))
}

let tray: Tray | undefined

function statusLine(state: AppState): string {
  const now = Date.now()
  const upcoming = state.config.stretches
    .filter((s) => stretchEndMs(s) > now)
    .sort((a, b) => stretchStartMs(a) - stretchStartMs(b))
  if (upcoming.length === 0) return 'No leave scheduled'
  const s = upcoming[0]
  const label = { live: 'set in Outlook', partial: 'partly set', failed: 'failed', applying: 'applying…', queued: 'queued', done: 'done' }[
    state.stretchStates[s.id] ?? 'queued'
  ]
  const more = upcoming.length > 1 ? ` (+${upcoming.length - 1} queued)` : ''
  return `${describeStretch(s)}: ${label}${more}`
}

function buildMenu(state: AppState, show: (view?: string) => void): Menu {
  const needsSignIn = state.config.accounts.filter((a) => state.accountStatus[a.id]?.auth === 'needs-signin')
  return Menu.buildFromTemplate([
    { label: statusLine(state), enabled: false },
    ...(needsSignIn.length
      ? [{ label: `Reconnect: ${needsSignIn.map((a) => a.nickname).join(', ')}`, click: () => show('accounts') }]
      : []),
    { type: 'separator' },
    ...(state.update.latest
      ? [
          {
            label: `Download update ${state.update.latest.version}…`,
            click: () => void shell.openExternal(state.update.latest!.url)
          },
          { type: 'separator' as const }
        ]
      : []),
    { label: 'Open OOO Scheduler', click: () => show() },
    { label: state.schedulerBusy ? 'Checking…' : 'Check now', enabled: !state.schedulerBusy, click: () => void requestCheck('user') },
    {
      label: state.update.checking ? 'Checking for updates…' : 'Check for updates',
      enabled: !state.update.checking,
      click: () => {
        // Show the result in the app too, in case notifications are turned off.
        show('message')
        void checkForUpdates('user')
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

export function createTray(show: (view?: string) => void, initial: AppState): void {
  const isMac = process.platform === 'darwin'
  tray = new Tray(trayIcon())
  tray.setToolTip('OOO Scheduler')
  const refresh = (state: AppState): void => tray?.setContextMenu(buildMenu(state, show))
  refresh(initial)
  subscribe(refresh)
  if (!isMac) tray.on('click', () => show())
}
