const { _electron: electron } = require('@playwright/test')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const oldInstaller = path.resolve(
  process.argv[2] || path.join('release', 'ChatInsight-1.2.0-x64.exe')
)
const newInstaller = path.resolve(
  process.argv[3] || path.join('release', 'ChatInsight-1.3.0-x64.exe')
)
const password = 'UpgradePreservation123'
const syntheticApiKey = 'upgrade-test-placeholder-key'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function install(installer, installDir) {
  assert(fs.existsSync(installer), `Installer not found: ${installer}`)
  const result = spawnSync(
    installer,
    ['/S', '/currentuser', '--no-desktop-shortcut', `/D=${installDir}`],
    { stdio: 'inherit', windowsHide: true }
  )
  assert(result.status === 0, `Installer exited with code ${result.status}: ${installer}`)
}

async function openApp(executablePath) {
  const electronApp = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  return { electronApp, page: await electronApp.firstWindow() }
}

async function createVaultAndCredential(page) {
  return page.evaluate(
    async ({ vaultPassword, apiKey }) => {
      await window.api.vault.create(vaultPassword)
      return window.api.providers.save({
        name: 'Upgrade preservation check',
        protocol: 'chat_completions',
        baseUrl: 'https://example.invalid/v1',
        apiKey,
        textModel: 'test-model',
        visionModel: '',
        isDefault: true
      })
    },
    { vaultPassword: password, apiKey: syntheticApiKey }
  )
}

async function unlockAndReadCredential(page) {
  return page.evaluate(
    async (vaultPassword) => {
      await window.api.vault.unlock(vaultPassword)
      const state = await window.api.app.getState()
      const providers = await window.api.providers.list()
      return { state, providers }
    },
    password
  )
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-upgrade-test-'))
  const installDir = path.join(tempRoot, 'ChatInsight')
  let appHandle
  try {
    install(oldInstaller, installDir)
    const executable = path.join(installDir, 'ChatInsight.exe')
    assert(fs.existsSync(executable), 'Old application executable was not installed')

    appHandle = await openApp(executable)
    const provider = await createVaultAndCredential(appHandle.page)
    await appHandle.electronApp.close()
    appHandle = undefined

    const manifestPath = path.join(installDir, 'data', 'vault.manifest.json')
    const databasePath = path.join(installDir, 'data', 'vault.db')
    assert(fs.existsSync(manifestPath), 'Vault manifest was not created')
    assert(fs.existsSync(databasePath), 'Encrypted database was not created')
    const manifestHash = sha256(manifestPath)
    const databaseSize = fs.statSync(databasePath).size

    install(newInstaller, installDir)

    assert(fs.existsSync(manifestPath), 'Update removed the vault manifest')
    assert(fs.existsSync(databasePath), 'Update removed the encrypted database')
    assert(sha256(manifestPath) === manifestHash, 'Update changed the vault password material')
    assert(fs.statSync(databasePath).size >= databaseSize, 'Update truncated the encrypted database')
    assert(
      !fs.existsSync(path.join(path.dirname(installDir), 'ChatInsight-data-update-backup')),
      'Update backup was not restored'
    )

    appHandle = await openApp(executable)
    const restored = await unlockAndReadCredential(appHandle.page)
    assert(restored.state.version === '1.3.0', 'Updated application version is not 1.3.0')
    const savedProvider = restored.providers.find((item) => item.id === provider.id)
    assert(savedProvider, 'Provider credential record was lost during the update')
    assert(savedProvider.hasApiKey, 'Provider API key was lost during the update')

    process.stdout.write(
      `Upgrade preservation passed: password material retained, provider ${provider.id} retained, version ${restored.state.version}.\n`
    )
  } finally {
    if (appHandle) await appHandle.electronApp.close()
    const uninstallerName = fs.existsSync(installDir)
      ? fs.readdirSync(installDir).find((name) => /^Uninstall.*\.exe$/i.test(name))
      : undefined
    if (uninstallerName) {
      spawnSync(path.join(installDir, uninstallerName), ['/S', '/currentuser', '--delete-app-data'], {
        stdio: 'ignore',
        windowsHide: true
      })
    }
    const resolvedTemp = path.resolve(tempRoot)
    const resolvedBase = path.resolve(os.tmpdir())
    if (resolvedTemp.startsWith(`${resolvedBase}${path.sep}`) && fs.existsSync(resolvedTemp)) {
      let cleanupError
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          fs.rmSync(resolvedTemp, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 })
          cleanupError = undefined
          break
        } catch (error) {
          cleanupError = error
          await delay(500)
        }
      }
      if (cleanupError) {
        process.stderr.write(
          `Warning: upgrade verification passed, but temporary test files could not be removed: ${resolvedTemp}\n`
        )
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
