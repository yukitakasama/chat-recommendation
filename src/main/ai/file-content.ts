import fs from 'node:fs'
import path from 'node:path'
import { simpleParser } from 'mailparser'
import { decryptBuffer } from '../crypto'
import { decodeText, htmlToText } from '../parsers'

const MAX_CHARS_PER_FILE = 20_000
const MAX_TOTAL_CHARS = 60_000
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.log',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.yaml',
  '.yml'
])

export interface FileAssetInput {
  id: string
  originalName: string
  mime: string
  encryptedPath: string
  sha256: string
  size: number
}

export interface FileEvidence {
  assetId: string
  name: string
  text: string
}

export interface FileEvidenceResult {
  files: FileEvidence[]
  warnings: string[]
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    verbosity: 0
  })
  try {
    const result = await parser.getText({
      pageJoiner: '\n',
      includeMarkedContent: false
    })
    return result.text
  } finally {
    await parser.destroy()
  }
}

async function extractMht(buffer: Buffer): Promise<string> {
  const parsed = await simpleParser(buffer)
  if (parsed.html) return htmlToText(parsed.html.toString())
  return parsed.text ?? ''
}

async function extractOne(
  asset: FileAssetInput,
  mediaKey: Buffer
): Promise<{ text: string; warning?: string }> {
  const extension = path.extname(asset.originalName).toLowerCase()
  let buffer: Buffer
  try {
    buffer = decryptBuffer(fs.readFileSync(asset.encryptedPath), mediaKey, asset.sha256)
  } catch (error) {
    return {
      text: '',
      warning: `${asset.originalName} 解密失败：${
        error instanceof Error ? error.message : '未知错误'
      }`
    }
  }

  try {
    if (extension === '.pdf' || asset.mime === 'application/pdf') {
      return { text: await extractPdf(buffer) }
    }
    if (extension === '.mht' || extension === '.mhtml') {
      return { text: await extractMht(buffer) }
    }
    if (extension === '.html' || extension === '.htm') {
      return { text: htmlToText(decodeText(buffer)) }
    }
    if (TEXT_FILE_EXTENSIONS.has(extension) || asset.mime.startsWith('text/')) {
      return { text: decodeText(buffer) }
    }
    return {
      text: '',
      warning: `${asset.originalName} 是 ${asset.mime || '未知类型'}，已保存但暂不能在本地提取正文。`
    }
  } catch (error) {
    return {
      text: '',
      warning: `${asset.originalName} 内容提取失败：${
        error instanceof Error ? error.message : '未知错误'
      }`
    }
  }
}

export async function extractFileEvidence(
  assets: FileAssetInput[],
  mediaKey: Buffer,
  signal?: AbortSignal
): Promise<FileEvidenceResult> {
  const files: FileEvidence[] = []
  const warnings: string[] = []
  let totalChars = 0
  for (const asset of assets) {
    if (signal?.aborted) throw new DOMException('分析已取消', 'AbortError')
    if (totalChars >= MAX_TOTAL_CHARS) {
      warnings.push(`附件文本已达到 ${MAX_TOTAL_CHARS.toLocaleString('zh-CN')} 字符上限。`)
      break
    }
    const extracted = await extractOne(asset, mediaKey)
    if (extracted.warning) warnings.push(extracted.warning)
    const remaining = MAX_TOTAL_CHARS - totalChars
    const text = normalizeExtractedText(extracted.text).slice(
      0,
      Math.min(MAX_CHARS_PER_FILE, remaining)
    )
    if (!text) {
      if (!extracted.warning) {
        warnings.push(`${asset.originalName} 未提取到可读文字，可能是扫描件或空文件。`)
      }
      continue
    }
    totalChars += text.length
    files.push({
      assetId: asset.id,
      name: asset.originalName,
      text
    })
  }
  return { files, warnings }
}
