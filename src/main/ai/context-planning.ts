import type { ChatMessage } from '../../shared/schemas'
import { estimateTextTokens } from '../../shared/token-estimate'

const MESSAGE_METADATA_TOKENS = 80
const DIRECT_ANALYSIS_RESERVE_TOKENS = 24_000
const SUMMARY_REQUEST_RESERVE_TOKENS = 32_000

export interface ChatContextPlan {
  direct: boolean
  estimatedChatTokens: number
  chunks: ChatMessage[][]
}

export function estimateChatEvidenceTokens(messages: ChatMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateTextTokens(message.text) + MESSAGE_METADATA_TOKENS,
    0
  )
}

export function planChatContext(messages: ChatMessage[], maxInputTokens: number): ChatContextPlan {
  const estimatedChatTokens = estimateChatEvidenceTokens(messages)
  const directBudget = Math.max(1024, maxInputTokens - DIRECT_ANALYSIS_RESERVE_TOKENS)
  if (estimatedChatTokens <= directBudget) {
    return {
      direct: true,
      estimatedChatTokens,
      chunks: messages.length > 0 ? [messages] : []
    }
  }

  const chunkBudget = Math.max(1024, maxInputTokens - SUMMARY_REQUEST_RESERVE_TOKENS)
  const chunks: ChatMessage[][] = []
  let current: ChatMessage[] = []
  let currentTokens = 0

  for (const message of messages) {
    const messageTokens = estimateTextTokens(message.text) + MESSAGE_METADATA_TOKENS
    if (current.length > 0 && currentTokens + messageTokens > chunkBudget) {
      chunks.push(current)
      current = []
      currentTokens = 0
    }
    current.push(message)
    currentTokens += messageTokens
  }
  if (current.length > 0) chunks.push(current)

  return {
    direct: false,
    estimatedChatTokens,
    chunks
  }
}
