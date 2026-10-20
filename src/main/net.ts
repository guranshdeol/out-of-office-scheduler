import { net } from 'electron'
import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from '@azure/msal-node'

/**
 * Routes MSAL traffic through Chromium's network stack so corporate proxies and
 * TLS-inspection certificates trusted by the OS are honoured.
 */
export class ElectronNetworkModule implements INetworkModule {
  async sendGetRequestAsync<T>(url: string, options?: NetworkRequestOptions, timeout?: number): Promise<NetworkResponse<T>> {
    return this.send<T>('GET', url, options, timeout)
  }

  async sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions, timeout?: number): Promise<NetworkResponse<T>> {
    return this.send<T>('POST', url, options, timeout)
  }

  private async send<T>(method: string, url: string, options?: NetworkRequestOptions, timeout?: number): Promise<NetworkResponse<T>> {
    const res = await net.fetch(url, {
      method,
      headers: options?.headers,
      body: method === 'POST' ? options?.body : undefined,
      signal: timeout ? AbortSignal.timeout(timeout) : undefined
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => (headers[key] = value))
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // non-JSON bodies are passed through as text
    }
    return { headers, body: body as T, status: res.status }
  }
}
