export interface CacheMetrics {
  hits: number
  misses: number
  totalTokensSaved: number
  writeTokens: number
  readTokens: number
  costSaved: number
}

export interface CacheEfficiency {
  hitRate: number
  tokenSavingsRate: number
  costEfficiency: number
}

export class CacheMonitor {
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    totalTokensSaved: 0,
    writeTokens: 0,
    readTokens: 0,
    costSaved: 0
  }

  public trackCacheUsage(
    cacheReadTokens?: number,
    cacheWriteTokens?: number,
    inputTokens: number = 0,
    baseInputPrice: number = 0,
    cacheReadPrice: number = 0
  ): void {
    if (cacheReadTokens && cacheReadTokens > 0) {
      this.metrics.hits++
      this.metrics.readTokens += cacheReadTokens
      
      // Calculate cost savings (difference between base input cost and cache read cost)
      const baseCost = (inputTokens * baseInputPrice) / 1_000_000
      const cacheCost = (cacheReadTokens * cacheReadPrice) / 1_000_000
      this.metrics.costSaved += baseCost - cacheCost
      
      // Track tokens saved through cache hits
      this.metrics.totalTokensSaved += inputTokens - cacheReadTokens
    } else if (cacheWriteTokens && cacheWriteTokens > 0) {
      this.metrics.writeTokens += cacheWriteTokens
      this.metrics.misses++
    }
  }

  public getEfficiencyMetrics(): CacheEfficiency {
    const totalRequests = this.metrics.hits + this.metrics.misses
    const hitRate = totalRequests > 0 ? this.metrics.hits / totalRequests : 0
    
    const totalTokens = this.metrics.readTokens + this.metrics.writeTokens
    const tokenSavingsRate = totalTokens > 0 ? 
      this.metrics.totalTokensSaved / totalTokens : 0
    
    const costEfficiency = this.metrics.writeTokens > 0 ?
      this.metrics.costSaved / this.metrics.writeTokens : 0

    return {
      hitRate,
      tokenSavingsRate,
      costEfficiency
    }
  }

  public getDetailedMetrics(): CacheMetrics {
    return { ...this.metrics }
  }

  public reset(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      totalTokensSaved: 0,
      writeTokens: 0,
      readTokens: 0,
      costSaved: 0
    }
  }
}
