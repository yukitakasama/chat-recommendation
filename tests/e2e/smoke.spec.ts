import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

test('first run creates a vault and friend workspace', async () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-e2e-'))
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-fixture-'))
  const chatPath = path.join(fixtureRoot, 'chat.txt')
  const imagePath = path.join(fixtureRoot, 'photo.png')
  const movePath = path.join(fixtureRoot, 'move.txt')
  const secretText = '这句话只应该存在于加密保险库中'
  fs.writeFileSync(
    chatPath,
    `2025-03-01 10:02:03 小林(123456)
${secretText}
2025-03-01 10:03:04 我: 周末有空一起吃饭吗
2025-03-01 10:04:00 小林: [图片] photo.png`,
    'utf8'
  )
  fs.writeFileSync(
    movePath,
    `2025-03-02 09:00:00 小林: 这条记录用于验证移动导入\n2025-03-02 09:01:00 我: 收到`,
    'utf8'
  )
  fs.writeFileSync(
    imagePath,
    await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 51, g: 117, b: 104, alpha: 1 }
      }
    })
      .png()
      .toBuffer()
  )

  let evidenceMessageId = ''
  let evidenceAssetId = ''
  const modelServer = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      expect(body.length).toBeGreaterThan(10)
      if (body.includes('可复用的回复风格档案')) {
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    schemaVersion: 1,
                    name: '本人简短风格',
                    description: '先回应具体内容，保持简短。',
                    language: 'zh-CN',
                    traits: {
                      tone: ['简短', '自然'],
                      sentenceLength: '一到两句',
                      emoji: '偶尔',
                      punctuation: '少用感叹号',
                      formality: '日常口语',
                      humor: '轻微'
                    },
                    rules: ['先回应对方最后一句话'],
                    avoid: ['长篇说教'],
                    examples: [],
                    evidenceMessageIds: [evidenceMessageId]
                  })
                }
              }
            ]
          })
        )
        return
      }
      if (body.includes('聊天图片证据提取器')) {
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    observations: [
                      {
                        assetId: evidenceAssetId,
                        observation: '一张测试图片，聊天气泡中包含可见信息。',
                        confidence: 'medium'
                      }
                    ]
                  })
                }
              }
            ]
          })
        )
        return
      }
      if (body.includes('职场沟通分析顾问')) {
        const workResult = {
          kind: 'work',
          counterpartRead: {
            summary: '对方希望确认周末安排，沟通目标直接。',
            confidence: 'medium',
            evidence: [{ messageId: evidenceMessageId, reason: '对方主动提出具体安排' }],
            uncertainty: ['尚未确认时间范围']
          },
          risks: ['回复过于模糊会让安排继续悬空'],
          objective: {
            summary: '给出一个明确、可调整的时间选项。',
            evidence: [{ messageId: evidenceMessageId, reason: '需要回应具体安排' }]
          },
          actions: ['先确认对方时间', '给出两个可用时段', '保留调整空间'],
          replies: [
            { text: '周六下午可以，你看几点合适？', tone: '明确', risk: 'low', rationale: '直接确认' },
            { text: '我周六下午或周日上午都行。', tone: '配合', risk: 'low', rationale: '给出选项' },
            { text: '你定就好。', tone: '随和', risk: 'medium', rationale: '可能显得信息不足' }
          ],
          warnings: []
        }
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(workResult) } }]
          })
        )
        return
      }
      const result = {
        kind: 'love',
        affection: {
          signal: 'positive',
          summary: '对方持续回应，并主动分享了图片。',
          confidence: 'medium',
          evidence: [
            {
              messageId: evidenceMessageId,
              quote: secretText,
              reason: '对方主动开启并延续对话'
            }
          ],
          uncertainty: ['目前样本只包含一次对话']
        },
        advancement: {
          decision: 'cautious',
          summary: '可以保持自然互动，再观察是否形成双向邀约。',
          reasons: ['对方有回应', '尚未出现明确线下安排'],
          evidence: [{ messageId: evidenceMessageId, reason: '对方持续回复' }]
        },
        topics: [
          { title: '周末安排', opening: '周末你一般喜欢做什么？', reason: '自然延伸', risk: 'low' },
          { title: '分享图片', opening: '那张照片是在哪里拍的？', reason: '承接聊天', risk: 'low' },
          { title: '吃饭', opening: '有机会可以一起试试。', reason: '轻度邀约', risk: 'medium' }
        ],
        replies: [
          { text: '听起来不错，周末我有空。', tone: '自然', risk: 'low', rationale: '平稳回应' },
          { text: '可以呀，你定时间。', tone: '主动', risk: 'medium', rationale: '推进安排' },
          { text: '周三之后会更方便。', tone: '直接', risk: 'low', rationale: '明确时间边界' }
        ],
        warnings: []
      }
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(result) } }]
        })
      )
    })
  })
  await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', resolve))
  const address = modelServer.address()
  if (!address || typeof address === 'string') throw new Error('Mock model server did not start')

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CHATINSIGHT_APP_ROOT: appRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })

  try {
    const page = await electronApp.firstWindow()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await expect(page.getByRole('heading', { name: '创建加密保险库' })).toBeVisible()
    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill('ChatInsight123')
    await passwordInputs.nth(1).fill('ChatInsight123')
    await page.getByRole('button', { name: '创建保险库' }).click()

    await expect(page.getByRole('heading', { name: '保存恢复码' })).toBeVisible()
    const recoveryCode = await page.locator('.recovery-code code').innerText()
    expect(recoveryCode).toMatch(/^CI-/)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '进入聊天洞察' }).click()

    await expect(page.getByText('从一个好友开始')).toBeVisible()
    await page.getByRole('button', { name: '添加好友' }).first().click()
    await page.getByPlaceholder('例如：小林').fill('小林')
    await page.getByRole('button', { name: '创建好友' }).click()

    await expect(page.getByRole('heading', { name: '小林' })).toBeVisible()
    await expect(page.getByText('还没有聊天记录')).toBeVisible()

    const imported = await page.evaluate(
      async ({ filePath, imagePath, root }) => {
        const friends = await window.api.friends.list()
        const friendId = friends[0]!.id
        const preview = await window.api.imports.preview(friendId, [filePath, imagePath])
        const messages = await window.api.imports.commit({
          previewId: preview.id,
          friendId,
          action: 'copy',
          messages: preview.messages
        })
        return {
          friendId,
          preview,
          messages,
          root
        }
      },
      { filePath: chatPath, imagePath, root: appRoot }
    )
    expect(imported.messages.importedMessages).toBe(3)
    expect(imported.messages.importedFiles).toBe(2)
    expect(fs.existsSync(chatPath)).toBe(true)
    expect(fs.existsSync(imagePath)).toBe(true)

    const messages = await page.evaluate(async (friendId) => {
      return window.api.messages.list(friendId)
    }, imported.friendId)
    expect(messages).toHaveLength(3)
    expect(messages.some((message) => message.assetIds.length > 0)).toBe(true)
    evidenceMessageId = messages[0]!.id
    evidenceAssetId = messages.flatMap((message) => message.assetIds)[0]!

    const configured = await page.evaluate(async (baseUrl) => {
      const provider = await window.api.providers.save({
        name: '本地模拟模型',
        protocol: 'chat_completions',
        baseUrl,
        apiKey: 'test-key',
        textModel: 'mock-model',
        visionModel: 'mock-vision',
        isDefault: true
      })
      const [personas, modes] = await Promise.all([
        window.api.personas.list(),
        window.api.modes.list()
      ])
      return {
        provider,
        persona: personas[0]!,
        mode: modes.find((item) => item.name === '恋爱建议')!
      }
    }, `http://127.0.0.1:${address.port}/v1`)

    const imagePreflight = await page.evaluate(
      async ({ friendId, providerId, personaId, modeId }) => {
        return window.api.analysis.preflight({
          friendId,
          modeId,
          personaId,
          providerId,
          styleId: null,
          includeImages: true,
          scope: { from: null, to: null }
        })
      },
      {
        friendId: imported.friendId,
        providerId: configured.provider.id,
        personaId: configured.persona.id,
        modeId: configured.mode.id
      }
    )
    expect(imagePreflight.imageCount).toBe(1)
    expect(imagePreflight.includesImages).toBe(true)

    const generatedStyle = await page.evaluate(
      async ({ friendId, providerId }) => {
        return window.api.styles.generate({
          scope: 'friend',
          friendId,
          providerId,
          name: '测试回复风格'
        })
      },
      { friendId: imported.friendId, providerId: configured.provider.id }
    )
    expect(generatedStyle.sourceKind).toBe('generated_friend')
    expect(generatedStyle.sampleCount).toBe(1)

    const run = await page.evaluate(
      async ({ friendId, providerId, personaId, modeId, styleId }) => {
        const input = {
          friendId,
          modeId,
          personaId,
          providerId,
          styleId,
          includeImages: true,
          scope: { from: null, to: null }
        }
        const preflight = await window.api.analysis.preflight(input)
        const result = await window.api.analysis.start({
          ...input,
          consentToImages: true
        })
        return { preflight, result }
      },
      {
        friendId: imported.friendId,
        providerId: configured.provider.id,
        personaId: configured.persona.id,
        modeId: configured.mode.id,
        styleId: generatedStyle.id
      }
    )
    expect(run.preflight.messageCount).toBe(3)
    expect(run.result.status).toBe('completed')
    expect(run.result.result?.kind).toBe('love')
    if (run.result.result?.kind === 'love') {
      expect(run.result.result.topics).toHaveLength(3)
      expect(run.result.result.replies).toHaveLength(3)
      expect(run.result.result.styleBasis?.styleName).toBe('测试回复风格')
    }

    const workRun = await page.evaluate(
      async ({ friendId, providerId, personaId }) => {
        const modes = await window.api.modes.list()
        const workMode = modes.find((mode) => mode.name === '应付工作')!
        return window.api.analysis.start({
          friendId,
          modeId: workMode.id,
          personaId,
          providerId,
          styleId: null,
          includeImages: false,
          scope: { from: null, to: null },
          consentToImages: false
        })
      },
      {
        friendId: imported.friendId,
        providerId: configured.provider.id,
        personaId: configured.persona.id
      }
    )
    expect(workRun.status).toBe('completed')
    expect(workRun.result?.kind).toBe('work')

    const moved = await page.evaluate(
      async ({ friendId, filePath }) => {
        const preview = await window.api.imports.preview(friendId, [filePath])
        return window.api.imports.commit({
          previewId: preview.id,
          friendId,
          action: 'move',
          messages: preview.messages
        })
      },
      { friendId: imported.friendId, filePath: movePath }
    )
    expect(moved.importedMessages).toBe(2)
    expect(fs.existsSync(movePath)).toBe(false)
    const batches = await page.evaluate(
      async (friendId) => window.api.imports.listBatches(friendId),
      imported.friendId
    )
    expect(batches).toHaveLength(2)

    await page.reload()
    await expect(page.getByText(secretText)).toBeVisible()
    await page.screenshot({
      path: path.join(process.cwd(), 'test-results', 'imported-messages.png'),
      fullPage: true
    })
    await page.getByRole('tab', { name: '导入资料' }).click()
    await expect(page.locator('.batch-row')).toHaveCount(2)
    await page.getByRole('tab', { name: '分析历史' }).click()
    await page.locator('.history-item').filter({ hasText: '恋爱建议' }).click()
    await expect(
      page.getByRole('heading', { name: '小林 的聊天分析' })
    ).toBeVisible()
    await page.screenshot({
      path: path.join(process.cwd(), 'test-results', 'analysis-result.png'),
      fullPage: true
    })

    await page.getByRole('button', { name: '回复风格' }).click()
    await expect(page.getByRole('heading', { name: '回复风格', exact: true })).toBeVisible()
    await expect(page.getByText('测试回复风格')).toBeVisible()
    await page.getByRole('button', { name: '助理人设' }).click()
    await expect(page.getByRole('heading', { name: '助理人设', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '分析模式' }).click()
    await expect(page.getByRole('heading', { name: '分析模式', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '设置' }).click()
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible()
    await expect(page.getByText('本地模拟模型')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1180, 720)
    })
    await expect(page.locator('.sidebar')).toBeVisible()
    expect(pageErrors).toEqual([])

    const chatBatch = batches.find((batch) => batch.sourceLabel.includes('chat.txt'))!
    await page.evaluate(async (batchId) => window.api.imports.removeBatch(batchId), chatBatch.id)
    const remainingMessages = await page.evaluate(
      async (friendId) => window.api.messages.list(friendId),
      imported.friendId
    )
    expect(remainingMessages).toHaveLength(2)

    expect(fs.existsSync(path.join(appRoot, 'data', 'vault.db'))).toBe(true)

    await page.evaluate(() => window.api.vault.lock())
    const dataFiles = fs
      .readdirSync(path.join(appRoot, 'data'), { recursive: true })
      .map(String)
      .filter((file) => {
        const target = path.join(appRoot, 'data', file)
        return fs.existsSync(target) && fs.statSync(target).isFile()
      })
    for (const file of dataFiles) {
      const content = fs.readFileSync(path.join(appRoot, 'data', file))
      expect(content.includes(Buffer.from(secretText, 'utf8'))).toBe(false)
    }
  } finally {
    await electronApp.close()
    await new Promise<void>((resolve) => modelServer.close(() => resolve()))
    fs.rmSync(appRoot, { recursive: true, force: true })
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
