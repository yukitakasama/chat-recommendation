import { useEffect, useMemo, useState } from 'react'
import { Image as ImageIcon, Search, SlidersHorizontal } from 'lucide-react'
import type { ChatMessage } from '../../../shared/schemas'
import { useAppStore } from '../store'
import { EmptyState, Input, Spinner } from './ui'

export function MessagesView(): React.JSX.Element {
  const messages = useAppStore((state) => state.messages)
  const loading = useAppStore((state) => state.messagesLoading)
  const loadMessages = useAppStore((state) => state.loadMessages)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'self' | 'other' | 'unknown'>('all')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMessages(search)
    }, 320)
    return () => window.clearTimeout(timer)
  }, [loadMessages, search])

  const filtered = useMemo(
    () => (filter === 'all' ? messages : messages.filter((item) => item.senderRole === filter)),
    [filter, messages]
  )
  const visible = filtered.slice(-1500)
  const groups = useMemo(() => groupMessages(visible), [visible])

  return (
    <section className="work-panel">
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索消息内容"
          />
        </div>
        <div className="segmented">
          {[
            ['all', '全部'],
            ['other', '对方'],
            ['self', '我'],
            ['unknown', '未知']
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'is-active' : ''}
              onClick={() => setFilter(value as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="toolbar__count">
          <SlidersHorizontal size={15} />
          {filtered.length.toLocaleString('zh-CN')} 条
        </span>
      </div>

      {loading ? (
        <div className="panel-loading">
          <Spinner label="正在读取加密记录" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<MessagesEmptyIcon />}
          title={search ? '没有匹配的消息' : '还没有聊天记录'}
          description={
            search ? '尝试更短的关键词，或切换发送者筛选。' : '前往“导入资料”添加聊天文件、图片或截图。'
          }
        />
      ) : (
        <>
          {filtered.length > visible.length ? (
            <div className="inline-note">
              为保持界面流畅，当前显示最近 {visible.length.toLocaleString('zh-CN')} 条；分析仍会使用完整范围。
            </div>
          ) : null}
          <div className="message-stream">
            {groups.map((group) => (
              <div key={group.date} className="message-group">
                <div className="message-date">
                  <span>{group.date}</span>
                </div>
                {group.messages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function MessageRow({ message }: { message: ChatMessage }): React.JSX.Element {
  return (
    <article className={`message-row message-row--${message.senderRole}`}>
      <div className="message-avatar">
        {message.senderRole === 'self' ? '我' : message.senderName.slice(0, 1)}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <strong>{message.senderName}</strong>
          <span>{formatTime(message.sentAt)}</span>
          {message.senderRole === 'unknown' ? <em>角色待确认</em> : null}
        </div>
        <p>{message.text}</p>
        {message.assetIds.length ? (
          <span className="attachment-count">
            <ImageIcon size={14} />
            {message.assetIds.length} 个附件
          </span>
        ) : null}
      </div>
    </article>
  )
}

function groupMessages(messages: ChatMessage[]): Array<{ date: string; messages: ChatMessage[] }> {
  const groups = new Map<string, ChatMessage[]>()
  for (const message of messages) {
    const date = message.sentAt ? formatDay(message.sentAt) : '时间未知'
    const list = groups.get(date) ?? []
    list.push(message)
    groups.set(date, list)
  }
  return [...groups.entries()].map(([date, items]) => ({ date, messages: items }))
}

function formatDay(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function formatTime(value: string | null): string {
  if (!value) return '--:--'
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function MessagesEmptyIcon(): React.JSX.Element {
  return (
    <span className="empty-bubbles">
      <span />
      <span />
    </span>
  )
}
