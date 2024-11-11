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

    constructor() {
        // Create a unique session ID for this chunking operation
        this.sessionId = crypto.randomBytes(16).toString('hex')
    }

    /**
     * Initialize the temp directory for storing chunks
     */
    async initialize(): Promise<void> {
        // Create a unique temp directory for this chunking session
        this.tempDir = path.join(os.tmpdir(), `cline-chunks-${this.sessionId}`)
        await fs.mkdir(this.tempDir, { recursive: true })
        this.combinedContent = ""
        this.chunks = []
        this.chunkFiles = []
    }

    /**
     * Add a new chunk of content
     */
    async addChunk(content: string): Promise<ChunkProgress> {
        if (!this.tempDir) {
            throw new Error("ChunkManager not initialized")
        }

        // Remove any INIT/FINAL markers before processing
        let processedContent = content
        if (content.trim().startsWith("INIT")) {
            processedContent = content.replace(/^INIT\s*/, '')
        } else if (content.trim().startsWith("FINAL")) {
            processedContent = content.replace(/^FINAL\s*/, '')
        }

        // Store chunk in memory
        this.chunks.push(processedContent)
        this.combinedContent += processedContent

        // Write chunk to temp file
        const chunkFileName = path.join(this.tempDir, `chunk-${this.chunks.length}.txt`)
        await fs.writeFile(chunkFileName, processedContent, 'utf8')
        this.chunkFiles.push(chunkFileName)

        // Calculate progress
        const linesInContent = content.split('\n').length
        const estimatedTotalChunks = Math.ceil(linesInContent / 300) // 300 lines per chunk

        return {
            currentChunk: this.chunks.length,
            totalChunks: estimatedTotalChunks,
            content: this.combinedContent
        }
    }

    /**
     * Get the combined content of all chunks
     */
    async getCombinedContent(): Promise<string> {
        return this.combinedContent
    }

    /**
     * Clean up temporary files and directory
     */
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
        }
    }
}
