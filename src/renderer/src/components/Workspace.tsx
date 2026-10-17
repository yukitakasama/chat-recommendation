import { useEffect, useState } from 'react'
import {
  Bot,
  ChevronRight,
  LayoutTemplate,
  Lock,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react'
import { formatError, useAppStore } from '../store'
import { Button, EmptyState, Field, Input, Modal, Textarea } from './ui'
import { FriendDetail } from './FriendDetail'
import { StyleLibrary } from './StyleLibrary'
import { PersonaLibrary } from './PersonaLibrary'
import { ModeLibrary } from './ModeLibrary'
import { SettingsView } from './SettingsView'

type View = 'friends' | 'styles' | 'personas' | 'modes' | 'settings'

const navigation = [
  { id: 'friends' as const, label: '好友与记录', icon: Users },
  { id: 'styles' as const, label: '回复风格', icon: Sparkles },
  { id: 'personas' as const, label: '助理人设', icon: Bot },
  { id: 'modes' as const, label: '分析模式', icon: LayoutTemplate },
  { id: 'settings' as const, label: '设置', icon: Settings }
]

export function Workspace(): React.JSX.Element {
  const [view, setView] = useState<View>('friends')
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [friendName, setFriendName] = useState('')
  const [friendNotes, setFriendNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const friends = useAppStore((state) => state.friends)
  const selectedFriendId = useAppStore((state) => state.selectedFriendId)
  const selectFriend = useAppStore((state) => state.selectFriend)
  const saveFriend = useAppStore((state) => state.saveFriend)
  const loadWorkspace = useAppStore((state) => state.loadWorkspace)
  const setAppState = useAppStore((state) => state.setAppState)
  const appState = useAppStore((state) => state.appState)
  const loading = useAppStore((state) => state.loading)

  useEffect(() => {
    if (friends.length === 0 && !loading) void loadWorkspace()
  }, [friends.length, loadWorkspace, loading])

  const createFriend = async (): Promise<void> => {
    if (!friendName.trim()) return
    setSaving(true)
    setError('')
    try {
      await saveFriend({ displayName: friendName.trim(), notes: friendNotes.trim() })
      setAddFriendOpen(false)
      setFriendName('')
      setFriendNotes('')
    } catch (saveError) {
      setError(formatError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const lock = async (): Promise<void> => {
    await window.api.vault.lock()
    if (appState) setAppState({ ...appState, vaultState: 'locked' })
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar__brand">
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

        <nav className="sidebar__nav">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? 'is-active' : ''}`}
                onClick={() => setView(item.id)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {view === item.id ? <ChevronRight size={14} className="nav-item__arrow" /> : null}
              </button>
            )
          })}
        </nav>

        {view === 'friends' ? (
          <div className="friend-rail">
            <div className="friend-rail__header">
              <span>好友</span>
              <button className="mini-icon-button" onClick={() => setAddFriendOpen(true)} title="添加好友">
                <Plus size={15} />
              </button>
            </div>
            <div className="friend-rail__list">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  className={`friend-rail__item ${selectedFriendId === friend.id ? 'is-active' : ''}`}
                  onClick={() => void selectFriend(friend.id)}
                >
                  <span className="friend-avatar">{friend.displayName.slice(0, 1)}</span>
                  <span>
                    <strong>{friend.displayName}</strong>
                    <small>{friend.messageCount.toLocaleString('zh-CN')} 条消息</small>
                  </span>
                </button>
              ))}
              {friends.length === 0 ? (
                <button className="friend-rail__empty" onClick={() => setAddFriendOpen(true)}>
                  <Plus size={16} />
                  添加第一个好友
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="sidebar__spacer" />
        )}

        <div className="sidebar__footer">
          <div className="vault-status">
            <ShieldCheck size={15} />
            <span>
              <strong>本地保险库</strong>
              <small>已加密 · 已解锁</small>
            </span>
          </div>
          <button className="lock-button" onClick={() => void lock()} title="锁定应用">
            <Lock size={16} />
          </button>
        </div>
      </aside>

      <main className="workspace__main">
        {view === 'friends' ? (
          selectedFriendId ? (
            <FriendDetail />
          ) : (
            <div className="content-page content-page--center">
              <EmptyState
                icon={<Users size={25} />}
                title="从一个好友开始"
                description="添加好友后，导入聊天记录、图片或截图，再选择分析模式。"
                action={
                  <Button onClick={() => setAddFriendOpen(true)}>
                    <Plus size={16} />
                    添加好友
                  </Button>
                }
              />
            </div>
          )
        ) : view === 'styles' ? (
          <StyleLibrary />
        ) : view === 'personas' ? (
          <PersonaLibrary />
        ) : view === 'modes' ? (
          <ModeLibrary />
        ) : (
          <SettingsView />
        )}
      </main>

      <Modal
        open={addFriendOpen}
        onOpenChange={setAddFriendOpen}
        title="添加好友"
        description="好友名称用于识别聊天中的对方发送者，不需要填写 QQ 号。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddFriendOpen(false)}>
              取消
            </Button>
            <Button onClick={createFriend} disabled={saving || !friendName.trim()}>
              {saving ? '创建中…' : '创建好友'}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Field label="好友名称">
            <Input
              value={friendName}
              onChange={(event) => setFriendName(event.target.value)}
              placeholder="例如：小林"
              autoFocus
            />
          </Field>
          <Field label="备注" hint="可选，仅保存在加密保险库中。">
            <Textarea
              value={friendNotes}
              onChange={(event) => setFriendNotes(event.target.value)}
              rows={3}
              placeholder="关系背景、认识方式等"
            />
          </Field>
          {error ? <div className="inline-error">{error}</div> : null}
        </div>
      </Modal>
    </div>
  )
}
