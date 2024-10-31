import { AnthropicModelId, ModelInfo, anthropicModels } from "../../shared/api"

export interface TokenBudget {
  availableInputTokens: number
  reservedOutputTokens: number
  totalUsedTokens: number
  cacheTokens: {
    reads: number
    writes: number
  }
}

export interface TokenBudgetOptions {
  maxInputUtilization: number  // e.g., 0.85 to leave 15% buffer
  outputTokenBuffer: number    // minimum tokens to reserve for output
}

export class TokenBudgetService {
  private modelInfo: ModelInfo
  private options: TokenBudgetOptions
  private budget: TokenBudget

  constructor(
    modelId: AnthropicModelId,
    options: TokenBudgetOptions = {
      maxInputUtilization: 0.85,
      outputTokenBuffer: 4096
    }
  ) {
    this.modelInfo = anthropicModels[modelId]
    this.options = options
    this.budget = this.initializeBudget()
  }

  private initializeBudget(): TokenBudget {
    const maxContextTokens = this.modelInfo.contextWindow || 200_000
    const maxInputTokens = Math.floor(maxContextTokens * this.options.maxInputUtilization)
    
    return {
      availableInputTokens: maxInputTokens,
      reservedOutputTokens: this.options.outputTokenBuffer,
      totalUsedTokens: 0,
      cacheTokens: {
        reads: 0,
        writes: 0
      }
    }
  }

  public updateUsage(
    inputTokens: number,
    outputTokens: number,
    cacheReads?: number,
    cacheWrites?: number
  ): void {
    this.budget.totalUsedTokens += inputTokens + outputTokens
    this.budget.availableInputTokens -= inputTokens
    
    if (cacheReads) {
      this.budget.cacheTokens.reads += cacheReads
    }
    if (cacheWrites) {
      this.budget.cacheTokens.writes += cacheWrites
    }
  }

  public canAccommodateTokens(inputTokens: number, estimatedOutputTokens: number): boolean {
    const totalRequired = inputTokens + estimatedOutputTokens + this.budget.reservedOutputTokens
    return totalRequired <= (this.modelInfo.contextWindow || 200_000)
  }

  public getTokenUtilization(): number {
    return this.budget.totalUsedTokens / (this.modelInfo.contextWindow || 200_000)
  }

  public shouldTruncateHistory(): boolean {
    return this.getTokenUtilization() > this.options.maxInputUtilization
  }

  public getRemainingBudget(): TokenBudget {
    return { ...this.budget }
  }

  public estimateCost(): number {
    if (!this.modelInfo.inputPrice || !this.modelInfo.outputPrice) {
      return 0
    }

    const inputCost = (this.budget.totalUsedTokens * this.modelInfo.inputPrice) / 1_000_000
    const cacheCost = this.calculateCacheCost()
    
    return inputCost + cacheCost
  }

  private calculateCacheCost(): number {
    const { cacheReadsPrice, cacheWritesPrice } = this.modelInfo
    if (!cacheReadsPrice || !cacheWritesPrice) {
      return 0
    }

    const readsCost = (this.budget.cacheTokens.reads * cacheReadsPrice) / 1_000_000
    const writesCost = (this.budget.cacheTokens.writes * cacheWritesPrice) / 1_000_000
    
    return readsCost + writesCost
  }
}
