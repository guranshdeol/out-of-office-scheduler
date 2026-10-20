import { app, safeStorage, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
  type AccountInfo,
  type ICachePlugin,
  type TokenCacheContext
} from '@azure/msal-node'
import { ElectronNetworkModule } from './net'

/** Public client ID of the Exchange Online PowerShell module (ExchangeOnlineManagement). */
export const EXO_CLIENT_ID = 'fb78d390-0c51-40cd-8e17-fdbfab77341b'
const SCOPES = ['https://outlook.office365.com/.default']
const AUTHORITY = 'https://login.microsoftonline.com/organizations'

export class NeedsSignInError extends Error {
  constructor(message = 'Sign-in expired or was revoked. Reconnect this account.') {
    super(message)
    this.name = 'NeedsSignInError'
  }
}

const page = (title: string, body: string): string => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb;color:#1f2430}
.card{background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;text-align:center}h1{font-size:20px}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`

const SUCCESS_PAGE = page('Account connected', 'You can close this tab and return to OOO Scheduler.')
const ERROR_PAGE = page('Sign-in failed', 'Return to OOO Scheduler to see the details and try again.')

/** Persists the MSAL cache encrypted with the OS keychain (Keychain, DPAPI, or libsecret) via Electron safeStorage. */
class SafeStorageCachePlugin implements ICachePlugin {
  constructor(private readonly file: string) {}

  async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
    if (!existsSync(this.file)) return
    try {
      const data = readFileSync(this.file)
      ctx.tokenCache.deserialize(safeStorage.decryptString(data))
    } catch (err) {
      console.error('Token cache unreadable; accounts will need to reconnect', err)
    }
  }

  async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
    if (!ctx.cacheHasChanged) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, safeStorage.encryptString(ctx.tokenCache.serialize()), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}

let pca: PublicClientApplication | undefined

function client(): PublicClientApplication {
  if (pca) return pca
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage (OS keychain) is not available on this system.')
  }
  pca = new PublicClientApplication({
    auth: { clientId: EXO_CLIENT_ID, authority: AUTHORITY },
    cache: { cachePlugin: new SafeStorageCachePlugin(join(app.getPath('userData'), 'token-cache.bin')) },
    system: {
      networkClient: new ElectronNetworkModule(),
      loggerOptions: {
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false,
        loggerCallback: (_level, message) => console.log('[msal]', message)
      }
    }
  })
  return pca
}

export interface SignInResult {
  homeAccountId: string
  tenantId: string
  username: string
}

/** Opens the system browser for a one-time interactive sign-in; the tenant's own SSO (Okta, Entra, ...) handles the rest. */
export async function signIn(email: string): Promise<SignInResult> {
  const result = await client().acquireTokenInteractive({
    scopes: SCOPES,
    loginHint: email,
    prompt: 'select_account',
    openBrowser: async (url) => {
      await shell.openExternal(url)
    },
    successTemplate: SUCCESS_PAGE,
    errorTemplate: ERROR_PAGE
  })
  const account = result.account
  if (!account) throw new Error('Sign-in completed without an account.')
  if (account.username.toLowerCase() !== email.toLowerCase()) {
    await client().getTokenCache().removeAccount(account)
    throw new Error(`You signed in as ${account.username}, but this account is ${email}. Sign in with ${email}.`)
  }
  return { homeAccountId: account.homeAccountId, tenantId: account.tenantId, username: account.username }
}

async function findAccount(homeAccountId: string): Promise<AccountInfo | null> {
  return client().getTokenCache().getAccountByHomeId(homeAccountId)
}

/** Returns a fresh Exchange Online access token without any UI, or throws NeedsSignInError. */
export async function getToken(homeAccountId: string | undefined): Promise<string> {
  if (!homeAccountId) throw new NeedsSignInError('This account has not been signed in yet.')
  const account = await findAccount(homeAccountId)
  if (!account) throw new NeedsSignInError()
  try {
    const result = await client().acquireTokenSilent({
      account,
      scopes: SCOPES,
      authority: `https://login.microsoftonline.com/${account.tenantId}`
    })
    return result.accessToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) throw new NeedsSignInError()
    throw err
  }
}

export async function signOut(homeAccountId: string | undefined): Promise<void> {
  if (!homeAccountId) return
  const account = await findAccount(homeAccountId)
  if (account) await client().getTokenCache().removeAccount(account)
}
