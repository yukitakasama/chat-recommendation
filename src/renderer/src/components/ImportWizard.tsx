import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileArchive,
  Files,
  Image,
  MoveRight,
  ShieldAlert,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react'
import type {
  ImportBatch,
  ImportCommitInput,
  ImportPreview,
  MessageInput
} from '../../../shared/schemas'
import type { ImportCommitResult } from '../../../shared/ipc'
import { formatError, useAppStore } from '../store'
import { Button, ConfirmDialog, Field, Modal, Spinner } from './ui'

export function ImportWizard({ onImported }: { onImported: () => void }): React.JSX.Element {
  const friendId = useAppStore((state) => state.selectedFriendId)
  const providers = useAppStore((state) => state.providers)
  const refreshFriends = useAppStore((state) => state.refreshFriends)
  const loadMessages = useAppStore((state) => state.loadMessages)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const notify = useAppStore((state) => state.notify)
  const [paths, setPaths] = useState<string[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [editedMessages, setEditedMessages] = useState<MessageInput[]>([])
  const [previewPage, setPreviewPage] = useState(0)
  const [action, setAction] = useState<'copy' | 'move'>('copy')
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [providerId, setProviderId] = useState(
    providers.find((provider) => provider.isDefault)?.id ?? providers[0]?.id ?? ''
  )
  const [screenshotModal, setScreenshotModal] = useState(false)
  const [moveModal, setMoveModal] = useState(false)
  const [error, setError] = useState('')
  const [recognitionWarnings, setRecognitionWarnings] = useState<string[]>([])
  const [result, setResult] = useState<ImportCommitResult | null>(null)

  const screenshotAssets = useMemo(
    () => preview?.assets.filter((asset) => asset.kind === 'screenshot') ?? [],
    [preview]
  )

  const addPaths = (next: string[]): void => {
    setPaths((current) => [...new Set([...current, ...next])])
    setPreview(null)
    setEditedMessages([])
    setResult(null)
    setError('')
  }

  const pickChatFiles = async (): Promise<void> => {
    const picked = await window.api.imports.pickFiles()
    if (!picked.canceled) addPaths(picked.paths)
  }

  const pickImages = async (): Promise<void> => {
    const picked = await window.api.imports.pickImages()
    if (!picked.canceled) addPaths(picked.paths)
  }

  const pickImageFolder = async (): Promise<void> => {
    const picked = await window.api.imports.pickImageFolder()
    if (!picked.canceled) addPaths(picked.paths)
  }

  const createPreview = async (): Promise<void> => {
    if (!friendId || paths.length === 0) return
    setPreviewing(true)
    setError('')
    try {
      const created = await window.api.imports.preview(friendId, paths)
      setPreview(created)
      setEditedMessages(created.messages)
      setPreviewPage(0)
      setProviderId(
        (current) => current || providers.find((provider) => provider.isDefault)?.id || providers[0]?.id || ''
      )
    } catch (previewError) {
      setError(formatError(previewError))
    } finally {
      setPreviewing(false)
    }
  }

  const recognizeScreenshots = async (): Promise<void> => {
    if (!preview || !providerId) return
    setScreenshotModal(false)
    setRecognizing(true)
    setError('')
    try {
      const recognized = await window.api.imports.recognizeScreenshots(
        preview.id,
        providerId,
        screenshotAssets.map((asset) => asset.tempId)
      )
      setEditedMessages(recognized.messages)
      setPreviewPage(0)
      setPreview((current) =>
        current
          ? {
              ...current,
              messages: recognized.messages,
              stats: { ...current.stats, parsedMessages: recognized.messages.length }
            }
          : current
      )
      setRecognitionWarnings(recognized.warnings)
      notify('截图识别完成，请复核发送者和文字', 'success')
    } catch (recognizeError) {
      setError(formatError(recognizeError))
    } finally {
      setRecognizing(false)
    }
  }

  const commit = async (): Promise<void> => {
    if (!preview || !friendId) return
    setBusy(true)
    setError('')
    try {
      const input: ImportCommitInput = {
        previewId: preview.id,
        friendId,
        action,
        messages: editedMessages.map((message, index) => ({
          ...message,
          seq: index
        }))
      }
      const committed = await window.api.imports.commit(input)
      setResult(committed)
      await refreshFriends()
      await loadMessages('')
      await refreshHistory(friendId)
      notify(`已导入 ${committed.importedMessages} 条消息`, 'success')
    } catch (commitError) {
      setError(formatError(commitError))
    } finally {
      setBusy(false)
      setMoveModal(false)
    }
  }

  const updateMessage = (index: number, patch: Partial<MessageInput>): void => {
    setEditedMessages((current) =>
      current.map((message, messageIndex) =>
        messageIndex === index ? { ...message, ...patch } : message
      )
    )
  }

  if (result) {
    return (
      <>
        <section className="work-panel import-result">
          <div className="success-mark">
            <Check size={24} />
          </div>
          <h2>导入完成</h2>
          <p>加密文件已写入保险库，源文件处理结果如下。</p>
          <div className="result-stats">
            <span>
              <strong>{result.importedMessages}</strong> 条消息
            </span>
            <span>
              <strong>{result.importedFiles}</strong> 个文件
            </span>
            <span>
              <strong>{result.deduplicatedFiles}</strong> 个重复文件已复用
            </span>
          </div>
          {result.failedFiles.length ? (
            <div className="failure-list">
              <h3>未完成项目</h3>
              {result.failedFiles.map((item) => (
                <div key={`${item.path}-${item.reason}`}>
                  <strong>{item.path}</strong>
                  <span>{item.reason}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="action-row">
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null)
                setPreview(null)
                setEditedMessages([])
                setPaths([])
              setPreviewPage(0)
              }}
            >
              继续导入
            </Button>
            <Button onClick={onImported}>查看聊天记录</Button>
          </div>
        </section>
        <BatchHistory friendId={friendId} refreshToken={result.batchId} />
      </>
    )
  }

  return (
    <section className="work-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">IMPORT WORKFLOW</span>
          <h2>导入聊天资料</h2>
          <p>聊天文本、图片和截图会组成同一批次，并在提交前显示解析结果。</p>
        </div>
        <span className="step-badge">{preview ? '02 预览与提交' : '01 选择资料'}</span>
      </div>

      {!preview ? (
        <>
          <div className="drop-zone">
            <UploadCloud size={30} />
            <h3>选择聊天导出文件或图片目录</h3>
            <p>支持 QQ TXT、MHT、HTML、JSON、CSV，以及常见图片和截图格式。</p>
            <div className="action-row">
              <Button onClick={pickChatFiles}>
                <Files size={16} />
                选择聊天文件
              </Button>
              <Button variant="secondary" onClick={pickImages}>
                <Image size={16} />
                选择图片文件
              </Button>
              <Button variant="ghost" onClick={pickImageFolder}>
                选择图片目录
              </Button>
            </div>
          </div>

          {paths.length ? (
            <div className="path-list">
              <div className="path-list__header">
                <strong>已选择 {paths.length} 项</strong>
                <button onClick={() => setPaths([])}>清空</button>
              </div>
              {paths.map((filePath) => (
                <div className="path-row" key={filePath}>
                  <FileArchive size={16} />
                  <span title={filePath}>{filePath}</span>
                  <button
                    aria-label="移除"
                    onClick={() => setPaths((current) => current.filter((item) => item !== filePath))}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="inline-error">{error}</div> : null}
          <div className="panel-actions">
            <Button disabled={!paths.length || previewing} onClick={createPreview}>
              {previewing ? <Spinner label="正在解析" /> : '解析并预览'}
              {!previewing ? <ArrowRight size={16} /> : null}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="preview-summary">
            <span>
              <strong>{preview.stats.parsedMessages}</strong> 条消息
            </span>
            <span>
              <strong>{preview.stats.imageFiles}</strong> 张图片
            </span>
            <span>
              <strong>{preview.stats.screenshotFiles}</strong> 张截图
            </span>
            <span>
              <strong>{preview.assets.length}</strong> 个源文件
            </span>
          </div>

          {preview.warnings.length || recognitionWarnings.length ? (
            <details className="warning-box">
              <summary>
                <ShieldAlert size={16} />
                有 {preview.warnings.length + recognitionWarnings.length} 条解析提示
              </summary>
              <ul>
                {[...preview.warnings, ...recognitionWarnings].slice(0, 80).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {screenshotAssets.length ? (
            <div className="screenshot-strip">
              <div>
                <strong>{screenshotAssets.length} 张截图尚未识别为消息</strong>
                <p>可选择视觉模型提取文字，识别结果必须人工复核；不识别时仍会作为分析图片保留。</p>
              </div>
              <select
                className="select"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
              >
                <option value="">选择模型服务</option>
                {providers
                  .filter((provider) => provider.visionModel)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
              </select>
              <Button
                variant="secondary"
                disabled={!providerId || recognizing}
                onClick={() => setScreenshotModal(true)}
              >
                {recognizing ? <Spinner label="识别中" /> : '识别截图'}
              </Button>
            </div>
          ) : null}

          <div className="preview-message-header">
            <div>
              <h3>消息预览与纠正</h3>
              <p>
                共 {editedMessages.length} 条；可按页纠正发送者、角色和文本，提交时保留全部消息。
              </p>
            </div>
          </div>
          <div className="preview-message-list">
            {editedMessages
              .slice(previewPage * 150, previewPage * 150 + 150)
              .map((message, localIndex) => {
                const index = previewPage * 150 + localIndex
                return (
              <div className="preview-message" key={message.tempId}>
                <select
                  className="select select--compact"
                  value={message.senderRole}
                  onChange={(event) =>
                    updateMessage(index, {
                      senderRole: event.target.value as MessageInput['senderRole']
                    })
                  }
                >
                  <option value="other">对方</option>
                  <option value="self">我</option>
                  <option value="system">系统</option>
                  <option value="unknown">未知</option>
                </select>
                <input
                  className="input input--compact sender-input"
                  value={message.senderName}
                  onChange={(event) => updateMessage(index, { senderName: event.target.value })}
                />
                <textarea
                  className="textarea textarea--compact"
                  value={message.text}
                  rows={2}
                  onChange={(event) => updateMessage(index, { text: event.target.value })}
                />
              </div>
                )
              })}
            {editedMessages.length === 0 ? (
              <div className="inline-note">
                没有解析出消息文本。图片和截图仍可作为分析证据导入。
              </div>
            ) : null}
          </div>
          {editedMessages.length > 150 ? (
            <div className="preview-pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={previewPage === 0}
                onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}
              >
                上一页
              </Button>
              <span>
                第 {Math.min(editedMessages.length, previewPage * 150 + 1)}–
                {Math.min(editedMessages.length, (previewPage + 1) * 150)} 条 / 共{' '}
                {editedMessages.length} 条
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={(previewPage + 1) * 150 >= editedMessages.length}
                onClick={() => setPreviewPage((page) => page + 1)}
              >
                下一页
              </Button>
            </div>
          ) : null}

          <div className="import-options">
            <Field label="源文件处理方式">
              <div className="choice-grid">
                <button
                  className={`choice-card ${action === 'copy' ? 'is-active' : ''}`}
                  onClick={() => setAction('copy')}
                >
                  <Files size={19} />
                  <span>
                    <strong>复制一份</strong>
                    <small>源文件完全不变</small>
                  </span>
                </button>
                <button
                  className={`choice-card ${action === 'move' ? 'is-active' : ''}`}
                  onClick={() => setAction('move')}
                >
                  <MoveRight size={19} />
                  <span>
                    <strong>移动到应用</strong>
                    <small>校验保存成功后才删除源文件</small>
                  </span>
                </button>
              </div>
            </Field>
          </div>

          {error ? <div className="inline-error">{error}</div> : null}
          <div className="panel-actions panel-actions--between">
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null)
                setEditedMessages([])
                setPreviewPage(0)
              }}
            >
              <ArrowLeft size={16} />
              返回选择
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (action === 'move') setMoveModal(true)
                else void commit()
              }}
            >
              {busy ? <Spinner label="正在导入" /> : '确认导入'}
              {!busy ? <ArrowRight size={16} /> : null}
            </Button>
          </div>
        </>
      )}

      <Modal
        open={screenshotModal}
        onOpenChange={setScreenshotModal}
        title="确认发送截图到云端"
        description="图片可能包含隐私信息。应用只会发送本次选择的截图到已配置的视觉模型。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setScreenshotModal(false)}>
              取消
            </Button>
            <Button onClick={recognizeScreenshots}>确认并识别</Button>
          </>
        }
      >
        <div className="notice notice--warning">
          <ShieldAlert size={18} />
          <p>
            将发送 {screenshotAssets.length} 张截图到
            <strong>
              {' '}
              {providers.find((provider) => provider.id === providerId)?.name ?? '所选模型服务'}
            </strong>
            。供应商的数据处理政策由该服务决定。
          </p>
        </div>
        <div className="endpoint-box">
          <small>目标端点</small>
          <code>{providers.find((provider) => provider.id === providerId)?.baseUrl ?? '未选择'}</code>
        </div>
      </Modal>

      <Modal
        open={moveModal}
        onOpenChange={setMoveModal}
        title="移动并删除源文件？"
        description="这是不可逆操作。应用会先加密保存并校验内容，成功后才尝试删除每个源文件。"
        width="500px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveModal(false)}>
              改为复制
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setAction('move')
                void commit()
              }}
            >
              确认移动
            </Button>
          </>
        }
      >
        <div className="notice notice--danger">
          <ShieldAlert size={18} />
          <p>{paths.length} 个原始路径将按文件逐个处理。任何保存失败都会保留对应源文件。</p>
        </div>
      </Modal>
      <BatchHistory friendId={friendId} refreshToken={preview?.id ?? ''} />
    </section>
  )
}

function BatchHistory({
  friendId,
  refreshToken
}: {
  friendId: string | null
  refreshToken: string
}): React.JSX.Element {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [deleteBatch, setDeleteBatch] = useState<ImportBatch | null>(null)
  const [error, setError] = useState('')
  const refreshFriends = useAppStore((state) => state.refreshFriends)
  const loadMessages = useAppStore((state) => state.loadMessages)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const notify = useAppStore((state) => state.notify)

  const load = async (): Promise<void> => {
    if (!friendId) return
    try {
      setBatches(await window.api.imports.listBatches(friendId))
    } catch (loadError) {
      setError(formatError(loadError))
    }
  }

  useEffect(() => {
    void load()
  }, [friendId, refreshToken])

  const remove = async (): Promise<void> => {
    if (!deleteBatch) return
    try {
      await window.api.imports.removeBatch(deleteBatch.id)
      setDeleteBatch(null)
      await load()
      await refreshFriends()
      await loadMessages('')
      await refreshHistory(friendId ?? undefined)
      notify('导入批次已删除', 'success')
    } catch (removeError) {
      notify(formatError(removeError), 'error')
    }
  }

  return (
    <div className="batch-history">
      <div className="batch-history__header">
        <div>
          <h3>已导入批次</h3>
          <p>删除批次会移除该批次的消息和图片，不影响其他导入。</p>
        </div>
        <span>{batches.length}</span>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {batches.length === 0 ? (
        <p className="muted">还没有导入批次。</p>
      ) : (
        <div className="batch-list">
          {batches.map((batch) => (
            <div className="batch-row" key={batch.id}>
              <span className="batch-row__mark">{batch.action === 'move' ? 'M' : 'C'}</span>
              <span className="batch-row__identity">
                <strong>{batch.sourceLabel}</strong>
                <small>
                  {formatBatchTime(batch.createdAt)} · {batch.messageCount} 条消息 ·{' '}
                  {batch.fileCount} 个文件
                </small>
              </span>
              <span className="source-tag">
                {batch.action === 'move' ? '移动导入' : '复制导入'}
                {batch.status === 'partial' ? ' · 部分完成' : ''}
              </span>
              <button
                className="mini-icon-button mini-icon-button--danger"
                onClick={() => setDeleteBatch(batch)}
                aria-label={`删除批次 ${batch.sourceLabel}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteBatch)}
        onOpenChange={(open) => {
          if (!open) setDeleteBatch(null)
        }}
        title="删除这个导入批次？"
        description={`“${deleteBatch?.sourceLabel ?? ''}”中的消息、图片和批次记录会被永久删除。已生成的分析报告仍保留。`}
        confirmText="删除批次"
        danger
        onConfirm={remove}
      />
    </div>
  )
}

function formatBatchTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
