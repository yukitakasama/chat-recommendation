# ChatInsight v1.3.2

## 修复

- 增强 Responses API 响应归一化，兼容标准 `output[].content[].text`、简化 `output[].text`、字符串 `content`、外层 `response`/`data`/`result` 包装及 Chat Completions 内容数组兜底。
- 增加 Responses SSE 聚合，支持 `response.output_text.delta`、`response.completed`、`response.incomplete`、`response.failed` 和错误事件，避免将 SSE 误判为非 JSON。
- HTTP 200 但状态为 `incomplete`、`failed` 或尚未完成时，现在返回具体错误，而不是笼统的“格式不受支持或内容为空”。
- reasoning-only、工具调用无文本、Chat Completions 长度截断等场景会给出可操作的错误说明。
- 错误诊断仅包含状态、输出项类型和脱敏请求 ID，不包含提示词、聊天正文、API 密钥或 Authorization。
- 连接测试继续验证非空文本层，确保鉴权成功不会被误判为完整可解析响应。

## 兼容性

- 继续支持 OpenAI 兼容 Chat Completions 和 Responses API。
- 未更改数据库结构、保险库格式、隐私密码或恢复码存储方式。
- 覆盖安装继续使用 v1.3.0 引入的原子数据目录保护策略。

## 验证

- TypeScript 严格类型检查。
- 单元测试覆盖标准 Responses、reasoning + final、reasoning-only、incomplete、Relay 包装、简化文本层级、SSE 聚合和 Chat Completions 内容数组。
- Electron E2E 覆盖打包版启动、原生保险库模块和版本校验。
- 真实 NSIS 覆盖升级测试覆盖 v1.3.1 → v1.3.2 的已导入消息、隐私密码、恢复码和加密 API 凭据保留。

## 升级说明

- 关闭正在运行的 ChatInsight，使用 v1.3.2 安装包覆盖安装到 v1.3.1 的同一目录。
- 覆盖更新存在旧保险库时不能更换安装目录。
- 若安装过程被中断，请按安装器提示保留更新备份并重新运行安装器。
