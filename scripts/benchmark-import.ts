import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { ImportService } from '../src/main/import-service'
import type { VaultDatabase } from '../src/main/database'
import type { DataPaths } from '../src/main/paths'

const messageCount = 50_000
const imageCount = 500
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-benchmark-'))
const dataDir = path.join(root, 'data')
const sourceDir = path.join(root, 'sources')
const imageDir = path.join(sourceDir, 'images')
const paths: DataPaths = {
  root,
  dataDir,
  dbPath: path.join(dataDir, 'vault.db'),
  manifestPath: path.join(dataDir, 'vault.manifest.json'),
  blobsDir: path.join(dataDir, 'blobs'),
  exportsDir: path.join(dataDir, 'exports'),
  logsDir: path.join(dataDir, 'logs'),
  tempDir: path.join(dataDir, 'temp')
}

for (const directory of [
  paths.dataDir,
  paths.blobsDir,
  paths.exportsDir,
  paths.logsDir,
  paths.tempDir,
  imageDir
]) {
  fs.mkdirSync(directory, { recursive: true })
}

const chatPath = path.join(sourceDir, 'large-chat.txt')
const lines: string[] = []
for (let index = 0; index < messageCount; index += 1) {
  const sender = index % 2 === 0 ? '小林(123456)' : '我'
  const seconds = String(index % 60).padStart(2, '0')
  lines.push(`2025-03-01 10:00:${seconds} ${sender}`)
  lines.push(`这是第 ${index + 1} 条用于本地导入性能验证的消息`)
}
fs.writeFileSync(chatPath, lines.join('\n'), 'utf8')

const pngPrefix = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=',
  'base64'
)
for (let index = 0; index < imageCount; index += 1) {
  fs.writeFileSync(
    path.join(imageDir, `photo-${String(index).padStart(3, '0')}.png`),
    Buffer.concat([pngPrefix, Buffer.from(String(index))])
  )
}

const fakeDatabase = {
  getFriend: () => ({
    id: 'friend-benchmark',
    displayName: '小林',
    notes: '',
    messageCount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }),
  getBlobByHash: () => null,
  deleteBlobRecord: () => undefined,
  ensureBlob: () => ({ id: crypto.randomUUID(), created: true }),
  commitImport: () => ({
    batchId: crypto.randomUUID(),
    importedMessages: messageCount,
    importedFiles: imageCount + 1
  })
} as unknown as VaultDatabase

const service = new ImportService(
  paths,
  () => fakeDatabase,
  () => crypto.randomBytes(32)
)

const started = performance.now()
try {
  const preview = await service.createPreview('friend-benchmark', [chatPath, imageDir])
  const commitStarted = performance.now()
  const result = service.commit({
    previewId: preview.id,
    friendId: 'friend-benchmark',
    action: 'copy',
    messages: preview.messages
  })
  const ended = performance.now()
  console.log(
    JSON.stringify(
      {
        messages: result.importedMessages,
        files: result.importedFiles,
        parseMs: Math.round(commitStarted - started),
        encryptAndCommitMs: Math.round(ended - commitStarted),
        totalMs: Math.round(ended - started)
      },
      null,
      2
    )
  )
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
