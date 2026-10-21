import { Notification, app, net, shell } from 'electron'
import { isNewerVersion } from '@shared/version'
import { getConfig, getUpdateStatus, mutateConfig, setUpdateStatus } from './state'

/**
 * Checks GitHub for a newer release and tells the user, with a link to download it.
 * Nothing is downloaded or installed automatically.
 */

const REPO = 'guranshdeol/out-of-office-scheduler'
const LATEST_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASE_PAGE = `https://github.com/${REPO}/releases/`
const FIRST_CHECK_DELAY_MS = 30_000
const CHECK_EVERY_MS = 24 * 60 * 60_000
const WAKE_INTERVAL_MS = 60 * 60_000

export type UpdateCheckReason = 'user' | 'timer'

function notify(title: string, body: string, url?: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  if (url) n.on('click', () => void shell.openExternal(url))
  n.show()
}

export async function checkForUpdates(reason: UpdateCheckReason): Promise<void> {
  if (getUpdateStatus().checking) return
  setUpdateStatus({ checking: true, error: undefined })
  try {
    const res = await net.fetch(LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `OOO-Scheduler/${app.getVersion()}` },
      signal: AbortSignal.timeout(20_000)
    })
    if (res.status === 404) {
      // No published release yet.
      setUpdateStatus({ checking: false, checkedAt: Date.now(), latest: undefined })
      return
    }
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const release = (await res.json()) as { tag_name?: string; html_url?: string }
    const version = (release.tag_name ?? '').replace(/^v/i, '')
    // Only ever link to this repository's release pages.
    const url = release.html_url?.startsWith(RELEASE_PAGE) ? release.html_url : `${RELEASE_PAGE}latest`
    const current = app.getVersion()

    if (version && isNewerVersion(version, current)) {
      setUpdateStatus({ checking: false, checkedAt: Date.now(), latest: { version, url } })
      if (reason === 'user' || getConfig().updateNotifiedVersion !== version) {
        notify('OOO Scheduler update available', `Version ${version} is available (you have ${current}). Click to download.`, url)
        mutateConfig((c) => (c.updateNotifiedVersion = version))
      }
    } else {
      setUpdateStatus({ checking: false, checkedAt: Date.now(), latest: undefined })
      if (reason === 'user') notify('OOO Scheduler is up to date', `You have the latest version (${current}).`)
    }
  } catch (err) {
    const message = (err as Error).message
    setUpdateStatus({ checking: false, error: message })
    if (reason === 'user') notify("Couldn't check for updates", message)
  }
}

/** Checks shortly after launch, then once a day while the automatic check is switched on. */
export function startUpdateChecks(): void {
  const due = (): boolean => {
    if (!getConfig().settings.checkForUpdates) return false
    const last = getUpdateStatus().checkedAt
    return !last || Date.now() - last >= CHECK_EVERY_MS
  }
  setTimeout(() => {
    if (due()) void checkForUpdates('timer')
  }, FIRST_CHECK_DELAY_MS)
  // Hourly tick; the check itself only runs when a day has passed (also covers sleep and wake).
  setInterval(() => {
    if (due()) void checkForUpdates('timer')
  }, WAKE_INTERVAL_MS)
}
