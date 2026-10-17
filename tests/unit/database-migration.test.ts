import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3-multiple-ciphers'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultDatabase } from '../../src/main/database'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('database migrations', () => {
  it('adds provider token limits with safe defaults to an existing vault', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-migration-'))
    tempDirectories.push(directory)
    const dbPath = path.join(directory, 'vault.db')
    const databaseKeyHex = crypto.randomBytes(32).toString('hex')
    const now = new Date().toISOString()

    const oldDatabase = new Database(dbPath)
    oldDatabase.pragma(`key = "x'${databaseKeyHex}'"`)
    oldDatabase.exec(`
      CREATE TABLE providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        text_model TEXT NOT NULL,
        vision_model TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    oldDatabase
      .prepare(
        `INSERT INTO providers
         (id, name, protocol, base_url, api_key, text_model, vision_model,
          is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        'legacy-provider',
        '旧版服务',
        'responses',
        'https://example.com/v1',
        'placeholder',
        'legacy-model',
        '',
        now,
        now
      )
    oldDatabase.close()

    const vaultDatabase = new VaultDatabase(dbPath, databaseKeyHex)
    try {
      expect(vaultDatabase.listProviders()[0]).toMatchObject({
        id: 'legacy-provider',
        maxInputTokens: 350_000,
        maxOutputTokens: 200_000
      })

      const updated = vaultDatabase.saveProvider({
        id: 'legacy-provider',
        name: '旧版服务',
        protocol: 'responses',
        baseUrl: 'https://example.com/v1',
        textModel: 'legacy-model',
        visionModel: '',
        maxInputTokens: 500_000,
        maxOutputTokens: 300_000,
        isDefault: true
      })
      expect(updated.maxInputTokens).toBe(500_000)
      expect(updated.maxOutputTokens).toBe(300_000)
    } finally {
      vaultDatabase.close()
    }
  })
})
