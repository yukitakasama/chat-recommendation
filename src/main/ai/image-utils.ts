import path from 'node:path'
import sharp from 'sharp'
import { decryptBuffer } from '../crypto'
export async function prepareImageForModel(
  encryptedPath: string,
  digest: string,
  mediaKey: Buffer
): Promise<{ mime: string; data: Buffer }> {
  const fs = await import('node:fs')
  const encrypted = fs.readFileSync(encryptedPath)
  const raw = decryptBuffer(encrypted, mediaKey, digest)
  const normalized = await sharp(raw, { animated: false })
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
  return { mime: 'image/jpeg', data: normalized }
}

export async function normalizeLocalImage(
  filePath: string
): Promise<{ mime: string; data: Buffer }> {
  const normalized = await sharp(filePath, { animated: false })
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
  return { mime: 'image/jpeg', data: normalized }
}

export function safeImageName(value: string): string {
  return path.basename(value).replace(/[^\p{L}\p{N}._-]+/gu, '_')
}
