import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseChatFile } from '../src/main/parsers'

const sourcePath = process.argv[2]
if (!sourcePath) {
  console.error('用法：bun scripts/verify-qq-chat-exporter.ts <QQChatExporter JSON 路径>')
  process.exit(2)
}

const resolvedSource = path.resolve(sourcePath)
if (!fs.existsSync(resolvedSource)) {
  console.error(`文件不存在：${resolvedSource}`)
  process.exit(2)
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-qq-verify-'))
try {
  const parsed = await parseChatFile(
    resolvedSource,
    'QQ好友',
    tempDir,
    [path.dirname(resolvedSource)]
  )
  const referencedFiles = parsed.referencedFiles ?? []
  const stickerFiles = referencedFiles.filter((filePath) =>
    filePath.replace(/\\/g, '/').includes('/sticker-packs/')
  )
  const imageFiles = referencedFiles.filter((filePath) => {
    if (stickerFiles.includes(filePath)) return false
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.suf'].includes(
      path.extname(filePath).toLowerCase()
    )
  })
  const attachmentFiles = referencedFiles.filter(
    (filePath) => !stickerFiles.includes(filePath) && !imageFiles.includes(filePath)
  )
  const roleCounts = parsed.messages.reduce<Record<string, number>>((counts, message) => {
    counts[message.senderRole] = (counts[message.senderRole] ?? 0) + 1
    return counts
  }, {})
  const missingFiles = referencedFiles.filter((filePath) => !fs.existsSync(filePath))
  const referencedBasenames = referencedFiles.map((filePath) => path.basename(filePath))
  const unresolvedAssetReferences = parsed.messages.flatMap((message) =>
    message.assetNames.filter(
      (assetName) =>
        !referencedBasenames.some(
          (basename) => basename === assetName || basename.endsWith(assetName)
        )
    )
  )
  const stats = {
    messages: parsed.messages.length,
    roles: roleCounts,
    referencedFiles: referencedFiles.length,
    imageFiles: imageFiles.length,
    attachmentFiles: attachmentFiles.length,
    stickerFiles: stickerFiles.length,
    messagesWithAssets: parsed.messages.filter((message) => message.assetNames.length > 0).length,
    messagesWithStickerLabels: parsed.messages.filter((message) =>
      message.text.includes('[表情:')
    ).length,
    unresolvedAssetReferences: [...new Set(unresolvedAssetReferences)].length,
    missingFiles: missingFiles.length,
    warnings: parsed.warnings
  }
  console.log(JSON.stringify(stats, null, 2))
  if (
    stats.messages === 0 ||
    stats.missingFiles > 0 ||
    (roleCounts.unknown ?? 0) > 0 ||
    stats.messagesWithAssets === 0
  ) {
    process.exitCode = 1
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
