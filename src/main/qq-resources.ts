import fs from 'node:fs'
import path from 'node:path'
import { isPathInside } from './path-utils'

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.suf'
])

const STICKER_CATALOG_NAMES = new Set(['all_sticker_packs.json', 'favorite_emojis.json'])

export type QQResourceKind = 'image' | 'sticker' | 'file'

export interface QQResourceReference {
  filePath: string | null
  names: string[]
  kind: QQResourceKind
  displayName: string
  label: string
}

interface StickerEntry {
  id: string
  md5: string
  name: string
  packName: string
  filePath: string
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((item) => item?.trim() ?? '').filter(Boolean))]
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function pathHasSegment(filePath: string, segment: string): boolean {
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .some((item) => item.toLowerCase() === segment.toLowerCase())
}

export class QQResourceResolver {
  private readonly sourceDir: string
  private readonly resourceRoots: string[]
  private readonly stickerRoots: string[]
  private readonly warningSet = new Set<string>()
  private readonly referenceSet = new Set<string>()
  private stickerIndex: Map<string, StickerEntry> | null = null
  private fileIndex: Map<string, string[]> | null = null

  constructor(sourceDir: string, additionalRoots: string[] = []) {
    this.sourceDir = path.resolve(sourceDir)
    const roots = [this.sourceDir, ...additionalRoots.map((item) => path.resolve(item))]
    this.resourceRoots = uniqueStrings(
      roots.flatMap((root) => [root, path.join(root, 'resources')])
    ).filter((root) => {
      try {
        return fs.lstatSync(root).isDirectory()
      } catch {
        return false
      }
    })
    this.stickerRoots = uniqueStrings(
      roots.flatMap((root) => [path.join(root, 'sticker-packs'), root])
    ).filter((root) => {
      try {
        return fs.lstatSync(root).isDirectory()
      } catch {
        return false
      }
    })
  }

  get warnings(): string[] {
    return [...this.warningSet]
  }

  get referencedFiles(): string[] {
    return [...this.referenceSet]
  }

  resolveMessageResources(record: Record<string, unknown>): QQResourceReference[] {
    const content = recordValue(record.content)
    if (!content) return []

    const references: QQResourceReference[] = []
    for (const resourceValue of arrayValue(content.resources)) {
      const resource = recordValue(resourceValue)
      if (!resource) continue
      const localPath = stringValue(resource.localPath ?? resource.local_path ?? resource.path)
      const filename = stringValue(resource.filename ?? resource.name)
      const resolved = this.resolveLocalFile(localPath, filename)
      if (!resolved && !filename) {
        this.warn('部分资源缺少 localPath 或 filename，无法读取。')
      }
      const kind: QQResourceKind =
        stringValue(resource.type).toLowerCase() === 'image' ||
        isImagePath(resolved ?? filename)
          ? 'image'
          : 'file'
      const displayName = filename || (resolved ? path.basename(resolved) : '附件')
      if (!resolved) {
        this.warn(`资源文件不存在或位于导出目录之外：${localPath || filename}`)
        if (filename) {
          references.push({
            filePath: null,
            names: [],
            kind,
            displayName,
            label: kind === 'image' ? '[图片]' : `[附件: ${displayName}]`
          })
        }
        continue
      }
      this.referenceSet.add(resolved)
      references.push({
        filePath: resolved,
        names: uniqueStrings([filename, path.basename(resolved)]),
        kind,
        displayName,
        label: kind === 'image' ? '[图片]' : `[附件: ${displayName}]`
      })
    }

    for (const elementValue of arrayValue(content.elements)) {
      const element = recordValue(elementValue)
      if (!element || stringValue(element.type) !== 'market_face') continue
      const data = recordValue(element.data)
      if (!data) continue
      const emojiId = stringValue(data.emojiId ?? data.id ?? data.key)
      const sticker = emojiId ? this.getStickerIndex().get(emojiId) : undefined
      const displayName =
        sticker?.name || stringValue(data.name) || stringValue(data.tabName) || '表情包'
      if (!sticker) {
        this.warn(`表情包“${displayName}”没有找到本地贴纸文件。`)
        references.push({
          filePath: null,
          names: [],
          kind: 'sticker',
          displayName,
          label: `[表情: ${displayName}]`
        })
        continue
      }
      this.referenceSet.add(sticker.filePath)
      references.push({
        filePath: sticker.filePath,
        names: uniqueStrings([path.basename(sticker.filePath)]),
        kind: 'sticker',
        displayName,
        label: `[表情: ${displayName}]`
      })
    }

    const deduplicated = new Map<string, QQResourceReference>()
    for (const reference of references) {
      const key = `${reference.kind}:${reference.filePath ?? reference.displayName}`
      if (!deduplicated.has(key)) deduplicated.set(key, reference)
    }
    return [...deduplicated.values()]
  }

  private resolveLocalFile(localPath: string, filename: string): string | null {
    const normalized = localPath.trim().replace(/\\/g, path.sep)
    if (normalized) {
      if (path.isAbsolute(normalized) || /^[A-Za-z]:[\\/]/.test(normalized)) {
        const absolute = path.resolve(normalized)
        if (
          this.resourceRoots.some((root) => isPathInside(root, absolute)) &&
          this.isRegularFile(absolute)
        ) {
          return absolute
        }
        return null
      }
      for (const root of this.resourceRoots) {
        const candidate = path.resolve(root, normalized)
        if (!isPathInside(root, candidate)) continue
        if (this.isRegularFile(candidate)) return candidate
      }
    }

    const basename = path.basename(filename || normalized)
    if (!basename) return null
    const matches = this.getFileIndex().get(basename.toLowerCase()) ?? []
    if (matches.length === 1) return matches[0] ?? null
    if (matches.length > 1) {
      this.warn(`资源文件名“${basename}”存在多个候选，已跳过以避免错误关联。`)
    }
    return null
  }

  private isRegularFile(filePath: string): boolean {
    try {
      return fs.lstatSync(filePath).isFile()
    } catch {
      return false
    }
  }

  private getFileIndex(): Map<string, string[]> {
    if (this.fileIndex) return this.fileIndex
    const index = new Map<string, string[]>()
    for (const root of this.resourceRoots) {
      for (const filePath of this.walkFiles(root)) {
        const key = path.basename(filePath).toLowerCase()
        const values = index.get(key) ?? []
        values.push(filePath)
        index.set(key, values)
      }
    }
    this.fileIndex = index
    return index
  }

  private getStickerIndex(): Map<string, StickerEntry> {
    if (this.stickerIndex) return this.stickerIndex
    const index = new Map<string, StickerEntry>()
    for (const root of this.stickerRoots) {
      for (const catalogPath of this.walkFiles(root, STICKER_CATALOG_NAMES)) {
        try {
          const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as unknown
          const catalogRecord = recordValue(catalog)
          if (!catalogRecord) continue
          const catalogDir = path.dirname(catalogPath)
          const packRows = Array.isArray(catalogRecord.packs)
            ? catalogRecord.packs
            : Array.isArray(catalogRecord.stickers)
              ? [{ packName: '收藏的表情', stickers: catalogRecord.stickers }]
              : []
          for (const packValue of packRows) {
            const pack = recordValue(packValue)
            if (!pack) continue
            const packName = stringValue(pack.packName)
            for (const stickerValue of arrayValue(pack.stickers)) {
              const sticker = recordValue(stickerValue)
              if (!sticker) continue
              const id = stringValue(sticker.id)
              const md5 = stringValue(sticker.md5)
              const name = stringValue(sticker.name) || '表情'
              const filePath = this.findStickerFile(catalogDir, packName, id, md5)
              if (!filePath) continue
              const entry: StickerEntry = { id, md5, name, packName, filePath }
              if (id) index.set(id, entry)
              if (md5) index.set(md5, entry)
            }
          }
        } catch (error) {
          this.warn(
            `表情包目录无法解析：${error instanceof Error ? error.message : '未知错误'}`
          )
        }
      }
    }
    this.stickerIndex = index
    if (index.size === 0) {
      this.warn('没有找到可用的 QQChatExporter 表情包目录或本地贴纸文件。')
    }
    return index
  }

  private findStickerFile(
    catalogDir: string,
    packName: string,
    id: string,
    md5: string
  ): string | null {
    const directories = uniqueStrings([
      packName ? path.join(catalogDir, packName, 'stickers') : null,
      path.join(catalogDir, '收藏的表情', 'stickers'),
      path.join(catalogDir, 'stickers')
    ])
    const prefixes = uniqueStrings([id, md5])
    if (prefixes.length === 0) return null
    for (const directory of directories) {
      let files: string[]
      try {
        files = fs.readdirSync(directory)
      } catch {
        continue
      }
      for (const file of files) {
        if (
          prefixes.some(
            (prefix) => file.startsWith(`${prefix}_`) || file.startsWith(`${prefix}.`)
          ) &&
          isImagePath(file)
        ) {
          return path.join(directory, file)
        }
      }
    }
    return null
  }

  private walkFiles(root: string, acceptedNames?: Set<string>, depth = 0): string[] {
    if (depth > 5) return []
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return []
    }
    const files: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        files.push(...this.walkFiles(fullPath, acceptedNames, depth + 1))
      } else if (
        entry.isFile() &&
        (!acceptedNames || acceptedNames.has(entry.name.toLowerCase()))
      ) {
        files.push(fullPath)
      }
    }
    return files
  }

  private warn(warning: string): void {
    if (this.warningSet.has(warning)) return
    if (this.warningSet.size >= 80) return
    this.warningSet.add(warning)
  }
}

export function isQQStickerPath(filePath: string): boolean {
  return pathHasSegment(filePath, 'sticker-packs') || pathHasSegment(filePath, 'stickers')
}
