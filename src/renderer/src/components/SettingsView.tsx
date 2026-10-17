import { useState } from 'react'
import {
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  Wifi
} from 'lucide-react'
import {
  DEFAULT_PROVIDER_MAX_INPUT_TOKENS,
  DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS,
  type ProviderProfile
} from '../../../shared/schemas'
import { formatError, useAppStore } from '../store'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  SwitchField
} from './ui'

interface ProviderDraft {
  id?: string
  name: string
  protocol: 'chat_completions' | 'responses'
  baseUrl: string
  apiKey: string
  textModel: string
  visionModel: string
  maxInputTokens: number
  maxOutputTokens: number
  isDefault: boolean
}

const emptyProvider = (): ProviderDraft => ({
  name: '',
  protocol: 'chat_completions',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  textModel: '',
  visionModel: '',
  maxInputTokens: DEFAULT_PROVIDER_MAX_INPUT_TOKENS,
  maxOutputTokens: DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS,
  isDefault: false
})

export function SettingsView(): React.JSX.Element {
  const appState = useAppStore((state) => state.appState)
  const providers = useAppStore((state) => state.providers)
  const refreshMetadata = useAppStore((state) => state.refreshMetadata)
  const setAppState = useAppStore((state) => state.setAppState)
  const notify = useAppStore((state) => state.notify)
  const [draft, setDraft] = useState<ProviderDraft>(emptyProvider)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteProvider, setDeleteProvider] = useState<ProviderProfile | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState('')
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const createProvider = (): void => {
    setDraft(emptyProvider())
    setError('')
    setEditorOpen(true)
  }

  const editProvider = (provider: ProviderProfile): void => {
    setDraft({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      apiKey: '',
      textModel: provider.textModel,
      visionModel: provider.visionModel,
      maxInputTokens: provider.maxInputTokens,
      maxOutputTokens: provider.maxOutputTokens,
      isDefault: provider.isDefault
    })
    setError('')
    setEditorOpen(true)
  }

  const saveProvider = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.api.providers.save({
        ...draft,
        apiKey: draft.apiKey || undefined
      })
      await refreshMetadata()
      setEditorOpen(false)
      notify('模型服务配置已加密保存', 'success')
    } catch (saveError) {
      setError(formatError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const testProvider = async (provider: ProviderProfile): Promise<void> => {
    setTestingId(provider.id)
    setTestResults((current) => ({ ...current, [provider.id]: '' }))
    try {
      const result = await window.api.providers.test(provider.id)
      setTestResults((current) => ({
        ...current,
        [provider.id]: result.ok
          ? `连接成功${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`
          : result.message
      }))
    } catch (testError) {
      setTestResults((current) => ({ ...current, [provider.id]: formatError(testError) }))
    } finally {
      setTestingId('')
    }
  }

  const removeProvider = async (): Promise<void> => {
    if (!deleteProvider) return
    try {
      await window.api.providers.remove(deleteProvider.id)
      await refreshMetadata()
      setDeleteProvider(null)
      notify('模型服务已删除', 'success')
    } catch (removeError) {
      notify(formatError(removeError), 'error')
    }
  }

  const changePassword = async (): Promise<void> => {
    setPasswordError('')
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    setPasswordBusy(true)
    try {
      await window.api.vault.changePassword(currentPassword, newPassword)
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      notify('应用密码已更新', 'success')
    } catch (changeError) {
      setPasswordError(formatError(changeError))
    } finally {
      setPasswordBusy(false)
    }
  }

  const lock = async (): Promise<void> => {
    await window.api.vault.lock()
    if (appState) setAppState({ ...appState, vaultState: 'locked' })
  }

  return (
    <div className="content-page">
      <PageHeader
        title="设置"
        description="配置 OpenAI 兼容模型服务、便携数据目录和应用密码。"
      />

      <section className="settings-section">
        <div className="settings-section__heading">
          <div>
            <span className="settings-icon">
              <Server size={18} />
            </span>
            <div>
              <h2>模型服务</h2>
              <p>文本分析走 Chat Completions 或 Responses；图片分析需要单独配置视觉模型。</p>
            </div>
          </div>
          <Button onClick={createProvider}>
            <Plus size={16} />
            添加服务
          </Button>
        </div>

        {providers.length === 0 ? (
          <EmptyState
            icon={<Wifi size={24} />}
            title="还没有模型服务"
            description="应用不内置任何供应商密钥。添加兼容端点后，才能连接测试、生成风格或发起分析。"
            action={<Button onClick={createProvider}>配置模型服务</Button>}
          />
        ) : (
          <div className="provider-list">
            {providers.map((provider) => (
              <article className="provider-row" key={provider.id}>
                <div className="provider-row__identity">
                  <span className="provider-mark">
                    {provider.protocol === 'responses' ? 'R' : 'C'}
                  </span>
                  <div>
                    <h3>
                      {provider.name}
                      {provider.isDefault ? <span className="default-tag">默认</span> : null}
                    </h3>
                    <p>
                      {provider.protocol === 'responses' ? 'Responses API' : 'Chat Completions'} ·{' '}
                      {provider.textModel}
                      {provider.visionModel ? ` / ${provider.visionModel}` : ' / 无视觉模型'}
                      {' · '}输入 {formatTokenLimit(provider.maxInputTokens)} / 输出{' '}
                      {formatTokenLimit(provider.maxOutputTokens)}
                    </p>
                  </div>
                </div>
                <code>{provider.baseUrl}</code>
                <div className="provider-row__status">
                  {testResults[provider.id] ? (
                    <span
                      className={
                        testResults[provider.id]!.startsWith('连接成功')
                          ? 'test-success'
                          : 'test-failure'
                      }
                    >
                      {testResults[provider.id]!.startsWith('连接成功') ? (
                        <CheckCircle2 size={14} />
                      ) : null}
                      {testResults[provider.id]}
                    </span>
                  ) : (
                    <span className="muted">{provider.hasApiKey ? 'API 密钥已保存' : '未配置密钥'}</span>
                  )}
                </div>
                <div className="provider-row__actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={testingId === provider.id}
                    onClick={() => void testProvider(provider)}
                  >
                    {testingId === provider.id ? <Spinner label="测试中" /> : <Wifi size={14} />}
                    {testingId !== provider.id ? '测试' : null}
                  </Button>
                  <button className="mini-icon-button" onClick={() => editProvider(provider)}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="mini-icon-button mini-icon-button--danger"
                    onClick={() => setDeleteProvider(provider)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <div>
            <span className="settings-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2>保险库与隐私</h2>
              <p>聊天、图片、密钥、人设、风格与历史均保存在加密数据库中。</p>
            </div>
          </div>
        </div>
        <div className="settings-grid">
          <article className="settings-tile">
            <Database size={19} />
            <h3>便携数据目录</h3>
            <p className="path-text">{appState?.dataPath}</p>
            <Button variant="secondary" size="sm" onClick={() => void window.api.app.revealDataFolder()}>
              打开目录
            </Button>
          </article>
          <article className="settings-tile">
            <KeyRound size={19} />
            <h3>应用密码</h3>
            <p>修改密码只会重新包装主密钥，不会重新加密全部记录。</p>
            <Button variant="secondary" size="sm" onClick={() => setPasswordOpen(true)}>
              修改密码
            </Button>
          </article>
          <article className="settings-tile">
            <Lock size={19} />
            <h3>锁定保险库</h3>
            <p>系统锁屏或休眠时也会自动锁定并取消正在进行的分析。</p>
            <Button variant="secondary" size="sm" onClick={() => void lock()}>
              立即锁定
            </Button>
          </article>
        </div>
        <div className="privacy-note">
          <ShieldCheck size={17} />
          <p>
            应用不包含遥测、云同步或自动更新。只有连接测试、风格生成、截图识别和分析操作会访问你配置的模型端点；图片分析每次都需要明确授权。
          </p>
        </div>
      </section>

      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={draft.id ? '编辑模型服务' : '添加模型服务'}
        description="API 密钥只保存在加密保险库，不会暴露给渲染页面。"
        width="680px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                saving ||
                !draft.name.trim() ||
                !draft.baseUrl.trim() ||
                !draft.textModel.trim() ||
                !Number.isFinite(draft.maxInputTokens) ||
                !Number.isFinite(draft.maxOutputTokens) ||
                draft.maxInputTokens < 1 ||
                draft.maxOutputTokens < 1
              }
              onClick={saveProvider}
            >
              {saving ? '保存中…' : '保存服务'}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-grid">
            <Field label="服务名称">
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="例如：OpenAI 主账号"
                autoFocus
              />
            </Field>
            <Field label="接口协议">
              <select
                className="select"
                value={draft.protocol}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    protocol: event.target.value as ProviderDraft['protocol']
                  })
                }
              >
                <option value="chat_completions">Chat Completions</option>
                <option value="responses">Responses API</option>
              </select>
            </Field>
          </div>
          <Field label="Base URL" hint="可填写根地址或 /v1；应用会补全对应协议路径。">
            <Input
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field
            label="API 密钥"
            hint={draft.id ? '已保存的密钥不会回显；留空表示保持原密钥。' : '只保存在本地加密保险库。'}
          >
            <Input
              type="password"
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              placeholder={draft.id ? '留空不修改' : 'sk-…'}
            />
          </Field>
          <div className="form-grid">
            <Field label="文本模型">
              <Input
                value={draft.textModel}
                onChange={(event) => setDraft({ ...draft, textModel: event.target.value })}
                placeholder="模型 ID"
              />
            </Field>
            <Field label="视觉模型" hint="留空时禁用图片分析。">
              <Input
                value={draft.visionModel}
                onChange={(event) => setDraft({ ...draft, visionModel: event.target.value })}
                placeholder="支持图片输入的模型 ID"
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field
              label="最大输入 tokens"
              hint="默认 350000。文本按保守规则估算，图片每张另按 1500 tokens 估算。"
            >
              <Input
                type="number"
                min={1}
                max={2_000_000}
                step={1000}
                value={draft.maxInputTokens}
                onChange={(event) =>
                  setDraft({ ...draft, maxInputTokens: Number(event.target.value) })
                }
              />
            </Field>
            <Field
              label="最大输出 tokens"
              hint="默认 200000。实际可用上限仍取决于中转站和模型。"
            >
              <Input
                type="number"
                min={1}
                max={2_000_000}
                step={1000}
                value={draft.maxOutputTokens}
                onChange={(event) =>
                  setDraft({ ...draft, maxOutputTokens: Number(event.target.value) })
                }
              />
            </Field>
          </div>
          <SwitchField
            checked={draft.isDefault}
            onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked })}
            label="设为默认模型服务"
            description="新分析会优先选中该服务。"
          />
          {error ? <div className="inline-error">{error}</div> : null}
        </div>
      </Modal>

      <Modal
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        title="修改应用密码"
        description="恢复码仍然有效；新密码必须至少 10 位并同时包含字母和数字。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)}>
              取消
            </Button>
            <Button disabled={passwordBusy} onClick={changePassword}>
              {passwordBusy ? '更新中…' : '更新密码'}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Field label="当前密码">
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
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
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
          {passwordError ? <div className="inline-error">{passwordError}</div> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteProvider)}
        onOpenChange={(open) => {
          if (!open) setDeleteProvider(null)
        }}
        title="删除模型服务？"
        description="如果该服务被历史报告引用，报告正文仍会保留，但之后不能再用它发起新分析。"
        confirmText="删除服务"
        danger
        onConfirm={removeProvider}
      />
    </div>
  )
}

function formatTokenLimit(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}
