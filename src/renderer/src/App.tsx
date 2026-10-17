import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { VaultGate } from './components/VaultGate'
import { Workspace } from './components/Workspace'
import { useAppStore } from './store'

export default function App(): React.JSX.Element {
  const appState = useAppStore((state) => state.appState)
  const loadAppState = useAppStore((state) => state.loadAppState)
  const toast = useAppStore((state) => state.toast)
  const clearToast = useAppStore((state) => state.clearToast)

  useEffect(() => {
    void loadAppState()
  }, [loadAppState])

  useEffect(() => {
    return window.api.app.onLocked(() => {
      void loadAppState()
    })
  }, [loadAppState])

  if (!appState) {
    return (
      <div className="app-loading">
        <div className="brand__mark brand__mark--dark">
          <span />
          <span />
          <span />
        </div>
        <p>正在打开本地保险库…</p>
      </div>
    )
  }

  return (
    <>
      {appState.vaultState === 'missing' ? (
        <VaultGate mode="create" />
      ) : appState.vaultState === 'locked' ? (
        <VaultGate mode="unlock" />
      ) : (
        <Workspace />
      )}
      {toast ? (
        <div className={`toast toast--${toast.tone}`} role="status">
          {toast.tone === 'success' ? (
            <CheckCircle2 size={18} />
          ) : toast.tone === 'error' ? (
            <AlertCircle size={18} />
          ) : (
            <Info size={18} />
          )}
          <span>{toast.message}</span>
          <button onClick={clearToast} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      ) : null}
    </>
  )
}
