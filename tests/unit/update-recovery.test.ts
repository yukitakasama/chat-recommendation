import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  recoverInterruptedUpdate,
  UPDATE_BACKUP_DIRNAME,
  type DataPaths
} from '../../src/main/paths'

const roots: string[] = []

function createPaths(): DataPaths {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-update-recovery-'))
  roots.push(parent)
  const root = path.join(parent, 'ChatInsight')
  fs.mkdirSync(root, { recursive: true })
  const dataDir = path.join(root, 'data')
  return {
    root,
    dataDir,
    updateBackupDir: path.join(path.dirname(root), UPDATE_BACKUP_DIRNAME),
    dbPath: path.join(dataDir, 'vault.db'),
    manifestPath: path.join(dataDir, 'vault.manifest.json'),
    blobsDir: path.join(dataDir, 'blobs'),
    exportsDir: path.join(dataDir, 'exports'),
    logsDir: path.join(dataDir, 'logs'),
    tempDir: path.join(dataDir, 'temp')
  }
}

afterEach(() => {
  for (const parent of roots.splice(0)) {
    fs.rmSync(parent, { recursive: true, force: true })
  }
})

describe('interrupted update recovery', () => {
  it('does nothing when no update backup exists', () => {
    const paths = createPaths()

    expect(recoverInterruptedUpdate(paths)).toEqual({
      status: 'none',
      backupDir: paths.updateBackupDir
    })
  })

  it('restores the complete encrypted vault backup', () => {
    const paths = createPaths()
    fs.mkdirSync(paths.updateBackupDir, { recursive: true })
    fs.writeFileSync(path.join(paths.updateBackupDir, 'vault.manifest.json'), '{"test":true}\n')
    fs.writeFileSync(path.join(paths.updateBackupDir, 'vault.db'), 'encrypted-database')

    expect(recoverInterruptedUpdate(paths).status).toBe('restored')
    expect(fs.readFileSync(paths.manifestPath, 'utf8')).toContain('"test":true')
    expect(fs.readFileSync(paths.dbPath, 'utf8')).toBe('encrypted-database')
    expect(fs.existsSync(paths.updateBackupDir)).toBe(false)
  })

  it('restores into an empty data directory without deleting backup content', () => {
    const paths = createPaths()
    fs.mkdirSync(paths.dataDir, { recursive: true })
    fs.mkdirSync(paths.updateBackupDir, { recursive: true })
    fs.writeFileSync(path.join(paths.updateBackupDir, 'vault.db'), 'encrypted-database')

    expect(recoverInterruptedUpdate(paths).status).toBe('restored')
    expect(fs.readFileSync(paths.dbPath, 'utf8')).toBe('encrypted-database')
  })

  it('refuses to merge or overwrite when both data locations contain files', () => {
    const paths = createPaths()
    fs.mkdirSync(paths.dataDir, { recursive: true })
    fs.mkdirSync(paths.updateBackupDir, { recursive: true })
    fs.writeFileSync(path.join(paths.dataDir, 'new-state'), 'current')
    fs.writeFileSync(path.join(paths.updateBackupDir, 'vault.db'), 'backup')

    const result = recoverInterruptedUpdate(paths)

    expect(result.status).toBe('conflict')
    expect(fs.readFileSync(path.join(paths.dataDir, 'new-state'), 'utf8')).toBe('current')
    expect(fs.readFileSync(path.join(paths.updateBackupDir, 'vault.db'), 'utf8')).toBe('backup')
  })

  it('refuses to treat a non-directory backup as vault data', () => {
    const paths = createPaths()
    fs.writeFileSync(paths.updateBackupDir, 'not-a-directory')

    expect(recoverInterruptedUpdate(paths).status).toBe('failed')
    expect(fs.readFileSync(paths.updateBackupDir, 'utf8')).toBe('not-a-directory')
  })
})
