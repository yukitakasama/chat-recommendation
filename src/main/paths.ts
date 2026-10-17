import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export const UPDATE_BACKUP_DIRNAME = 'ChatInsight-data-update-backup'

export interface DataPaths {
  root: string
  dataDir: string
  updateBackupDir: string
  dbPath: string
  manifestPath: string
  blobsDir: string
  exportsDir: string
  logsDir: string
  tempDir: string
}

export function getAppRoot(): string {
  if (process.env.CHATINSIGHT_APP_ROOT) {
    return path.resolve(process.env.CHATINSIGHT_APP_ROOT)
  }
  return app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd()
}

export function getDataPaths(): DataPaths {
  const root = getAppRoot()
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

export type UpdateRecoveryResult =
  | { status: 'none'; backupDir: string }
  | { status: 'restored'; backupDir: string }
  | { status: 'conflict' | 'failed'; backupDir: string; message: string }

function directoryHasEntries(directory: string): boolean {
  try {
    return fs.statSync(directory).isDirectory() && fs.readdirSync(directory).length > 0
  } catch {
    return false
  }
}

export function recoverInterruptedUpdate(paths: DataPaths): UpdateRecoveryResult {
  const { dataDir, updateBackupDir } = paths
  if (!fs.existsSync(updateBackupDir)) {
    return { status: 'none', backupDir: updateBackupDir }
  }

  let backupIsDirectory = false
  try {
    backupIsDirectory = fs.statSync(updateBackupDir).isDirectory()
  } catch {
    // Reported as a failed recovery below.
  }
  if (!backupIsDirectory) {
    return {
      status: 'failed',
      backupDir: updateBackupDir,
      message: '更新备份不是有效目录，应用不会覆盖或删除该路径。'
    }
  }

  if (directoryHasEntries(dataDir)) {
    return {
      status: 'conflict',
      backupDir: updateBackupDir,
      message: `检测到现有数据目录和更新备份同时存在。为避免覆盖保险库，应用已停止启动。\n\n现有数据：${dataDir}\n更新备份：${updateBackupDir}`
    }
  }

  try {
    if (fs.existsSync(dataDir)) {
      fs.rmdirSync(dataDir)
    }
    fs.renameSync(updateBackupDir, dataDir)
    return { status: 'restored', backupDir: updateBackupDir }
  } catch {
    return {
      status: 'failed',
      backupDir: updateBackupDir,
      message: `无法恢复覆盖更新前保留的数据。原备份仍完整保存在：\n${updateBackupDir}\n\n请关闭应用后检查目录权限，再重新启动。`
    }
  }
}

export function ensureDataDirectories(paths: DataPaths): boolean {
  try {
    for (const directory of [
      paths.dataDir,
      paths.blobsDir,
      paths.exportsDir,
      paths.logsDir,
      paths.tempDir
    ]) {
      fs.mkdirSync(directory, { recursive: true })
    }

    const probe = path.join(paths.dataDir, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, 'ok', { flag: 'wx' })
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}
