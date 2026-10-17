# 聊天洞察 ChatInsight

聊天洞察是一个仅面向 Windows 10 22H2 / Windows 11 x64 的本地优先聊天分析桌面应用。它把多好友聊天、图片、截图、人设、回复风格和分析历史保存在应用密码保护的加密保险库中；只有用户明确发起联网操作时，选定内容才会发送到用户配置的 OpenAI 兼容模型端点。

## 已实现能力

- 多好友与批次导入：QQ TXT/MHT/MHTML/HTML/JSON/CSV、通用结构化记录、图片和聊天截图。
- QQChatExporter 资源适配：自动解析 JSON 中的图片、文件与市场表情引用，并从 `resources`、`sticker-packs` 读取对应本地资源。
- “复制”与“移动”导入；重名不同内容保留两份，相同 SHA-256 文件复用加密 Blob。
- “恋爱建议”和“应付工作”内置模式；支持创建声明式自定义模式。
- 多人设新建、编辑、复制、删除与每次分析自由选择。
- JSON 与 Markdown/SKILL.md 风格导入；从全部好友或指定好友的本人消息生成风格。
- Chat Completions 与 Responses API 双协议；文本和视觉模型分别配置。
- 全量历史分块摘要、近期原文、图片/表情观察、PDF 与文本附件提取和证据引用；多批次调用前预检与独立授权。
- 加密分析历史、Markdown/JSON 导出、锁定保险库与系统锁屏自动锁定。
- 便携 ZIP 与每用户 NSIS 安装包。

## 安全模型

- 保险库使用随机 256 位主密钥；应用密码和一次性恢复码分别经 scrypt 包装主密钥。
- SQLCipher 加密数据库，图片和源文件以 AES-256-GCM 独立加密。
- 渲染进程无 Node 权限，模型密钥和网络请求只存在于 Electron 主进程。
- 不包含遥测、云同步、自动更新或静默模型调用。
- 图片、表情和截图默认不参与分析。每次上传视觉资源都显示端点、数量和用途并要求确认。
- 文件附件默认不读取正文。开启后文本、网页和 PDF 在本地解密提取，发送前再次确认端点与文件数量。
- 忘记密码且丢失恢复码时，数据无法恢复。恢复码只在建库时显示一次。
- Markdown/JSON 导出是明文文件，导出前应自行确认保存位置。

应用数据固定存放在程序 exe 同级 `data` 目录。目录不可写时应用会阻止创建保险库，不会静默回退到 AppData。便携使用时关闭应用后复制整个程序目录；安装版默认采用每用户安装，安装目录可自行选择，但同样必须可写。

## 隐私边界

聊天记录可能包含第三方隐私。导入前应确认你有权处理这些内容。关系判断是有限证据下的行为信号推断，不是心理诊断或事实认定。应用基础边界禁止操控、胁迫、冒充、情感勒索和无视明确拒绝；人设中的边界说明不能关闭这些基础约束。

## 导入格式

支持范围和字段映射见 [docs/IMPORT_FORMATS.md](docs/IMPORT_FORMATS.md)。QQ 私有消息数据库 `.db`、QQ 备份文件 `.bak`、微信数据库和自动读取其他应用数据目录不在首版范围内。

真实 QQ 导出格式会随版本变化。解析器适配应以脱敏样本和夹具为准，不能仅凭文件名判断兼容性。

## 风格 Skill

JSON schema、Markdown 约定和示例见 [docs/STYLE_SKILL.md](docs/STYLE_SKILL.md)。导入的 Skill 被当作纯文本规则，不执行脚本、宏或外部命令。

## 开发环境

- Windows 10 22H2 或 Windows 11 x64
- Bun 1.3+
- Node.js 22+

```bash
bun install
bun run dev
```

若 Electron 官方二进制下载受网络影响，安装脚本默认使用 npmmirror；可在执行前覆盖：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ bun install
```

## 验证与构建

```bash
bun run typecheck
bun run test
bun run test:e2e
bun run benchmark:import
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ bun run dist
```

- `bun run test`：加密、解析器、公共 schema 和双协议模型网关单元测试。
- `bun run test:e2e`：真实 Electron 中建库、通过 IPC 导入、加密落盘、模拟模型分析、历史结果渲染与明文泄漏检查。
- `bun run verify:qqchat <JSON路径>`：用真实 QQChatExporter 导出核对发送者、资源引用、贴纸映射与缺失资源告警。
- `bun run benchmark:import`：合成 50,000 条消息和 500 张图片，验证本地解析、哈希、加密和提交耗时。
- `bun run dist`：生成 `release` 下的便携 ZIP 与 NSIS 安装包。

首次运行需要创建应用密码并保存恢复码。进行模型分析前，请在“设置 → 模型服务”中填入 Base URL、API 密钥、文本模型，以及需要图片分析时使用的视觉模型。

## 发布注意

当前仓库不包含 Windows 代码签名证书。未签名构建在部分设备上会触发 SmartScreen 未知发布者提示。正式分发前应补充代码签名、干净虚拟机验收与真实 QQ 脱敏样本回归。
