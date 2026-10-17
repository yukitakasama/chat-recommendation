import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ImportCommitInputSchema, type ImportCommitInput, type ImportPreview } from '../shared/schemas'
import type { ImportCommitResult } from '../shared/ipc'
import { decryptBuffer, encryptBuffer, sha256 } from './crypto'
import {
  collectImportFiles,
  isImagePath,
  mimeForFile,
  parseChatFile
} from './parsers'
import type { DataPaths } from './paths'
import { isPathInside } from './path-utils'
import type { VaultDatabase } from './database'

interface StoredPreview {
  preview: ImportPreview
}

function isScreenshot(filePath: string): boolean {
  return /截图|screenshot|screen[-_ ]?shot/i.test(path.basename(filePath))
}

export class ImportService {
  private previews = new Map<string, StoredPreview>()

  constructor(
    private readonly paths: DataPaths,
    private readonly getDatabase: () => VaultDatabase,
    private readonly getMediaKey: () => Buffer
  ) {}

  async createPreview(friendId: string, sourcePaths: string[]): Promise<ImportPreview> {
    const db = this.getDatabase()
    const friend = db.getFriend(friendId)
    if (!friend) throw new Error('请选择有效好友')
    if (sourcePaths.length === 0) throw new Error('没有选择导入文件')

    const collected = collectImportFiles(sourcePaths)
    const warnings = [...collected.warnings]
    const messages: ImportPreview['messages'] = []
    const extractedFiles: string[] = []

    for (const file of collected.textFiles) {
      const parsed = await parseChatFile(file, friend.displayName, this.paths.tempDir)
      messages.push(...parsed.messages)
      warnings.push(...parsed.warnings.map((item) => `${path.basename(file)}：${item}`))
      extractedFiles.push(...parsed.extractedFiles)
    }

    for (let index = 0; index < messages.length; index += 1) {
      messages[index] = { ...messages[index]!, seq: index }
    }

    const allFiles = [...collected.textFiles, ...collected.imageFiles, ...extractedFiles]
    const seenSourcePaths = new Set<string>()
    const assets: ImportPreview['assets'] = []
    for (const sourcePath of allFiles) {
      const normalized = path.resolve(sourcePath)
      if (seenSourcePaths.has(normalized)) continue
      seenSourcePaths.add(normalized)
      let content: Buffer
      try {
        content = fs.readFileSync(normalized)
      } catch (error) {
        warnings.push(
          `无法读取 ${path.basename(normalized)}：${error instanceof Error ? error.message : '未知错误'}`
        )
        continue
      }
      const image = isImagePath(normalized)
      assets.push({
        tempId: crypto.randomUUID(),
        originalName: path.basename(normalized),
        sourcePath: normalized,
        mime: mimeForFile(normalized),
        size: content.length,
        kind: image ? (isScreenshot(normalized) ? 'screenshot' : 'image') : 'chat_export',
        sha256: sha256(content)
      })
    }

    const preview: ImportPreview = {
      id: crypto.randomUUID(),
      sourceLabel:
        sourcePaths.length === 1
          ? path.basename(sourcePaths[0]!)
          : `${path.basename(sourcePaths[0]!)} 等 ${sourcePaths.length} 项`,
      createdAt: new Date().toISOString(),
      friendId,
      messages,
      assets,
      warnings: [...new Set(warnings)].slice(0, 200),
      stats: {
        textFiles: collected.textFiles.length,
        imageFiles: assets.filter((item) => item.kind === 'image').length,
        screenshotFiles: assets.filter((item) => item.kind === 'screenshot').length,
        parsedMessages: messages.length
      }
    }
    this.previews.set(preview.id, { preview })
    return preview
  }

  updatePreviewMessages(previewId: string, messages: ImportPreview['messages']): void {
    const stored = this.previews.get(previewId)
    if (!stored) throw new Error('导入预览已失效，请重新选择文件')
    stored.preview.messages = messages
    stored.preview.stats.parsedMessages = messages.length
  }

  getPreview(previewId: string): ImportPreview {
    const stored = this.previews.get(previewId)
    if (!stored) throw new Error('导入预览已失效，请重新选择文件')
    return stored.preview
  }

  commit(inputValue: ImportCommitInput): ImportCommitResult {
    const input = ImportCommitInputSchema.parse(inputValue)
    const preview = this.getPreview(input.previewId)
    if (preview.friendId !== input.friendId) throw new Error('导入预览与好友不匹配')
    const db = this.getDatabase()
    if (!db.getFriend(input.friendId)) throw new Error('好友不存在')
    const mediaKey = this.getMediaKey()

    const fileRecords: Array<{
      tempId: string
      blobId: string
      originalName: string
      originalPath: string
      kind: string
      sha256: string
    }> = []
    const failedFiles: ImportCommitResult['failedFiles'] = []
    const writtenBlobPaths: string[] = []
    let deduplicatedFiles = 0

    for (const asset of preview.assets) {
      if (isPathInside(this.paths.dataDir, asset.sourcePath)) {
        failedFiles.push({ path: asset.sourcePath, reason: '不能把应用保险库目录内的文件再次导入' })
        continue
      }
      let content: Buffer
      try {
        content = fs.readFileSync(asset.sourcePath)
      } catch (error) {
        failedFiles.push({
          path: asset.sourcePath,
          reason: `读取失败：${error instanceof Error ? error.message : '未知错误'}`
        })
        continue
      }
      const digest = sha256(content)
      if (asset.sha256 && asset.sha256 !== digest) {
        failedFiles.push({ path: asset.sourcePath, reason: '文件在预览后发生变化，请重新导入' })
        continue
      }
      try {
        const existing = db.getBlobByHash(digest)
        if (existing && fs.existsSync(existing.encryptedPath)) {
          deduplicatedFiles += 1
          fileRecords.push({
            tempId: asset.tempId,
            blobId: existing.id,
            originalName: asset.originalName,
            originalPath: asset.sourcePath,
            kind: asset.kind,
            sha256: digest
          })
          continue
        }
        if (existing) db.deleteBlobRecord(existing.id)
        const blobId = crypto.randomUUID()
        const folder = path.join(this.paths.blobsDir, digest.slice(0, 2))
        fs.mkdirSync(folder, { recursive: true })
        const encryptedPath = path.join(folder, `${blobId}.bin`)
        const encrypted = encryptBuffer(content, mediaKey, digest)
        const tempPath = `${encryptedPath}.tmp`
        fs.writeFileSync(tempPath, encrypted, { mode: 0o600 })
        fs.renameSync(tempPath, encryptedPath)
        writtenBlobPaths.push(encryptedPath)
        const roundTrip = decryptBuffer(
          fs.readFileSync(encryptedPath),
          mediaKey,
          digest
        )
        if (sha256(roundTrip) !== digest) {
          throw new Error('写入后的加密校验失败')
        }
        db.ensureBlob({
          id: blobId,
          sha256: digest,
          encryptedPath,
          mime: asset.mime,
          size: content.length
        })
        fileRecords.push({
          tempId: asset.tempId,
          blobId,
          originalName: asset.originalName,
          originalPath: asset.sourcePath,
          kind: asset.kind,
          sha256: digest
        })
      } catch (error) {
        failedFiles.push({
          path: asset.sourcePath,
          reason: `加密保存失败：${error instanceof Error ? error.message : '未知错误'}`
        })
      }
    }

    try {
      if (fileRecords.length === 0) {
        throw new Error('没有文件成功读取和加密，批次未提交')
      }
      const committed = db.commitImport(
        preview,
        input,
        fileRecords,
        failedFiles.length ? 'partial' : 'completed'
      )
      const movedPaths = new Set(
        fileRecords
          .filter((file) => input.action === 'move')
          .map((file) => file.originalPath)
          .filter((filePath) => !isPathInside(this.paths.dataDir, filePath))
      )

      if (input.action === 'move') {
        for (const sourcePath of movedPaths) {
          try {
            fs.rmSync(sourcePath, { force: false })
          } catch (error) {
            failedFiles.push({
              path: sourcePath,
              reason: `已在应用中保存，但删除源文件失败：${
                error instanceof Error ? error.message : '未知错误'
              }`
            })
          }
        }
      }
      if (failedFiles.length) db.setImportBatchStatus(committed.batchId, 'partial')

      this.cleanupPreview(preview.id)
      return {
        batchId: committed.batchId,
        importedMessages: committed.importedMessages,
        importedFiles: committed.importedFiles,
        deduplicatedFiles,
        failedFiles
      }
    } catch (error) {
      for (const encryptedPath of writtenBlobPaths) {
        try {
          fs.rmSync(encryptedPath, { force: true })
        } catch {
          // The next unlock performs orphan cleanup.
        }
      }
      throw new Error(`导入提交失败，原文件未删除：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  resetForLock(): void {
    for (const { preview } of this.previews.values()) {
      for (const asset of preview.assets) {
        if (isPathInside(this.paths.tempDir, asset.sourcePath)) {
          try {
            fs.rmSync(asset.sourcePath, { force: true })
          } catch {
            // The temp directory is cleared on unlock.
          }
        }
      }
    }
    this.previews.clear()
  }

  private cleanupPreview(previewId: string): void {
    const stored = this.previews.get(previewId)
    if (stored) {
      for (const asset of stored.preview.assets) {
        if (isPathInside(this.paths.tempDir, asset.sourcePath)) {
          try {
            fs.rmSync(asset.sourcePath, { force: true })
          } catch {
            // Temp cleanup is best effort.
          }
        }
      }
    }
    this.previews.delete(previewId)
  }
}
