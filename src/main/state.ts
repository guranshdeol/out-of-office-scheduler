import { app } from 'electron'
import type { AccountStatus, AppConfig, AppState, RuntimeStatus, StretchState, UpdateStatus } from '@shared/types'
import { currentStretch, deriveState } from './periods'
import { loadConfig, saveConfig } from './store'

let config: AppConfig
const accountStatus: Record<string, AccountStatus> = {}
let runtime: RuntimeStatus = { phase: 'checking', message: 'Starting…' }
const applying = new Set<string>()
let schedulerBusy = false
let lastCheckAt: number | undefined
let update: UpdateStatus = { checking: false }
const listeners = new Set<(state: AppState) => void>()

export function initState(): void {
  config = loadConfig()
}

export const getConfig = (): AppConfig => config
export const getRuntime = (): RuntimeStatus => runtime
export const getUpdateStatus = (): UpdateStatus => update
export const getAccountStatus = (id: string): AccountStatus => accountStatus[id] ?? { auth: 'unknown' }

export function snapshot(): AppState {
  const now = Date.now()
  const current = currentStretch(config.stretches, now)
  const stretchStates: Record<string, StretchState> = {}
  for (const s of config.stretches) {
    stretchStates[s.id] = deriveState(s, {
      now,
      isCurrent: s.id === current?.id,
      accounts: config.accounts,
      applying: applying.has(s.id)
    })
  }
  return {
    config,
    accountStatus: Object.fromEntries(config.accounts.map((a) => [a.id, getAccountStatus(a.id)])),
    stretchStates,
    runtime,
    schedulerBusy,
    lastCheckAt,
    platform: process.platform,
    version: app.getVersion(),
    update
  }
}

export function subscribe(listener: (state: AppState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notify(): void {
  const state = snapshot()
  for (const l of listeners) l(state)
}

export function mutateConfig(fn: (c: AppConfig) => void): void {
  fn(config)
  saveConfig(config)
  notify()
}

export function setAccountStatus(id: string, patch: Partial<AccountStatus>): void {
  accountStatus[id] = { ...getAccountStatus(id), ...patch }
  notify()
}

export function setRuntime(status: RuntimeStatus): void {
  runtime = status
  notify()
}

export function setApplying(stretchId: string, on: boolean): void {
  if (on) applying.add(stretchId)
  else applying.delete(stretchId)
  notify()
}

export function setSchedulerBusy(busy: boolean, checkedAt?: number): void {
  schedulerBusy = busy
  if (checkedAt) lastCheckAt = checkedAt
  notify()
}

export function setUpdateStatus(patch: Partial<UpdateStatus>): void {
  update = { ...update, ...patch }
  notify()
}
