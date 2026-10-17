import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../src/shared/schemas'
import { planChatContext } from '../../src/main/ai/context-planning'

function message(index: number, text: string): ChatMessage {
  return {
    id: `message-${index}`,
    friendId: 'friend-1',
    batchId: 'batch-1',
    seq: index,
    sentAt: null,
    senderName: index % 2 === 0 ? '我' : '对方',
    senderRole: index % 2 === 0 ? 'self' : 'other',
    text,
    messageType: 'text',
    assetIds: []
  }
}

describe('chat context planning', () => {
  it('keeps histories within the configured input budget in one complete request', () => {
    const messages = Array.from({ length: 200 }, (_, index) => message(index, '聊'.repeat(1000)))
    const plan = planChatContext(messages, 350_000)
    expect(plan.direct).toBe(true)
    expect(plan.chunks).toHaveLength(1)
    expect(plan.chunks[0]).toHaveLength(messages.length)
  })

  it('only splits oversized histories and keeps every message once', () => {
    const messages = Array.from({ length: 120 }, (_, index) => message(index, '聊'.repeat(200)))
    const plan = planChatContext(messages, 10_000)
    expect(plan.direct).toBe(false)
    expect(plan.chunks.length).toBeGreaterThan(1)
    expect(plan.chunks.flat()).toEqual(messages)
  })
})
