import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import * as crypto from "crypto"

interface ChunkProgress {
    currentChunk: number
    totalChunks: number
    content: string
}

export class ChunkManager {
    private tempDir: string | undefined
    private chunks: string[] = []
    private chunkFiles: string[] = []
    private sessionId: string
    private combinedContent: string = ""
    private processedLines: number = 0
    private totalFileLines: number = 0
    private isInitialized: boolean = false
    private averageChunkSize: number = 0
    private lastChunkSize: number = 0
    private isFinalChunkReceived: boolean = false

    constructor() {
        this.sessionId = crypto.randomBytes(16).toString('hex')
    }

    async initialize(): Promise<void> {
        this.tempDir = path.join(os.tmpdir(), `cline-chunks-${this.sessionId}`)
        await fs.mkdir(this.tempDir, { recursive: true })
        this.combinedContent = ""
        this.chunks = []
        this.chunkFiles = []
        this.processedLines = 0
        this.totalFileLines = 0
        this.isInitialized = true
        this.averageChunkSize = 0
        this.lastChunkSize = 0
        this.isFinalChunkReceived = false
    }

    async addChunk(content: string): Promise<ChunkProgress> {
        if (!this.tempDir || !this.isInitialized) {
            throw new Error("ChunkManager not initialized")
        }

        // Process INIT/FINAL markers
        let processedContent = content
        const isInit = content.trim().startsWith("INIT")
        const isFinal = content.trim().startsWith("FINAL")

        if (isInit) {
            processedContent = content.replace(/^INIT\s*/, '')
            this.processedLines = 0
            this.totalFileLines = 0
            this.averageChunkSize = 0
            this.lastChunkSize = 0
            this.isFinalChunkReceived = false
        } else if (isFinal) {
            processedContent = content.replace(/^FINAL\s*/, '')
            this.isFinalChunkReceived = true
        }

        // Store chunk and update counts
        this.chunks.push(processedContent)
        this.combinedContent += processedContent

        // Calculate lines in current chunk
        const currentChunkLines = processedContent.split('\n').length
        this.lastChunkSize = currentChunkLines
        this.processedLines += currentChunkLines

        // Update average chunk size and estimates
        if (this.chunks.length === 1) {
            this.averageChunkSize = currentChunkLines
            this.totalFileLines = currentChunkLines * 3 // Initial estimate
        } else {
            this.averageChunkSize = this.processedLines / this.chunks.length
            
            if (!isInit && !isFinal) {
                // Update total lines estimate based on chunk size trend
                const chunkSizeTrend = this.lastChunkSize / this.averageChunkSize
                if (chunkSizeTrend > 0.8) {
                    // Current chunk is close to average size, expect more similar-sized chunks
                    this.totalFileLines = Math.max(
                        this.totalFileLines,
                        Math.ceil(this.processedLines * 1.5)
                    )
                }
            }
        }

        // Write chunk to temp file
        const chunkFileName = path.join(this.tempDir, `chunk-${this.chunks.length}.txt`)
        await fs.writeFile(chunkFileName, processedContent, 'utf8')
        this.chunkFiles.push(chunkFileName)

        // Set exact total on final chunk
        if (isFinal) {
            this.totalFileLines = this.processedLines
        }

        // Calculate progress
        const estimatedTotalChunks = this.isFinalChunkReceived 
            ? this.chunks.length  // We know this is the last chunk
            : Math.max(
                this.chunks.length + 1,  // At least one more chunk
                Math.ceil(this.totalFileLines / this.averageChunkSize)  // Estimate based on average chunk size
            )

        return {
            currentChunk: this.chunks.length,
            totalChunks: estimatedTotalChunks,
            content: this.combinedContent
        }
    }

    async getCombinedContent(): Promise<string> {
        return this.combinedContent
    }

    isProcessing(): boolean {
        return this.isInitialized && this.chunks.length > 0 && !this.isFinalChunkReceived
    }

    async cleanup(): Promise<void> {
        if (this.tempDir) {
            // Delete all chunk files
            for (const file of this.chunkFiles) {
                try {
                    await fs.unlink(file)
                } catch (error) {
                    console.error(`Error deleting chunk file ${file}:`, error)
                }
            }

            // Delete temp directory
            try {
                await fs.rmdir(this.tempDir)
            } catch (error) {
                console.error(`Error deleting temp directory ${this.tempDir}:`, error)
            }

            // Reset state
            this.tempDir = undefined
            this.chunks = []
            this.chunkFiles = []
            this.combinedContent = ""
            this.processedLines = 0
            this.totalFileLines = 0
            this.isInitialized = false
            this.averageChunkSize = 0
            this.lastChunkSize = 0
            this.isFinalChunkReceived = false
        }
    }
}
