import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { load } from 'cheerio'
import { parse as parseCsv } from 'csv-parse/sync'
import { simpleParser } from 'mailparser'
import type { MessageInput } from '../shared/schemas'

const TEXT_EXTENSIONS = new Set(['.txt', '.log', '.json', '.csv', '.html', '.htm', '.mht', '.mhtml'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'])
const MAX_TEXT_FILE_BYTES = 120 * 1024 * 1024

export interface ParsedConversation {
  messages: MessageInput[]
  warnings: string[]
  extractedFiles: string[]
}

export interface CollectedFiles {
  textFiles: string[]
  imageFiles: string[]
  warnings: string[]
}

function stableId(): string {
  return crypto.randomUUID()
}

function normalizeSender(value: unknown): string {
  return String(value ?? '')
    .replace(/\s*[（(]\d{4,12}[)）]\s*$/, '')
    .replace(/^[<【\[]|[>】\]]$/g, '')
    .trim()
}

function roleForSender(name: string, friendName: string): MessageInput['senderRole'] {
  const cleaned = normalizeSender(name)
  if (!cleaned) return 'unknown'
  if (cleaned === friendName || cleaned.includes(friendName) || friendName.includes(cleaned)) {
    return 'other'
  }
  if (/^(我|本人|自己|me|self)$/i.test(cleaned)) return 'self'
  if (/^(系统|system|QQ系统|群系统)$/i.test(cleaned)) return 'system'
  return 'unknown'
}

function parseTimestamp(raw: string): string | null {
  if (/^\d{10,13}$/.test(raw.trim())) {
    const numeric = Number(raw)
    const date = new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (raw.includes('T')) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  const normalized = raw
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  )
  if (!match) {
    const dateOnly = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!dateOnly) return null
    const date = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      0,
      0,
      0
    )
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0)
  )
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function findMessageArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 3) return null
  if (Array.isArray(value)) {
    return value.some((item) => item && typeof item === 'object') ? value : null
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of ['messages', 'data', 'records', 'items', 'chatRecords', 'list']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  for (const child of Object.values(record)) {
    const found = findMessageArray(child, depth + 1)
    if (found) return found
  }
  return null
}

function extractAssetNames(text: string): string[] {
  const names = new Set<string>()
  const filenamePattern =
    /(?:\[图片\]\s*|图片[:：]\s*|<img[^>]+(?:alt|src)=["'])([^"'\]\s<>]+\.(?:png|jpe?g|webp|gif|bmp))/gi
  for (const match of text.matchAll(filenamePattern)) {
    if (match[1]) names.add(path.basename(match[1]))
  }
  return [...names]
}

function message(
  seq: number,
  sentAt: string | null,
  senderName: string,
  friendName: string,
  text: string
): MessageInput {
  return {
    tempId: stableId(),
    seq,
    sentAt,
    senderName: normalizeSender(senderName) || '未知发送者',
    senderRole: roleForSender(senderName, friendName),
    text,
    messageType: /^(?:\[图片\]|图片|null|undefined)$/i.test(text.trim()) ? 'image' : 'text',
    assetNames: extractAssetNames(text)
  }
}

export function parseTextConversation(text: string, friendName: string): ParsedConversation {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const messages: MessageInput[] = []
  const warnings: string[] = []
  let pending:
    | {
        sentAt: string | null
        sender: string
      }
    | null = null
  let body: string[] = []

  const flush = (): void => {
    if (!pending) return
    const content = body.join('\n').trim()
    if (content) {
      messages.push(message(messages.length, pending.sentAt, pending.sender, friendName, content))
    }
    pending = null
    body = []
  }

  const patterns: Array<{
    regex: RegExp
    dateIndex: number
    senderIndex: number
    contentIndex?: number
  }> = [
    {
      regex:
        /^\s*[\[【](\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}:\d{2}(?::\d{2})?)[\]】]\s*([^:：]{1,120})[:：]\s*(.*)$/,
      dateIndex: 1,
      senderIndex: 2,
      contentIndex: 3
    },
    {
      regex:
        /^\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}:\d{2}(?::\d{2})?)\s+([^:：]{1,120})[:：]\s*(.*)$/,
      dateIndex: 1,
      senderIndex: 2,
      contentIndex: 3
    },
    {
      regex:
        /^\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s*$/,
      dateIndex: 1,
      senderIndex: 2
    }
  ]

  for (const line of lines) {
    let matched = false
    for (const pattern of patterns) {
      const match = line.match(pattern.regex)
      if (!match) continue
      const sentAt = parseTimestamp(match[pattern.dateIndex] ?? '')
      if (!sentAt) continue
      flush()
      pending = {
        sentAt,
        sender: match[pattern.senderIndex] ?? '未知发送者'
      }
      const inlineContent = pattern.contentIndex
        ? match[pattern.contentIndex]?.trim()
        : undefined
      if (inlineContent) {
        body.push(inlineContent)
      }
      matched = true
      break
    }
    if (matched) continue
    if (pending) {
      if (!/^(={3,}|-{3,})$/.test(line.trim())) body.push(line)
    } else if (line.trim()) {
      warnings.push(`未能识别为聊天行的内容已忽略：${line.trim().slice(0, 80)}`)
    }
  }
  flush()

  if (messages.length === 0) {
    warnings.push('没有识别到标准时间戳消息，可检查导出格式或手动整理后重试。')
  }
  return { messages, warnings: warnings.slice(0, 100), extractedFiles: [] }
}

function fmtValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return fmtValue(record.text ?? record.content ?? record.value ?? JSON.stringify(value))
  }
  return String(value)
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] != null && record[key] !== '') return record[key]
  }
  const lower = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]))
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase())
    if (actual && record[actual] != null && record[actual] !== '') return record[actual]
  }
  return undefined
}

function parseStructuredRows(rows: unknown[], friendName: string, sourceName: string): ParsedConversation {
  const messages: MessageInput[] = []
  const warnings: string[] = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const rawTime = pick(record, [
      'sentAt',
      'timestamp',
      'time',
      'msgTime',
      'createTime',
      'date',
      'datetime',
      '发送时间'
    ])
    const rawSender = pick(record, [
      'senderName',
      'sender',
      'nickname',
      'from',
      'user',
      'username',
      '发送者',
      '昵称'
    ])
    const rawText = pick(record, [
      'text',
      'content',
      'message',
      'msg',
      'body',
      '消息',
      '内容'
    ])
    const rawRole = pick(record, ['senderRole', 'role', 'isSelf', 'fromSelf', 'is_self'])
    const text = fmtValue(rawText).trim()
    if (!text && !rawTime && !rawSender) continue
    const sender = normalizeSender(rawSender) || (rawRole === 'self' || rawRole === true ? '我' : friendName)
    let role = roleForSender(sender, friendName)
    if (rawRole === 'self' || rawRole === true || rawRole === 1 || rawRole === '我') role = 'self'
    if (rawRole === 'other' || rawRole === false || rawRole === 0) role = 'other'
    messages.push({
      tempId: stableId(),
      seq: messages.length,
      sentAt: rawTime ? parseTimestamp(String(rawTime)) : null,
      senderName: sender,
      senderRole: role,
      text: text || '[非文本消息]',
      messageType: /^(?:\[图片\]|图片|image)$/i.test(text) ? 'image' : 'text',
      assetNames: extractAssetNames(text)
    })
  }
  if (messages.length === 0) {
    warnings.push(`${sourceName} 未找到可识别的消息字段。`)
  }
  if (messages.some((item) => item.senderRole === 'unknown')) {
    warnings.push('部分发送者无法判断是我还是好友，请在导入预览中纠正。')
  }
  return { messages, warnings, extractedFiles: [] }
}

export function parseJsonConversation(source: string, friendName: string, sourceName: string): ParsedConversation {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    return { messages: [], warnings: [`${sourceName} 不是有效 JSON。`], extractedFiles: [] }
  }
  if (Array.isArray(data)) return parseStructuredRows(data, friendName, sourceName)
  const rows = findMessageArray(data)
  if (rows) return parseStructuredRows(rows, friendName, sourceName)
  return {
    messages: [],
    warnings: [`${sourceName} 的 JSON 结构未知，未找到消息数组。`],
    extractedFiles: []
  }
}

export function parseCsvConversation(source: string, friendName: string, sourceName: string): ParsedConversation {
  try {
    const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
    const delimiter = [',', '\t', ';', '|'].sort(
      (a, b) => firstLine.split(b).length - firstLine.split(a).length
    )[0] ?? ','
    const rows = parseCsv(source, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      delimiter
    }) as unknown[]
    return parseStructuredRows(rows, friendName, sourceName)
  } catch (error) {
    return {
      messages: [],
      warnings: [
        `${sourceName} CSV 解析失败：${error instanceof Error ? error.message : '格式错误'}`
      ],
      extractedFiles: []
    }
  }
}

export function htmlToText(html: string): string {
  const $ = load(html)
  $('script, style, iframe, object, embed, link, meta').remove()
  $('br').replaceWith('\n')
  $('p, div, li, tr, h1, h2, h3, h4, h5, h6').each((_, element) => {
    $(element).append('\n')
  })
  $('img').each((_, element) => {
    const alt = $(element).attr('alt')
    const src = $(element).attr('src')
    if (alt || src) $(element).replaceWith(`\n[图片] ${path.basename(alt || src || '')}\n`)
  })
  return $.root().text().replace(/\n{3,}/g, '\n\n')
}

export function parseHtmlConversation(source: string, friendName: string): ParsedConversation {
  return parseTextConversation(htmlToText(source), friendName)
}

function decodeText(buffer: Buffer): string {
  const detected = chardet.detect(buffer)
  const candidates = [
    detected,
    'UTF-8',
    'GB18030',
    'GBK',
    'UTF-16LE',
    'windows-1252'
  ].filter(Boolean) as string[]
  let best = buffer.toString('utf8')
  let bestScore = Number.POSITIVE_INFINITY
  for (const encoding of [...new Set(candidates)]) {
    try {
      const decoded = iconv.decode(buffer, encoding)
      const score = (decoded.match(/\uFFFD/g) ?? []).length
      if (score < bestScore) {
        best = decoded
        bestScore = score
      }
      if (score === 0) break
    } catch {
      // Try the next compatible encoding.
    }
  }
  return best.replace(/^\uFEFF/, '')
}

async function parseMht(
  buffer: Buffer,
  friendName: string,
  sourceName: string,
  tempDir: string
): Promise<ParsedConversation> {
  try {
    const parsed = await simpleParser(buffer)
    const body = parsed.html || parsed.text || ''
    const conversation = parsed.html
      ? parseHtmlConversation(body.toString(), friendName)
      : parseTextConversation(body.toString(), friendName)
    const extractedFiles: string[] = []
    for (const attachment of parsed.attachments ?? []) {
      const contentType = attachment.contentType || ''
      if (
        !contentType.startsWith('image/') &&
        !/\.(png|jpe?g|webp|gif|bmp)$/i.test(attachment.filename ?? '')
      ) {
        continue
      }
      const safeName = (attachment.filename || `embedded-${stableId()}.png`).replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        '_'
      )
      const target = path.join(tempDir, `${stableId()}-${safeName}`)
      fs.writeFileSync(target, attachment.content)
      extractedFiles.push(target)
    }
    if (extractedFiles.length > 0) {
      conversation.warnings.push(`从 ${sourceName} 提取了 ${extractedFiles.length} 个内嵌图片。`)
    }
    return { ...conversation, extractedFiles }
  } catch (error) {
    return {
      messages: [],
      warnings: [
        `${sourceName} MHT 解析失败：${error instanceof Error ? error.message : '格式错误'}`
      ],
      extractedFiles: []
    }
  }
}

export async function parseChatFile(
  filePath: string,
  friendName: string,
  tempDir: string
): Promise<ParsedConversation> {
  const extension = path.extname(filePath).toLowerCase()
  const stats = fs.statSync(filePath)
  if (stats.size > MAX_TEXT_FILE_BYTES) {
    return {
      messages: [],
      warnings: [`${path.basename(filePath)} 超过 120 MB，已跳过文本解析。`],
      extractedFiles: []
    }
  }
  const buffer = fs.readFileSync(filePath)
  const sourceName = path.basename(filePath)
  if (extension === '.mht' || extension === '.mhtml') {
    return parseMht(buffer, friendName, sourceName, tempDir)
  }
  const text = decodeText(buffer)
  if (extension === '.json') return parseJsonConversation(text, friendName, sourceName)
  if (extension === '.csv') return parseCsvConversation(text, friendName, sourceName)
  if (extension === '.html' || extension === '.htm') {
    return parseHtmlConversation(text, friendName)
  }
  return parseTextConversation(text, friendName)
}

export function collectImportFiles(paths: string[]): CollectedFiles {
  const textFiles: string[] = []
  const imageFiles: string[] = []
  const warnings: string[] = []

  const visit = (target: string): void => {
    const resolved = path.resolve(target)
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(resolved)
    } catch {
      warnings.push(`路径不存在或无法访问：${resolved}`)
      return
    }
    if (stat.isSymbolicLink()) {
      warnings.push(`已跳过符号链接：${resolved}`)
      return
    }
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(resolved)) visit(path.join(resolved, child))
      return
    }
    if (!stat.isFile()) return
    const extension = path.extname(resolved).toLowerCase()
    if (TEXT_EXTENSIONS.has(extension)) textFiles.push(resolved)
    else if (IMAGE_EXTENSIONS.has(extension)) imageFiles.push(resolved)
    else warnings.push(`不支持的文件类型，已跳过：${path.basename(resolved)}`)
  }

  for (const item of paths) visit(item)
  return {
    textFiles: [...new Set(textFiles)].sort(),
    imageFiles: [...new Set(imageFiles)].sort(),
    warnings
  }
}

export function mimeForFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    case '.json':
      return 'application/json'
    case '.csv':
      return 'text/csv'
    case '.html':
    case '.htm':
      return 'text/html'
    case '.mht':
    case '.mhtml':
      return 'multipart/related'
    default:
      return 'text/plain'
  }
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}
