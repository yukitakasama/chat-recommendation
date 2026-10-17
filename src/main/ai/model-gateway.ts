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
    readonly retryable = false,
    readonly requestId?: string,
    readonly code?: string
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

interface NormalizedResponsesPayload {
  text: string
  status?: string
  incompleteReason?: string
  outputTypes: string[]
  requestId?: string
  errorCode?: string
  hasReasoning: boolean
  hasToolCall: boolean
}

interface SseEvent {
  event?: string
  data: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  const record = asRecord(value)
  if (record && typeof record.value === 'string' && record.value.trim()) return record.value
  return undefined
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      const record = asRecord(part)
      if (!record) return ''
      return nonEmptyString(record.text) ?? nonEmptyString(record.refusal) ?? ''
    })
    .join('')
}

function responseOutputText(output: unknown[]): string {
  const finalItems = output
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => {
      const type = nonEmptyString(item.type)
      return !type || type === 'message' || type === 'output_text'
    })
  return finalItems
    .map((item) => nonEmptyString(item.text) ?? contentText(item.content))
    .join('')
}

function unwrapResponsesPayload(payload: unknown): unknown {
  let current = payload
  for (let depth = 0; depth < 3; depth += 1) {
    const root = asRecord(current)
    if (!root) break
    if (
      'output_text' in root ||
      'output' in root ||
      'choices' in root ||
      'error' in root ||
      'text' in root
    ) {
      break
    }
    const wrapper = ['response', 'data', 'result']
      .map((key) => root[key])
      .find((value) => Boolean(asRecord(value)))
    if (!wrapper) break
    current = wrapper
  }
  return current
}

export function normalizeResponsesPayload(
  payload: unknown,
  headerRequestId?: string
): NormalizedResponsesPayload {
  const unwrapped = unwrapResponsesPayload(payload)
  const root = asRecord(unwrapped)
  if (!root) {
    return {
      text: '',
      outputTypes: [],
      requestId: headerRequestId,
      hasReasoning: false,
      hasToolCall: false
    }
  }

  const output = Array.isArray(root.output) ? root.output : []
  const outputTypes = output.map((item) => nonEmptyString(asRecord(item)?.type) ?? 'unknown')
  const status = nonEmptyString(root.status)
  const incompleteDetails = asRecord(root.incomplete_details)
  const incompleteReason = nonEmptyString(incompleteDetails?.reason)
  const errorRecord = asRecord(root.error)
  const errorCode =
    nonEmptyString(errorRecord?.code) ??
    nonEmptyString(root.error_code) ??
    (typeof root.error === 'string' ? 'upstream_error' : undefined)
  const hasReasoning = outputTypes.includes('reasoning')
  const hasToolCall = outputTypes.some((type) =>
    [
      'function_call',
      'tool_call',
      'computer_call',
      'local_shell_call',
      'web_search_call'
    ].includes(type)
  )

  let text = nonEmptyString(root.output_text) ?? ''
  if (!text) text = responseOutputText(output)
  if (!text) {
    const choices = Array.isArray(root.choices) ? root.choices : []
    const message = asRecord(asRecord(choices[0])?.message)
    text = contentText(message?.content)
  }
  if (!text) text = nonEmptyString(root.text) ?? ''

  return {
    text,
    status,
    incompleteReason,
    outputTypes,
    requestId: nonEmptyString(root.id) ?? headerRequestId,
    errorCode,
    hasReasoning,
    hasToolCall
  }
}

function diagnosticValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '?').slice(0, 80)
}

function responseDiagnostic(normalized: NormalizedResponsesPayload): string {
  const details: string[] = []
  if (normalized.status) details.push(`状态：${diagnosticValue(normalized.status)}`)
  if (normalized.outputTypes.length) {
    details.push(`输出项：${normalized.outputTypes.map(diagnosticValue).join(',')}`)
  }
  if (normalized.requestId) details.push(`请求 ID：${diagnosticValue(normalized.requestId)}`)
  return details.length ? `（${details.join('；')}）` : ''
}

function requireResponsesText(normalized: NormalizedResponsesPayload): string {
  if (normalized.status === 'failed' || normalized.errorCode) {
    throw new ModelGatewayError(
      `模型服务返回失败状态${responseDiagnostic(normalized)}`,
      undefined,
      false,
      normalized.requestId,
      normalized.errorCode ?? 'upstream_failed'
    )
  }
  if (normalized.status === 'incomplete' || normalized.incompleteReason) {
    const reason = normalized.incompleteReason
      ? `，原因：${diagnosticValue(normalized.incompleteReason)}`
      : ''
    throw new ModelGatewayError(
      `模型输出未完成${reason}${responseDiagnostic(normalized)}`,
      undefined,
      false,
      normalized.requestId,
      normalized.incompleteReason === 'max_output_tokens'
        ? 'max_output_tokens'
        : 'incomplete'
    )
  }
  if (normalized.text.trim()) return normalized.text
  if (normalized.status === 'queued' || normalized.status === 'in_progress') {
    throw new ModelGatewayError(
      `模型响应尚未完成${responseDiagnostic(normalized)}`,
      undefined,
      false,
      normalized.requestId
    )
  }
  if (normalized.hasReasoning) {
    throw new ModelGatewayError(
      `模型只返回了推理内容，未生成最终回答${responseDiagnostic(normalized)}`,
      undefined,
      false,
      normalized.requestId
    )
  }
  if (normalized.hasToolCall) {
    throw new ModelGatewayError(
      `模型返回了工具调用，但没有生成文本回答${responseDiagnostic(normalized)}`,
      undefined,
      false,
      normalized.requestId
    )
  }
  throw new ModelGatewayError(
    `模型响应格式不受支持或内容为空${responseDiagnostic(normalized)}`,
    undefined,
    false,
    normalized.requestId
  )
}

function normalizeChatPayload(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) throw new ModelGatewayError('模型返回中没有可读取的文本内容')
  const choices = Array.isArray(root.choices) ? root.choices : []
  const choice = asRecord(choices[0])
  const message = asRecord(choice?.message)
  const text =
    contentText(message?.content) ||
    nonEmptyString(message?.refusal) ||
    nonEmptyString(root.output_text) ||
    ''
  if (text.trim()) return text
  if (nonEmptyString(message?.reasoning_content)) {
    throw new ModelGatewayError('模型只返回了推理内容，未生成最终回答')
  }
  if (nonEmptyString(choice?.finish_reason) === 'length') {
    throw new ModelGatewayError(
      '模型输出因长度限制被截断',
      undefined,
      false,
      undefined,
      'max_output_tokens'
    )
  }
  if (choice?.tool_calls || choice?.function_call) {
    throw new ModelGatewayError('模型返回了工具调用，但没有生成文本回答')
  }
  throw new ModelGatewayError('模型返回中没有可读取的文本内容')
}

function parseSseEvents(body: string): SseEvent[] {
  const events: SseEvent[] = []
  for (const block of body.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    if (!block.trim()) continue
    let event: string | undefined
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue
      const separator = line.indexOf(':')
      const field = separator >= 0 ? line.slice(0, separator) : line
      const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : ''
      if (field === 'event') event = value
      if (field === 'data') data.push(value)
    }
    if (data.length) events.push({ event, data: data.join('\n') })
  }
  return events
}

function normalizeResponsesSse(
  body: string,
  headerRequestId?: string
): NormalizedResponsesPayload {
  const events = parseSseEvents(body)
  if (!events.length) {
    throw new ModelGatewayError(
      '模型服务返回了无法解析的 SSE 响应',
      undefined,
      false,
      headerRequestId
    )
  }

  const deltas = new Map<string, string>()
  let finalPayload: unknown
  let terminated = false
  let streamErrorCode: string | undefined
  let sawReasoning = false

  for (const event of events) {
    if (event.data.trim() === '[DONE]') {
      terminated = true
      continue
    }
    let payload: unknown
    try {
      payload = JSON.parse(event.data)
    } catch {
      throw new ModelGatewayError(
        '模型服务返回了无法解析的 SSE 事件',
        undefined,
        false,
        headerRequestId
      )
    }
    const record = asRecord(payload)
    if (!record) continue
    const type = event.event ?? nonEmptyString(record.type) ?? ''
    if (type.includes('reasoning')) sawReasoning = true
    if (type === 'response.output_text.delta') {
      const delta = nonEmptyString(record.delta) ?? ''
      const key = [
        nonEmptyString(record.item_id) ?? '',
        typeof record.output_index === 'number' ? record.output_index : '',
        typeof record.content_index === 'number' ? record.content_index : ''
      ].join(':')
      deltas.set(key, `${deltas.get(key) ?? ''}${delta}`)
      continue
    }
    if (type === 'response.completed') {
      finalPayload = record.response ?? record
      terminated = true
      continue
    }
    if (type === 'response.incomplete') {
      finalPayload = record.response ?? record
      terminated = true
      continue
    }
    if (type === 'response.failed') {
      finalPayload = record.response ?? record
      terminated = true
      continue
    }
    if (type === 'error' || record.error) {
      const errorRecord = asRecord(record.error)
      streamErrorCode =
        nonEmptyString(errorRecord?.code) ??
        nonEmptyString(record.code) ??
        'stream_error'
      terminated = true
    }
  }

  const normalized: NormalizedResponsesPayload = finalPayload
    ? normalizeResponsesPayload(finalPayload, headerRequestId)
    : {
        text: '',
        outputTypes: [],
        requestId: headerRequestId,
        hasReasoning: sawReasoning,
        hasToolCall: false
      }
  if (!normalized.text) normalized.text = [...deltas.values()].join('')
  if (streamErrorCode) normalized.errorCode = streamErrorCode
  if (!terminated) {
    throw new ModelGatewayError(
      '模型 SSE 响应未正常结束，缺少完成事件',
      undefined,
      false,
      normalized.requestId
    )
  }
  return normalized
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
      Accept:
        provider.protocol === 'responses'
          ? 'text/event-stream, application/json'
          : 'application/json'
    }
    if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`
    const model = request.model || provider.textModel
    let outputTokenBudget = request.maxOutputTokens ?? 4000
    let budgetRetries = 0

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
                max_output_tokens: outputTokenBudget,
                stream: true
              }
            : {
                model,
                messages: [
                  { role: 'system', content: request.system },
                  { role: 'user', content: chatContent(request) }
                ],
                temperature: 0.2,
                max_tokens: outputTokenBudget,
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
        const requestId =
          response.headers.get('x-request-id') ??
          response.headers.get('request-id') ??
          response.headers.get('openai-request-id') ??
          undefined
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
            retryable,
            requestId
          )
          if (retryable && attempt < 2) {
            const retryAfter = Number(response.headers.get('retry-after') ?? 0)
            await sleep(Math.min(5000, Math.max(800, retryAfter * 1000 || 800 * 2 ** attempt)), request.signal)
            continue
          }
          throw error
        }
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        const looksLikeSse =
          contentType.includes('text/event-stream') ||
          /^\s*(?:event|data):/m.test(body.slice(0, 1024))
        if (provider.protocol === 'responses' && looksLikeSse) {
          const normalized = normalizeResponsesSse(body, requestId)
          return {
            text: requireResponsesText(normalized),
            requestId: normalized.requestId
          }
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(body)
        } catch {
          throw new ModelGatewayError(
            '模型服务返回了非 JSON 响应',
            undefined,
            false,
            requestId
          )
        }
        if (provider.protocol === 'responses') {
          const normalized = normalizeResponsesPayload(parsed, requestId)
          return {
            text: requireResponsesText(normalized),
            requestId: normalized.requestId
          }
        }
        return {
          text: normalizeChatPayload(parsed),
          requestId
        }
      } catch (error) {
        if (request.signal?.aborted) throw new DOMException('已取消', 'AbortError')
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new ModelGatewayError('模型请求超时', 408, true)
        }
        if (
          error instanceof ModelGatewayError &&
          error.code === 'max_output_tokens' &&
          budgetRetries < 2
        ) {
          const nextBudget = Math.min(24_000, Math.max(8192, outputTokenBudget * 2))
          if (nextBudget > outputTokenBudget) {
            outputTokenBudget = nextBudget
            budgetRetries += 1
            continue
          }
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
      maxOutputTokens: 1024
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
