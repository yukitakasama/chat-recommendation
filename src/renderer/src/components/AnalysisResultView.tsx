import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  HeartHandshake,
  MessageCircle,
  Quote,
  ShieldAlert,
  Sparkles
} from 'lucide-react'
import type {
  AnalysisRun,
  Confidence,
  EvidenceRef,
  ReplyCandidate,
  RiskLevel,
  SupplementalAnswerResult
} from '../../../shared/schemas'
import { useAppStore } from '../store'
import { Button } from './ui'

export function AnalysisResultView({
  run,
  compact
}: {
  run: AnalysisRun
  compact?: boolean
}): React.JSX.Element {
  const result = run.result
  if (!result) {
    return (
      <div className="result-placeholder">
        <AlertTriangle size={22} />
        <h3>没有可显示的结果</h3>
        <p>{run.error ?? '分析尚未完成。'}</p>
      </div>
    )
  }
  return (
    <div className={`result-document ${compact ? 'result-document--compact' : ''}`}>
      <header className="result-header">
        <div>
          <span className="eyebrow">{run.modeName}</span>
          <h2>{run.friendName} 的聊天分析</h2>
          <p>
            {run.messageCount.toLocaleString('zh-CN')} 条消息 · {run.imageCount} 张图片 ·{' '}
            {formatDateTime(run.completedAt ?? run.createdAt)}
          </p>
        </div>
        <span className="result-status">
          <CheckCircle2 size={16} />
          已完成
        </span>
      </header>

      <div className="result-default-marker">
        <MessageCircle size={16} />
        <div>
          <strong>默认问题分析</strong>
          <span>按“{run.modeName}”模式生成的完整结果</span>
        </div>
      </div>

      {result.kind === 'love' ? (
        <>
          <section className="result-section result-section--affection">
            <div className="section-kicker">
              <HeartHandshake size={17} />
              好感与对方看法
            </div>
            <div className="signal-heading">
              <div>
                <span className="signal-label">行为信号</span>
                <h3>{signalLabel(result.affection.signal)}</h3>
              </div>
              <span className={`confidence confidence--${result.affection.confidence}`}>
                置信度 {confidenceLabel(result.affection.confidence)}
              </span>
            </div>
            <p className="result-lead">{result.affection.summary}</p>
            <EvidenceList items={result.affection.evidence} />
            {result.affection.uncertainty.length ? (
              <div className="uncertainty-list">
                {result.affection.uncertainty.map((item, index) => (
                  <p key={`${item}-${index}`}>
                    <AlertTriangle size={14} />
                    {item}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="result-section">
            <div className="section-kicker">能否推进</div>
            <div className="advance-heading">
              <h3>{advancementLabel(result.advancement.decision)}</h3>
              <p>{result.advancement.summary}</p>
            </div>
            <ul className="reason-list">
              {result.advancement.reasons.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
            <EvidenceList items={result.advancement.evidence} />
          </section>

          <section className="result-section">
            <div className="section-kicker">
              <MessageCircle size={17} />
              可以聊什么
            </div>
            <div className="topic-grid">
              {result.topics.map((topic, index) => (
                <article className="topic-card" key={`${topic.title}-${index}`}>
                  <span className={`risk risk--${topic.risk}`}>{riskLabel(topic.risk)}</span>
                  <h4>{topic.title}</h4>
                  <p className="topic-opening">“{topic.opening}”</p>
                  <small>{topic.reason}</small>
                  <CopyButton text={topic.opening} label="复制开场" />
                </article>
              ))}
            </div>
          </section>

          <section className="result-section">
            <div className="section-kicker">回复候选</div>
            <div className="reply-list">
              {result.replies.map((reply, index) => (
                <ReplyCard key={`${reply.text}-${index}`} reply={reply} />
              ))}
            </div>
          </section>
        </>
      ) : result.kind === 'work' ? (
        <>
          <section className="result-section">
            <div className="section-kicker">对方意图与态度</div>
            <div className="signal-heading">
              <p className="result-lead">{result.counterpartRead.summary}</p>
              <span className={`confidence confidence--${result.counterpartRead.confidence}`}>
                置信度 {confidenceLabel(result.counterpartRead.confidence)}
              </span>
            </div>
            <EvidenceList items={result.counterpartRead.evidence} />
            {result.counterpartRead.uncertainty.length ? (
              <div className="uncertainty-list">
                {result.counterpartRead.uncertainty.map((item, index) => (
                  <p key={`${item}-${index}`}>
                    <AlertTriangle size={14} />
                    {item}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          <section className="result-section">
            <div className="section-kicker">沟通风险</div>
            <ul className="reason-list">
              {result.risks.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="result-section">
            <div className="section-kicker">目标与行动</div>
            <p className="result-lead">{result.objective.summary}</p>
            <ol className="action-list">
              {result.actions.map((item, index) => (
                <li key={`${item}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {item}
                </li>
              ))}
            </ol>
            <EvidenceList items={result.objective.evidence} />
          </section>
          <section className="result-section">
            <div className="section-kicker">回复候选</div>
            <div className="reply-list">
              {result.replies.map((reply, index) => (
                <ReplyCard key={`${reply.text}-${index}`} reply={reply} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="result-section">
            <div className="section-kicker">{result.modeName}</div>
            <p className="result-lead">{result.summary}</p>
          </section>
          {result.sections.map((section) => (
            <section className="result-section" key={section.id}>
              <div className="section-kicker">{section.title}</div>
              {section.content ? <p>{section.content}</p> : null}
              {section.items.length ? (
                <ul className="reason-list">
                  {section.items.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {section.topics?.length ? (
                <div className="topic-grid">
                  {section.topics.map((topic, index) => (
                    <article className="topic-card" key={`${topic.title}-${index}`}>
                      <span className={`risk risk--${topic.risk}`}>{riskLabel(topic.risk)}</span>
                      <h4>{topic.title}</h4>
                      <p className="topic-opening">“{topic.opening}”</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {section.replies?.length ? (
                <div className="reply-list">
                  {section.replies.map((reply, index) => (
                    <ReplyCard key={`${reply.text}-${index}`} reply={reply} />
                  ))}
                </div>
              ) : null}
              <EvidenceList items={section.evidence} />
            </section>
          ))}
        </>
      )}

      {result.supplementalAnswer ? (
        <SupplementalAnswerSection supplementalAnswer={result.supplementalAnswer} />
      ) : null}

      {result.styleBasis ? (
        <section className="result-section style-basis">
          <div className="section-kicker">
            <Sparkles size={17} />
            风格依据
          </div>
          <h3>{result.styleBasis.styleName}</h3>
          <p>{result.styleBasis.evidenceNote}</p>
          <div className="trait-list">
            {result.styleBasis.traits.map((trait, index) => (
              <span key={`${trait}-${index}`}>{trait}</span>
            ))}
          </div>
        </section>
      ) : null}

      {result.warnings.length ? (
        <section className="result-section result-warnings">
          <div className="section-kicker">
            <ShieldAlert size={17} />
            需要注意
          </div>
          {result.warnings.map((warning, index) => (
            <p key={`${warning}-${index}`}>{warning}</p>
          ))}
        </section>
      ) : null}

      <footer className="result-footer">
        <span>人设：{run.personaName}</span>
        <span>模型：{run.providerName}</span>
        <span>本结果是有限证据下的推断，不代表事实或心理诊断。</span>
      </footer>
    </div>
  )
}

function SupplementalAnswerSection({
  supplementalAnswer
}: {
  supplementalAnswer: SupplementalAnswerResult
}): React.JSX.Element {
  return (
    <section className="result-section result-section--supplemental">
      <div className="section-kicker">
        <MessageCircle size={17} />
        补充提问回答
      </div>
      <blockquote className="supplement-question">{supplementalAnswer.question}</blockquote>
      {supplementalAnswer.status === 'answered' ? (
        <>
          <p className="result-lead supplement-answer">{supplementalAnswer.answer}</p>
          <EvidenceList items={supplementalAnswer.evidence} />
          {supplementalAnswer.uncertainty.length ? (
            <div className="uncertainty-list">
              {supplementalAnswer.uncertainty.map((item, index) => (
                <p key={`${item}-${index}`}>
                  <AlertTriangle size={14} />
                  {item}
                </p>
              ))}
            </div>
          ) : null}
          <div className="supplement-answer__actions">
            <CopyButton text={supplementalAnswer.answer} label="复制补充回答" />
          </div>
        </>
      ) : (
        <div className="supplement-answer__failure">
          <AlertTriangle size={16} />
          <p>{supplementalAnswer.error ?? '补充问题未能生成有效回答，默认分析结果已保留。'}</p>
        </div>
      )}
    </section>
  )
}

function ReplyCard({ reply }: { reply: ReplyCandidate }): React.JSX.Element {
  return (
    <article className="reply-card">
      <div className="reply-card__meta">
        <span className="tone-tag">{reply.tone}</span>
        <span className={`risk risk--${reply.risk}`}>{riskLabel(reply.risk)}</span>
      </div>
      <p>{reply.text}</p>
      <div className="reply-card__footer">
        <small>{reply.rationale}</small>
        <CopyButton text={reply.text} label="复制回复" />
      </div>
    </article>
  )
}

function EvidenceList({ items }: { items: EvidenceRef[] }): React.JSX.Element | null {
  if (!items.length) return <p className="evidence-empty">证据不足：本轮没有可引用的明确片段。</p>
  return (
    <div className="evidence-list">
      {items.map((item, index) => (
        <div className="evidence-item" key={`${item.messageId ?? item.assetId}-${index}`}>
          <Quote size={14} />
          <div>
            {item.quote ? <q>{item.quote}</q> : null}
            <span>
              {item.reason || '支持上述判断'}
              {item.messageId ? ` · 消息 ${shortId(item.messageId)}` : ''}
              {item.assetId ? ` · 图片 ${shortId(item.assetId)}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }): React.JSX.Element {
  const notify = useAppStore((state) => state.notify)
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        await window.api.app.copyText(text)
        notify('已复制到剪贴板', 'success')
      }}
    >
      <Clipboard size={14} />
      {label}
    </Button>
  )
}

function signalLabel(value: string): string {
  return (
    { positive: '偏积极', mixed: '混合信号', negative: '偏消极', insufficient: '证据不足' }[
      value
    ] ?? value
  )
}

function advancementLabel(value: string): string {
  return (
    {
      advance: '可以小幅推进',
      cautious: '谨慎观察后再推进',
      pause: '暂缓推进',
      insufficient: '证据不足，先补上下文'
    }[value] ?? value
  )
}

function confidenceLabel(value: Confidence): string {
  return { low: '低', medium: '中', high: '高' }[value]
}

function riskLabel(value: RiskLevel): string {
  return { low: '低风险', medium: '中风险', high: '高风险' }[value]
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
