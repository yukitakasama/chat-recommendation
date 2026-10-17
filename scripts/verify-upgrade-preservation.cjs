const { _electron: electron } = require('@playwright/test')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const oldInstaller = path.resolve(
  process.argv[2] || path.join('release', 'ChatInsight-1.3.1-x64.exe')
)
const newInstaller = path.resolve(
  process.argv[3] || path.join('release', 'ChatInsight-1.3.2-x64.exe')
)
const password = 'UpgradePreservation123'
const recoveredPassword = 'UpgradeRecovered456'
const syntheticApiKey = 'upgrade-test-placeholder-key'
const importedMessage = '升级前写入的聊天记录必须在 v1.3.2 中保持不变'

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

async function createVaultData(page, importPath) {
  return page.evaluate(
    async ({ vaultPassword, apiKey, fixturePath }) => {
      const vault = await window.api.vault.create(vaultPassword)
      const friend = await window.api.friends.save({
        displayName: '升级数据验证好友',
        notes: ''
      })
      const preview = await window.api.imports.preview(friend.id, [fixturePath])
      const committed = await window.api.imports.commit({
        previewId: preview.id,
        friendId: friend.id,
        action: 'copy',
        messages: preview.messages
      })
      const provider = await window.api.providers.save({
        name: 'Upgrade preservation check',
        protocol: 'chat_completions',
        baseUrl: 'https://example.invalid/v1',
        apiKey,
        textModel: 'test-model',
        visionModel: '',
        isDefault: true
      })
      const messages = await window.api.messages.list(friend.id)
      return {
        recoveryCode: vault.recoveryCode,
        friendId: friend.id,
        providerId: provider.id,
        importedMessages: committed.importedMessages,
        messageTexts: messages.map((message) => message.text)
      }
    },
    { vaultPassword: password, apiKey: syntheticApiKey, fixturePath: importPath }
  )
}

async function unlockAndReadData(page, friendId, providerId) {
  return page.evaluate(
    async ({ vaultPassword, targetFriendId, targetProviderId }) => {
      await window.api.vault.unlock(vaultPassword)
      const state = await window.api.app.getState()
      const providers = await window.api.providers.list()
      const friends = await window.api.friends.list()
      const messages = await window.api.messages.list(targetFriendId)
      return {
        state,
        provider: providers.find((provider) => provider.id === targetProviderId),
        friend: friends.find((friend) => friend.id === targetFriendId),
        messageCount: messages.length,
        messageTexts: messages.map((message) => message.text)
      }
    },
    { vaultPassword: password, targetFriendId: friendId, targetProviderId: providerId }
  )
}

async function recoverAndReadData(page, recoveryCode, friendId, providerId) {
  return page.evaluate(
    async ({ code, newPassword, targetFriendId, targetProviderId }) => {
      await window.api.vault.recover(code, newPassword)
      const state = await window.api.app.getState()
      const providers = await window.api.providers.list()
      const friends = await window.api.friends.list()
      const messages = await window.api.messages.list(targetFriendId)
      return {
        state,
        provider: providers.find((provider) => provider.id === targetProviderId),
        friend: friends.find((friend) => friend.id === targetFriendId),
        messageCount: messages.length,
        messageTexts: messages.map((message) => message.text)
      }
    },
    {
      code: recoveryCode,
      newPassword: recoveredPassword,
      targetFriendId: friendId,
      targetProviderId: providerId
    }
  )
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-upgrade-test-'))
  const installDir = path.join(tempRoot, 'ChatInsight')
  const importPath = path.join(tempRoot, 'upgrade-import.txt')
  fs.writeFileSync(
    importPath,
    `2026-01-02 10:00:00 升级数据验证好友: ${importedMessage}\n2026-01-02 10:01:00 我: 收到，升级后核对。`,
    'utf8'
  )
  let appHandle
  try {
    install(oldInstaller, installDir)
    const executable = path.join(installDir, 'ChatInsight.exe')
    assert(fs.existsSync(executable), 'Old application executable was not installed')

    appHandle = await openApp(executable)
    const created = await createVaultData(appHandle.page, importPath)
    assert(created.recoveryCode.startsWith('CI-'), 'Recovery code was not created')
    assert(created.importedMessages === 2, 'Initial chat import did not contain two messages')
    assert(
      created.messageTexts.some((message) => message.includes(importedMessage)),
      'Initial chat import did not persist the expected message'
    )
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
    const restored = await unlockAndReadData(appHandle.page, created.friendId, created.providerId)
    assert(restored.state.version === '1.3.2', 'Updated application version is not 1.3.2')
    assert(restored.friend, 'Imported friend was lost during the update')
    assert(restored.messageCount === 2, 'Imported chat messages were lost during the update')
    assert(
      restored.messageTexts.some((message) => message.includes(importedMessage)),
      'Imported chat content changed during the update'
    )
    assert(restored.provider, 'Provider credential record was lost during the update')
    assert(restored.provider.hasApiKey, 'Provider API key was lost during the update')

    await appHandle.electronApp.close()
    appHandle = await openApp(executable)
    const recovered = await recoverAndReadData(
      appHandle.page,
      created.recoveryCode,
      created.friendId,
      created.providerId
    )
    assert(recovered.state.version === '1.3.2', 'Recovered application version is not 1.3.2')
    assert(recovered.friend, 'Recovery code could not access the imported friend')
    assert(recovered.messageCount === 2, 'Recovery code could not access imported messages')
    assert(
      recovered.messageTexts.some((message) => message.includes(importedMessage)),
      'Recovery code produced changed chat data'
    )
    assert(recovered.provider?.hasApiKey, 'Recovery code could not access the saved credential')

    process.stdout.write(
      'Upgrade preservation passed: imported messages, privacy password, recovery code, and API credential retained in v1.3.2.\n'
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
