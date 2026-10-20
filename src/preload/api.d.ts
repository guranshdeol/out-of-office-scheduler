import type { OooApi } from '../shared/types'

declare global {
  interface Window {
    ooo: OooApi
  }
}

export {}
