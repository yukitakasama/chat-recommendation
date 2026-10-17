/// <reference types="vite/client" />

import type { ChatInsightApi } from '../../shared/ipc'

declare global {
  interface Window {
    api: ChatInsightApi
  }
}

export {}
