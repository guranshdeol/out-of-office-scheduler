import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'

export const DEFAULT_MESSAGE = `Hi, I'm currently out of office and may have limited access to messages. I'll respond as soon as I return.

Thank you.`

const defaults = (): AppConfig => ({
  accounts: [],
  message: DEFAULT_MESSAGE,
  settings: {
    launchAtLogin: true,
    calendarSubject: 'Out of office',
    createCalendarEvent: true
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
      calendarCleanups: raw.calendarCleanups ?? base.calendarCleanups
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
