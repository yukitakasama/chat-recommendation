import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const packagedExecutable = path.join(process.cwd(), 'release', 'win-unpacked', 'ChatInsight.exe')

test('packaged x64 application loads native vault modules', async () => {
  test.skip(!fs.existsSync(packagedExecutable), 'Run bun run dist:dir before packaged smoke test')
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-packaged-'))
  const electronApp = await electron.launch({
    executablePath: packagedExecutable,
    env: {
      ...process.env,
      CHATINSIGHT_APP_ROOT: appRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  try {
    const page = await electronApp.firstWindow()
    const state = await page.evaluate(() => window.api.app.getState())
    expect(state.version).toBe('1.3.0')
    await expect(page.getByRole('heading', { name: '创建加密保险库' })).toBeVisible()
    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill('PackagedTest123')
    await passwordInputs.nth(1).fill('PackagedTest123')
    await page.getByRole('button', { name: '创建保险库' }).click()
    await expect(page.getByRole('heading', { name: '保存恢复码' })).toBeVisible()
    expect(fs.existsSync(path.join(appRoot, 'data', 'vault.db'))).toBe(true)
  } finally {
    await electronApp.close()
    fs.rmSync(appRoot, { recursive: true, force: true })
  }
})
