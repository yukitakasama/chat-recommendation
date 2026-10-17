# ChatInsight 项目指令

## GitHub 推送与 Windows 代理 [verified]

- 本仓库远端为 `https://github.com/yukitakasama/chat-recommendation.git`，目标分支为 `main`。
- 当前 Codex harness 可能实际在 WSL2 中执行命令。若 `pwd` 显示 `/mnt/d/...` 或 `uname -s` 返回 `Linux`，不要假设 `/usr/bin/git` 能使用 Windows 侧的 Watt Toolkit 代理。
- Watt Toolkit（`Steam++.exe` / `Steam++.Accelerator.exe`）运行在 Windows 网络栈中。Windows 可以访问 GitHub 时，WSL Git 仍可能报 `Failed to connect to github.com port 443 after 5 ms`。
- 遇到该错误时，不要反复重试、不要重新登录、不要修改 hosts 或系统代理；先验证 Windows 连接：
  `powershell.exe -NoProfile -Command "Test-NetConnection github.com -Port 443"`
- Windows 连接成功后，使用 Windows Git 执行网络操作：
  `powershell.exe -NoProfile -Command 'Set-Location "D:\my-project\chat-recommendation"; git push -u origin main; exit $LASTEXITCODE'`
- GitHub CLI 位于 `C:\Program Files\GitHub CLI\gh.exe`，在 WSL 中可调用 `/mnt/c/Program Files/GitHub CLI/gh.exe`。认证已保存在 Windows keyring，不得输出或记录 token。
- 推送后使用 Windows Git 确认 `HEAD` 与 `origin/main` 相同：
  `powershell.exe -NoProfile -Command 'Set-Location "D:\my-project\chat-recommendation"; git status --short --branch; git rev-parse HEAD; git rev-parse origin/main'`
- 当前远端仓库已经存在并已发布 `v1.0.0`、`v1.2.0`。后续发布前仍须先检查同名仓库、标签和 Release 是否已存在，禁止覆盖或删除已有对象。

## 打包与 Electron 缓存 [verified]

- 在 WSL 中调用 Windows `electron-builder` 时，WSL 侧临时环境变量不保证传入 Windows 子进程；需要在 PowerShell 内使用 `Set-Item -Path "Env:NAME" -Value "..."`。
- 本机 Electron 完整缓存位于 `C:\Users\yuki\AppData\Local\electron\Cache\3515b5b0ff3044aacdce800952e6d9c13664feaaa7ce01a8926366571150d4fb\electron-v44.9.0-win32-x64.zip`。
- Watt Toolkit 证书链下，使用 Windows Node 24 的 `--use-system-ca` 可避免 `unable to verify the first certificate`。
- 若 electron-builder 因默认 GitHub 下载而长时间无进展，直接通过 `--config.electronDist=<本地完整 ZIP>` 指定缓存，或在 PowerShell 内设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- 打包完成后运行 `bun run test:e2e`，确认打包版 `app:get-state` 返回目标版本，并检查 `resources/app.asar.unpacked` 中包含新增原生依赖。
