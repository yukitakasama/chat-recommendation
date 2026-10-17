import { contextBridge, ipcRenderer } from 'electron'
import type { ChatInsightApi } from '../shared/ipc'
import type { AnalysisProgress } from '../shared/schemas'

const api: ChatInsightApi = {
  app: {
    getState: () => ipcRenderer.invoke('app:get-state'),
    copyText: (text) => ipcRenderer.invoke('app:copy-text', text),
    revealDataFolder: () => ipcRenderer.invoke('app:reveal-data-folder'),
    onLocked: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:locked', listener)
      return () => ipcRenderer.removeListener('app:locked', listener)
    },
    onAnalysisProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: AnalysisProgress): void =>
        callback(progress)
      ipcRenderer.on('analysis:progress', listener)
      return () => ipcRenderer.removeListener('analysis:progress', listener)
    }
  },
  vault: {
    create: (password) => ipcRenderer.invoke('vault:create', password),
    unlock: (password) => ipcRenderer.invoke('vault:unlock', password),
    recover: (recoveryCode, newPassword) =>
      ipcRenderer.invoke('vault:recover', recoveryCode, newPassword),
    changePassword: (currentPassword, newPassword) =>
      ipcRenderer.invoke('vault:change-password', currentPassword, newPassword),
    lock: () => ipcRenderer.invoke('vault:lock')
  },
  friends: {
    list: () => ipcRenderer.invoke('friends:list'),
    save: (input) => ipcRenderer.invoke('friends:save', input),
    remove: (id) => ipcRenderer.invoke('friends:remove', id)
  },
  messages: {
    list: (friendId, search) => ipcRenderer.invoke('messages:list', friendId, search)
  },
  imports: {
    pickFiles: () => ipcRenderer.invoke('imports:pick-files'),
    pickImages: () => ipcRenderer.invoke('imports:pick-images'),
    pickImageFolder: () => ipcRenderer.invoke('imports:pick-image-folder'),
    preview: (friendId, paths) => ipcRenderer.invoke('imports:preview', friendId, paths),
    recognizeScreenshots: (previewId, providerId, assetTempIds) =>
      ipcRenderer.invoke('imports:recognize-screenshots', previewId, providerId, assetTempIds),
    commit: (input) => ipcRenderer.invoke('imports:commit', input),
    listBatches: (friendId) => ipcRenderer.invoke('imports:list-batches', friendId),
    removeBatch: (id) => ipcRenderer.invoke('imports:remove-batch', id)
  },
  personas: {
    list: () => ipcRenderer.invoke('personas:list'),
    save: (input) => ipcRenderer.invoke('personas:save', input),
    remove: (id) => ipcRenderer.invoke('personas:remove', id)
  },
  modes: {
    list: () => ipcRenderer.invoke('modes:list'),
    save: (input) => ipcRenderer.invoke('modes:save', input),
    remove: (id) => ipcRenderer.invoke('modes:remove', id)
  },
  styles: {
    list: () => ipcRenderer.invoke('styles:list'),
    importFile: () => ipcRenderer.invoke('styles:import-file'),
    generate: (input) => ipcRenderer.invoke('styles:generate', input),
    remove: (id) => ipcRenderer.invoke('styles:remove', id)
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    save: (input) => ipcRenderer.invoke('providers:save', input),
    remove: (id) => ipcRenderer.invoke('providers:remove', id),
    test: (id) => ipcRenderer.invoke('providers:test', id)
  },
  analysis: {
    preflight: (input) => ipcRenderer.invoke('analysis:preflight', input),
    start: (input) => ipcRenderer.invoke('analysis:start', input),
    cancel: (runId) => ipcRenderer.invoke('analysis:cancel', runId)
  },
  history: {
    list: (friendId) => ipcRenderer.invoke('history:list', friendId),
    get: (id) => ipcRenderer.invoke('history:get', id),
    export: (input) => ipcRenderer.invoke('history:export', input),
    remove: (id) => ipcRenderer.invoke('history:remove', id)
  }
}

contextBridge.exposeInMainWorld('api', api)
