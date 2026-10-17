import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJsonConversation } from '../../src/main/parsers'

const tempDirs: string[] = []

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-qq-resources-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('QQChatExporter resources', () => {
  it('resolves images, files and market stickers referenced by messages', () => {
    const directory = tempDir()
    const imagePath = path.join(directory, 'resources', 'images', 'photo.suf')
    const filePath = path.join(directory, 'resources', 'files', 'document.pdf')
    const stickerPath = path.join(
      directory,
      'sticker-packs',
      'all_packs_1',
      '测试包',
      'stickers',
      'sticker_md5_微笑.gif'
    )
    fs.mkdirSync(path.dirname(imagePath), { recursive: true })
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.mkdirSync(path.dirname(stickerPath), { recursive: true })
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    fs.writeFileSync(filePath, Buffer.from('%PDF-1.4'))
    fs.writeFileSync(stickerPath, Buffer.from('GIF89a'))
    fs.writeFileSync(
      path.join(directory, 'sticker-packs', 'all_packs_1', 'all_sticker_packs.json'),
      JSON.stringify({
        packs: [
          {
            packName: '测试包',
            stickers: [
              {
                id: 'sticker_md5',
                md5: 'sticker_md5',
                name: '微笑'
              }
            ]
          }
        ]
      })
    )

    const parsed = parseJsonConversation(
      JSON.stringify({
        chatInfo: {
          type: 'private',
          selfUin: '10001',
          selfUid: 'u_self',
          peerUin: '20002',
          peerUid: 'u_peer'
        },
        messages: [
          {
            timestamp: 1760690000000,
            type: 'text',
            system: false,
            sender: { uin: '20002' },
            content: {
              text: '',
              elements: [{ type: 'image', data: {} }],
              resources: [
                {
                  type: 'image',
                  filename: 'photo.suf',
                  localPath: 'images/photo.suf'
                }
              ]
            }
          },
          {
            timestamp: 1760690001000,
            type: 'file',
            system: false,
            sender: { uin: '10001' },
            content: {
              text: '',
              resources: [
                {
                  type: 'file',
                  filename: 'document.pdf',
                  localPath: 'files/document.pdf'
                }
              ]
            }
          },
          {
            timestamp: 1760690002000,
            type: 'type_17',
            system: false,
            sender: { uin: '20002' },
            content: {
              text: '',
              elements: [
                {
                  type: 'market_face',
                  data: {
                    emojiId: 'sticker_md5',
                    emojiPackageId: 1,
                    name: '微笑'
                  }
                }
              ]
            }
          }
        ]
      }),
      '好友备注',
      'friend.json',
      directory
    )

    expect(parsed.messages).toHaveLength(3)
    expect(parsed.messages[0]?.senderRole).toBe('other')
    expect(parsed.messages[0]?.messageType).toBe('image')
    expect(parsed.messages[0]?.assetNames).toContain('photo.suf')
    expect(parsed.messages[1]?.senderRole).toBe('self')
    expect(parsed.messages[1]?.messageType).toBe('other')
    expect(parsed.messages[1]?.assetNames).toContain('document.pdf')
    expect(parsed.messages[1]?.text).toContain('[附件: document.pdf]')
    expect(parsed.messages[2]?.messageType).toBe('image')
    expect(parsed.messages[2]?.text).toContain('[表情: 微笑]')
    expect(parsed.referencedFiles).toEqual(
      expect.arrayContaining([imagePath, filePath, stickerPath])
    )
  })

  it('rejects resource paths outside the export and resource roots', () => {
    const directory = tempDir()
    const outside = `${directory}-outside.txt`
    fs.writeFileSync(outside, 'must not be imported')
    try {
      const parsed = parseJsonConversation(
        JSON.stringify({
          chatInfo: {
            type: 'private',
            selfUin: '10001',
            peerUin: '20002'
          },
          messages: [
            {
              timestamp: 1760690000000,
              sender: { uin: '20002' },
              content: {
                text: '附件',
                resources: [
                  {
                    type: 'file',
                    filename: 'outside.txt',
                    localPath: path.basename(outside)
                  }
                ]
              }
            }
          ]
        }),
        '好友',
        'friend.json',
        directory
      )
      expect(parsed.referencedFiles).toEqual([])
      expect(parsed.warnings.some((warning) => warning.includes('导出目录之外'))).toBe(true)
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })
})
