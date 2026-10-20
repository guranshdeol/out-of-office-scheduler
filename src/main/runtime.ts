import { app, net } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { RuntimeStatus } from '@shared/types'

const execFileAsync = promisify(execFile)

export const PWSH_VERSION = '7.6.7'
export const EXO_MIN_VERSION = '3.7.0'

type Listener = (status: RuntimeStatus) => void

const isWin = process.platform === 'win32'
const exe = isWin ? 'pwsh.exe' : 'pwsh'

const runtimeDir = (): string => join(app.getPath('userData'), 'runtime')
const bundledPwsh = (): string => join(runtimeDir(), 'pwsh', exe)

function candidatePaths(): string[] {
  const home = homedir()
  if (isWin) {
    return [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', exe),
      join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Microsoft', 'PowerShell', exe)
    ]
  }
  return ['/usr/local/bin/pwsh', '/opt/homebrew/bin/pwsh', '/usr/bin/pwsh', '/snap/bin/pwsh', join(home, 'powershell', 'pwsh')]
}

async function pwshVersion(path: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(path, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      timeout: 30_000
    })
    return stdout.trim()
  } catch {
    return undefined
  }
}

const major = (v: string): number => Number(v.split('.')[0])

export async function findPwsh(): Promise<string | undefined> {
  for (const p of [bundledPwsh(), ...candidatePaths()]) {
    if (!existsSync(p)) continue
    const v = await pwshVersion(p)
    if (v && major(v) >= 7) return p
  }
  return undefined
}

function assetName(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  switch (process.platform) {
    case 'darwin':
      return `powershell-${PWSH_VERSION}-osx-${arch}.tar.gz`
    case 'win32':
      return `PowerShell-${PWSH_VERSION}-win-${arch}.zip`
    default:
      return `powershell-${PWSH_VERSION}-linux-${arch}.tar.gz`
  }
}

async function download(url: string, dest: string, onProgress: (fraction: number) => void): Promise<void> {
  const res = await net.fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0
  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (total) onProgress(received / total)
  })
  await pipeline(body, createWriteStream(dest))
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}: ${err.trim()}`))))
  })
}

async function installPwsh(emit: Listener): Promise<string> {
  const name = assetName()
  const url = `https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/${name}`
  const dir = runtimeDir()
  const archive = join(dir, name)
  const target = join(dir, 'pwsh')
  mkdirSync(dir, { recursive: true })
  emit({ phase: 'downloading', message: `Downloading PowerShell ${PWSH_VERSION}…`, progress: 0 })
  await download(url, archive, (progress) =>
    emit({ phase: 'downloading', message: `Downloading PowerShell ${PWSH_VERSION}…`, progress })
  )
  emit({ phase: 'extracting', message: 'Unpacking PowerShell…' })
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  // bsdtar ships with macOS and Windows 10+ and handles both .tar.gz and .zip
  await run(isWin ? 'tar.exe' : 'tar', ['-xf', archive, '-C', target])
  rmSync(archive, { force: true })
  const pwsh = bundledPwsh()
  if (!isWin) chmodSync(pwsh, 0o755)
  if (process.platform === 'darwin') {
    await run('xattr', ['-dr', 'com.apple.quarantine', target]).catch(() => undefined)
  }
  return pwsh
}

async function moduleVersion(pwsh: string): Promise<string | undefined> {
  const { stdout } = await execFileAsync(
    pwsh,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-Module ExchangeOnlineManagement -ListAvailable | Sort-Object Version -Descending | Select-Object -First 1 | ForEach-Object { $_.Version.ToString() }"
    ],
    { timeout: 60_000 }
  )
  return stdout.trim() || undefined
}

const atLeast = (v: string, min: string): boolean => {
  const a = v.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return true
}

async function installModule(pwsh: string): Promise<void> {
  await execFileAsync(
    pwsh,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force -AllowClobber -MinimumVersion " +
        EXO_MIN_VERSION
    ],
    { timeout: 10 * 60_000 }
  )
}

/** Ensures PowerShell 7 and the ExchangeOnlineManagement module are available, installing both per-user if needed. */
export async function ensureRuntime(emit: Listener): Promise<RuntimeStatus> {
  emit({ phase: 'checking', message: 'Looking for PowerShell…' })
  let pwsh = await findPwsh()
  if (!pwsh) pwsh = await installPwsh(emit)
  emit({ phase: 'checking', message: 'Checking the Exchange Online module…', pwshPath: pwsh })
  let version = await moduleVersion(pwsh)
  if (!version || !atLeast(version, EXO_MIN_VERSION)) {
    emit({ phase: 'installing-module', message: 'Installing the Exchange Online PowerShell module…', pwshPath: pwsh })
    await installModule(pwsh)
    version = await moduleVersion(pwsh)
    if (!version) throw new Error('ExchangeOnlineManagement did not install correctly.')
  }
  const ready: RuntimeStatus = { phase: 'ready', message: 'Ready', pwshPath: pwsh, moduleVersion: version }
  emit(ready)
  return ready
}
