import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { createDirectoriesForFile } from "../../utils/fs"
import { ChunkManager } from "./ChunkManager"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"

interface ChunkProgress {
    currentChunk: number
    totalChunks: number
    content: string
}

export class LargeFileWriter {
    private chunkManager: ChunkManager | undefined
    private originalContent?: string
    private createdDirs: string[] = []
    private documentWasOpen = false
    private relPath?: string
    private isEditing = false
    private diffViewProvider?: DiffViewProvider

    constructor(private cwd: string) {}

    setDiffViewProvider(provider: DiffViewProvider) {
        this.diffViewProvider = provider
    }

    /**
     * Initialize a new large file write operation
     */
    async initializeWrite(relPath: string): Promise<void> {
        if (!this.diffViewProvider) {
            throw new Error("DiffViewProvider not set")
        }

        this.relPath = relPath
        const absolutePath = path.resolve(this.cwd, relPath)
        const fileExists = await this.checkFileExists(relPath)
        
        // Set editType on DiffViewProvider
        this.diffViewProvider.editType = fileExists ? "modify" : "create"

        if (fileExists) {
            this.originalContent = await fs.readFile(absolutePath, "utf-8")
        } else {
            this.originalContent = ""
            // Create directories if needed
            this.createdDirs = await createDirectoriesForFile(path.resolve(this.cwd, relPath))
            // Create empty file
            await fs.writeFile(path.resolve(this.cwd, relPath), "")
        }

        // Track if file was already open
        this.documentWasOpen = vscode.workspace.textDocuments.some(doc => 
            doc.uri.fsPath === path.resolve(this.cwd, relPath)
        )

        // Initialize chunk manager
        this.chunkManager = new ChunkManager()
        await this.chunkManager.initialize()

        this.isEditing = true
    }

    /**
     * Add a chunk of content
     */
    async addChunk(content: string): Promise<ChunkProgress> {
        if (!this.chunkManager) {
            throw new Error("LargeFileWriter not initialized")
        }

        if (!this.diffViewProvider) {
            throw new Error("DiffViewProvider not set")
        }

        // Add the chunk and get progress
        const progress = await this.chunkManager.addChunk(content)

        // Return progress for UI updates
        return progress
    }

    /**
     * Get the current combined content
     */
    async getCurrentContent(): Promise<string> {
        if (!this.chunkManager) {
            throw new Error("LargeFileWriter not initialized")
        }
        return this.chunkManager.getCombinedContent()
    }

    /**
     * Save the final content to the file
     */
    async save(): Promise<void> {
        if (!this.relPath || !this.chunkManager) {
            throw new Error("LargeFileWriter not initialized")
        }

        const absolutePath = path.resolve(this.cwd, this.relPath)
        const finalContent = await this.chunkManager.getCombinedContent()
        await fs.writeFile(absolutePath, finalContent)

        // Clean up after successful save
        await this.cleanup()
    }

    /**
     * Revert changes and cleanup
     */
    async revert(): Promise<void> {
        if (!this.relPath) {
            return
        }

        const absolutePath = path.resolve(this.cwd, this.relPath)
        
        if (this.diffViewProvider?.editType === "create") {
            try {
                await fs.unlink(absolutePath)
                // Remove created directories in reverse order
                for (let i = this.createdDirs.length - 1; i >= 0; i--) {
                    await fs.rmdir(this.createdDirs[i])
                }
            } catch (error) {
                console.error("Error reverting file creation:", error)
            }
        } else if (this.originalContent !== undefined) {
            await fs.writeFile(absolutePath, this.originalContent)
        }

        // Clean up
        await this.cleanup()
    }

    /**
     * Check if a file exists at the given path
     */
    private async checkFileExists(relPath: string): Promise<boolean> {
        try {
            await fs.access(path.resolve(this.cwd, relPath))
            return true
        } catch {
            return false
        }
    }

    /**
     * Clean up resources
     */
    private async cleanup() {
        if (this.chunkManager) {
            await this.chunkManager.cleanup()
            this.chunkManager = undefined
        }
    }

    /**
     * Reset the writer state
     */
    async reset(): Promise<void> {
        this.isEditing = false
        this.originalContent = undefined
        this.createdDirs = []
        this.documentWasOpen = false
        this.relPath = undefined
        await this.cleanup()
    }
}
