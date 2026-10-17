import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectImportFiles,
  parseChatFile,
  parseCsvConversation,
  parseHtmlConversation,
  parseJsonConversation,
  parseTextConversation
} from '../../src/main/parsers'

const tempDirs: string[] = []

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatinsight-parser-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('chat parsers', () => {
  it('parses QQ-style text and identifies the friend role', () => {
    const parsed = parseTextConversation(
      `2025-03-01 10:02:03 小林(123456)
在吗？
2025-03-01 10:03:04 我: 在，刚开完会
2025-03-01 10:04:00 小林: [图片] 周末的照片.jpg`,
      '小林'
    )

    expect(parsed.messages).toHaveLength(3)
    expect(parsed.messages[0]?.senderRole).toBe('other')
    expect(parsed.messages[1]?.senderRole).toBe('self')
    expect(parsed.messages[2]?.assetNames).toContain('周末的照片.jpg')
  })

  it('parses common JSON and CSV field names', () => {
    const json = parseJsonConversation(
      JSON.stringify({
        messages: [
          {
            timestamp: '2025-03-02T10:00:00+08:00',
            senderName: '小林',
            content: '你好'
          },
          {
            timestamp: '2025-03-02T10:01:00+08:00',
            senderName: '我',
            content: '最近怎么样'
          }
        ]
      }),
      '小林',
      'chat.json'
    )
    expect(json.messages).toHaveLength(2)
    expect(json.messages[0]?.senderRole).toBe('other')
    expect(json.messages[1]?.senderRole).toBe('self')

    const csv = parseCsvConversation(
      `发送时间,发送者,内容
2025-03-02 10:00:00,小林,你好
2025-03-02 10:01:00,我,最近怎么样`,
      '小林',
      'chat.csv'
    )
    expect(csv.messages).toHaveLength(2)
  })

  it('finds nested JSON message arrays and converts epoch timestamps', () => {
    const parsed = parseJsonConversation(
      JSON.stringify({
        payload: {
          conversation: {
            records: [
              {
                time: 1740794400,
                sender: '小林',
                message: '嵌套记录'
              }
            ]
          }
        }
      }),
      '小林',
      'nested.json'
    )
    expect(parsed.messages).toHaveLength(1)
    expect(parsed.messages[0]?.sentAt).toMatch(/^2025-/)
  })

  it('converts sanitized HTML to a readable conversation', () => {
    const parsed = parseHtmlConversation(
      `<div><script>alert('x')</script>
       <p>2025-03-03 10:00:00 小林: 这是文本</p>
       <img alt="photo.png" src="photo.png" /></div>`,
      '小林'
    )
    expect(parsed.messages.length).toBeGreaterThanOrEqual(1)
    expect(parsed.messages[0]?.text).not.toContain('script')
  })

  it('extracts embedded images from MHTML without needing a browser', async () => {
    const dir = tempDir()
    const mhtPath = path.join(dir, 'sample.mht')
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=',
      'base64'
    )
    const multipart = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="boundary-test"

--boundary-test
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 8bit

<html><body>
<p>2025-03-04 12:00:00 小林: 看看这张图</p>
<img src="photo.png" alt="photo.png">
</body></html>

--boundary-test
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Location: photo.png

${image.toString('base64')}
--boundary-test--
`
    fs.writeFileSync(mhtPath, multipart, 'utf8')
    const parsed = await parseChatFile(mhtPath, '小林', dir)
    expect(parsed.messages.length).toBeGreaterThanOrEqual(1)
    expect(parsed.extractedFiles).toHaveLength(1)
    expect(fs.existsSync(parsed.extractedFiles[0]!)).toBe(true)
  })

  it('recursively collects support files and skips symlink-like unknown inputs', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'chat.txt'), 'hello')
    fs.writeFileSync(path.join(dir, 'photo.png'), Buffer.from([1, 2, 3]))
    fs.writeFileSync(path.join(dir, 'unknown.exe'), 'nope')
    const result = collectImportFiles([dir])
    expect(result.textFiles).toHaveLength(1)
    expect(result.imageFiles).toHaveLength(1)
    expect(result.warnings[0]).toContain('不支持')
  })
})
