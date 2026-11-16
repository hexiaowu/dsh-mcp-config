# dsh-mcp-config

[![npm](https://img.shields.io/npm/v/@hexiaowu/dsh-mcp-config.svg)](https://www.npmjs.com/package/@hexiaowu/dsh-mcp-config)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/hexiaowu/dsh-mcp-config/blob/main/LICENSE)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.1%20%3C0.3.0-2f7cf6)

在 DeepSeek Harness 里集中管理 MCP 连接：把本机其他 agent / IDE 已经配好的 MCP 搬进来，也能直接在页面上新建、编辑、启停。

## 它能做什么

- **一个页面看全**：本插件管理的 MCP，以及 profile 里直接声明的 `@deepseek-ai/dsh-mcp-client` 行，都列在同一处。
- **从别的工具搬**：扫描 25 个常见客户端（Claude Code、Codex、Cursor、VS Code、ZCode 等）的配置，点一下就导入，不用手抄命令、参数和环境变量。
- **不用手改 YAML**：新增、编辑、启停、删除都在页面上完成，结果写回当前 profile 的 `cordis.patch.yml`。
- **工具名与原生一致**：导入的服务器挂载为 `@deepseek-ai/dsh-mcp-client` 子插件，模型看到的仍是 `mcp__<名称>__<工具>`。

## 快速开始

1. 安装（见下一节）。
2. 打开 `设置 → MCP 配置`。
3. 在下方「其他软件配置的 MCP」里展开一个来源，点右侧「导入 DSH」；或点「新增 MCP」自己填。

导入或保存后立即生效，不需要重启 DSH（安装插件本身要重启一次）。

## 安装

要求 DSH `>=0.2.2-rc.1 <0.3.0`（对应 `package.json` 的 `engines.dsh`）。包发布在 npm，按包名从 npm 拉取。

用 DSH 的启动器 `dsh` 把包装进指定 profile（`dsh` 没加进 PATH 时用完整路径调用）：

```bash
dsh plugin --profile desktop add @hexiaowu/dsh-mcp-config
```

装完重启一次 DSH，入口出现在 `设置 → MCP 配置`。


## 页面怎么用

页面顶部是操作区，下面是两个数据区块：

| 区域 | 内容 |
| --- | --- |
| 顶部操作区 | 说明文字、`重新扫描`、`新增 MCP` |
| **DSH 已接入** | 本插件管理的 MCP，一行一个；下方还会列出 profile 直接声明的 mcp-client 行（带「只读」徽标） |
| **其他软件配置的 MCP** | 按来源分组，默认收起；标题行显示来源名、配置文件路径、服务器数量 |

两个数据区块的每一行都长得不太一样：

- **DSH 已接入**：名称、传输方式（`stdio` / `HTTP`）、状态、工具数（连上且有工具时）、启动摘要（命令参数或 URL）、来源（导入来的会标出「ZCode · config.json」这类出处）、环境变量 / 请求头数量；右侧是启停开关、`编辑`、`删除`。
- **其他软件配置的 MCP**：名称、传输方式、环境变量数量、摘要；来源里禁用的条目带「已禁用」标签，不能导入的会写明原因。

### 状态含义（仅「DSH 已接入」的行）

| 标签 | 含义 | 通常要做什么 |
| --- | --- | --- |
| 已启用 | 已挂载；后面跟着工具数标签说明工具已注册 | — |
| 已启用 +「正在连接，或该服务器没有工具」 | 挂载成功，但工具列表还是空的 | 稍等并刷新；也可能这个 MCP 本身没有暴露工具 |
| 已停用 | 配置保留，不连接、不注册工具 | 右侧开关打开即可 |
| 启动失败 | 挂载时报错，行内会给出原因 | 检查命令能否执行、URL 是否可达、环境变量是否齐全 |

## 操作指南

### 从其他工具导入 MCP

1. 展开下方对应的来源。
2. 找到要导入的服务器，点右侧「导入 DSH」。
3. 连接参数完全相同的 MCP 已经存在时，按钮显示「已导入」并禁用，避免重复挂载。
4. 名称被占用时，条目上会先提示「名称冲突，将导入为 `name-2`」；导入完成的提示里也会告诉你最终名称。

导入会把对方配置里的 `env` / `headers` 原样写进当前 profile（明文，权限 0600）。环境变量在本机没有值时条目上会提示「缺少环境变量」，带 `${VAR}` 占位符的会单独标出。

### 新增 MCP

点「新增 MCP」，表单字段如下：

| 字段 | 说明 |
| --- | --- |
| 名称 | 必填；字母、数字、下划线、短横线，最长 32 位。工具名会以 `mcp__<名称>__` 开头 |
| 传输方式 | `stdio`（本地进程）或 Streamable HTTP |
| 命令 | stdio 必填，例如 `npx`、`uvx`，或可执行文件的绝对路径 |
| 参数 | 可选；每行一个，也可以直接粘贴 JSON 数组 |
| 环境变量 | 可选；每行 `KEY=VALUE`，会明文保存在 profile 配置里 |
| 工作目录 | 可选；stdio 服务的启动目录 |
| 服务地址 | HTTP 必填；http(s) URL |
| 请求头 | 可选；每行 `Key: Value` |
| 单次调用超时 | 可选；毫秒，默认 60000 |
| 启动失败时拒绝激活 | 默认关；开启后这个服务起不来会让整个 DSH 激活失败 |
| 启用 | 编辑时才有；关掉即保留配置但不连接、不注册工具 |

### 编辑、启停、删除

- 每行右侧的开关即时启停，配置不变；开关和「编辑 / 删除」同一套控件，浅色深色主题下表现一致。
- 启停是即时的：只有被点的那一行在等 Host 返回，其它行、顶部按钮照常可用；同一行的「编辑 / 删除」也不会被这次写入挡住（删除会把还没发出的写入直接作废）。成功不弹右下角提示（开关、状态标签、工具数已经就地变了），失败才回滚开关并提示。
- 连点不会丢：150ms 内的连续点击会合并成一次写入；点回原状态则完全不写。写配置会让 DSH 重启本插件，所以合并也顺带减少了重启次数。
- 「编辑」打开同一个表单，保存即生效。
- 「删除」会先弹确认；确认后对应的 MCP 工具立刻从 DSH 移除。

### 重新扫描

外部配置只在进入页面时读一次，之后新增 / 编辑 / 删除只刷新列表。想重新读取其他工具的最新配置，点顶部「重新扫描」

## 支持的来源

扫描的都是用户级配置，只读，不会改动对方的文件。表里的占位符：

- `<appSupport>`：macOS `~/Library/Application Support`，Linux `$XDG_CONFIG_HOME` 或 `~/.config`，Windows `%APPDATA%`
- `<configHome>`：`$XDG_CONFIG_HOME` 或 `~/.config`（Windows 下为 `%USERPROFILE%\.config`）
- `<vscodeUser>`：`<appSupport>/Code/User`（Insiders 用 `Code - Insiders`）

| 来源 | 配置文件 | 读取的键 |
| --- | --- | --- |
| Claude Code | `~/.claude.json` | `mcpServers`，外加 `projects.<路径>.mcpServers`（最多 50 个项目） |
| Claude Desktop | `<appSupport>/Claude/claude_desktop_config.json` | `mcpServers` |
| Codex | `~/.codex/config.toml` | `[mcp_servers.*]` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` |
| Cursor | `~/.cursor/mcp.json`、`<appSupport>/Cursor/User/mcp.json`、`<configHome>/Cursor/User/mcp.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json`、`<appSupport>/Codeium/windsurf/mcp_config.json` | `mcpServers` |
| Cline | `<vscodeUser>/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `mcpServers` |
| Roo Code | `<vscodeUser>/globalStorage/rooveteranking.roo-cline/settings/mcp_settings.json` | `mcpServers` |
| Kilo Code | `<vscodeUser>/globalStorage/kilocode.kilo-code/settings/mcp_settings.json` | `mcpServers` |
| VS Code | `<vscodeUser>/mcp.json` | `servers`，没有则回退 `mcpServers` |
| VS Code Insiders | `<appSupport>/Code - Insiders/User/mcp.json` | `servers` |
| Zed | `<configHome>/zed/settings.json`、`<appSupport>/Zed/settings.json` | `context_servers` |
| Continue | `~/.continue/config.json` | `mcpServers`（对象或数组都支持） |
| OpenCode | `<configHome>/opencode/opencode.json`、`<appSupport>/opencode/opencode.json` | `mcp` |
| Crush | `<configHome>/crush/crush.json`、`<appSupport>/crush/crush.json` | `mcp` |
| Factory Droid | `~/.factory/mcp.json` | `mcpServers` |
| Lingma | `~/.lingma/lingma_mcp.json`、`~/.lingma/extension/local/mcp.json` | `mcpServers` |
| Kiro | `~/.kiro/settings/mcp.json` | `mcpServers` |
| Amazon Q | `~/.aws/amazonq/mcp.json` | `mcpServers` |
| GitHub Copilot (JetBrains) | `<configHome>/github-copilot/intellij/mcp.json`、`<appSupport>/github-copilot/intellij/mcp.json` | `servers` |
| Trae | `<appSupport>/Trae/User/mcp.json` | `mcpServers` |
| Qoder | `<appSupport>/Qoder/User/mcp.json` | `mcpServers` |
| CodeBuddy | `<appSupport>/CodeBuddy/User/mcp.json` | `mcpServers` |
| ZCode | `~/.zcode/cli/config.json`、`~/.zcode/v2/config.json`、`~/.zcode/config.json` | `mcp.servers`，没有则回退 `mcpServers` |
| Grok CLI | `~/.grok/config.toml` | `[mcp_servers.*]` |

JSONC（注释、尾逗号）和 Codex 的 TOML 子集都能解析。SSE 传输的条目会显示但标为不支持——DSH 的 MCP 客户端只支持 stdio 与 Streamable HTTP。

## 常见问题

**页面顶部出现红色横幅「无法加载 @deepseek-ai/dsh-mcp-client」**
插件从 DSH 安装目录解析这个包。出现这条说明当前安装里没有它（例如把插件装到了缺这个包的环境），已配置的 MCP 不会启动。

**某一行显示「启动失败」**
行内会带失败原因，常见是命令不存在（`npx` 不在 PATH）、URL 不可达、环境变量缺失。改完保存会重新挂载。

**一直显示「正在连接，或该服务器没有工具」**
挂载成功但工具列表为空：可能服务启动慢，也可能它本来就没有暴露工具。

**「已导入」按钮为什么是灰的**
DSH 里已经有一个连接参数完全相同的 MCP。比较时只看传输方式，以及命令 / 参数 / 环境变量 / 工作目录，或 URL / 请求头；不看名称、超时和启停状态。

**某些行带「只读」徽标**
那是 profile 里直接声明的 `@deepseek-ai/dsh-mcp-client` 行，不归本插件管理；要改就改 profile 配置。

**为什么有的条目显示「不支持」**
SSE 传输目前不支持导入；缺启动命令、缺 URL、无法识别传输方式的条目同样不能导入。

**页面提示「configEditor 不可用」**
当前部署不允许修改 profile 配置，页面只能查看。

**想彻底卸载**
先在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里删掉以 `- id: mcp-config` 开头的那一整段，再执行：

```bash
dsh plugin --profile desktop remove @hexiaowu/dsh-mcp-config
```

那一整段就是这个插件的配置，里面存着你加的所有 MCP；卸载插件包不会动它，删掉等于一起删了。重启 DSH 生效。

## 数据与安全

- 配置写在当前 profile 的 `cordis.patch.yml`，随 profile 持久化；文件权限 0600，`env` / `headers` 是明文。
- 浏览器端只看摘要与环境变量 / 请求头数量，不传输具体值；导入时由 Host 读取文件并写入。
- 页面接口挂在 DSH 的 `connection` 服务上：Host / Origin 不在信任名单内返回 403，没有浏览器会话或 API token 返回 401。
- 插件不会改写其他工具的配置文件，也不会整体重写 profile patch；写入统一经过 `ctx.configEditor`。

## 已知限制

- profile 直接声明的 `@deepseek-ai/dsh-mcp-client` 行在页面里只读。
- SSE 传输不支持导入。
- 只读上表列出的用户级配置文件，不会去各项目目录里翻 `.mcp.json`。Claude Code 存在 `~/.claude.json` 里 `projects` 下的项目级配置会被读到（最多 50 个项目）。
- 依赖 DSH 自带的 `@deepseek-ai/dsh-mcp-client`，插件从安装目录解析它，不额外安装依赖。

## 反馈

遇到问题、想加一个扫描来源，或者发现某个客户端的配置路径不对，去 [Issues](https://github.com/hexiaowu/dsh-mcp-config/issues) 提。

## License

MIT
