/** Calendar day in the user's local time zone, formatted YYYY-MM-DD. */
export type DateKey = string
/** Wall-clock time in the user's local time zone, formatted HH:mm. */
export type TimeOfDay = string

export interface Account {
  id: string
  email: string
  nickname: string
  enabled: boolean
  /** Plain-text message that replaces the default message for this account only. */
  messageOverride?: string
  /** MSAL home account id, set after the first successful sign-in. */
  homeAccountId?: string
  tenantId?: string
  /** The out-of-office calendar block Exchange is currently tracking for this mailbox. */
  oofBlock?: { stretchId: string; startMs: number; endMs: number }
}

export interface Settings {
  launchAtLogin: boolean
  calendarSubject: string
  createCalendarEvent: boolean
}

export type ApplyStatus = 'ok' | 'failed'

export interface ApplyResult {
  status: ApplyStatus
  at: number
  error?: string
  needsSignIn?: boolean
  /** The schedule Exchange reported back after the change. */
  readBack?: OooSnapshot
  /** Exchange reported times that differ from what was requested. */
  timeMismatch?: boolean
  /** The apply asked Exchange to create the out-of-office calendar block. */
  eventCreated?: boolean
  /** The auto-reply was turned off first so Exchange kept the previous, finished leave's block. */
  keptPrevious?: boolean
  /** A failure notification was already shown for this result. */
  notified?: boolean
}

export interface Stretch {
  id: string
  /** First leave day. */
  startDate: DateKey
  /** Last leave day (inclusive). */
  endDate: DateKey
  /** Time on startDate when the auto-reply turns on. */
  startTime: TimeOfDay
  /** Time on the day after endDate when the auto-reply turns off. */
  endTime: TimeOfDay
  customTimes: boolean
  /** Per-account outcome of applying this stretch, keyed by account id. */
  results: Record<string, ApplyResult>
  createdAt: number
}

export type StretchState = 'queued' | 'applying' | 'live' | 'partial' | 'failed' | 'done'

/**
 * A calendar block Exchange created that is no longer wanted. Exchange PowerShell cannot delete
 * calendar items, so the user removes it in Outlook.
 */
export interface CalendarCleanup {
  id: string
  accountId: string
  nickname: string
  email: string
  subject: string
  startMs: number
  endMs: number
  createdAt: number
}

export interface AppConfig {
  accounts: Account[]
  message: string
  settings: Settings
  stretches: Stretch[]
  calendarCleanups: CalendarCleanup[]
}

export interface OooTime {
  iso: string
  kind: string
}

export interface OooSnapshot {
  state: string
  start?: OooTime | null
  end?: OooTime | null
  createOofEvent?: boolean
  externalAudience?: string
}

export type AuthStatus = 'unknown' | 'checking' | 'connected' | 'needs-signin'

export interface AccountTest {
  ok: boolean
  at: number
  error?: string
  canSet?: boolean
  canCreateEvent?: boolean
  snapshot?: OooSnapshot
}

export interface AccountStatus {
  auth: AuthStatus
  authError?: string
  test?: AccountTest
  busy?: string
}

export type RuntimePhase = 'checking' | 'downloading' | 'extracting' | 'installing-module' | 'ready' | 'error'

export interface RuntimeStatus {
  phase: RuntimePhase
  message: string
  progress?: number
  pwshPath?: string
  moduleVersion?: string
}

export interface AppState {
  config: AppConfig
  accountStatus: Record<string, AccountStatus>
  stretchStates: Record<string, StretchState>
  runtime: RuntimeStatus
  schedulerBusy: boolean
  lastCheckAt?: number
  platform: string
}

export interface NewAccountInput {
  email: string
  nickname: string
}

export interface ApplyDaysInput {
  days: DateKey[]
  customTimes: boolean
  startTime: TimeOfDay
  endTime: TimeOfDay
}

export interface StretchEdit {
  startDate: DateKey
  endDate: DateKey
  customTimes: boolean
  startTime: TimeOfDay
  endTime: TimeOfDay
}

export interface OooApi {
  getState(): Promise<AppState>
  onState(listener: (state: AppState) => void): () => void
  onNavigate(listener: (view: string) => void): () => void
  retrySetup(): Promise<void>
  addAccount(input: NewAccountInput): Promise<{ ok: boolean; error?: string }>
  reconnectAccount(id: string): Promise<{ ok: boolean; error?: string }>
  testAccount(id: string): Promise<void>
  updateAccount(id: string, patch: Partial<Pick<Account, 'nickname' | 'enabled' | 'messageOverride'>>): Promise<void>
  removeAccount(id: string): Promise<void>
  saveMessage(message: string): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<void>
  applyDays(input: ApplyDaysInput): Promise<void>
  editStretch(id: string, edit: StretchEdit): Promise<void>
  cancelStretch(id: string): Promise<{ ok: boolean; error?: string }>
  dismissCleanup(id: string): Promise<void>
  runCheckNow(): Promise<void>
}
