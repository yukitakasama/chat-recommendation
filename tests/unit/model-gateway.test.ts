import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProviderSecret } from '../../src/main/ai/model-gateway'
import { extractJsonObject, ModelGateway } from '../../src/main/ai/model-gateway'

const servers: http.Server[] = []

function provider(
  port: number,
  protocol: 'chat_completions' | 'responses'
): ProviderSecret {
  const now = new Date().toISOString()
  return {
    id: 'provider-test',
    name: 'Mock',
    protocol,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: 'secret',
    textModel: 'text-model',
    visionModel: 'vision-model',
    isDefault: true,
    hasApiKey: true,
    createdAt: now,
    updatedAt: now
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        })
    )
  )
})

describe('model gateway', () => {
  it('supports Chat Completions including image data URLs', async () => {
    let requestBody: Record<string, unknown> | null = null
    const server = http.createServer((request, response) => {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        requestBody = JSON.parse(body) as Record<string, unknown>
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }]
          })
        )
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test port')

    const gateway = new ModelGateway()
    const result = await gateway.request(provider(address.port, 'chat_completions'), {
      system: 'test',
      prompt: 'hello',
      images: [{ mime: 'image/jpeg', data: Buffer.from('image') }],
      jsonMode: true
    })
    expect(result.text).toBe('{"ok":true}')
    expect(JSON.stringify(requestBody)).toContain('data:image/jpeg;base64,')
    expect(JSON.stringify(requestBody)).toContain('response_format')
  })

  it('supports Responses API output_text and retries 429 responses', async () => {
    let attempts = 0
    const server = http.createServer((_request, response) => {
      attempts += 1
      if (attempts === 1) {
        response.statusCode = 429
        response.setHeader('retry-after', '0')
        response.end('rate limited')
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ output_text: '{"summary":"ok"}' }))
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test port')

    const gateway = new ModelGateway()
    const result = await gateway.request(provider(address.port, 'responses'), {
      system: 'test',
      prompt: 'hello'
    })
    expect(result.text).toContain('summary')
    expect(attempts).toBe(2)
  })

  it('retries Chat Completions without response_format when a compatible endpoint rejects it', async () => {
    let attempts = 0
    let finalBody = ''
    const server = http.createServer((request, response) => {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        attempts += 1
        if (attempts === 1) {
          response.statusCode = 400
          response.end('response_format json_object is not supported')
          return
        }
        finalBody = body
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test port')

    const gateway = new ModelGateway()
    const result = await gateway.request(provider(address.port, 'chat_completions'), {
      system: 'test',
      prompt: 'hello',
      jsonMode: true
    })
    expect(result.text).toBe('{"ok":true}')
    expect(attempts).toBe(2)
    expect(finalBody).not.toContain('response_format')
  })

  it('turns a stalled endpoint into a clear timeout error', async () => {
    const server = http.createServer((_request, response) => {
      setTimeout(() => response.end('{}'), 200)
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test port')

    const gateway = new ModelGateway()
    await expect(
      gateway.request(provider(address.port, 'chat_completions'), {
        system: 'test',
        prompt: 'hello',
        timeoutMs: 40
      })
    ).rejects.toThrow('模型请求超时')
  })

  it('extracts JSON from fenced or prefixed model text', () => {
    expect(extractJsonObject<{ ok: boolean }>('说明\n```json\n{"ok":true}\n```')).toEqual({
      ok: true
    })
  })
})
