import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Clock3, MessageSquareText, PieChart, Trash2, UploadCloud } from 'lucide-react'
import { formatError, useAppStore } from '../store'
import { MessagesView } from './MessagesView'
import { ImportWizard } from './ImportWizard'
import { AnalysisPanel } from './AnalysisPanel'
import { HistoryPanel } from './HistoryPanel'
import { ConfirmDialog, IconButton } from './ui'

export function FriendDetail(): React.JSX.Element {
  const [tab, setTab] = useState('messages')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const friends = useAppStore((state) => state.friends)
  const selectedFriendId = useAppStore((state) => state.selectedFriendId)
  const removeFriend = useAppStore((state) => state.removeFriend)
  const notify = useAppStore((state) => state.notify)
  const friend = friends.find((item) => item.id === selectedFriendId)

  if (!friend) return <div className="content-page" />

  return (
    <div className="friend-page">
      <header className="friend-hero">
        <div className="friend-hero__identity">
          <span className="friend-avatar friend-avatar--large">{friend.displayName.slice(0, 1)}</span>
          <div>
            <span className="eyebrow">CONVERSATION WORKSPACE</span>
            <h1>{friend.displayName}</h1>
            <p>{friend.notes || '暂无关系备注'}</p>
          </div>
        </div>
        <div className="friend-hero__stats">
          <span>
            <MessageSquareText size={17} />
            <strong>{friend.messageCount.toLocaleString('zh-CN')}</strong>
            条消息
          </span>
          <span>
            <Clock3 size={17} />
            最近更新
            <strong>{formatDate(friend.updatedAt)}</strong>
          </span>
          <IconButton label="删除好友" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={16} />
          </IconButton>
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={setTab} className="friend-tabs">
        <Tabs.List className="tabs-list">
          <Tabs.Trigger value="messages" className="tabs-trigger">
            <MessageSquareText size={16} />
            聊天记录
          </Tabs.Trigger>
          <Tabs.Trigger value="import" className="tabs-trigger">
            <UploadCloud size={16} />
            导入资料
          </Tabs.Trigger>
          <Tabs.Trigger value="analysis" className="tabs-trigger">
            <PieChart size={16} />
            开始分析
          </Tabs.Trigger>
          <Tabs.Trigger value="history" className="tabs-trigger">
            <Clock3 size={16} />
            分析历史
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="messages" className="tab-content">
          <MessagesView />
        </Tabs.Content>
        <Tabs.Content value="import" className="tab-content">
          <ImportWizard onImported={() => setTab('messages')} />
        </Tabs.Content>
        <Tabs.Content value="analysis" className="tab-content">
          <AnalysisPanel onFinished={() => setTab('history')} />
        </Tabs.Content>
        <Tabs.Content value="history" className="tab-content">
          <HistoryPanel />
        </Tabs.Content>
      </Tabs.Root>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`删除好友“${friend.displayName}”？`}
        description="该好友的聊天记录、图片、导入批次和分析历史会从加密保险库永久删除。此操作不能撤销。"
        confirmText="永久删除"
        danger
        onConfirm={async () => {
          try {
            await removeFriend(friend.id)
            notify('好友及其关联数据已删除', 'success')
          } catch (error) {
            notify(formatError(error), 'error')
          }
        }}
      />
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
