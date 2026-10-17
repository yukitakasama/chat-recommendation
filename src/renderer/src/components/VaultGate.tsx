import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Clipboard,
  Database,
  KeyRound,
  LockKeyhole,
  ShieldCheck
} from 'lucide-react'
import { formatError, useAppStore } from '../store'
import { Button, Field, Input } from './ui'

export function VaultGate({ mode }: { mode: 'create' | 'unlock' }): React.JSX.Element {
  const appState = useAppStore((state) => state.appState)
  const loadAppState = useAppStore((state) => state.loadAppState)
  const notify = useAppStore((state) => state.notify)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [createdRecoveryCode, setCreatedRecoveryCode] = useState('')
  const [savedConfirmation, setSavedConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (): Promise<void> => {
    setError('')
    if (mode === 'create' && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (recoveryMode && newPassword !== confirmNewPassword) {
      setError('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      if (mode === 'create') {
        const result = await window.api.vault.create(password)
        setCreatedRecoveryCode(result.recoveryCode)
      } else if (recoveryMode) {
        await window.api.vault.recover(recoveryCode, newPassword)
        await loadAppState()
      } else {
        await window.api.vault.unlock(password)
        await loadAppState()
      }
    } catch (submitError) {
      setError(formatError(submitError))
    } finally {
      setBusy(false)
    }
  }

  const finishCreation = async (): Promise<void> => {
    if (!savedConfirmation) return
    await loadAppState()
  }

  if (createdRecoveryCode) {
    return (
      <div className="vault-screen">
        <aside className="vault-aside">
          <Brand />
          <div className="vault-aside__copy">
            <span className="eyebrow">最后一步</span>
            <h2>恢复码是唯一的主密钥备份</h2>
            <p>
              它只显示这一次。聊天记录全量加密，忘记密码或丢失恢复码后，任何人都无法恢复数据。
            </p>
          </div>
        </aside>
        <main className="vault-main">
          <div className="vault-panel vault-panel--wide">
            <div className="vault-icon">
              <KeyRound size={24} />
            </div>
            <h1>保存恢复码</h1>
            <p className="muted">建议放入密码管理器或离线保存，不要与便携目录放在一起。</p>
            <div className="recovery-code">
              <code>{createdRecoveryCode}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await window.api.app.copyText(createdRecoveryCode)
                  notify('恢复码已复制', 'success')
                }}
              >
                <Clipboard size={15} />
                复制
              </Button>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={savedConfirmation}
                onChange={(event) => setSavedConfirmation(event.target.checked)}
              />
              <span>我已安全保存恢复码，并理解丢失后无法找回保险库。</span>
            </label>
            <Button className="full-width" disabled={!savedConfirmation} onClick={finishCreation}>
              进入聊天洞察
              <ArrowRight size={17} />
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="vault-screen">
      <aside className="vault-aside">
        <Brand />
        <div className="vault-aside__copy">
          <span className="eyebrow">LOCAL-FIRST PRIVATE ANALYSIS</span>
          <h2>把聊天证据留在本地，把判断讲清楚。</h2>
          <p>
            好友记录、图片、风格与分析历史进入加密保险库。只有在你明确发起分析时，选定的内容才会发送到已配置的模型端点。
          </p>
        </div>
        <div className="vault-features">
          <span>
            <ShieldCheck size={17} /> 应用密码与恢复码双重解锁
          </span>
          <span>
            <Database size={17} /> 便携目录，不静默上传数据
          </span>
          <span>
            <LockKeyhole size={17} /> 图片分析逐次授权
          </span>
        </div>
      </aside>
      <main className="vault-main">
        <div className="vault-panel">
          <div className="vault-icon">
            {recoveryMode ? <KeyRound size={24} /> : <LockKeyhole size={24} />}
          </div>
          <h1>
            {recoveryMode
              ? '使用恢复码解锁'
              : mode === 'create'
                ? '创建加密保险库'
                : '解锁聊天洞察'}
          </h1>
          <p className="muted">
            {recoveryMode
              ? '输入一次性恢复码并设置新的应用密码。'
              : mode === 'create'
                ? '设置至少 10 位、包含字母和数字的应用密码。'
                : '你的聊天数据仅保存在当前便携目录。'}
          </p>

          <div className="form-stack">
            {recoveryMode ? (
              <>
                <Field label="恢复码">
                  <Input
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(event.target.value)}
                    placeholder="CI-XXXXX-XXXXX-..."
                    autoFocus
                  />
                </Field>
                <Field label="新密码">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label="确认新密码">
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submit()
                    }}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="应用密码">
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && mode === 'unlock') void submit()
                    }}
                  />
                </Field>
                {mode === 'create' ? (
                  <Field label="确认密码">
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void submit()
                      }}
                    />
                  </Field>
                ) : null}
              </>
            )}
          </div>

          {error ? <div className="inline-error">{error}</div> : null}

          <Button className="full-width" onClick={submit} disabled={busy}>
            {busy ? '正在处理…' : recoveryMode ? '恢复并解锁' : mode === 'create' ? '创建保险库' : '解锁'}
            {!busy ? <ArrowRight size={17} /> : null}
          </Button>

          {mode === 'unlock' ? (
            <button className="text-button" onClick={() => setRecoveryMode((value) => !value)}>
              {recoveryMode ? '返回密码解锁' : '忘记密码？使用恢复码'}
            </button>
          ) : null}
        </div>
        <p className="vault-path">
          <Database size={14} />
          数据目录：{appState?.dataPath ?? '正在检测'}
        </p>
      </main>
    </div>
  )
}

function Brand(): React.JSX.Element {
  return (
    <div className="brand">
      <div className="brand__mark">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>聊天洞察</strong>
        <small>ChatInsight</small>
      </div>
    </div>
  )
}
