import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'

export const DEFAULT_MESSAGE = `Thank you for your email. I'm out of the office until {end}, with limited access to email.

I'll reply as soon as possible after I return.

Kind regards`

const defaults = (): AppConfig => ({
  accounts: [],
  message: DEFAULT_MESSAGE,
  settings: {
    launchAtLogin: true,
    calendarSubject: 'Out of office',
    createCalendarEvent: true,
    checkForUpdates: true
  },
  stretches: [],
  calendarCleanups: []
})

export const configPath = (): string => join(app.getPath('userData'), 'config.json')

export function loadConfig(): AppConfig {
  const file = configPath()
  if (!existsSync(file)) return defaults()
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppConfig>
    const base = defaults()
    return {
      accounts: raw.accounts ?? base.accounts,
      message: raw.message ?? base.message,
      settings: { ...base.settings, ...raw.settings },
      stretches: raw.stretches ?? base.stretches,
      calendarCleanups: raw.calendarCleanups ?? base.calendarCleanups,
      updateNotifiedVersion: raw.updateNotifiedVersion
    }
  } catch (err) {
    console.error('Could not read config, starting fresh', err)
    renameSync(file, `${file}.corrupt-${Date.now()}`)
    return defaults()
  }
}

export function saveConfig(config: AppConfig): void {
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, file)
}
