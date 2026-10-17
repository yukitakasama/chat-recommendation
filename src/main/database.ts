import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3-multiple-ciphers'
import { BUILT_IN_MODES, DEFAULT_PERSONA } from '../shared/defaults'
import type {
  AnalysisMode,
  AnalysisModeInput,
  AnalysisResult,
  AnalysisRun,
  ChatMessage,
  Friend,
  ImportCommitInput,
  ImportBatch,
  ImportPreview,
  Persona,
  PersonaInput,
  ProviderInput,
  ProviderProfile,
  StyleProfile
} from '../shared/schemas'
import type { FriendInput } from '../../src/shared/ipc'

interface FriendRow {
  id: string
  display_name: string
  notes: string
  created_at: string
  updated_at: string
  message_count: number
}

interface MessageRow {
  id: string
  friend_id: string
  batch_id: string
  seq: number
  sent_at: string | null
  sender_name: string
  sender_role: ChatMessage['senderRole']
  text: string
  message_type: ChatMessage['messageType']
}

interface PersonaRow {
  id: string
  name: string
  tone: string
  analysis_style: string
  boundaries: string
  built_in: number
  created_at: string
  updated_at: string
}

interface ModeRow {
  id: string
  mode_key: string
  name: string
  description: string
  prompt: string
  built_in: number
  sections_json: string
  include_images_default: number
  created_at: string
  updated_at: string
}

interface StyleRow {
  id: string
  name: string
  source_kind: StyleProfile['sourceKind']
  friend_id: string | null
  sample_count: number
  skill_json: string
  evidence_ids_json: string
  created_at: string
}

interface ProviderRow {
  id: string
  name: string
  protocol: ProviderProfile['protocol']
  base_url: string
  api_key: string
  text_model: string
  vision_model: string
  is_default: number
  created_at: string
  updated_at: string
}

interface RunRow {
  id: string
  friend_id: string
  friend_name: string
  mode_id: string
  mode_name: string
  persona_id: string
  persona_name: string
  provider_id: string
  provider_name: string
  style_id: string | null
  status: AnalysisRun['status']
  include_images: number
  request_count: number
  message_count: number
  image_count: number
  result_json: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export class VaultDatabase {
  private db: Database.Database

  constructor(dbPath: string, databaseKeyHex: string) {
    this.db = new Database(dbPath)
    this.db.pragma(`key = "x'${databaseKeyHex}'"`)
    this.db.prepare('SELECT count(*) AS count FROM sqlite_master').get()
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('secure_delete = ON')
    this.db.pragma('busy_timeout = 5000')
    this.initialize()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friends (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blobs (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        encrypted_path TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
        source_label TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
        blob_id TEXT NOT NULL REFERENCES blobs(id),
        original_name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        association_status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
        batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        sent_at TEXT,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        text TEXT NOT NULL,
        message_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_friend_time ON messages(friend_id, sent_at, seq);
      CREATE INDEX IF NOT EXISTS idx_messages_friend_text ON messages(friend_id, text);

      CREATE TABLE IF NOT EXISTS message_assets (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        match_confidence REAL NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        PRIMARY KEY (message_id, asset_id)
      );

      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tone TEXT NOT NULL,
        analysis_style TEXT NOT NULL,
        boundaries TEXT NOT NULL,
        built_in INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS modes (
        id TEXT PRIMARY KEY,
        mode_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        prompt TEXT NOT NULL,
        built_in INTEGER NOT NULL DEFAULT 0,
        sections_json TEXT NOT NULL,
        include_images_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS styles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        friend_id TEXT REFERENCES friends(id) ON DELETE CASCADE,
        sample_count INTEGER NOT NULL DEFAULT 0,
        skill_json TEXT NOT NULL,
        evidence_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS providers (
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

      CREATE TABLE IF NOT EXISTS analysis_runs (
        id TEXT PRIMARY KEY,
        friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
        friend_name TEXT NOT NULL,
        mode_id TEXT NOT NULL,
        mode_name TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        persona_name TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        style_id TEXT,
        status TEXT NOT NULL,
        include_images INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        image_count INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS evidence_refs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        excerpt TEXT,
        created_at TEXT NOT NULL
      );
    `)

    this.db
      .prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
      .run(1, new Date().toISOString())
    this.db
      .prepare(
        `UPDATE analysis_runs
         SET status = 'failed', error = '应用上次退出时分析未完成', completed_at = ?
         WHERE status = 'running'`
      )
      .run(new Date().toISOString())
    this.seedDefaults()
  }

  private seedDefaults(): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT OR IGNORE INTO personas
         (id, name, tone, analysis_style, boundaries, built_in, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        DEFAULT_PERSONA.id,
        DEFAULT_PERSONA.name,
        DEFAULT_PERSONA.tone,
        DEFAULT_PERSONA.analysisStyle,
        DEFAULT_PERSONA.boundaries,
        now,
        now
      )

    const modeStatement = this.db.prepare(
      `INSERT OR IGNORE INTO modes
       (id, mode_key, name, description, prompt, built_in, sections_json,
        include_images_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    )
    for (const mode of BUILT_IN_MODES) {
      modeStatement.run(
        mode.id,
        mode.key,
        mode.name,
        mode.description,
        mode.prompt,
        JSON.stringify(mode.sections),
        mode.includeImagesByDefault ? 1 : 0,
        now,
        now
      )
    }
  }

  close(): void {
    this.db.close()
  }

  checkpoint(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
  }

  listFriends(): Friend[] {
    const rows = this.db
      .prepare(
        `SELECT f.*, count(m.id) AS message_count
         FROM friends f
         LEFT JOIN messages m ON m.friend_id = f.id
         GROUP BY f.id
         ORDER BY f.updated_at DESC`
      )
      .all() as FriendRow[]
    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      notes: row.notes,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  getFriend(id: string): Friend | null {
    const row = this.db
      .prepare(
        `SELECT f.*, count(m.id) AS message_count
         FROM friends f
         LEFT JOIN messages m ON m.friend_id = f.id
         WHERE f.id = ?
         GROUP BY f.id`
      )
      .get(id) as FriendRow | undefined
    return row
      ? {
          id: row.id,
          displayName: row.display_name,
          notes: row.notes,
          messageCount: row.message_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      : null
  }

  saveFriend(input: FriendInput): Friend {
    const now = new Date().toISOString()
    if (input.id) {
      const existing = this.getFriend(input.id)
      if (!existing) throw new Error('好友不存在')
      this.db
        .prepare('UPDATE friends SET display_name = ?, notes = ?, updated_at = ? WHERE id = ?')
        .run(input.displayName.trim(), input.notes?.trim() ?? '', now, input.id)
      return this.getFriend(input.id) as Friend
    }
    const id = crypto.randomUUID()
    this.db
      .prepare(
        'INSERT INTO friends(id, display_name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, input.displayName.trim(), input.notes?.trim() ?? '', now, now)
    return this.getFriend(id) as Friend
  }

  deleteFriend(id: string): string[] {
    const blobIds = (
      this.db.prepare('SELECT DISTINCT blob_id FROM assets WHERE friend_id = ?').all(id) as Array<{
        blob_id: string
      }>
    ).map((row) => row.blob_id)
    this.db.prepare('DELETE FROM friends WHERE id = ?').run(id)
    this.removeOrphanBlobs()
    return blobIds
  }

  listMessages(friendId: string, search = ''): ChatMessage[] {
    const base = `
      SELECT * FROM (
        SELECT m.* FROM messages m
        WHERE m.friend_id = ?
    `
    const rows = (
      search.trim()
        ? this.db
            .prepare(
              `${base}
               AND m.text LIKE ? ESCAPE '\\'
               ORDER BY coalesce(m.sent_at, ''), m.seq DESC
               LIMIT 5000
             ) ORDER BY coalesce(sent_at, ''), seq`
            )
            .all(friendId, `%${search.trim().replace(/[%_\\]/g, '\\$&')}%`)
        : this.db
            .prepare(
              `${base}
               ORDER BY coalesce(m.sent_at, ''), m.seq DESC
               LIMIT 5000
             ) ORDER BY coalesce(sent_at, ''), seq`
            )
            .all(friendId)
    ) as MessageRow[]
    return rows.map((row) => this.mapMessage(row))
  }

  getAllMessages(friendId: string): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE friend_id = ?
         ORDER BY coalesce(sent_at, ''), seq`
      )
      .all(friendId) as MessageRow[]
    return rows.map((row) => this.mapMessage(row))
  }

  getOutgoingMessages(friendId?: string): ChatMessage[] {
    const rows = (
      friendId
        ? this.db
            .prepare(
              `SELECT * FROM messages WHERE friend_id = ? AND sender_role = 'self'
               ORDER BY coalesce(sent_at, ''), seq`
            )
            .all(friendId)
        : this.db
            .prepare(
              `SELECT * FROM messages WHERE sender_role = 'self'
               ORDER BY coalesce(sent_at, ''), seq`
            )
            .all()
    ) as MessageRow[]
    return rows.map((row) => this.mapMessage(row))
  }

  private mapMessage(row: MessageRow): ChatMessage {
    const assetIds = (
      this.db.prepare('SELECT asset_id FROM message_assets WHERE message_id = ?').all(row.id) as Array<{
        asset_id: string
      }>
    ).map((item) => item.asset_id)
    return {
      id: row.id,
      friendId: row.friend_id,
      batchId: row.batch_id,
      seq: row.seq,
      sentAt: row.sent_at,
      senderName: row.sender_name,
      senderRole: row.sender_role,
      text: row.text,
      messageType: row.message_type,
      assetIds
    }
  }

  listPersonas(): Persona[] {
    return (this.db.prepare('SELECT * FROM personas ORDER BY built_in DESC, name').all() as PersonaRow[]).map(
      (row) => ({
        id: row.id,
        name: row.name,
        tone: row.tone,
        analysisStyle: row.analysis_style,
        boundaries: row.boundaries,
        builtIn: Boolean(row.built_in),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })
    )
  }

  savePersona(input: PersonaInput): Persona {
    const now = new Date().toISOString()
    if (input.id) {
      const row = this.db.prepare('SELECT built_in FROM personas WHERE id = ?').get(input.id) as
        | { built_in: number }
        | undefined
      if (!row) throw new Error('人设不存在')
      if (row.built_in) throw new Error('内置人设不能直接修改，请先复制')
      this.db
        .prepare(
          `UPDATE personas SET name = ?, tone = ?, analysis_style = ?, boundaries = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(input.name, input.tone, input.analysisStyle, input.boundaries, now, input.id)
      return this.listPersonas().find((item) => item.id === input.id) as Persona
    }
    const id = crypto.randomUUID()
    this.db
      .prepare(
        `INSERT INTO personas(id, name, tone, analysis_style, boundaries, built_in, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, input.name, input.tone, input.analysisStyle, input.boundaries, now, now)
    return this.listPersonas().find((item) => item.id === id) as Persona
  }

  duplicatePersona(id: string): Persona {
    const source = this.listPersonas().find((item) => item.id === id)
    if (!source) throw new Error('人设不存在')
    return this.savePersona({
      name: `${source.name} 副本`,
      tone: source.tone,
      analysisStyle: source.analysisStyle,
      boundaries: source.boundaries
    })
  }

  deletePersona(id: string): void {
    const row = this.db.prepare('SELECT built_in FROM personas WHERE id = ?').get(id) as
      | { built_in: number }
      | undefined
    if (!row) return
    if (row.built_in) throw new Error('内置人设不能删除')
    this.db.prepare('DELETE FROM personas WHERE id = ?').run(id)
  }

  listModes(): AnalysisMode[] {
    return (this.db.prepare('SELECT * FROM modes ORDER BY built_in DESC, name').all() as ModeRow[]).map(
      (row) => ({
        id: row.id,
        key: row.mode_key,
        name: row.name,
        description: row.description,
        prompt: row.prompt,
        builtIn: Boolean(row.built_in),
        sections: JSON.parse(row.sections_json),
        includeImagesByDefault: Boolean(row.include_images_default),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })
    )
  }

  saveMode(input: AnalysisModeInput): AnalysisMode {
    const now = new Date().toISOString()
    if (input.id) {
      const row = this.db.prepare('SELECT built_in, mode_key FROM modes WHERE id = ?').get(input.id) as
        | { built_in: number; mode_key: string }
        | undefined
      if (!row) throw new Error('分析模式不存在')
      if (row.built_in) throw new Error('内置模式不能直接修改，请先复制')
      this.db
        .prepare(
          `UPDATE modes SET name = ?, description = ?, prompt = ?, sections_json = ?,
           include_images_default = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.name,
          input.description,
          input.prompt,
          JSON.stringify(input.sections),
          input.includeImagesByDefault ? 1 : 0,
          now,
          input.id
        )
      return this.listModes().find((item) => item.id === input.id) as AnalysisMode
    }
    const id = crypto.randomUUID()
    this.db
      .prepare(
        `INSERT INTO modes
         (id, mode_key, name, description, prompt, built_in, sections_json,
          include_images_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        id,
        `custom-${id}`,
        input.name,
        input.description,
        input.prompt,
        JSON.stringify(input.sections),
        input.includeImagesByDefault ? 1 : 0,
        now,
        now
      )
    return this.listModes().find((item) => item.id === id) as AnalysisMode
  }

  duplicateMode(id: string): AnalysisMode {
    const source = this.listModes().find((item) => item.id === id)
    if (!source) throw new Error('分析模式不存在')
    return this.saveMode({
      name: `${source.name} 副本`,
      description: source.description,
      prompt: source.prompt,
      sections: source.sections,
      includeImagesByDefault: source.includeImagesByDefault
    })
  }

  deleteMode(id: string): void {
    const row = this.db.prepare('SELECT built_in FROM modes WHERE id = ?').get(id) as
      | { built_in: number }
      | undefined
    if (!row) return
    if (row.built_in) throw new Error('内置模式不能删除')
    this.db.prepare('DELETE FROM modes WHERE id = ?').run(id)
  }

  listStyles(): StyleProfile[] {
    return (this.db.prepare('SELECT * FROM styles ORDER BY created_at DESC').all() as StyleRow[]).map(
      (row) => ({
        id: row.id,
        name: row.name,
        sourceKind: row.source_kind,
        friendId: row.friend_id,
        sampleCount: row.sample_count,
        skill: JSON.parse(row.skill_json),
        evidenceMessageIds: JSON.parse(row.evidence_ids_json),
        createdAt: row.created_at
      })
    )
  }

  saveStyle(style: Omit<StyleProfile, 'id' | 'createdAt'>): StyleProfile {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO styles
         (id, name, source_kind, friend_id, sample_count, skill_json, evidence_ids_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        style.name,
        style.sourceKind,
        style.friendId,
        style.sampleCount,
        JSON.stringify(style.skill),
        JSON.stringify(style.evidenceMessageIds),
        createdAt
      )
    return { id, createdAt, ...style }
  }

  deleteStyle(id: string): void {
    this.db.prepare('DELETE FROM styles WHERE id = ?').run(id)
  }

  listProviders(): ProviderProfile[] {
    return (this.db.prepare('SELECT * FROM providers ORDER BY is_default DESC, name').all() as ProviderRow[]).map(
      (row) => ({
        id: row.id,
        name: row.name,
        protocol: row.protocol,
        baseUrl: row.base_url,
        textModel: row.text_model,
        visionModel: row.vision_model,
        isDefault: Boolean(row.is_default),
        hasApiKey: Boolean(row.api_key),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })
    )
  }

  getProviderWithSecret(id: string): (ProviderProfile & { apiKey: string }) | null {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
      | ProviderRow
      | undefined
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.base_url,
      textModel: row.text_model,
      visionModel: row.vision_model,
      isDefault: Boolean(row.is_default),
      hasApiKey: Boolean(row.api_key),
      apiKey: row.api_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  saveProvider(input: ProviderInput): ProviderProfile {
    const now = new Date().toISOString()
    const transaction = this.db.transaction(() => {
      if (input.isDefault) {
        this.db.prepare('UPDATE providers SET is_default = 0').run()
      }
      if (input.id) {
        const existing = this.getProviderWithSecret(input.id)
        if (!existing) throw new Error('模型服务不存在')
        this.db
          .prepare(
            `UPDATE providers SET name = ?, protocol = ?, base_url = ?, api_key = ?,
             text_model = ?, vision_model = ?, is_default = ?, updated_at = ? WHERE id = ?`
          )
          .run(
            input.name,
            input.protocol,
            input.baseUrl.replace(/\/+$/, ''),
            input.apiKey?.trim() || existing.apiKey,
            input.textModel,
            input.visionModel,
            input.isDefault ? 1 : 0,
            now,
            input.id
          )
        return input.id
      }
      const id = crypto.randomUUID()
      this.db
        .prepare(
          `INSERT INTO providers
           (id, name, protocol, base_url, api_key, text_model, vision_model,
            is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.name,
          input.protocol,
          input.baseUrl.replace(/\/+$/, ''),
          input.apiKey?.trim() ?? '',
          input.textModel,
          input.visionModel,
          input.isDefault ? 1 : 0,
          now,
          now
        )
      return id
    })
    const id = transaction()
    return this.listProviders().find((item) => item.id === id) as ProviderProfile
  }

  deleteProvider(id: string): void {
    this.db.prepare('DELETE FROM providers WHERE id = ?').run(id)
  }

  createRun(input: {
    friendId: string
    modeId: string
    personaId: string
    providerId: string
    styleId: string | null
    includeImages: boolean
    requestCount: number
    messageCount: number
    imageCount: number
  }): AnalysisRun {
    const friend = this.getFriend(input.friendId)
    const mode = this.listModes().find((item) => item.id === input.modeId)
    const persona = this.listPersonas().find((item) => item.id === input.personaId)
    const provider = this.listProviders().find((item) => item.id === input.providerId)
    if (!friend || !mode || !persona || !provider) throw new Error('分析配置不完整')
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO analysis_runs
         (id, friend_id, friend_name, mode_id, mode_name, persona_id, persona_name,
          provider_id, provider_name, style_id, status, include_images, request_count,
          message_count, image_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        friend.id,
        friend.displayName,
        mode.id,
        mode.name,
        persona.id,
        persona.name,
        provider.id,
        provider.name,
        input.styleId,
        input.includeImages ? 1 : 0,
        input.requestCount,
        input.messageCount,
        input.imageCount,
        createdAt
      )
    return this.getRun(id) as AnalysisRun
  }

  completeRun(id: string, result: AnalysisResult): AnalysisRun {
    this.db
      .prepare(
        `UPDATE analysis_runs SET status = 'completed', result_json = ?, error = NULL, completed_at = ?
         WHERE id = ?`
      )
      .run(JSON.stringify(result), new Date().toISOString(), id)
    return this.getRun(id) as AnalysisRun
  }

  failRun(id: string, error: string, status: 'failed' | 'cancelled' = 'failed'): void {
    this.db
      .prepare(
        `UPDATE analysis_runs SET status = ?, error = ?, completed_at = ? WHERE id = ?`
      )
      .run(status, error.slice(0, 4000), new Date().toISOString(), id)
  }

  updateRunRequestCount(id: string, count: number): void {
    this.db.prepare('UPDATE analysis_runs SET request_count = ? WHERE id = ?').run(count, id)
  }

  listRuns(friendId?: string): AnalysisRun[] {
    const rows = (
      friendId
        ? this.db
            .prepare('SELECT * FROM analysis_runs WHERE friend_id = ? ORDER BY created_at DESC')
            .all(friendId)
        : this.db.prepare('SELECT * FROM analysis_runs ORDER BY created_at DESC').all()
    ) as RunRow[]
    return rows.map((row) => this.mapRun(row))
  }

  getRun(id: string): AnalysisRun | null {
    const row = this.db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(id) as
      | RunRow
      | undefined
    return row ? this.mapRun(row) : null
  }

  deleteRun(id: string): void {
    this.db.prepare('DELETE FROM analysis_runs WHERE id = ?').run(id)
  }

  private mapRun(row: RunRow): AnalysisRun {
    return {
      id: row.id,
      friendId: row.friend_id,
      friendName: row.friend_name,
      modeId: row.mode_id,
      modeName: row.mode_name,
      personaId: row.persona_id,
      personaName: row.persona_name,
      providerId: row.provider_id,
      providerName: row.provider_name,
      styleId: row.style_id,
      status: row.status,
      includeImages: Boolean(row.include_images),
      requestCount: row.request_count,
      messageCount: row.message_count,
      imageCount: row.image_count,
      result: row.result_json ? JSON.parse(row.result_json) : null,
      error: row.error,
      createdAt: row.created_at,
      completedAt: row.completed_at
    }
  }

  listAssets(friendId: string, kind?: 'image' | 'screenshot'): Array<{
    id: string
    blobId: string
    originalName: string
    mime: string
    kind: string
    encryptedPath: string
    sha256: string
  }> {
    const rows = (
      kind
        ? this.db
            .prepare(
              `SELECT min(a.id) AS id, a.blob_id, min(a.original_name) AS original_name,
                      b.mime, a.kind, b.encrypted_path, b.sha256
               FROM assets a JOIN blobs b ON b.id = a.blob_id
               WHERE a.friend_id = ? AND a.kind = ?
               GROUP BY a.blob_id, b.mime, a.kind, b.encrypted_path, b.sha256
               ORDER BY max(a.created_at) DESC`
            )
            .all(friendId, kind)
        : this.db
            .prepare(
              `SELECT min(a.id) AS id, a.blob_id, min(a.original_name) AS original_name,
                      b.mime, a.kind, b.encrypted_path, b.sha256
               FROM assets a JOIN blobs b ON b.id = a.blob_id
               WHERE a.friend_id = ? AND a.kind IN ('image', 'screenshot')
               GROUP BY a.blob_id, b.mime, a.kind, b.encrypted_path, b.sha256
               ORDER BY max(a.created_at) DESC`
            )
            .all(friendId)
    ) as Array<{
      id: string
      blob_id: string
      original_name: string
      mime: string
      kind: string
      encrypted_path: string
      sha256: string
    }>
    return rows.map((row) => ({
      id: row.id,
      blobId: row.blob_id,
      originalName: row.original_name,
      mime: row.mime,
      kind: row.kind,
      encryptedPath: row.encrypted_path,
      sha256: row.sha256
    }))
  }

  commitImport(
    preview: ImportPreview,
    input: ImportCommitInput,
    fileRecords: Array<{
      tempId: string
      blobId: string
      originalName: string
      originalPath: string
      kind: string
      sha256: string
    }>,
    status: 'completed' | 'partial' = 'completed'
  ): { batchId: string; importedMessages: number; importedFiles: number } {
    const batchId = crypto.randomUUID()
    const now = new Date().toISOString()
    const assetIdByTempId = new Map<string, string>()

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO import_batches
           (id, friend_id, source_label, action, status, summary_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          batchId,
          input.friendId,
          preview.sourceLabel,
          input.action,
          status,
          JSON.stringify(preview.stats),
          now
        )

      for (const file of fileRecords) {
        const assetId = crypto.randomUUID()
        assetIdByTempId.set(file.tempId, assetId)
        this.db
          .prepare(
            `INSERT INTO assets
             (id, batch_id, friend_id, blob_id, original_name, original_path, kind,
              association_status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'stored', ?)`
          )
          .run(
            assetId,
            batchId,
            input.friendId,
            file.blobId,
            file.originalName,
            file.originalPath,
            file.kind,
            now
          )
      }

      const messageStatement = this.db.prepare(
        `INSERT INTO messages
         (id, friend_id, batch_id, seq, sent_at, sender_name, sender_role, text,
          message_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const message of input.messages) {
        const messageId = crypto.randomUUID()
        messageStatement.run(
          messageId,
          input.friendId,
          batchId,
          message.seq,
          message.sentAt,
          message.senderName,
          message.senderRole,
          message.text,
          message.messageType,
          now
        )
        for (const assetName of message.assetNames) {
          const asset = this.db
            .prepare(
              `SELECT id FROM assets
               WHERE batch_id = ? AND (original_name = ? OR original_name LIKE ?)
               ORDER BY length(original_name) LIMIT 1`
            )
            .get(batchId, assetName, `%${assetName}`) as { id: string } | undefined
          if (asset) {
            this.db
              .prepare(
                `INSERT OR IGNORE INTO message_assets
                 (message_id, asset_id, match_confidence, source)
                 VALUES (?, ?, 0.9, 'filename')`
              )
              .run(messageId, asset.id)
          }
        }
      }

      this.db
        .prepare('UPDATE friends SET updated_at = ? WHERE id = ?')
        .run(now, input.friendId)
    })
    transaction()
    return {
      batchId,
      importedMessages: input.messages.length,
      importedFiles: fileRecords.length
    }
  }

  setImportBatchStatus(id: string, status: 'completed' | 'partial'): void {
    this.db.prepare('UPDATE import_batches SET status = ? WHERE id = ?').run(status, id)
  }

  listImportBatches(friendId: string): ImportBatch[] {
    const rows = this.db
      .prepare(
        `SELECT b.id, b.friend_id, b.source_label, b.action, b.status, b.created_at,
                (SELECT count(*) FROM messages m WHERE m.batch_id = b.id) AS message_count,
                (SELECT count(*) FROM assets a WHERE a.batch_id = b.id) AS file_count
         FROM import_batches b
         WHERE b.friend_id = ?
         ORDER BY b.created_at DESC`
      )
      .all(friendId) as Array<{
      id: string
      friend_id: string
      source_label: string
      action: 'copy' | 'move'
      status: string
      created_at: string
      message_count: number
      file_count: number
    }>
    return rows.map((row) => ({
      id: row.id,
      friendId: row.friend_id,
      sourceLabel: row.source_label,
      action: row.action,
      status: row.status,
      messageCount: row.message_count,
      fileCount: row.file_count,
      createdAt: row.created_at
    }))
  }

  deleteImportBatch(id: string): void {
    const batch = this.db.prepare('SELECT friend_id FROM import_batches WHERE id = ?').get(id) as
      | { friend_id: string }
      | undefined
    if (!batch) return
    this.db.prepare('DELETE FROM import_batches WHERE id = ?').run(id)
    this.removeOrphanBlobs()
    this.db
      .prepare('UPDATE friends SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), batch.friend_id)
  }

  ensureBlob(input: {
    id: string
    sha256: string
    encryptedPath: string
    mime: string
    size: number
  }): { id: string; created: boolean } {
    const existing = this.db.prepare('SELECT id FROM blobs WHERE sha256 = ?').get(input.sha256) as
      | { id: string }
      | undefined
    if (existing) return { id: existing.id, created: false }
    this.db
      .prepare(
        `INSERT INTO blobs(id, sha256, encrypted_path, mime, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.id, input.sha256, input.encryptedPath, input.mime, input.size, new Date().toISOString())
    return { id: input.id, created: true }
  }

  getBlobByHash(digest: string): { id: string; encryptedPath: string } | null {
    const row = this.db
      .prepare('SELECT id, encrypted_path FROM blobs WHERE sha256 = ?')
      .get(digest) as { id: string; encrypted_path: string } | undefined
    return row ? { id: row.id, encryptedPath: row.encrypted_path } : null
  }

  deleteBlobRecord(id: string): void {
    this.db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
  }

  removeOrphanBlobs(): void {
    this.db.exec(`
      DELETE FROM blobs
      WHERE id NOT IN (SELECT DISTINCT blob_id FROM assets)
    `)
  }

  getBlobPaths(): string[] {
    return (
      this.db.prepare('SELECT encrypted_path FROM blobs').all() as Array<{
        encrypted_path: string
      }>
    ).map((row) => row.encrypted_path)
  }
}

export function removeBlobFiles(paths: string[]): void {
  for (const encryptedPath of paths) {
    try {
      if (fs.existsSync(encryptedPath)) {
        fs.rmSync(encryptedPath, { force: true })
        const parent = path.dirname(encryptedPath)
        if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent)
      }
    } catch {
      // Orphan cleanup can safely be retried on the next launch.
    }
  }
}
