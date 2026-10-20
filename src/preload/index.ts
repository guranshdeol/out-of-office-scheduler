import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppState, OooApi } from '@shared/types'

const on =
  <T>(channel: string) =>
  (listener: (value: T) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, value: T): void => listener(value)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }

const api: OooApi = {
  getState: () => ipcRenderer.invoke('ooo:getState'),
  onState: on<AppState>('ooo:state'),
  onNavigate: on<string>('ooo:navigate'),
  retrySetup: () => ipcRenderer.invoke('ooo:retrySetup'),
  addAccount: (input) => ipcRenderer.invoke('ooo:addAccount', input),
  reconnectAccount: (id) => ipcRenderer.invoke('ooo:reconnectAccount', id),
  testAccount: (id) => ipcRenderer.invoke('ooo:testAccount', id),
  updateAccount: (id, patch) => ipcRenderer.invoke('ooo:updateAccount', id, patch),
  removeAccount: (id) => ipcRenderer.invoke('ooo:removeAccount', id),
  saveMessage: (message) => ipcRenderer.invoke('ooo:saveMessage', message),
  saveSettings: (patch) => ipcRenderer.invoke('ooo:saveSettings', patch),
  applyDays: (input) => ipcRenderer.invoke('ooo:applyDays', input),
  editStretch: (id, edit) => ipcRenderer.invoke('ooo:editStretch', id, edit),
  cancelStretch: (id) => ipcRenderer.invoke('ooo:cancelStretch', id),
  dismissCleanup: (id) => ipcRenderer.invoke('ooo:dismissCleanup', id),
  runCheckNow: () => ipcRenderer.invoke('ooo:runCheckNow')
}

contextBridge.exposeInMainWorld('ooo', api)
