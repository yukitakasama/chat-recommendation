import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProviderSecret } from '../../src/main/ai/model-gateway'
import {
  extractJsonObject,
  ModelGateway,
  normalizeResponsesPayload
} from '../../src/main/ai/model-gateway'

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

async function listen(server: http.Server): Promise<number> {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  return address.port
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

  it('normalizes standard, wrapped, and simplified Responses payloads', () => {
    const standard = {
      id: 'resp_standard',
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [{ type: 'summary_text', text: 'private reasoning' }] },
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"summary":"ok"}' }]
        }
      ]
    }
    expect(normalizeResponsesPayload(standard)).toMatchObject({
      text: '{"summary":"ok"}',
      status: 'completed',
      outputTypes: ['reasoning', 'message'],
      hasReasoning: true
    })
    expect(normalizeResponsesPayload({ response: standard }).text).toBe('{"summary":"ok"}')
    expect(
      normalizeResponsesPayload({
        output: [{ type: 'message', text: '{"summary":"direct"}' }]
      }).text
    ).toBe('{"summary":"direct"}')
    expect(
      normalizeResponsesPayload({
        output: [{ type: 'message', content: '{"summary":"string-content"}' }]
      }).text
    ).toBe('{"summary":"string-content"}')
    expect(
      normalizeResponsesPayload({
        choices: [{ message: { content: [{ type: 'text', text: '{"summary":"chat-array"}' }] } }]
      }).text
    ).toBe('{"summary":"chat-array"}')
  })

  it('reports reasoning-only and incomplete HTTP 200 responses precisely', async () => {
    const reasoningServer = http.createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          id: 'resp_reasoning',
          status: 'completed',
          output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'no final' }] }]
        })
      )
    })
    const reasoningPort = await listen(reasoningServer)
    await expect(
      new ModelGateway().request(provider(reasoningPort, 'responses'), {
        system: 'test',
        prompt: 'hello'
      })
    ).rejects.toThrow('模型只返回了推理内容')

    const incompleteServer = http.createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          id: 'resp_incomplete',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: []
        })
      )
    })
    const incompletePort = await listen(incompleteServer)
    await expect(
      new ModelGateway().request(provider(incompletePort, 'responses'), {
        system: 'test',
        prompt: 'hello'
      })
    ).rejects.toThrow('模型输出未完成')
  })

  it('aggregates Responses SSE text and final completion events', async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'text/event-stream')
      response.end(
        [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","item_id":"item_1","output_index":0,"content_index":0,"delta":"{\\"ok\\":"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","item_id":"item_1","output_index":0,"content_index":0,"delta":"true}"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"id":"resp_sse","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"{\\"ok\\":true}"}]}]}}',
          ''
        ].join('\n')
      )
    })
    const port = await listen(server)
    const result = await new ModelGateway().request(provider(port, 'responses'), {
      system: 'test',
      prompt: 'hello'
    })
    expect(result.text).toBe('{"ok":true}')
    expect(result.requestId).toBe('resp_sse')
  })

  it('normalizes Chat Completions content arrays to plain text', async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: 'hello ' },
                  { type: 'text', text: 'world' }
                ]
              }
            }
          ]
        })
      )
    })
    const port = await listen(server)
    const result = await new ModelGateway().request(provider(port, 'chat_completions'), {
      system: 'test',
      prompt: 'hello'
    })
    expect(result.text).toBe('hello world')
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
