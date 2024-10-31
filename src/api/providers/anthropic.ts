import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"
import { ApiHandler } from "../index"
import { ApiStream } from "../transform/stream"
import { TokenBudgetService } from "../../services/token-budget"
import { CacheMonitor } from "../../services/cache-monitor"
import { improvedTruncateConversation } from "../../core/sliding-window/improved-truncation"

export class AnthropicHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private client: Anthropic
	private tokenBudget: TokenBudgetService
	private cacheMonitor: CacheMonitor

	constructor(options: ApiHandlerOptions) {
		this.options = options
		this.client = new Anthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.anthropicBaseUrl || undefined,
		})
		
		const modelId = this.getModel().id as AnthropicModelId
		this.tokenBudget = new TokenBudgetService(modelId)
		this.cacheMonitor = new CacheMonitor()
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const modelId = this.getModel().id
		const modelInfo = this.getModel().info

		// Check if we need to truncate based on token budget
		if (this.tokenBudget.shouldTruncateHistory()) {
			messages = improvedTruncateConversation(messages)
		}

		let stream: AnthropicStream<Anthropic.Beta.PromptCaching.Messages.RawPromptCachingBetaMessageStreamEvent>
		
		switch (modelId) {
			case "claude-3-5-sonnet-20241022":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307": {
				const userMsgIndices = messages.reduce(
					(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
					[] as number[]
				)
				const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
				const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

				stream = await this.client.beta.promptCaching.messages.create(
					{
						model: modelId,
						max_tokens: modelInfo.maxTokens || 8192,
						temperature: 0,
						system: [{ text: systemPrompt, type: "text", cache_control: { type: "ephemeral" } }],
						messages: messages.map((message, index) => {
							if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
								return {
									...message,
									content:
										typeof message.content === "string"
											? [
													{
														type: "text",
														text: message.content,
														cache_control: { type: "ephemeral" },
													},
											  ]
											: message.content.map((content, contentIndex) =>
													contentIndex === message.content.length - 1
														? { ...content, cache_control: { type: "ephemeral" } }
														: content
											  ),
								}
							}
							return message
						}),
						stream: true,
					},
					(() => {
						switch (modelId) {
							case "claude-3-5-sonnet-20241022":
							case "claude-3-haiku-20240307":
								return {
									headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
								}
							default:
								return undefined
						}
					})()
				)
				break
			}
			default: {
				stream = (await this.client.messages.create({
					model: modelId,
					max_tokens: modelInfo.maxTokens || 8192,
					temperature: 0,
					system: [{ text: systemPrompt, type: "text" }],
					messages,
					stream: true,
				})) as any
				break
			}
		}

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start": {
					const usage = chunk.message.usage
					// Update token budget and cache monitoring
					this.tokenBudget.updateUsage(
						usage.input_tokens || 0,
						usage.output_tokens || 0,
						usage.cache_read_input_tokens,
						usage.cache_creation_input_tokens
					)

					this.cacheMonitor.trackCacheUsage(
						usage.cache_read_input_tokens,
						usage.cache_creation_input_tokens,
						usage.input_tokens,
						modelInfo.inputPrice,
						modelInfo.cacheReadsPrice
					)

					yield {
						type: "usage",
						inputTokens: usage.input_tokens || 0,
						outputTokens: usage.output_tokens || 0,
						cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
						cacheReadTokens: usage.cache_read_input_tokens || undefined,
					}
					break
				}
				case "message_delta":
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}
					break
				case "content_block_start":
					switch (chunk.content_block.type) {
						case "text":
							if (chunk.index > 0) {
								yield {
									type: "text",
									text: "\n",
								}
							}
							yield {
								type: "text",
								text: chunk.content_block.text,
							}
							break
					}
					break
				case "content_block_delta":
					switch (chunk.delta.type) {
						case "text_delta":
							yield {
								type: "text",
								text: chunk.delta.text,
							}
							break
					}
					break
			}
		}
	}

	getModel(): { id: AnthropicModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in anthropicModels) {
			const id = modelId as AnthropicModelId
			return { id, info: anthropicModels[id] }
		}
		return { id: anthropicDefaultModelId, info: anthropicModels[anthropicDefaultModelId] }
	}

	getCacheEfficiency() {
		return this.cacheMonitor.getEfficiencyMetrics()
	}

	getTokenBudget() {
		return this.tokenBudget.getRemainingBudget()
	}
}
