import { useState } from 'react'
import { Bot, Copy, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { Persona } from '../../../shared/schemas'
import { formatError, useAppStore } from '../store'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Textarea
} from './ui'

interface PersonaDraft {
  id?: string
  name: string
  tone: string
  analysisStyle: string
  boundaries: string
}

const emptyDraft: PersonaDraft = {
  name: '',
  tone: '',
  analysisStyle: '',
  boundaries: ''
}

export function PersonaLibrary(): React.JSX.Element {
  const personas = useAppStore((state) => state.personas)
  const refreshMetadata = useAppStore((state) => state.refreshMetadata)
  const notify = useAppStore((state) => state.notify)
  const [draft, setDraft] = useState<PersonaDraft>(emptyDraft)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deletePersona, setDeletePersona] = useState<Persona | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const edit = (persona: Persona): void => {
    setDraft({
      id: persona.id,
      name: persona.name,
      tone: persona.tone,
      analysisStyle: persona.analysisStyle,
      boundaries: persona.boundaries
    })
    setError('')
    setEditorOpen(true)
  }

  const duplicate = (persona: Persona): void => {
    setDraft({
      name: `${persona.name} 副本`,
      tone: persona.tone,
      analysisStyle: persona.analysisStyle,
      boundaries: persona.boundaries
    })
    setError('')
    setEditorOpen(true)
  }

  const create = (): void => {
    setDraft(emptyDraft)
    setError('')
    setEditorOpen(true)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.api.personas.save(draft)
      await refreshMetadata()
      setEditorOpen(false)
      notify('助理人设已保存', 'success')
    } catch (saveError) {
      setError(formatError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!deletePersona) return
    try {
      await window.api.personas.remove(deletePersona.id)
      await refreshMetadata()
      setDeletePersona(null)
      notify('人设已删除', 'success')
    } catch (removeError) {
      notify(formatError(removeError), 'error')
    }
  }

  return (
    <div className="content-page">
      <PageHeader
        title="助理人设"
        description="人设决定分析叙述的语气、风格和边界；回复候选的表达由风格库单独控制。"
        actions={
          <Button onClick={create}>
            <Plus size={16} />
            新建人设
          </Button>
        }
      />
      {personas.length === 0 ? (
        <EmptyState
          icon={<Bot size={25} />}
          title="还没有助理人设"
          description="创建一个人设，用于控制分析报告的表达方式。"
        />
      ) : (
        <div className="persona-grid">
          {personas.map((persona) => (
            <article className="persona-card" key={persona.id}>
              <div className="persona-card__top">
                <span className="persona-icon">
                  <Bot size={20} />
                </span>
                <div>
                  <h3>{persona.name}</h3>
                  <span className="source-tag">{persona.builtIn ? '内置' : '自定义'}</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>语气</dt>
                  <dd>{persona.tone}</dd>
                </div>
                <div>
                  <dt>分析风格</dt>
                  <dd>{persona.analysisStyle}</dd>
                </div>
              </dl>
              <div className="boundary-note">
                <ShieldCheck size={15} />
                <p>{persona.boundaries}</p>
              </div>
              <footer>
                {persona.builtIn ? (
                  <Button variant="secondary" size="sm" onClick={() => duplicate(persona)}>
                    <Copy size={14} />
                    复制并编辑
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => edit(persona)}>
                      <Pencil size={14} />
                      编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletePersona(persona)}>
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={draft.id ? '编辑助理人设' : '新建助理人设'}
        description="安全底线会覆盖人设边界：应用不会执行操控、胁迫或冒充他人的建议。"
        width="680px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button disabled={saving || !draft.name.trim()} onClick={save}>
              {saving ? '保存中…' : '保存人设'}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Field label="名称">
            <Input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              autoFocus
            />
          </Field>
          <Field label="语气" hint="描述报告的表达方式，例如克制、直接、温和。">
            <Textarea
              rows={3}
              value={draft.tone}
              onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
            />
          </Field>
          <Field label="分析风格" hint="说明如何组织证据、推断和建议。">
            <Textarea
              rows={4}
              value={draft.analysisStyle}
              onChange={(event) => setDraft({ ...draft, analysisStyle: event.target.value })}
            />
          </Field>
          <Field label="边界说明" hint="属于可配置人设边界，不会关闭应用的基础安全约束。">
            <Textarea
              rows={4}
              value={draft.boundaries}
              onChange={(event) => setDraft({ ...draft, boundaries: event.target.value })}
            />
          </Field>
          {error ? <div className="inline-error">{error}</div> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletePersona)}
        onOpenChange={(open) => {
          if (!open) setDeletePersona(null)
        }}
        title="删除助理人设？"
        description="已经生成的分析报告保留原人设快照，但之后不能再选择该人设。"
        confirmText="删除人设"
        danger
        onConfirm={remove}
      />
    </div>
  )
}
