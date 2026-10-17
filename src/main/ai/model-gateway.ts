import type { ProviderProfile } from '../../shared/schemas'

export interface ProviderSecret extends ProviderProfile {
  apiKey: string
}

export interface ModelImage {
  mime: string
  data: Buffer
}

export interface ModelRequest {
  system: string
  prompt: string
  images?: ModelImage[]
  model?: string
  maxOutputTokens?: number
  signal?: AbortSignal
  jsonMode?: boolean
  timeoutMs?: number
}

export interface ModelResponse {
  text: string
  requestId?: string
}

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'ModelGatewayError'
  }
}

export function buildProviderEndpoint(provider: ProviderProfile): string {
  const base = provider.baseUrl.replace(/\/+$/, '')
  const suffix = provider.protocol === 'responses' ? '/responses' : '/chat/completions'
  if (base.endsWith('/responses') || base.endsWith('/chat/completions')) return base
  if (/\/v1$/i.test(base)) return `${base}${suffix}`
  return `${base}/v1${suffix}`
}

function chatContent(request: ModelRequest): string | Array<Record<string, unknown>> {
  if (!request.images?.length) return request.prompt
  return [
    { type: 'text', text: request.prompt },
    ...request.images.map((image) => ({
      type: 'image_url',
      image_url: {
        url: `data:${image.mime};base64,${image.data.toString('base64')}`
      }
    }))
  ]
}

function responseContent(request: ModelRequest): Array<Record<string, unknown>> {
  return [
    { type: 'input_text', text: request.prompt },
    ...(request.images ?? []).map((image) => ({
      type: 'input_image',
      image_url: `data:${image.mime};base64,${image.data.toString('base64')}`
    }))
  ]
}

function extractChatText(payload: unknown): string {
  const root = payload as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>
      }
    }>
    output_text?: string
  }
  const content = root.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('')
  }
  if (typeof root.output_text === 'string') return root.output_text
  throw new ModelGatewayError('模型返回中没有可读取的文本内容')
}

function extractResponsesText(payload: unknown): string {
  const root = payload as {
    output_text?: string
    output?: Array<{
      content?: Array<{
        type?: string
        text?: string
        refusal?: string
      }>
    }>
    choices?: Array<{ message?: { content?: string } }>
  }
  if (typeof root.output_text === 'string' && root.output_text.trim()) return root.output_text
  const text = (root.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? item.refusal ?? '')
    .join('')
  if (text.trim()) return text
  const fallback = root.choices?.[0]?.message?.content
  if (fallback) return fallback
  throw new ModelGatewayError('模型响应格式不受支持或内容为空')
}

function errorMessage(status: number, body: string): string {
  const compact = body.replace(/\s+/g, ' ').slice(0, 500)
  if (status === 401 || status === 403) return `模型服务鉴权失败（HTTP ${status}）`
  if (status === 404) return `模型端点或模型名称不存在（HTTP 404）`
  if (status === 429) return '模型服务请求过于频繁（HTTP 429）'
  return `模型服务请求失败（HTTP ${status}）：${compact}`
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('已取消', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('已取消', 'AbortError'))
      },
      { once: true }
    )
  })
}

export class ModelGateway {
  async request(provider: ProviderSecret, request: ModelRequest): Promise<ModelResponse> {
    const endpoint = buildProviderEndpoint(provider)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
    if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`
    const model = request.model || provider.textModel

    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const payload =
          provider.protocol === 'responses'
            ? {
                model,
                input: [
                  {
                    role: 'system',
                    content: [{ type: 'input_text', text: request.system }]
                  },
                  {
                    role: 'user',
                    content: responseContent(request)
                  }
                ],
                max_output_tokens: request.maxOutputTokens ?? 4000
              }
            : {
                model,
                messages: [
                  { role: 'system', content: request.system },
                  { role: 'user', content: chatContent(request) }
                ],
                temperature: 0.2,
                max_tokens: request.maxOutputTokens ?? 4000,
                ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {})
              }
        const timeoutSignal = AbortSignal.timeout(request.timeoutMs ?? 120_000)
        const signal = request.signal
          ? AbortSignal.any([request.signal, timeoutSignal])
          : timeoutSignal
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal
        })
        const body = await response.text()
        if (
          !response.ok &&
          request.jsonMode &&
          provider.protocol === 'chat_completions' &&
          response.status === 400 &&
          /response_format|json_object/i.test(body)
        ) {
          request = { ...request, jsonMode: false }
          attempt -= 1
          continue
        }
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500
          const error = new ModelGatewayError(
            errorMessage(response.status, body),
            response.status,
            retryable
          )
          if (retryable && attempt < 2) {
            const retryAfter = Number(response.headers.get('retry-after') ?? 0)
            await sleep(Math.min(5000, Math.max(800, retryAfter * 1000 || 800 * 2 ** attempt)), request.signal)
            continue
          }
          throw error
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(body)
        } catch {
          throw new ModelGatewayError('模型服务返回了非 JSON 响应')
        }
        const text =
          provider.protocol === 'responses' ? extractResponsesText(parsed) : extractChatText(parsed)
        return {
          text,
          requestId: response.headers.get('x-request-id') ?? undefined
        }
      } catch (error) {
        if (request.signal?.aborted) throw new DOMException('已取消', 'AbortError')
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new ModelGatewayError('模型请求超时', 408, true)
        }
        lastError = error
        if (attempt < 2 && error instanceof TypeError) {
          await sleep(800 * 2 ** attempt, request.signal)
          continue
        }
        throw error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('模型请求失败')
  }

  async test(provider: ProviderSecret): Promise<{ latencyMs: number }> {
    const start = Date.now()
    await this.request(provider, {
      system: '你是连通性测试助手。',
      prompt: '只回复 OK。',
      maxOutputTokens: 16
    })
    return { latencyMs: Date.now() - start }
  }
}

export function extractJsonObject<T = unknown>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const startObject = trimmed.indexOf('{')
    const endObject = trimmed.lastIndexOf('}')
    if (startObject >= 0 && endObject > startObject) {
      try {
        return JSON.parse(trimmed.slice(startObject, endObject + 1)) as T
      } catch {
        // Fall through with a stable error.
      }
    }
    throw new ModelGatewayError('模型未返回可解析的 JSON')
  }
}
