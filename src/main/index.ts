import { app, BrowserWindow, dialog, Menu, powerMonitor, session } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc'
import { getDataPaths, ensureDataDirectories } from './paths'
import { VaultService } from './vault'
import { ImportService } from './import-service'
import { ModelGateway } from './ai/model-gateway'
import { AnalysisService } from './ai/analysis-service'
import { StyleService } from './ai/style-service'

let mainWindow: BrowserWindow | null = null
let vault: VaultService
let imports: ImportService
let analysis: AnalysisService
let styles: StyleService

function broadcastLocked(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app:locked')
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#f2f1ec',
    title: '聊天洞察',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(process.cwd(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      dialog.showErrorBox('不支持的平台', '聊天洞察仅支持 Windows 10 22H2 / Windows 11 x64。')
      app.quit()
      return
    }
    const paths = getDataPaths()
    if (!ensureDataDirectories(paths)) {
      dialog.showErrorBox(
        '无法写入应用目录',
        `聊天洞察需要把加密数据保存在程序同级目录：\n${paths.dataDir}\n\n请把程序移动到可写入的目录后重试。`
      )
      app.quit()
      return
    }
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)

    const gateway = new ModelGateway()
    vault = new VaultService(paths)
    imports = new ImportService(
      paths,
      () => vault.database,
      () => vault.getMediaKey()
    )
    analysis = new AnalysisService(vault, imports, gateway)
    styles = new StyleService(vault, gateway)

    registerIpc({
      vault,
      imports,
      analysis,
      styles,
      gateway,
      paths,
      getWindow: () => mainWindow,
      onLocked: broadcastLocked
    })
    createWindow()

    powerMonitor.on('lock-screen', () => {
      analysis.cancelAll()
      imports.resetForLock()
      vault.lock()
      broadcastLocked()
    })
    powerMonitor.on('suspend', () => {
      analysis.cancelAll()
      imports.resetForLock()
      vault.lock()
      broadcastLocked()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => {
  analysis?.cancelAll()
  imports?.resetForLock()
  vault?.lock()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
