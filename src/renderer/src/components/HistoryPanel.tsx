import { useEffect, useState } from 'react'
import { Clock3, Download, FileJson, FileText, Trash2 } from 'lucide-react'
import type { AnalysisRun } from '../../../shared/schemas'
import { formatError, useAppStore } from '../store'
import { Button, ConfirmDialog, EmptyState, Spinner } from './ui'
import { AnalysisResultView } from './AnalysisResultView'

export function HistoryPanel(): React.JSX.Element {
  const selectedFriendId = useAppStore((state) => state.selectedFriendId)
  const history = useAppStore((state) => state.history)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const notify = useAppStore((state) => state.notify)
  const [selectedRun, setSelectedRun] = useState<AnalysisRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState('')
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | null>(null)

  useEffect(() => {
    void refreshHistory(selectedFriendId ?? undefined)
  }, [refreshHistory, selectedFriendId])

  useEffect(() => {
    if (history.length && !history.some((item) => item.id === selectedRun?.id)) {
      setSelectedRun(history[0] ?? null)
    } else if (!history.length) {
      setSelectedRun(null)
    }
  }, [history, selectedRun?.id])

  const loadRun = async (run: AnalysisRun): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setSelectedRun(await window.api.history.get(run.id))
    } catch (loadError) {
      setError(formatError(loadError))
    } finally {
      setLoading(false)
    }
  }

  const exportRun = async (format: 'markdown' | 'json'): Promise<void> => {
    if (!selectedRun) return
    try {
      const result = await window.api.history.export({ runId: selectedRun.id, format })
      if (!result.canceled) notify(`报告已导出到 ${result.path}`, 'success')
    } catch (exportError) {
      notify(formatError(exportError), 'error')
    }
  }

  const removeRun = async (): Promise<void> => {
    if (!deleteId) return
    try {
      await window.api.history.remove(deleteId)
      await refreshHistory(selectedFriendId ?? undefined)
      setDeleteId('')
      notify('分析历史已删除', 'success')
    } catch (removeError) {
      notify(formatError(removeError), 'error')
    }
  }

  return (
    <section className="history-layout">
      <aside className="history-list">
        <div className="history-list__header">
          <div>
            <span className="eyebrow">SAVED REPORTS</span>
            <h2>分析历史</h2>
          </div>
          <span>{history.length}</span>
        </div>
        {history.length === 0 ? (
          <EmptyState
            icon={<Clock3 size={23} />}
            title="还没有分析报告"
            description="完成一次分析后，报告会加密保存在这里。"
          />
        ) : (
          history.map((run) => (
            <button
              key={run.id}
              className={`history-item ${selectedRun?.id === run.id ? 'is-active' : ''}`}
              onClick={() => void loadRun(run)}
            >
              <span className={`history-status history-status--${run.status}`} />
              <span>
                <strong>{run.modeName}</strong>
                <small>
                  {run.personaName} · {run.messageCount.toLocaleString('zh-CN')} 条消息
                </small>
                <em>{formatTime(run.createdAt)}</em>
              </span>
            </button>
          ))
        )}
      </aside>
      <div className="history-detail">
        {loading ? (
          <div className="panel-loading">
            <Spinner label="正在解密报告" />
          </div>
        ) : error ? (
          <div className="inline-error">{error}</div>
        ) : selectedRun ? (
          <>
            <div className="history-actions">
              <Button variant="secondary" size="sm" onClick={() => setExportFormat('markdown')}>
                <FileText size={15} />
                Markdown
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setExportFormat('json')}>
                <FileJson size={15} />
                JSON
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(selectedRun.id)}>
                <Trash2 size={15} />
                删除
              </Button>
            </div>
            {selectedRun.status === 'completed' ? (
              <AnalysisResultView run={selectedRun} compact />
            ) : (
              <div className="result-placeholder">
                <Download size={22} />
                <h3>该报告未完成</h3>
                <p>{selectedRun.error ?? selectedRun.status}</p>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<FileText size={24} />}
            title="选择一份报告"
            description="报告只使用该好友当前已导入的聊天与图片证据。"
          />
        )}
      </div>
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId('')
        }}
        title="删除分析报告？"
        description="报告正文和数据会从加密保险库永久删除，聊天记录与图片不受影响。"
        confirmText="删除报告"
        danger
        onConfirm={removeRun}
      />
      <ConfirmDialog
        open={Boolean(exportFormat)}
        onOpenChange={(open) => {
          if (!open) setExportFormat(null)
        }}
        title="导出明文分析报告？"
        description="导出的 Markdown 或 JSON 不再受应用密码和保险库加密保护。请选择可信的保存位置，并在分享前自行脱敏。"
        confirmText="选择保存位置"
        onConfirm={async () => {
          if (exportFormat) await exportRun(exportFormat)
          setExportFormat(null)
        }}
      />
    </section>
  )
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
