import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface DataPaths {
  root: string
  dataDir: string
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
    dbPath: path.join(dataDir, 'vault.db'),
    manifestPath: path.join(dataDir, 'vault.manifest.json'),
    blobsDir: path.join(dataDir, 'blobs'),
    exportsDir: path.join(dataDir, 'exports'),
    logsDir: path.join(dataDir, 'logs'),
    tempDir: path.join(dataDir, 'temp')
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
