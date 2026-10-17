import { create } from 'zustand'
import type {
  AnalysisMode,
  AnalysisRun,
  AppState,
  ChatMessage,
  Friend,
  Persona,
  ProviderProfile,
  StyleProfile
} from '../../shared/schemas'
import type { FriendInput } from '../../shared/ipc'

interface ToastState {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

interface AppStore {
  appState: AppState | null
  friends: Friend[]
  selectedFriendId: string | null
  messages: ChatMessage[]
  personas: Persona[]
  modes: AnalysisMode[]
  styles: StyleProfile[]
  providers: ProviderProfile[]
  history: AnalysisRun[]
  loading: boolean
  messagesLoading: boolean
  toast: ToastState | null
  setAppState: (appState: AppState | null) => void
  loadAppState: () => Promise<void>
  loadWorkspace: () => Promise<void>
  selectFriend: (id: string | null) => Promise<void>
  loadMessages: (search?: string) => Promise<void>
  refreshFriends: () => Promise<void>
  saveFriend: (input: FriendInput) => Promise<Friend>
  removeFriend: (id: string) => Promise<void>
  refreshMetadata: () => Promise<void>
  refreshHistory: (friendId?: string) => Promise<void>
  notify: (message: string, tone?: ToastState['tone']) => void
  clearToast: () => void
}

export function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
}

export const useAppStore = create<AppStore>((set, get) => ({
  appState: null,
  friends: [],
  selectedFriendId: null,
  messages: [],
  personas: [],
  modes: [],
  styles: [],
  providers: [],
  history: [],
  loading: false,
  messagesLoading: false,
  toast: null,

  setAppState: (appState) => set({ appState }),

  loadAppState: async () => {
    try {
      const appState = await window.api.app.getState()
      set({ appState })
      if (appState.vaultState === 'unlocked') await get().loadWorkspace()
    } catch (error) {
      get().notify(formatError(error), 'error')
    }
  },

  loadWorkspace: async () => {
    set({ loading: true })
    try {
      const [friends, personas, modes, styles, providers] = await Promise.all([
        window.api.friends.list(),
        window.api.personas.list(),
        window.api.modes.list(),
        window.api.styles.list(),
        window.api.providers.list()
      ])
      const selected =
        (get().selectedFriendId && friends.some((item) => item.id === get().selectedFriendId)
          ? get().selectedFriendId
          : friends[0]?.id) ?? null
      set({ friends, personas, modes, styles, providers, selectedFriendId: selected, loading: false })
      if (selected) {
        const [messages, history] = await Promise.all([
          window.api.messages.list(selected),
          window.api.history.list(selected)
        ])
        set({ messages, history })
      } else {
        set({ messages: [], history: [] })
      }
    } catch (error) {
      set({ loading: false })
      get().notify(formatError(error), 'error')
    }
  },

  selectFriend: async (id) => {
    set({ selectedFriendId: id, messages: [], history: [], messagesLoading: Boolean(id) })
    if (!id) return
    try {
      const [messages, history] = await Promise.all([
        window.api.messages.list(id),
        window.api.history.list(id)
      ])
      if (get().selectedFriendId === id) set({ messages, history })
    } catch (error) {
      get().notify(formatError(error), 'error')
    } finally {
      set({ messagesLoading: false })
    }
  },

  loadMessages: async (search = '') => {
    const friendId = get().selectedFriendId
    if (!friendId) return
    set({ messagesLoading: true })
    try {
      const messages = await window.api.messages.list(friendId, search)
      set({ messages })
    } catch (error) {
      get().notify(formatError(error), 'error')
    } finally {
      set({ messagesLoading: false })
    }
  },

  refreshFriends: async () => {
    const friends = await window.api.friends.list()
    const selected =
      (get().selectedFriendId && friends.some((item) => item.id === get().selectedFriendId)
        ? get().selectedFriendId
        : friends[0]?.id) ?? null
    set({ friends, selectedFriendId: selected })
  },

  saveFriend: async (input) => {
    const friend = await window.api.friends.save(input)
    await get().refreshFriends()
    await get().selectFriend(friend.id)
    return friend
  },

  removeFriend: async (id) => {
    await window.api.friends.remove(id)
    const friends = get().friends.filter((item) => item.id !== id)
    set({ friends, selectedFriendId: friends[0]?.id ?? null, messages: [], history: [] })
    if (friends[0]) await get().selectFriend(friends[0].id)
  },

  refreshMetadata: async () => {
    const [personas, modes, styles, providers] = await Promise.all([
      window.api.personas.list(),
      window.api.modes.list(),
      window.api.styles.list(),
      window.api.providers.list()
    ])
    set({ personas, modes, styles, providers })
  },

  refreshHistory: async (friendId) => {
    const history = await window.api.history.list(friendId ?? get().selectedFriendId ?? undefined)
    set({ history })
  },

  notify: (message, tone = 'info') => {
    set({ toast: { id: Date.now(), message, tone } })
    window.setTimeout(() => {
      if (get().toast?.message === message) set({ toast: null })
    }, 4200)
  },

  clearToast: () => set({ toast: null })
}))
