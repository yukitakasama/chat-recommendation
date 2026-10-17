import { useMemo, useState } from 'react'
import {
  BookOpenText,
  Import,
  Plus,
  Sparkles,
  Trash2,
  UserRound
} from 'lucide-react'
import type { StyleProfile } from '../../../shared/schemas'
import { formatError, useAppStore } from '../store'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner
} from './ui'

export function StyleLibrary(): React.JSX.Element {
  const styles = useAppStore((state) => state.styles)
  const friends = useAppStore((state) => state.friends)
  const providers = useAppStore((state) => state.providers)
  const selectedFriendId = useAppStore((state) => state.selectedFriendId)
  const refreshMetadata = useAppStore((state) => state.refreshMetadata)
  const notify = useAppStore((state) => state.notify)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [deleteStyle, setDeleteStyle] = useState<StyleProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scope, setScope] = useState<'global' | 'friend'>('global')
  const [friendId, setFriendId] = useState(selectedFriendId ?? friends[0]?.id ?? '')
  const [providerId, setProviderId] = useState(
    providers.find((item) => item.isDefault)?.id ?? providers[0]?.id ?? ''
  )
  const [name, setName] = useState('')

  const grouped = useMemo(
    () => ({
      generated: styles.filter((item) => item.sourceKind !== 'imported'),
      imported: styles.filter((item) => item.sourceKind === 'imported')
    }),
    [styles]
  )

  const importStyle = async (): Promise<void> => {
    setError('')
    try {
      const result = await window.api.styles.importFile()
      if (!result.canceled) {
        await refreshMetadata()
        notify('回复风格已导入', 'success')
      }
    } catch (importError) {
      notify(formatError(importError), 'error')
    }
  }

  const generate = async (): Promise<void> => {
    setError('')
    setBusy(true)
    try {
      await window.api.styles.generate({
        scope,
        friendId: scope === 'friend' ? friendId : undefined,
        providerId,
        name: name.trim() || undefined
      })
      await refreshMetadata()
      setGenerateOpen(false)
      setName('')
      notify('已从聊天记录生成回复风格', 'success')
    } catch (generateError) {
      setError(formatError(generateError))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!deleteStyle) return
    try {
      await window.api.styles.remove(deleteStyle.id)
      await refreshMetadata()
      setDeleteStyle(null)
      notify('风格档案已删除', 'success')
    } catch (removeError) {
      notify(formatError(removeError), 'error')
    }
  }

  return (
    <div className="content-page">
      <PageHeader
        title="回复风格"
        description="导入风格 skill，或从你本人发出的消息中提取可复用的表达习惯。"
        actions={
          <>
            <Button variant="secondary" onClick={importStyle}>
              <Import size={16} />
              导入 Skill
            </Button>
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles size={16} />
              从记录生成
            </Button>
          </>
        }
      />

      {styles.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={25} />}
          title="还没有回复风格"
          description="支持 JSON 与 Markdown/SKILL.md，也可以从历史聊天中学习你自己的表达方式。"
          action={
            <Button variant="secondary" onClick={() => setGenerateOpen(true)}>
              生成第一个风格
            </Button>
          }
        />
      ) : (
        <>
          {grouped.generated.length ? (
            <section className="library-section">
              <div className="library-section__heading">
                <h2>从聊天生成</h2>
                <span>{grouped.generated.length}</span>
              </div>
              <div className="style-grid">
                {grouped.generated.map((style) => (
                  <StyleCard key={style.id} style={style} onDelete={setDeleteStyle} />
                ))}
              </div>
            </section>
          ) : null}
          {grouped.imported.length ? (
            <section className="library-section">
              <div className="library-section__heading">
                <h2>导入的风格 Skill</h2>
                <span>{grouped.imported.length}</span>
              </div>
              <div className="style-grid">
                {grouped.imported.map((style) => (
                  <StyleCard key={style.id} style={style} onDelete={setDeleteStyle} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <Modal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title="从聊天记录生成回复风格"
        description="只分析发送者角色为“我”的消息；建议先纠正导入记录中的未知角色。"
        width="600px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={busy || !providerId || (scope === 'friend' && !friendId)}
              onClick={generate}
            >
              {busy ? <Spinner label="分析风格中" /> : '生成风格'}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Field label="样本范围">
            <div className="segmented segmented--wide">
              <button
                className={scope === 'global' ? 'is-active' : ''}
                onClick={() => setScope('global')}
              >
                全部好友
              </button>
              <button
                className={scope === 'friend' ? 'is-active' : ''}
                onClick={() => setScope('friend')}
              >
                指定好友
              </button>
            </div>
          </Field>
          {scope === 'friend' ? (
            <Field label="好友">
              <select
                className="select"
                value={friendId}
                onChange={(event) => setFriendId(event.target.value)}
              >
                {friends.map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.displayName}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="模型服务">
            <select
              className="select"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">选择模型服务</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="风格名称" hint="可选，留空由模型命名。">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {providers.length === 0 ? (
            <div className="inline-warning">请先在“设置”中配置模型服务。</div>
          ) : null}
          {error ? <div className="inline-error">{error}</div> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteStyle)}
        onOpenChange={(open) => {
          if (!open) setDeleteStyle(null)
        }}
        title="删除风格档案？"
        description="之后的回复生成将不能继续选择该风格，已经生成的分析报告不受影响。"
        confirmText="删除风格"
        danger
        onConfirm={remove}
      />
    </div>
  )
}

function StyleCard({
  style,
  onDelete
}: {
  style: StyleProfile
  onDelete: (style: StyleProfile) => void
}): React.JSX.Element {
  const source =
    style.sourceKind === 'imported'
      ? '导入 Skill'
      : style.sourceKind === 'generated_global'
        ? '全部好友样本'
        : '指定好友样本'
  const traits = [
    ...style.skill.traits.tone,
    style.skill.traits.sentenceLength,
    style.skill.traits.emoji
  ].filter(Boolean)
  return (
    <article className="style-card">
      <div className="style-card__top">
        <span className="style-icon">
          {style.sourceKind === 'imported' ? <BookOpenText size={19} /> : <UserRound size={19} />}
        </span>
        <span className="source-tag">{source}</span>
        <button
          className="mini-icon-button mini-icon-button--danger"
          onClick={() => onDelete(style)}
          aria-label="删除风格"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <h3>{style.name}</h3>
      <p>{style.skill.description || '没有补充说明。'}</p>
      <div className="trait-list">
        {traits.slice(0, 5).map((trait, index) => (
          <span key={`${trait}-${index}`}>{trait}</span>
        ))}
      </div>
      <footer>
        {style.sourceKind === 'imported'
          ? '文本规则'
          : `${style.sampleCount.toLocaleString('zh-CN')} 条本人消息`}
      </footer>
    </article>
  )
}
