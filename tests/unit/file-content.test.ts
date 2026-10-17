import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { encryptBuffer, sha256 } from '../../src/main/crypto'
import { extractFileEvidence } from '../../src/main/ai/file-content'

const tempDirs: string[] = []

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-file-content-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('file attachment content extraction', () => {
  it('decrypts and extracts text while reporting unsupported binary files', async () => {
    const directory = tempDir()
    const key = crypto.randomBytes(32)
    const text = '附件里的可读文字\n第二行'
    const textBuffer = Buffer.from(text, 'utf8')
    const textDigest = sha256(textBuffer)
    const textPath = path.join(directory, 'note.txt.bin')
    fs.writeFileSync(textPath, encryptBuffer(textBuffer, key, textDigest))

    const audioBuffer = Buffer.from('audio-bytes')
    const audioDigest = sha256(audioBuffer)
    const audioPath = path.join(directory, 'voice.m4a.bin')
    fs.writeFileSync(audioPath, encryptBuffer(audioBuffer, key, audioDigest))

    const result = await extractFileEvidence(
      [
        {
          id: 'asset-text',
          originalName: 'note.txt',
          mime: 'text/plain',
          encryptedPath: textPath,
          sha256: textDigest,
          size: textBuffer.length
        },
        {
          id: 'asset-audio',
          originalName: 'voice.m4a',
          mime: 'audio/mp4',
          encryptedPath: audioPath,
          sha256: audioDigest,
          size: audioBuffer.length
        }
      ],
      key
    )

    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.assetId).toBe('asset-text')
    expect(result.files[0]?.text).toContain('附件里的可读文字')
    expect(result.warnings[0]).toContain('暂不能在本地提取正文')
  })
})
