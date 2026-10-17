import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarRange,
  CircleStop,
  Image,
  ShieldAlert,
  Sparkles
} from 'lucide-react'
import type {
  AnalysisPreflight,
  AnalysisProgress,
  AnalysisRun
} from '../../../shared/schemas'
import { formatError, useAppStore } from '../store'
import { Button, Field, Input, Modal, Spinner, SwitchField } from './ui'
import { AnalysisResultView } from './AnalysisResultView'

export function AnalysisPanel({ onFinished }: { onFinished: () => void }): React.JSX.Element {
  const friendId = useAppStore((state) => state.selectedFriendId)
  const friends = useAppStore((state) => state.friends)
  const modes = useAppStore((state) => state.modes)
  const personas = useAppStore((state) => state.personas)
  const styles = useAppStore((state) => state.styles)
  const providers = useAppStore((state) => state.providers)
  const refreshHistory = useAppStore((state) => state.refreshHistory)
  const notify = useAppStore((state) => state.notify)
  const friend = friends.find((item) => item.id === friendId)
  const [modeId, setModeId] = useState(modes[0]?.id ?? '')
  const [personaId, setPersonaId] = useState(
    personas.find((item) => item.builtIn)?.id ?? personas[0]?.id ?? ''
  )
  const [providerId, setProviderId] = useState(
    providers.find((item) => item.isDefault)?.id ?? providers[0]?.id ?? ''
  )
  const [styleId, setStyleId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [includeImages, setIncludeImages] = useState(false)
  const [imageConsent, setImageConsent] = useState(false)
  const [preflight, setPreflight] = useState<AnalysisPreflight | null>(null)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [currentRunId, setCurrentRunId] = useState('')
  const [run, setRun] = useState<AnalysisRun | null>(null)
  const [error, setError] = useState('')

  const selectedMode = useMemo(() => modes.find((item) => item.id === modeId), [modeId, modes])

  useEffect(() => {
    if (!modeId && modes[0]) setModeId(modes[0].id)
    if (!personaId && personas[0]) setPersonaId(personas[0].id)
    if (!providerId && providers[0]) setProviderId(providers[0].id)
  }, [modeId, modes, personaId, personas, providerId, providers])

  useEffect(() => {
    if (selectedMode) setIncludeImages(selectedMode.includeImagesByDefault)
  }, [selectedMode])

  useEffect(() => {
    return window.api.app.onAnalysisProgress((next) => {
      setProgress(next)
      setCurrentRunId(next.runId)
    })
  }, [])

  const buildInput = (): Parameters<typeof window.api.analysis.preflight>[0] => ({
    friendId: friendId ?? '',
    modeId,
    personaId,
    styleId: styleId || null,
    providerId,
    includeImages,
    scope: {
      from: dateBoundary(from, 'start'),
      to: dateBoundary(to, 'end')
    }
  })

  const openPreflight = async (): Promise<void> => {
    setError('')
    if (!friendId || !modeId || !personaId || !providerId) {
      setError('请选择好友、分析模式、人设和模型服务')
      return
    }
    setPreparing(true)
    try {
      const result = await window.api.analysis.preflight(buildInput())
      setPreflight(result)
      setImageConsent(false)
      setPreflightOpen(true)
    } catch (preflightError) {
      setError(formatError(preflightError))
    } finally {
      setPreparing(false)
    }
  }

  const startAnalysis = async (): Promise<void> => {
    if (!preflight) return
    if (preflight.includesImages && !imageConsent) {
      setError('需要勾选图片发送授权')
      return
    }
    setPreflightOpen(false)
    setRunning(true)
    setRun(null)
    setError('')
    setProgress(null)
    setCurrentRunId('')
    try {
      const completed = await window.api.analysis.start({
        ...buildInput(),
        consentToImages: includeImages && imageConsent
      })
      setRun(completed)
      await refreshHistory(friendId ?? undefined)
      notify('分析完成并已加密保存', 'success')
    } catch (analysisError) {
      setError(formatError(analysisError))
    } finally {
      setRunning(false)
      setProgress(null)
      setCurrentRunId('')
    }
  }

  const cancel = async (): Promise<void> => {
    if (currentRunId) await window.api.analysis.cancel(currentRunId)
  }

  return (
    <section className="analysis-layout">
      <div className="work-panel analysis-config">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">EVIDENCE-BASED ANALYSIS</span>
            <h2>配置本次分析</h2>
            <p>证据范围、模型和风格都会记录到结果中，便于回看。</p>
          </div>
        </div>

        <div className="form-grid">
          <Field label="分析模式">
            <select
              className="select"
              value={modeId}
              onChange={(event) => setModeId(event.target.value)}
            >
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="助理人设">
            <select
              className="select"
              value={personaId}
              onChange={(event) => setPersonaId(event.target.value)}
            >
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="模型服务">
            <select
              className="select"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="回复风格">
            <select
              className="select"
              value={styleId}
              onChange={(event) => setStyleId(event.target.value)}
            >
              <option value="">不模仿特定风格</option>
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="开始日期" hint="留空表示全量历史">
            <div className="input-with-icon">
              <CalendarRange size={16} />
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
          </Field>
          <Field label="结束日期" hint="留空表示截至现在">
            <div className="input-with-icon">
              <CalendarRange size={16} />
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </Field>
        </div>

        {selectedMode ? (
          <div className="analysis-mode-note">
            <Sparkles size={17} />
            <p>{selectedMode.description}</p>
          </div>
        ) : null}

        <SwitchField
          checked={includeImages}
          onCheckedChange={setIncludeImages}
          label="本次分析包含聊天图片与截图"
          description="默认关闭。开启后会在预检中显示图片数量，并在发送前再次确认。"
          disabled={running}
        />

        {providers.length === 0 ? (
          <div className="notice notice--warning">
            <ShieldAlert size={18} />
            <p>尚未配置模型服务。请先在“设置”中添加 OpenAI 兼容端点、模型名称和 API 密钥。</p>
          </div>
        ) : null}
        {error ? <div className="inline-error">{error}</div> : null}

        {running ? (
          <div className="analysis-progress">
            <div className="analysis-progress__top">
              <span>
                <Image size={16} />
                {progress?.message ?? '正在准备分析'}
              </span>
              <strong>
                {progress ? `${progress.completed}/${progress.total}` : '准备中'}
              </strong>
            </div>
            <div className="progress-track">
              <span
                style={{
                  width: progress
                    ? `${Math.min(100, (progress.completed / Math.max(1, progress.total)) * 100)}%`
                    : '8%'
                }}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={cancel}>
              <CircleStop size={15} />
              取消分析
            </Button>
          </div>
        ) : null}

        <div className="panel-actions panel-actions--between">
          <span className="muted">
            {friend ? `分析对象：${friend.displayName}` : '请选择好友'}
          </span>
          <Button onClick={openPreflight} disabled={running || preparing || !friendId}>
            {preparing ? <Spinner label="预检中" /> : '预检并分析'}
            {!preparing ? <ArrowRight size={16} /> : null}
          </Button>
        </div>
      </div>

      <div className="analysis-result-column">
        {run?.result ? (
          <>
            <AnalysisResultView run={run} />
            <div className="result-followup">
              <Button variant="secondary" onClick={onFinished}>
                查看全部分析历史
              </Button>
            </div>
          </>
        ) : (
          <div className="result-placeholder">
            <span className="result-placeholder__index">01</span>
            <h3>结果会在这里展开</h3>
            <p>
              好感信号、推进建议、话题和回复候选都会附带证据引用、置信度与风险等级。
            </p>
            <div className="result-placeholder__lines">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <Modal
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        title="确认本次云端分析"
        description="这不是模型调用结果，只是即将外发内容的预检。"
        width="620px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreflightOpen(false)}>
              取消
            </Button>
            <Button onClick={startAnalysis} disabled={preflight?.includesImages && !imageConsent}>
              开始分析
            </Button>
          </>
        }
      >
        {preflight ? (
          <div className="preflight">
            <div className="preflight__grid">
              <span>
                <small>好友</small>
                <strong>{preflight.friendName}</strong>
              </span>
              <span>
                <small>模式</small>
                <strong>{preflight.modeName}</strong>
              </span>
              <span>
                <small>消息</small>
                <strong>{preflight.messageCount.toLocaleString('zh-CN')} 条</strong>
              </span>
              <span>
                <small>字符</small>
                <strong>{preflight.characterCount.toLocaleString('zh-CN')}</strong>
              </span>
              <span>
                <small>图片</small>
                <strong>{preflight.imageCount} 张</strong>
              </span>
              <span>
                <small>预计请求</small>
                <strong>{preflight.estimatedRequests} 次</strong>
              </span>
            </div>
            <div className="endpoint-box">
              <small>{preflight.protocol === 'responses' ? 'Responses API' : 'Chat Completions'}</small>
              <code>{preflight.endpoint}</code>
            </div>
            {preflight.warnings.map((warning, index) => (
              <p className="preflight-warning" key={`${warning}-${index}`}>
                {warning}
              </p>
            ))}
            {preflight.includesImages ? (
              <label className="check-row check-row--warning">
                <input
                  type="checkbox"
                  checked={imageConsent}
                  onChange={(event) => setImageConsent(event.target.checked)}
                />
                <span>
                  我确认将 {preflight.imageCount} 张聊天图片发送到上述视觉模型端点，并了解供应商的数据政策不由本应用控制。
                </span>
              </label>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}

function dateBoundary(value: string, boundary: 'start' | 'end'): string | null {
  if (!value) return null
  const date = new Date(`${value}T${boundary === 'start' ? '00:00:00' : '23:59:59'}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
