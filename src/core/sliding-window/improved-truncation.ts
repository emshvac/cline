import { Anthropic } from "@anthropic-ai/sdk"

interface MessageRelevance {
  score: number
  index: number
}

export interface TruncationOptions {
  minRetainCount: number        // Minimum number of messages to retain
  maxRetainCount: number        // Maximum number of messages to retain
  recentMessageWeight: number   // Weight for recent messages (0-1)
  contentLengthWeight: number   // Weight for content length (0-1)
  toolUseWeight: number         // Weight for tool use messages (0-1)
}

const defaultOptions: TruncationOptions = {
  minRetainCount: 4,
  maxRetainCount: 20,
  recentMessageWeight: 0.4,
  contentLengthWeight: 0.3,
  toolUseWeight: 0.3
}

export function improvedTruncateConversation(
  messages: Anthropic.Messages.MessageParam[],
  options: Partial<TruncationOptions> = {}
): Anthropic.Messages.MessageParam[] {
  const opts = { ...defaultOptions, ...options }
  
  // Always keep the first task message
  const firstMessage = messages[0]
  const messagesToScore = messages.slice(1)
  
  // Score each message based on multiple factors
  const scoredMessages: MessageRelevance[] = messagesToScore.map((msg, idx) => ({
    score: calculateMessageScore(msg, idx, messagesToScore.length, opts),
    index: idx + 1  // +1 because we sliced off the first message
  }))

  // Sort by score descending
  scoredMessages.sort((a, b) => b.score - a.score)

  // Select top N messages based on score, where N is between min and max retain count
  const retainCount = Math.min(
    Math.max(opts.minRetainCount, Math.floor(messages.length * 0.5)),
    opts.maxRetainCount
  )
  
  const indicesToKeep = scoredMessages
    .slice(0, retainCount)
    .map(m => m.index)
    .sort((a, b) => a - b)  // Sort indices to maintain message order

  // Reconstruct conversation with selected messages
  const truncatedMessages = [firstMessage]
  for (const idx of indicesToKeep) {
    truncatedMessages.push(messages[idx])
  }

  return truncatedMessages
}

function calculateMessageScore(
  message: Anthropic.Messages.MessageParam,
  index: number,
  totalMessages: number,
  options: TruncationOptions
): number {
  let score = 0

  // Recency score (more recent messages get higher scores)
  const recencyScore = (index + 1) / totalMessages
  score += recencyScore * options.recentMessageWeight

  // Content length score (longer messages might be more important)
  const content = Array.isArray(message.content) 
    ? message.content.map(c => c.text).join(' ')
    : message.content
  const lengthScore = Math.min(content.length / 1000, 1)  // Normalize to 0-1
  score += lengthScore * options.contentLengthWeight

  // Tool use score (messages with tool use might be more important)
  const hasToolUse = content.includes('tool_use') || content.includes('tool_result')
  score += (hasToolUse ? 1 : 0) * options.toolUseWeight

  return score
}
