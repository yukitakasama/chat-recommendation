import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  LayoutTemplate,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import type {
  AnalysisMode,
  ModeSectionDefinition,
  ModeSectionDefinition as Section
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
  SwitchField,
  Textarea
} from './ui'

interface ModeDraft {
  id?: string
  name: string
  description: string
  prompt: string
  includeImagesByDefault: boolean
  sections: ModeSectionDefinition[]
}

const defaultSections = (): Section[] => [
  {
    id: crypto.randomUUID(),
    title: '分析',
    type: 'analysis',
    instruction: '基于证据说明情况，不作绝对化判断。',
    required: true
  },
  {
    id: crypto.randomUUID(),
    title: '建议',
    type: 'recommendations',
    instruction: '给出 3-5 条可执行建议。',
    required: true
  },
  {
    id: crypto.randomUUID(),
    title: '回复候选',
    type: 'replies',
    instruction: '给出 3-5 条回复，至少一条低风险。',
    required: true
  }
]

const emptyDraft = (): ModeDraft => ({
  name: '',
  description: '',
  prompt: '',
  includeImagesByDefault: false,
  sections: defaultSections()
})

export function ModeLibrary(): React.JSX.Element {
  const modes = useAppStore((state) => state.modes)
  const refreshMetadata = useAppStore((state) => state.refreshMetadata)
  const notify = useAppStore((state) => state.notify)
  const [draft, setDraft] = useState<ModeDraft>(emptyDraft)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState<AnalysisMode | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const create = (): void => {
    setDraft(emptyDraft())
    setError('')
    setEditorOpen(true)
  }

  const edit = (mode: AnalysisMode): void => {
    setDraft({
      id: mode.id,
      name: mode.name,
      description: mode.description,
      prompt: mode.prompt,
      includeImagesByDefault: mode.includeImagesByDefault,
      sections: mode.sections.map((section) => ({ ...section }))
    })
    setError('')
    setEditorOpen(true)
  }

  const duplicate = (mode: AnalysisMode): void => {
    setDraft({
      name: `${mode.name} 副本`,
      description: mode.description,
      prompt: mode.prompt,
      includeImagesByDefault: mode.includeImagesByDefault,
      sections: mode.sections.map((section) => ({ ...section, id: crypto.randomUUID() }))
    })
    setError('')
    setEditorOpen(true)
  }

  const updateSection = (index: number, patch: Partial<Section>): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section
      )
    }))
  }

  const moveSection = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= draft.sections.length) return
    setDraft((current) => {
      const next = [...current.sections]
      const [section] = next.splice(index, 1)
      next.splice(target, 0, section!)
      return { ...current, sections: next }
    })
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.api.modes.save({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        prompt: draft.prompt,
        includeImagesByDefault: draft.includeImagesByDefault,
        sections: draft.sections
      })
      await refreshMetadata()
      setEditorOpen(false)
      notify('分析模式已保存', 'success')
    } catch (saveError) {
      setError(formatError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!deleteMode) return
    try {
      await window.api.modes.remove(deleteMode.id)
      await refreshMetadata()
      setDeleteMode(null)
      notify('分析模式已删除', 'success')
    } catch (removeError) {
      notify(formatError(removeError), 'error')
    }
  }

  return (
    <div className="content-page">
      <PageHeader
        title="分析模式"
        description="内置模式不可直接修改；可以复制后调整提示词与结构化输出区块。模式配置不会执行脚本。"
        actions={
          <Button onClick={create}>
            <Plus size={16} />
            新建模式
          </Button>
        }
      />
      {modes.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={25} />}
          title="还没有分析模式"
          description="创建模式来定义分析目标与输出区块。"
        />
      ) : (
        <div className="mode-grid">
          {modes.map((mode) => (
            <article className="mode-card" key={mode.id}>
              <div className="mode-card__top">
                <span className="mode-index">{mode.builtIn ? 'BUILT-IN' : 'CUSTOM'}</span>
                <span className="source-tag">{mode.includeImagesByDefault ? '默认含图片' : '默认纯文本'}</span>
              </div>
              <h3>{mode.name}</h3>
              <p>{mode.description || '没有补充说明。'}</p>
              <div className="mode-flow">
                {mode.sections.map((section, index) => (
                  <span key={section.id}>
                    <em>{String(index + 1).padStart(2, '0')}</em>
                    {section.title}
                  </span>
                ))}
              </div>
              <footer>
                {mode.builtIn ? (
                  <Button variant="secondary" size="sm" onClick={() => duplicate(mode)}>
                    <Copy size={14} />
                    复制并编辑
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => edit(mode)}>
                      <Pencil size={14} />
                      编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteMode(mode)}>
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
        title={draft.id ? '编辑分析模式' : '新建分析模式'}
        description="提示词约束分析目标，输出区块决定报告结构；两者都会参与结果校验。"
        width="760px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                saving ||
                !draft.name.trim() ||
                !draft.prompt.trim() ||
                draft.sections.some((section) => !section.title.trim())
              }
              onClick={save}
            >
              {saving ? '保存中…' : '保存模式'}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-grid">
            <Field label="模式名称">
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="模式说明">
              <Input
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>
          </div>
          <Field label="分析提示词" hint="说明分析目标、边界和不允许出现的结论。">
            <Textarea
              rows={5}
              value={draft.prompt}
              onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            />
          </Field>
          <SwitchField
            checked={draft.includeImagesByDefault}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, includeImagesByDefault: checked })
            }
            label="默认包含图片"
            description="即使默认开启，每次分析仍会在预检时单独确认上传。"
          />
          <div className="section-editor">
            <div className="section-editor__header">
              <div>
                <h3>输出区块</h3>
                <p>最多 8 个，顺序决定结果页结构。</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={draft.sections.length >= 8}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    sections: [
                      ...current.sections,
                      {
                        id: crypto.randomUUID(),
                        title: '新区块',
                        type: 'text',
                        instruction: '',
                        required: true
                      }
                    ]
                  }))
                }
              >
                <Plus size={14} />
                添加区块
              </Button>
            </div>
            {draft.sections.map((section, index) => (
              <div className="section-editor__row" key={section.id}>
                <span className="drag-number">{String(index + 1).padStart(2, '0')}</span>
                <Input
                  value={section.title}
                  onChange={(event) => updateSection(index, { title: event.target.value })}
                  placeholder="区块标题"
                />
                <select
                  className="select select--compact"
                  value={section.type}
                  onChange={(event) =>
                    updateSection(index, { type: event.target.value as Section['type'] })
                  }
                >
                  <option value="analysis">分析</option>
                  <option value="recommendations">建议</option>
                  <option value="topics">话题</option>
                  <option value="replies">回复</option>
                  <option value="bullets">列表</option>
                  <option value="text">文本</option>
                </select>
                <Input
                  value={section.instruction}
                  onChange={(event) => updateSection(index, { instruction: event.target.value })}
                  placeholder="区块要求"
                />
                <div className="row-icon-actions">
                  <button
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    aria-label="上移"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => moveSection(index, 1)}
                    disabled={index === draft.sections.length - 1}
                    aria-label="下移"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        sections: current.sections.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                    disabled={draft.sections.length === 1}
                    aria-label="删除区块"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {error ? <div className="inline-error">{error}</div> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteMode)}
        onOpenChange={(open) => {
          if (!open) setDeleteMode(null)
        }}
        title="删除分析模式？"
        description="历史报告保留原模式名称，但之后无法再用该配置发起新分析。"
        confirmText="删除模式"
        danger
        onConfirm={remove}
      />
    </div>
  )
}
