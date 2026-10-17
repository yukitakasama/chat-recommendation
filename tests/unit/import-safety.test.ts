import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ImportService } from '../../src/main/import-service'
import type { VaultDatabase } from '../../src/main/database'
import type { DataPaths } from '../../src/main/paths'

const roots: string[] = []

function setup(): { root: string; paths: DataPaths } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-import-safety-'))
  roots.push(root)
  const dataDir = path.join(root, 'data')
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
    paths.tempDir
  ]) {
    fs.mkdirSync(directory, { recursive: true })
  }
  return { root, paths }
}

function fakeDatabase(
  mode: 'success' | 'failure'
): VaultDatabase {
  return {
    getFriend: () => ({
      id: 'friend-1',
      displayName: '小林',
      notes: '',
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }),
    getBlobByHash: () => null,
    deleteBlobRecord: () => undefined,
    ensureBlob: () => ({ id: crypto.randomUUID(), created: true }),
    commitImport: () => {
      if (mode === 'failure') throw new Error('forced database failure')
      return {
        batchId: crypto.randomUUID(),
        importedMessages: 1,
        importedFiles: 1
      }
    }
  } as unknown as VaultDatabase
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('move import safety', () => {
  it('keeps the source file when database commit fails', async () => {
    const { root, paths } = setup()
    const source = path.join(root, 'source.txt')
    fs.writeFileSync(source, '2025-03-01 10:00:00 小林: 测试', 'utf8')
    const service = new ImportService(
      paths,
      () => fakeDatabase('failure'),
      () => crypto.randomBytes(32)
    )
    const preview = await service.createPreview('friend-1', [source])
    await expect(
      Promise.resolve().then(() =>
        service.commit({
          previewId: preview.id,
          friendId: 'friend-1',
          action: 'move',
          messages: preview.messages
        })
      )
    ).rejects.toThrow('原文件未删除')
    expect(fs.existsSync(source)).toBe(true)
  })

  it('deletes the source only after a successful commit', async () => {
    const { root, paths } = setup()
    const source = path.join(root, 'source.txt')
    fs.writeFileSync(source, '2025-03-01 10:00:00 小林: 测试', 'utf8')
    const service = new ImportService(
      paths,
      () => fakeDatabase('success'),
      () => crypto.randomBytes(32)
    )
    const preview = await service.createPreview('friend-1', [source])
    const result = service.commit({
      previewId: preview.id,
      friendId: 'friend-1',
      action: 'move',
      messages: preview.messages
    })
    expect(result.importedMessages).toBe(1)
    expect(fs.existsSync(source)).toBe(false)
  })
})
