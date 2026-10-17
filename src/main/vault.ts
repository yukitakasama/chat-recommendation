import fs from 'node:fs'
import path from 'node:path'
import { VaultDatabase, removeBlobFiles } from './database'
import {
  createVaultMaterial,
  deriveDatabaseKey,
  deriveMediaKey,
  rewrapPassword,
  unlockWithPassword,
  unlockWithRecoveryCode,
  type VaultManifest
} from './crypto'
import type { DataPaths } from './paths'

type VaultState = 'missing' | 'locked' | 'unlocked'

function atomicWriteJson(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tempPath, filePath)
}

function readManifest(filePath: string): VaultManifest {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as VaultManifest
  if (parsed.formatVersion !== 1 || parsed.kdf?.name !== 'scrypt') {
    throw new Error('保险库版本不受支持')
  }
  return parsed
}

export class VaultService {
  private state: VaultState
  private db: VaultDatabase | null = null
  private masterKey: Buffer | null = null
  private mediaKey: Buffer | null = null

  constructor(private readonly paths: DataPaths) {
    this.state = fs.existsSync(paths.manifestPath) ? 'locked' : 'missing'
  }

  getState(): VaultState {
    return this.state
  }

  get database(): VaultDatabase {
    if (this.state !== 'unlocked' || !this.db) throw new Error('保险库尚未解锁')
    return this.db
  }

  get dataPaths(): DataPaths {
    return this.paths
  }

  getMediaKey(): Buffer {
    if (this.state !== 'unlocked' || !this.mediaKey) throw new Error('保险库尚未解锁')
    return this.mediaKey
  }

  async create(password: string): Promise<{ recoveryCode: string }> {
    if (this.state !== 'missing') throw new Error('保险库已经存在')
    const { manifest, masterKey, recoveryCode } = await createVaultMaterial(password)
    atomicWriteJson(this.paths.manifestPath, manifest)
    this.openDatabase(masterKey)
    return { recoveryCode }
  }

  async unlock(password: string): Promise<void> {
    if (this.state === 'missing') throw new Error('尚未创建保险库')
    if (this.state === 'unlocked') return
    const manifest = readManifest(this.paths.manifestPath)
    const masterKey = await unlockWithPassword(manifest, password)
    this.openDatabase(masterKey)
  }

  async recover(recoveryCode: string, newPassword: string): Promise<void> {
    if (this.state === 'unlocked') throw new Error('请先锁定当前保险库')
    const manifest = readManifest(this.paths.manifestPath)
    const masterKey = await unlockWithRecoveryCode(manifest, recoveryCode)
    const updated = await rewrapPassword(manifest, masterKey, newPassword)
    atomicWriteJson(this.paths.manifestPath, updated)
    this.openDatabase(masterKey)
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (this.state !== 'unlocked' || !this.masterKey) throw new Error('保险库尚未解锁')
    const manifest = readManifest(this.paths.manifestPath)
    const verified = await unlockWithPassword(manifest, currentPassword)
    if (
      !verified.equals(this.masterKey) ||
      !fs.existsSync(this.paths.dbPath)
    ) {
      verified.fill(0)
      throw new Error('当前密码不正确')
    }
    try {
      const updated = await rewrapPassword(manifest, this.masterKey, newPassword)
      atomicWriteJson(this.paths.manifestPath, updated)
    } finally {
      verified.fill(0)
    }
  }

  lock(): void {
    if (this.state !== 'unlocked') return
    try {
      this.db?.checkpoint()
    } finally {
      this.db?.close()
      this.db = null
      this.masterKey?.fill(0)
      this.masterKey = null
      this.mediaKey?.fill(0)
      this.mediaKey = null
      this.state = 'locked'
      for (const name of fs.readdirSync(this.paths.tempDir)) {
        try {
          fs.rmSync(path.join(this.paths.tempDir, name), { recursive: true, force: true })
        } catch {
          // Temporary files contain no long-lived application data.
        }
      }
    }
  }

  private openDatabase(masterKey: Buffer): void {
    const dbKey = deriveDatabaseKey(masterKey)
    const mediaKey = deriveMediaKey(masterKey)
    try {
      fs.mkdirSync(this.paths.tempDir, { recursive: true })
      for (const entry of fs.readdirSync(this.paths.tempDir)) {
        fs.rmSync(path.join(this.paths.tempDir, entry), { recursive: true, force: true })
      }
      const db = new VaultDatabase(this.paths.dbPath, dbKey)
      this.db = db
      this.masterKey = masterKey
      this.mediaKey = mediaKey
      this.state = 'unlocked'
      this.cleanupOrphanBlobs()
    } catch (error) {
      masterKey.fill(0)
      mediaKey.fill(0)
      this.state = 'locked'
      throw new Error(`无法打开加密数据库：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  private cleanupOrphanBlobs(): void {
    if (!this.db) return
    const referenced = new Set(this.db.getBlobPaths())
    for (const folder of fs.readdirSync(this.paths.blobsDir)) {
      const folderPath = path.join(this.paths.blobsDir, folder)
      if (!fs.statSync(folderPath).isDirectory()) continue
      for (const file of fs.readdirSync(folderPath)) {
        const filePath = path.join(folderPath, file)
        if (!referenced.has(filePath)) removeBlobFiles([filePath])
      }
    }
  }
}
