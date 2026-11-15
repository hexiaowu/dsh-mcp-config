# MCP Config

在 DeepSeek Harness 中集中管理 MCP 连接，并把本机其他 agent / IDE 已经配置好的 MCP 服务器一键导入 DSH。

npm: [`@hexiaowu/dsh-mcp-config`](https://www.npmjs.com/package/@hexiaowu/dsh-mcp-config)

## 安装

要求 DSH `>=0.2.2-rc.1 <0.3.0`（对应 `package.json` 的 `engines.dsh`）。

**图形界面**：`设置 → 插件`，搜索 `@hexiaowu/dsh-mcp-config` 安装；装完在 `设置 → MCP 配置` 打开页面。

**命令行**：用 DSH 的启动器 `dsh`（Desktop 安装包里在 `runtime/cli/bin/dsh`，没加进 PATH 时用完整路径），把包装进指定 profile：

```bash
dsh plugin --profile desktop add @hexiaowu/dsh-mcp-config
```

`desktop` 换成你自己的 profile 名；`desktop` profile 只能由 Desktop 自带的 `dsh` 管理，npm 全局装的那个会直接拒绝。这条命令等于在 profile 目录里执行 `pnpm add`，装完 DSH 会自动把声明了 `dsh.bundle` 的依赖加入该 profile 的 bundle 列表，不用手改 `package.json`。重启 DSH 后入口出现在 `设置 → MCP 配置`。

**本地开发**：用 `link:` 指向工作目录，改完重启 DSH 生效：

```bash
dsh plugin --profile desktop add link:$PWD
```

**卸载**：先删掉 profile 里保存的配置行，再移除包：

```bash
# 删掉 ~/.dsh/profiles/desktop/cordis.patch.yml 中以 `- id: mcp-config` 开头的那一整段
dsh plugin --profile desktop remove @hexiaowu/dsh-mcp-config
```

那一行是本插件写入的配置，里面存着你添加的 MCP 服务；不先删会留下一条指向已卸载模块的空行。

## 功能

- **DSH 已接入**：列出由本插件管理的 MCP 服务，可新增、编辑、启停、删除；同一列表还会显示 profile 里直接声明的 `@deepseek-ai/dsh-mcp-client` 行（只读）。
- **从其他工具导入**：扫描本机常见 agent / IDE 的 MCP 配置，按来源分组展示；每个服务器右侧有「导入 DSH」按钮。
- **重复保护**：如果 DSH 里已经有连接参数完全相同的 MCP（不比较名称、超时和启停状态），按钮显示「已导入」并禁用。
- **名称冲突处理**：导入时如果名称已被占用，会自动生成 `name-2` 这样的可用名称。

导入的服务器由本插件挂载为 `@deepseek-ai/dsh-mcp-client` 子插件，因此模型的工具名与原生配置一致：`mcp__<serverName>__<tool>`。配置保存在当前 profile 的 `cordis.patch.yml` 中，随 profile 持久化。

## 支持扫描的来源

| 来源 | 位置 |
|---|---|
| Claude Code | `~/.claude.json`（全局与项目级 `mcpServers`） |
| Claude Desktop | `claude_desktop_config.json` |
| Codex | `~/.codex/config.toml`（`[mcp_servers.*]`） |
| Gemini CLI | `~/.gemini/settings.json` |
| Cursor | `~/.cursor/mcp.json`、Cursor User `mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code / Insiders | User `mcp.json`（`servers`） |
| Cline / Roo Code / Kilo Code | VS Code globalStorage 下的 `mcp_settings.json` |
| Zed | `settings.json`（`context_servers`） |
| Continue | `~/.continue/config.json` |
| OpenCode | `opencode.json`（`mcp`） |
| Crush | `crush.json`（`mcp`） |
| Factory Droid | `~/.factory/mcp.json` |
| Lingma / Kiro / Amazon Q / Trae / Qoder / CodeBuddy | 各自的 `mcp.json` |
| GitHub Copilot (JetBrains) | `~/.config/github-copilot/intellij/mcp.json` |
| ZCode | `~/.zcode/cli/config.json`（`mcp.servers`） |
| Grok CLI | `~/.grok/config.toml` |

扫描是只读的，不会修改其他工具的任何文件。JSONC（注释、尾逗号）与 Codex 的 TOML 子集都支持。SSE 配置会显示但标记为不支持，因为 DSH 的 MCP 客户端只支持 stdio 与 Streamable HTTP。

## 使用

1. 安装后在 **设置 → MCP 配置** 打开页面。
2. 上方的「DSH 已接入」是本插件管理的服务器；点「新增 MCP」手动添加，或对已有项点「编辑」「删除」。新增/编辑使用无全屏遮罩的浮层表单，下方列表保持可见；删除确认也是同样的小浮层。
3. 下方的「其他软件配置的 MCP」按来源分组，默认收起；点来源标题展开，再点右侧「导入 DSH」即可写入配置并立即尝试连接。
4. 外部配置只在第一次进入页面或手动点「重新扫描」时读取；新增/编辑/删除 MCP 后只刷新列表，不会重新读外部文件。页面会显示上次扫描时间。

## 安全说明

- 页面 RPC 走 `ctx.connection` 的 owner-only 通道；非 owner 的 API/远程调用会收到 403。
- 导入时会把外部配置里的 `env` / `headers` 原样写入当前 profile 配置（明文，文件权限 0600）。外部条目在浏览器端只显示摘要与环境变量数量，不传输具体值。
- 插件不会读取或改写其他工具的配置文件，也不会把 profile patch 整体重写；写入统一经过 `ctx.configEditor`。

## 已知限制

- 由 profile 直接声明的 `@deepseek-ai/dsh-mcp-client` 行在页面中只读（可查看，不可在本页删除或修改）。通过本插件新增的 MCP 支持完整增删改。
- SSE 传输不支持导入。
- 目前扫描用户级配置，不扫描每个项目的 `.mcp.json`（Claude Code 的 `projects` 内嵌配置除外）。
- 依赖 DSH 自带的 `@deepseek-ai/dsh-mcp-client`；插件从安装目录解析它，不额外安装依赖。

## 开发

```bash
node --test test/*.test.mjs
```

包结构：

- `lib/model.js` — 服务器归一化、指纹、名称与 `dsh-mcp-client` 配置转换
- `lib/scan.js` — 外部来源目录与扫描
- `lib/jsonc.js` / `lib/toml.js` — 配置解析
- `lib/plugin.js` — Host 插件、子 MCP 挂载、RPC
- `client.js` — 设置页

## 发布

发布走 `.github/workflows/publish.yml`，用 npm Trusted Publishing（GitHub OIDC），仓库里不存 `NPM_TOKEN`。

npm 没有“预配置”机制：包必须先存在于 registry，才能配置 Trusted Publisher。所以**第一次发布要手动做一次**：

1. 首次发布（只需一次）：本地 `npm login` 后执行 `npm publish --access public`。
2. 在 npm 配置 Trusted Publisher：包 `@hexiaowu/dsh-mcp-config` → Settings → Trusted Publisher → GitHub Actions，填 owner `hexiaowu`、repository `dsh-mcp-config`、workflow filename `publish.yml`、environment 留空。
3. 之后每次发布：改 `package.json` 的 `version`，提交，打 `v<version>` 形式的 tag（例如 `v0.1.0`），发 GitHub Release —— workflow 会跑测试、校验 tag 与版本一致，然后 `npm publish --access public`，provenance 由 OIDC 自动生成。

已经发布过的版本会被跳过，tag 与 `package.json` 版本不一致则直接失败。也可以在 Actions 页面手动 `Run workflow` 并填一个已有 tag。

## License

MIT
