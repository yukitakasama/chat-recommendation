import type {
  AnalysisMode,
  AnalysisModeInput,
  AnalysisPreflight,
  AnalysisPreflightInput,
  AnalysisProgress,
  AnalysisRun,
  AnalysisStartInput,
  AppState,
  ChatMessage,
  Friend,
  ImportCommitInput,
  ImportBatch,
  ImportPreview,
  Persona,
  PersonaInput,
  ProviderInput,
  ProviderProfile,
  StyleProfile
} from './schemas'

export interface VaultCreateResult {
  recoveryCode: string
}

export interface FriendInput {
  id?: string
  displayName: string
  notes?: string
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export interface ImportPickResult {
  paths: string[]
  canceled: boolean
}

export interface ImportCommitResult {
  batchId: string
  importedMessages: number
  importedFiles: number
  deduplicatedFiles: number
  failedFiles: Array<{ path: string; reason: string }>
}

export interface StyleGenerateInput {
  scope: 'global' | 'friend'
  friendId?: string
  providerId: string
  name?: string
}

export interface StyleImportResult {
  canceled: boolean
  style?: StyleProfile
}

export interface ExportRunInput {
  runId: string
  format: 'markdown' | 'json'
}

export interface ExportRunResult {
  canceled: boolean
  path?: string
}

export interface ChatInsightApi {
  app: {
    getState(): Promise<AppState>
    copyText(text: string): Promise<void>
    revealDataFolder(): Promise<void>
    onLocked(callback: () => void): () => void
    onAnalysisProgress(callback: (progress: AnalysisProgress) => void): () => void
  }
  vault: {
    create(password: string): Promise<VaultCreateResult>
    unlock(password: string): Promise<void>
    recover(recoveryCode: string, newPassword: string): Promise<void>
    changePassword(currentPassword: string, newPassword: string): Promise<void>
    lock(): Promise<void>
  }
  friends: {
    list(): Promise<Friend[]>
    save(input: FriendInput): Promise<Friend>
    remove(id: string): Promise<void>
  }
  messages: {
    list(friendId: string, search?: string): Promise<ChatMessage[]>
  }
  imports: {
    pickFiles(): Promise<ImportPickResult>
    pickImages(): Promise<ImportPickResult>
    pickImageFolder(): Promise<ImportPickResult>
    preview(friendId: string, paths: string[]): Promise<ImportPreview>
    recognizeScreenshots(
      previewId: string,
      providerId: string,
      assetTempIds: string[]
    ): Promise<{ messages: ImportPreview['messages']; warnings: string[] }>
    commit(input: ImportCommitInput): Promise<ImportCommitResult>
    listBatches(friendId: string): Promise<ImportBatch[]>
    removeBatch(id: string): Promise<void>
  }
  personas: {
    list(): Promise<Persona[]>
    save(input: PersonaInput): Promise<Persona>
    remove(id: string): Promise<void>
  }
  modes: {
    list(): Promise<AnalysisMode[]>
    save(input: AnalysisModeInput): Promise<AnalysisMode>
    remove(id: string): Promise<void>
  }
  styles: {
    list(): Promise<StyleProfile[]>
    importFile(): Promise<StyleImportResult>
    generate(input: StyleGenerateInput): Promise<StyleProfile>
    remove(id: string): Promise<void>
  }
  providers: {
    list(): Promise<ProviderProfile[]>
    save(input: ProviderInput): Promise<ProviderProfile>
    remove(id: string): Promise<void>
    test(id: string): Promise<ProviderTestResult>
  }
  analysis: {
    preflight(input: AnalysisPreflightInput): Promise<AnalysisPreflight>
    start(input: AnalysisStartInput): Promise<AnalysisRun>
    cancel(runId: string): Promise<void>
  }
  history: {
    list(friendId?: string): Promise<AnalysisRun[]>
    get(id: string): Promise<AnalysisRun>
    export(input: ExportRunInput): Promise<ExportRunResult>
    remove(id: string): Promise<void>
  }
}
