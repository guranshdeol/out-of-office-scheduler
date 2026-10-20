import { app } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { OooSnapshot } from '@shared/types'

const RESULT_MARKER = '__OOO_RESULT__'
const TIMEOUT_MS = 3 * 60_000

type ScriptName = 'set-ooo' | 'clear-ooo' | 'get-ooo' | 'test-account'

export class ExoError extends Error {
  constructor(
    message: string,
    readonly authRejected = false
  ) {
    super(message)
    this.name = 'ExoError'
  }
}

let pwshPath: string | undefined

export function setPwshPath(path: string): void {
  pwshPath = path
}

const scriptsDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'scripts') : join(app.getAppPath(), 'resources', 'scripts')

const AUTH_REJECTED = /\b401\b|unauthori[sz]ed|access token|AADSTS|expired/i

/** Runs one of the bundled scripts in its own pwsh process. The request (including the token) goes over stdin, never argv. */
function runScript<T>(name: ScriptName, request: Record<string, unknown>): Promise<T> {
  if (!pwshPath) return Promise.reject(new ExoError('PowerShell is not ready yet.'))
  const file = join(scriptsDir(), `${name}.ps1`)
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive']
  if (process.platform === 'win32') args.push('-ExecutionPolicy', 'Bypass')
  args.push('-File', file)

  return new Promise<T>((resolve, reject) => {
    const child = spawn(pwshPath!, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new ExoError(`Exchange Online did not respond within ${TIMEOUT_MS / 60_000} minutes.`))
    }, TIMEOUT_MS)

    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new ExoError(`Could not start PowerShell: ${err.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const line = stdout.split(/\r?\n/).find((l) => l.startsWith(RESULT_MARKER))
      if (!line) {
        const detail = (stderr || stdout).trim().split(/\r?\n/).slice(-5).join(' ')
        reject(new ExoError(`PowerShell exited (${code}) without a result. ${detail}`.trim()))
        return
      }
      const result = JSON.parse(line.slice(RESULT_MARKER.length)) as { ok: boolean; data?: T; error?: string }
      if (result.ok) resolve(result.data as T)
      else reject(new ExoError(result.error ?? 'Unknown Exchange error', AUTH_REJECTED.test(result.error ?? '')))
    })

    child.stdin.end(JSON.stringify(request))
  })
}

export interface SetOooRequest {
  upn: string
  token: string
  startMs: number
  endMs: number
  html: string
  createEvent: boolean
  subject: string
}

export const setOoo = (req: SetOooRequest): Promise<OooSnapshot> => runScript('set-ooo', { ...req })

export const clearOoo = (upn: string, token: string): Promise<OooSnapshot> => runScript('clear-ooo', { upn, token })

export const getOoo = (upn: string, token: string): Promise<OooSnapshot> => runScript('get-ooo', { upn, token })

export interface TestResult {
  snapshot: OooSnapshot
  canSet: boolean
  canCreateEvent: boolean
}

export const testAccount = (upn: string, token: string): Promise<TestResult> => runScript('test-account', { upn, token })
