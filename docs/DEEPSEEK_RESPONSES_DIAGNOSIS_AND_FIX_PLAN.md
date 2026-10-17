# DeepSeek Responses 空结果排查与修复计划

## 1. 文档状态

- 状态：已完成本地黑盒复现、代码定位、v1.3.2 兼容修复、自动化测试和本地发行版验证；仍未取得 ginka 中转站的真实脱敏响应。
- 范围：已按本计划完成 Responses 归一化、错误分类、SSE 支持、测试和发行准备，未访问或修改真实聊天数据。
- 当前工作区未发现独立 ginka 工程。本次以当前仓库的 Responses 网关作为同类实现进行验证，代码位置为 `src/main/ai/model-gateway.ts`。
- 未访问真实 DeepSeek 或 ginka 中转站，未读取 API Key，也未发送真实聊天内容。

## 2. 结论摘要

问题不是简单的“Responses 接口设置错误”。当前证据表明：

1. 标准 Responses 返回结构可以被现有网关解析，包括 `output[].content[].text` 和 reasoning 项后跟最终 message 的常见结构。
2. 当前错误文案“模型响应格式不受支持或内容为空”来自 `extractResponsesText` 的最后兜底，说明响应已成功读取为 JSON，但没有命中当前支持的文本字段。
3. 最可疑的是中转站返回了以下一种与标准结构不同的响应：
   - 只有 reasoning 内容，没有最终 `message/output_text`。
   - HTTP 200，但 `status` 为 `incomplete` 或 `failed`，`output` 为空。
   - 中转站把结果额外包裹在 `response`、`data` 或自定义字段中。
   - 中转站返回 Responses SSE 事件，但客户端仍按普通 JSON 处理。
   - Relay 返回 Chat Completions 风格的 `choices[].message.content` 数组，当前 Responses 兜底返回了非字符串。
4. 需要一条失败请求的脱敏原始响应，才能在上述可能中做最终确认。

## 3. 已执行测试

### 3.1 现有网关测试

执行：

```bash
bun x vitest run tests/unit/model-gateway.test.ts
```

结果：5/5 通过。

现有测试只覆盖：

- 顶层 `output_text`。
- Chat Completions 字符串正文与图片输入。
- 429 重试。
- JSON 模式不支持时的重试。
- 请求超时。

现有测试没有覆盖嵌套 Responses、reasoning-only、SSE、Relay 包装和 incomplete 状态。

### 3.2 本地响应形态矩阵

使用本地 HTTP 服务模拟 Relay，通过当前 `ModelGateway` 发起真实 Responses 请求。未使用真实密钥或外部网络。

| 响应形态 | 结果 |
|---|---|
| 顶层 `output_text` | 通过 |
| 标准 `output[].content[].type=output_text` | 通过 |
| reasoning 项后跟最终 message | 通过 |
| 只有 reasoning 项，没有最终 message | 失败：“模型响应格式不受支持或内容为空” |
| Relay 返回 Chat `choices[].message.content` 字符串 | 通过 |
| Relay 返回 Chat `choices[].message.content` 数组 | 返回数组字符串，类型不安全，后续可能解析失败 |
| Relay 额外包裹 `response` 字段 | 失败：“模型响应格式不受支持或内容为空” |
| `text/event-stream` SSE 事件 | 失败：“模型服务返回了非 JSON 响应” |
| `output[]` 项直接放 `text`，没有 `content[]` | 失败：“模型响应格式不受支持或内容为空” |
| `output[].content` 为字符串而不是数组 | 失败：“模型响应格式不受支持或内容为空” |
| HTTP 200，`status=incomplete`，`output=[]` | 失败：“模型响应格式不受支持或内容为空” |

## 4. 代码定位

### 4.1 Responses 文本提取

`src/main/ai/model-gateway.ts:88-109`

当前支持：

- 顶层非空 `output_text`。
- `output[].content[]` 中的 `text` 或 `refusal`。
- `choices[0].message.content` 字符串兜底。

当前限制：

- 不检查 `status`、`error`、`incomplete_details`。
- 不读取 reasoning-only 的真实原因。
- 不兼容 Relay 外层包装。
- Responses 路径下没有完整处理 `choices[].message.content` 数组。
- SSE 不在 Responses 非流式请求中处理。

### 4.2 Responses 请求构造

`src/main/ai/model-gateway.ts:150-165`

当前请求使用：

- `input`
- `max_output_tokens`
- system/user input_text

请求体本身符合 Responses 基本结构，因此暂不支持“请求体仍使用 messages 字段”这一原因。

### 4.3 连接测试

`src/main/ai/model-gateway.ts` 中的 `test()` 会调用同一个 `request()`，使用“只回复 OK”和 16 输出 token。

影响：

- 对标准的短响应可以验证真实生成和基础解析。
- 不能覆盖长分析提示、JSON 输出、reasoning-only、incomplete、Relay 包装或 SSE。
- 如果 ginka 的连接测试实现与真实分析不同，则连接测试通过不能排除 Responses 适配问题。

### 4.4 分析结果校验

`src/main/ai/analysis-service.ts:602-646`

分析请求要求模型输出 JSON。即使网关成功提取出纯文本：

- 非 JSON 文本会在后续 `extractJsonObject` 中失败。
- 被截断的 JSON 会进入修复请求，或在第二次失败后报“模型结果校验失败”。

但本次已知错误文案更早来自 Responses 文本提取，因此当前优先处理响应归一化。

## 5. 原因排序

### P0：responses 返回 reasoning-only 或缺少最终 message

最可能。DeepSeek 推理模型或 Relay 适配器可能只暴露推理项，最终正文为空。当前网关会忽略 reasoning 的 `summary`，随后抛出空结果错误。

确认方式：

- 记录原始 JSON 的所有 `output[].type`。
- 检查是否存在 `reasoning`、`message`、`function_call`。
- 检查 `status` 和 `incomplete_details`。

### P1：HTTP 200 的 incomplete/failed 状态未被识别

可能是 `max_output_tokens` 耗尽、上游超时或 Relay 阶段失败，但 HTTP 状态仍为 200。当前错误会丢失真正原因。

确认方式：

- 记录 `status`、`error`、`incomplete_details.reason` 和 usage。
- 使用相同的 `max_output_tokens` 重放最小请求。

### P2：Relay 使用自定义包装或非标准文本层级

可能是 `response`、`data`、`result` 外层包装，或 `output[].text`、`content` 字符串等简化结构。当前归一化器只支持标准层级。

确认方式：

- 提供完整顶层键列表和失败响应样例。
- 不依赖业务解析器，直接保存原始响应。

### P3：Relay 实际返回 Responses SSE

当前请求没有显式要求流式，但某些中转站可能默认返回 SSE。当前代码对 `text/event-stream` 会直接尝试 `JSON.parse`。

确认方式：

- 记录 `Content-Type`。
- 保存前 5 个和后 5 个 SSE 事件类型。
- 检查是否存在 `response.output_text.delta` 和 `response.completed`。

### P4：Chat Completions 内容数组被错误兜底

如果 Relay 在 Responses 路径返回 Chat Completions 结构，文本可能是内容数组。当前 Responses 兜底没有像 Chat 提取器一样拼接数组，最终返回运行时数组，存在类型错误风险。

确认方式：

- 检查 `choices[0].message.content` 的实际类型。
- 记录 Response 返回值的运行时类型，而不是只看 TypeScript 类型。

### P5：模型输出被截断或 JSON 模式没有生效

长提示、6000 输出 token 限制或 Relay 未正确处理结构化输出，可能导致最终 JSON 不完整。这个原因通常不会产生当前最早的“格式不支持或内容为空”，但可能是后续错误来源。

确认方式：

- 检查 `finish_reason`、`status`、usage 和输出 token。
- 用短提示、普通文本和小输出对比。

## 6. 需要补充的外部信息

在不提供 API Key、Authorization、完整聊天内容和用户隐私的前提下，需要至少提供：

1. 一次失败 Responses 请求的脱敏请求体字段列表。
2. HTTP 状态码和 `Content-Type`。
3. 原始响应前 2KB 和末尾 1KB，文本内容可替换为 `[REDACTED]`。
4. 顶层字段名，或完整 JSON 结构。
5. 如果为 SSE，提供事件类型序列和最后 5 个事件。
6. ginka 使用的模型名称。
7. 连接测试实际 URL、请求体字段和响应结构。
8. 失败响应的 `x-request-id` 或 Relay 请求 ID。
9. ginka 的 Responses 解析代码或期望字段说明。

如果无法提供原始响应，至少需要提供失败时的日志字段：`status`、`content-type`、`output length`、`output types`、`finish_reason`、`incomplete_details`。

## 7. 修复计划

### 阶段 1：增加无敏感信息的诊断上下文

目标：

- 不改变响应兼容行为，只让失败原因可定位。

计划：

- 在 Responses 归一化失败时附加结构化诊断：
  - HTTP 状态。
  - `status`。
  - `incomplete_details`。
  - `output` 数量与各 item type。
  - 文本字段是否存在及长度。
  - `choices` 是否存在。
- 默认不记录完整 prompt、响应正文、Authorization 或聊天内容。
- 保留 request ID。

验收：

- 空结果错误能明确区分“无 output”“只有 reasoning”“incomplete”“非标准包装”“SSE”。

### 阶段 2：建立 Responses 归一化器

目标：

- 将 Relay 差异集中处理，避免调用方直接依赖多种字段。

计划：

- 提取独立的 `normalizeResponsesPayload()`。
- 支持并测试：
  - 顶层 `output_text`。
  - `output[].content[].text`。
  - `output[].content[].refusal`。
  - reasoning 项后的最终 message。
  - `choices[0].message.content` 字符串和内容数组。
- 对外层包装只接受已确认的 Relay 格式，不盲目递归搜索所有字符串。
- 返回值统一为 `{ text, status, incompleteReason, outputTypes, requestId }`。

验收：

- 同一归一化器对标准 OpenAI Responses 和已确认的 Relay 响应产生一致文本。
- 内容数组不会再以非字符串形式返回。

### 阶段 3：显式处理 incomplete、failed 和空正文

目标：

- HTTP 200 不再掩盖上游失败。

计划：

- 在提取文本前检查 `status`、`error`、`incomplete_details`。
- 只有 reasoning 内容时返回明确错误，例如“模型只返回推理内容，未生成最终回答”。
- `max_output_tokens` 耗尽时返回可操作的错误，不用“格式不支持”笼统覆盖。

验收：

- `incomplete` 响应即使 HTTP 200 也能得到准确错误。
- reasoning-only 响应不再被误报为普通格式错误。

### 阶段 4：评估 SSE 支持

目标：

- 确认 Relay 是否实际返回 SSE，再决定实现或明确拒绝。

计划：

- 先记录并收集真实 SSE 样例。
- 如果确认返回 SSE，增加 Responses 事件聚合器：
  - 拼接 `response.output_text.delta`。
  - 识别 `response.completed`。
  - 识别 `response.failed` 和错误事件。
  - 设置流结束和超时保护。
- 如果 Relay 不应返回 SSE，则在错误中明确提示内容类型异常。

验收：

- SSE 不再进入 `JSON.parse`。
- 文本增量完整拼接，完成事件缺失时给出明确错误。

### 阶段 5：强化连接测试

目标：

- 连接测试能提前发现 Responses 适配问题。

计划：

- 连接测试继续使用真实 Responses 生成请求。
- 增加一次嵌套 `output` 解析断言。
- 记录模型、响应类型、status 和 request ID。
- 不把 HTTP 200 或“有响应”单独视为成功，必须得到非空文本。

验收：

- 连接测试可区分鉴权成功、请求成功和响应可解析成功。

### 阶段 6：补充测试夹具

目标：

- 使用真实 Relay 的脱敏响应建立回归测试。

计划：

- 添加 Responses 标准嵌套输出。
- 添加 reasoning + final message。
- 添加 reasoning-only。
- 添加 incomplete。
- 添加 Relay 外层包装。
- 添加 Chat choices 内容数组。
- 添加 SSE 事件流。
- 添加仅有工具调用、无 message 的响应。

验收：

- 每个已确认响应形态都有独立测试。
- 不允许用真实 API Key 或真实聊天正文作为测试夹具。

## 8. 建议实施顺序

1. 先补诊断上下文并从实际 Relay 获取一条失败原始响应。
2. 根据真实响应确认 P0-P4 中的具体原因。
3. 实现 Responses 归一化器。
4. 实现 incomplete、reasoning-only 和工具调用错误分类。
5. 仅在确有 SSE 证据时实现 SSE 聚合。
6. 更新连接测试和回归测试。
7. 使用脱敏真实响应做最终验收。

## 9. 验收标准

- 标准 Responses 响应正常返回非空文本。
- reasoning 项后跟 message 时只提取最终回答。
- reasoning-only 返回明确错误，不显示空结果。
- HTTP 200 的 incomplete 响应返回具体原因。
- Chat choices 字符串和内容数组都被安全归一化为字符串。
- 已确认的 Relay 包装格式可解析。
- SSE 要么被完整支持，要么给出明确、可诊断的错误。
- 日志不包含 API Key、完整 prompt、聊天正文或 Authorization。
- 连接测试验证到响应文本层，不只验证 HTTP 状态。

## 10. 风险与回滚

- 不应为了兼容未知 Relay 而递归抓取任意 `text` 字段，这可能误取 reasoning、工具参数或隐私内容。
- 扩展字段兼容应有真实响应夹具和明确格式边界。
- SSE 支持涉及分片、取消、超时和错误事件，不能只拼接第一条事件。
- 归一化器变更应保持 Chat Completions 行为不变。
- 修复应通过新归一化器和独立测试完成，便于回滚，不应直接把大量条件分支继续堆入 `extractResponsesText`。

## 11. 当前阻塞

当前无法从本地代码唯一确定 ginka 中转站的具体响应形态，原因包括：

- 工作区没有 ginka 源码。
- 没有失败请求的脱敏原始响应。
- 没有真实 Relay 的 `Content-Type`、请求 ID 或 SSE 事件。
- 没有远端凭据，且不应在排查中输出密钥。

在取得上述最小信息前，不能把任一候选原因宣称为最终根因。

## 12. v1.3.2 实施记录

已实现：

- 独立 Responses 归一化路径，支持 `output_text`、标准嵌套 `output[].content[].text`、简化 `output[].text`、字符串 `content`、最终 message 与 Chat `choices` 兜底。
- 有限层级解包 `response`、`data`、`result` Relay 包装，不递归抓取任意文本字段。
- 在读取文本前检查 `status`、`error`、`incomplete_details`；`incomplete`、`failed`、reasoning-only 和工具调用无文本均返回明确错误。
- Responses SSE 聚合，支持增量文本、`response.completed`、`response.incomplete`、`response.failed`、错误事件及完成事件缺失检测。
- Chat Completions 内容数组归一化为字符串，并识别 reasoning-only、长度截断和工具调用。
- 错误诊断只包含状态、输出项类型和安全截断的请求 ID，不包含正文、提示词、Authorization 或密钥。

验证结果：

- `bun run typecheck` 通过。
- `bun run test`：8 个测试文件、32 个测试全部通过。
- 新增 Responses 回归覆盖标准层级、Relay 包装、简化层级、reasoning-only、HTTP 200 incomplete、SSE 聚合和 Chat 内容数组。
- `bun run test:e2e`：开发版与打包版共 2 个 Electron E2E 全部通过。
- `bun run verify:upgrade`：v1.3.1 → v1.3.2 覆盖升级通过，已导入消息、隐私密码、恢复码和加密 API 凭据均保留。

剩余边界：

- 尚未取得 ginka 的真实失败响应，因此本轮是覆盖已复现形态的兼容性加固，不能把某一个候选原因宣称为已由线上响应确认的唯一根因。
- 如果 ginka 返回未包含在本计划中的额外结构，应补充脱敏响应后按同一归一化器增加受控夹具，而不是扩大为任意字符串递归搜索。

## 13. v1.3.3 线上反馈修复

实际反馈显示，Relay 记录为非流式请求，最终错误为：

- `status=incomplete`
- `incomplete_details.reason=max_output_tokens`
- 唯一输出项为 `reasoning`

据此完成：

- Responses 请求体增加 `stream: true`，Accept 优先协商 `text/event-stream`。
- 连接测试输出预算从 16 提升到 1024，避免短测试被 reasoning 全部消耗。
- `max_output_tokens` 被明确耗尽时，自动将预算至少提升到 8192，并最多两次按倍增预算重试，最高 24000。
- 仅对 token 耗尽执行预算重试；其他错误仍按原有逻辑立即返回。
- 新增流式标志、连接测试预算和 token 耗尽重试测试。

该修复解决已确认的请求模式和输出预算问题。若中转站仍返回不同响应形态，需要继续提供脱敏 SSE 事件序列。

## 14. v1.3.4 可配置输入输出预算

根据用户反馈，将固定的输出预算进一步改为模型服务级配置：

- 默认最大输入 350000 tokens，默认最大输出 200000 tokens。
- 设置界面允许用户按模型能力修改两个上限，范围为 1 至 2000000 tokens。
- 旧数据库通过版本 2 迁移自动增加字段并使用默认值，不重建 provider 记录。
- 最终综合分析请求使用配置的输出上限；连接测试仍限制在最多 8192 tokens 的轻量预算。
- token 耗尽重试的最高预算改为 provider 配置值，不再写死 24000。
- 发起请求前对 system、prompt 和图片数量执行保守输入 token 估算，超限时在本地阻止联网。
- 分析预检展示估算输入、输入上限和输出上限。
- 默认请求超时提高到 10 分钟，仍可通过取消操作终止。
