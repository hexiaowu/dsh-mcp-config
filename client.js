window.__ModuleLoader__.load({
  id: '@hexiaowu/dsh-mcp-config',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'mcp-config'
    const RPC_CHANNEL = '/api'
    const RPC_ENDPOINT = 'mcp-config.rpc'
    /** Longest a mutation may keep its own control marked busy (see `withPending`). */
    const MUTATION_LOCK_MS = 20000
    /**
     * Quiet window before a toggle write leaves for the Host. A profile write
     * restarts this plugin, so a double click inside this window collapses into
     * one write (or none at all when the user lands back on the original state).
     */
    const TOGGLE_SETTLE_MS = 150

    const zh = {
      nav: 'MCP 配置',
      title: 'MCP 配置',
      intro: '集中管理 DSH 的 MCP 连接，并从本机其他 agent / IDE 导入已有的 MCP 配置。',
      refresh: '重新扫描',
      add: '新增 MCP',
      loading: '正在读取 MCP 配置…',
      retry: '重试',
      empty: '暂无数据',
      'dsh.title': 'DSH 已接入',
      'dsh.empty': '还没有接入任何 MCP。从下方导入，或点击「新增 MCP」。',
      'dsh.profileNote': '这些服务器由 profile 直接配置，在本页只读。',
      'dsh.profileRows': 'profile 直接配置',
      'dsh.readonly': '只读',
      'external.title': '其他软件配置的 MCP',
      'external.scanned': '已检查 {count} 个配置文件',
      'external.scannedAt': '上次扫描 {time}',
      'external.empty': '没有在本机发现其他软件的 MCP 配置。已检查 Claude Code、Codex、Gemini CLI、ZCode、Cursor、VS Code 等常见位置。',
      'external.scanFailed': '扫描失败：{message}',
      'external.parseFailed': '读取失败：{message}',
      'external.secretNote': '导入会把外部配置里的 env / headers 原样写入当前 profile（明文，文件权限 0600）。包含数据库密码等敏感值时，请确认这是你希望保留的副本。',
      'external.disabled': '已禁用',
      'external.errorTag': '读取失败',
      'external.error': '配置文件解析失败',
      'import.action': '导入 DSH',
      'import.imported': '已导入',
      'import.importing': '导入中…',
      'import.unsupported': '不支持',
      'import.renamed': '名称冲突，将导入为 {name}',
      'import.placeholder': '包含变量占位符：{value}',
      'unsupported.sse': 'SSE 传输不受支持',
      'unsupported.missing-command': '缺少启动命令',
      'unsupported.missing-url': '缺少服务地址',
      'unsupported.unknown': '无法识别传输方式',
      'import.envMissing': '缺少环境变量：{value}',
      'status.enabled': '已启用',
      'status.disabled': '已停用',
      'status.error': '启动失败',
      'dsh.connecting': '正在连接，或该服务器没有工具',
      'tag.stdio': 'stdio',
      'tag.http': 'HTTP',
      'tag.profile': 'profile',
      'toolCount': '{count} 个工具',
      'envCount': '{count} 个环境变量',
      'edit': '编辑',
      'delete': '删除',
      'enable': '启用',
      'disable': '停用',
      'form.newTitle': '新增 MCP',
      'form.editTitle': '编辑 MCP',
      'form.name': '名称',
      'form.nameHint': '字母、数字、下划线和短横线，最长 32 位。工具名会以 mcp__<名称>__ 开头。',
      'form.transport': '传输方式',
      'form.command': '命令',
      'form.commandHint': '例如 npx、uvx 或可执行文件的绝对路径。',
      'form.args': '参数',
      'form.argsHint': '每行一个参数，也可以粘贴 JSON 数组。',
      'form.env': '环境变量',
      'form.envHint': '每行 KEY=VALUE。值会明文保存在 DSH profile 配置中。',
      'form.cwd': '工作目录',
      'form.cwdHint': '可选。stdio 服务的启动目录。',
      'form.url': '服务地址',
      'form.urlHint': '例如 https://example.com/mcp。',
      'form.headers': '请求头',
      'form.headersHint': '每行 Key: Value。',
      'form.timeout': '单次调用超时（毫秒）',
      'form.failFast': '启动失败时拒绝激活',
      'form.failFastHint': '默认关闭：服务器不可用时只影响它自己的工具，不影响 DSH 启动。',
      'form.enabled': '启用',
      'form.enabledHint': '关闭后保留配置，但不连接、不注册工具。',
      close: '关闭',
      'form.cancel': '取消',
      'form.save': '保存',
      'form.saving': '保存中…',
      'form.secretsNote': '环境变量和请求头会写入 profile 配置，请确认没有不该落盘的临时凭据。',
      'confirm.title': '删除 MCP',
      'confirm.body': '确定删除「{name}」吗？对应的 MCP 工具会立即从 DSH 中移除。',
      'confirm.cancel': '取消',
      'confirm.delete': '删除',
      'confirm.deleting': '删除中…',
      'toast.imported': '已导入「{name}」',
      'toast.importedRenamed': '已导入为「{name}」',
      'toast.added': '已添加「{name}」',
      'toast.updated': '已更新「{name}」',
      'toast.removed': '已删除「{name}」',
      'toast.refreshFailed': '已保存，但刷新列表失败：{message}',
      'toast.slow': 'Host 响应超时，已重新读取配置。',
      'error.invalid-name': '名称不合法：只能包含字母、数字、下划线和短横线，最长 32 位。',
      'error.duplicate-name': '名称「{name}」已被占用，请换一个。',
      'error.unsupported-transport': '这个 MCP 使用 DSH 不支持的传输方式（例如 SSE），无法直接导入。',
      'error.missing-command': 'stdio 服务需要一个启动命令。',
      'error.missing-url': 'HTTP 服务需要一个 http(s) 地址。',
      'error.invalid-server': 'MCP 配置格式不正确。',
      'error.config-unavailable': '当前部署无法写入 profile 配置（configEditor 不可用），本页只能查看。',
      'error.not-found': '这个 MCP 已不存在，请刷新后重试。',
      'error.import-not-found': '外部配置已经变化，请重新扫描后再导入。',
      'error.already-imported': 'DSH 里已经有完全相同的 MCP 配置。',
      'error.mcp-module-unavailable': '无法加载 @deepseek-ai/dsh-mcp-client，已配置的 MCP 不会启动。',
      'error.unknown-endpoint': '插件版本不匹配，请重新加载页面。',
      'error.internal': '操作失败：{message}',
      'error.timeout': 'Host 没有响应（超时），已重新读取配置。',
      'client.name': '名称不合法：只能包含字母、数字、下划线和短横线，最长 32 位。',
      'client.command': '请填写启动命令。',
      'client.url': '请填写以 http:// 或 https:// 开头的服务地址。',
      'client.timeout': '超时必须是 1 到 3600000 之间的整数毫秒。',
      'client.unknown': '操作失败，请重试。',
    }

    const en = {
      nav: 'MCP Config',
      title: 'MCP Config',
      intro: 'Manage DSH MCP connections and import MCP servers already configured in other agents and IDEs.',
      refresh: 'Rescan',
      add: 'Add MCP',
      loading: 'Reading MCP configuration…',
      retry: 'Retry',
      empty: 'No data',
      'dsh.title': 'Connected in DSH',
      'dsh.empty': 'No MCP server is connected yet. Import one below, or choose “Add MCP”.',
      'dsh.profileNote': 'These servers are configured directly by the profile and are read-only here.',
      'dsh.profileRows': 'Configured by the profile',
      'dsh.readonly': 'Read-only',
      'external.title': 'MCP configured in other tools',
      'external.scanned': 'Checked {count} configuration files',
      'external.scannedAt': 'Scanned {time}',
      'external.empty': 'No MCP configuration was found in other tools. Common locations for Claude Code, Codex, Gemini CLI, ZCode, Cursor, and VS Code were checked.',
      'external.scanFailed': 'Scan failed: {message}',
      'external.parseFailed': 'Could not read: {message}',
      'external.secretNote': 'Importing copies env values and headers into the current profile as plain text (file mode 0600). Review the copy when the source contains database passwords or other secrets.',
      'external.disabled': 'Disabled',
      'external.errorTag': 'Parse error',
      'external.error': 'Could not parse this configuration file',
      'import.action': 'Import to DSH',
      'import.imported': 'Imported',
      'import.importing': 'Importing…',
      'import.unsupported': 'Unsupported',
      'import.renamed': 'Name conflict; will import as {name}',
      'import.placeholder': 'Contains placeholders: {value}',
      'unsupported.sse': 'SSE transport is not supported',
      'unsupported.missing-command': 'No command',
      'unsupported.missing-url': 'No URL',
      'unsupported.unknown': 'Unknown transport',
      'import.envMissing': 'Missing environment variables: {value}',
      'status.enabled': 'Enabled',
      'status.disabled': 'Disabled',
      'status.error': 'Failed to start',
      'dsh.connecting': 'Connecting, or this server exposes no tools',
      'tag.stdio': 'stdio',
      'tag.http': 'HTTP',
      'tag.profile': 'profile',
      'toolCount': '{count} tools',
      'envCount': '{count} env vars',
      'edit': 'Edit',
      'delete': 'Delete',
      'enable': 'Enable',
      'disable': 'Disable',
      'form.newTitle': 'Add MCP',
      'form.editTitle': 'Edit MCP',
      'form.name': 'Name',
      'form.nameHint': 'Letters, digits, underscores, and hyphens; up to 32 characters. Tools appear as mcp__<name>__.',
      'form.transport': 'Transport',
      'form.command': 'Command',
      'form.commandHint': 'For example npx, uvx, or an absolute executable path.',
      'form.args': 'Arguments',
      'form.argsHint': 'One argument per line, or paste a JSON array.',
      'form.env': 'Environment',
      'form.envHint': 'One KEY=VALUE per line. Values are stored as plain text in the DSH profile configuration.',
      'form.cwd': 'Working directory',
      'form.cwdHint': 'Optional. The stdio server’s start directory.',
      'form.url': 'Server URL',
      'form.urlHint': 'For example https://example.com/mcp.',
      'form.headers': 'Headers',
      'form.headersHint': 'One Key: Value per line.',
      'form.timeout': 'Per-call timeout (ms)',
      'form.failFast': 'Refuse activation if startup fails',
      'form.failFastHint': 'Off by default: an unavailable server only loses its own tools and does not block DSH startup.',
      'form.enabled': 'Enabled',
      'form.enabledHint': 'Turn this off to keep the configuration without connecting or registering tools.',
      close: 'Close',
      'form.cancel': 'Cancel',
      'form.save': 'Save',
      'form.saving': 'Saving…',
      'form.secretsNote': 'Environment values and headers are written to the profile configuration. Do not persist temporary credentials you would not store on disk.',
      'confirm.title': 'Delete MCP',
      'confirm.body': 'Delete “{name}”? Its MCP tools are removed from DSH immediately.',
      'confirm.cancel': 'Cancel',
      'confirm.delete': 'Delete',
      'confirm.deleting': 'Deleting…',
      'toast.imported': 'Imported “{name}”',
      'toast.importedRenamed': 'Imported as “{name}”',
      'toast.added': 'Added “{name}”',
      'toast.updated': 'Updated “{name}”',
      'toast.removed': 'Deleted “{name}”',
      'toast.refreshFailed': 'Saved, but the list could not be refreshed: {message}',
      'toast.slow': 'The Host did not answer in time; the configuration was re-read.',
      'error.invalid-name': 'Invalid name: use letters, digits, underscores, and hyphens, up to 32 characters.',
      'error.duplicate-name': 'The name “{name}” is already in use. Choose another one.',
      'error.unsupported-transport': 'This MCP server uses a transport DSH does not support (for example SSE) and cannot be imported directly.',
      'error.missing-command': 'A stdio server needs a command.',
      'error.missing-url': 'An HTTP server needs an http(s) URL.',
      'error.invalid-server': 'The MCP configuration is malformed.',
      'error.config-unavailable': 'This deployment cannot persist profile configuration (configEditor is unavailable); this page is read-only.',
      'error.not-found': 'This MCP server no longer exists. Refresh and try again.',
      'error.import-not-found': 'The external configuration changed. Rescan and try again.',
      'error.already-imported': 'DSH already has an identical MCP configuration.',
      'error.mcp-module-unavailable': 'Could not load @deepseek-ai/dsh-mcp-client; configured MCP servers will not start.',
      'error.unknown-endpoint': 'Plugin version mismatch. Reload the page.',
      'error.internal': 'Operation failed: {message}',
      'error.timeout': 'The Host did not answer (timed out); the configuration was re-read.',
      'client.name': 'Invalid name: use letters, digits, underscores, and hyphens, up to 32 characters.',
      'client.command': 'Enter a command.',
      'client.url': 'Enter a server URL starting with http:// or https://.',
      'client.timeout': 'Timeout must be an integer between 1 and 3600000 milliseconds.',
      'client.unknown': 'Operation failed. Try again.',
    }

    const CSS = `
.mcpcfg-root{display:flex;flex-direction:column;gap:18px;max-width:780px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.mcpcfg-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.mcpcfg-heading{margin:0;font-size:18px;line-height:26px;font-weight:600}
.mcpcfg-intro{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;max-width:560px}
.mcpcfg-header-actions{display:flex;gap:8px;flex-wrap:wrap}
.mcpcfg-banner{display:flex;align-items:flex-start;gap:8px;border-radius:8px;padding:9px 11px;font-size:12px;line-height:18px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.mcpcfg-banner-error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-secondary,var(--dsw-alias-border-l1))}
.mcpcfg-banner-warn{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-secondary));border-color:var(--dsw-alias-state-warn-secondary,var(--dsw-alias-border-l1))}
.mcpcfg-banner-text{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}
.mcpcfg-section{display:flex;flex-direction:column;gap:10px}
.mcpcfg-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:8px}
.mcpcfg-section-title{display:flex;align-items:baseline;gap:8px;margin:0;font-size:15px;line-height:22px;font-weight:600}
.mcpcfg-count{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}
.mcpcfg-section-sub{color:var(--dsw-alias-label-tertiary);font-size:12px}
.mcpcfg-list{display:flex;flex-direction:column;gap:8px}
.mcpcfg-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:11px 13px;display:flex;align-items:flex-start;gap:12px}
.mcpcfg-card:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcpcfg-card-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.mcpcfg-card-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}
.mcpcfg-name{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.mcpcfg-summary{display:block;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mcpcfg-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.mcpcfg-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.mcpcfg-tag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;white-space:nowrap}
.mcpcfg-tag-ok{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary,var(--dsw-alias-bg-layer-2))}
.mcpcfg-tag-info{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary,var(--dsw-alias-bg-layer-2))}
.mcpcfg-tag-warn{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-secondary));background:var(--dsw-alias-state-warn-tertiary,var(--dsw-alias-bg-layer-2))}
.mcpcfg-tag-error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-secondary,var(--dsw-alias-bg-layer-2))}
.mcpcfg-tag-muted{opacity:.8}
.mcpcfg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:5px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.mcpcfg-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mcpcfg-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.mcpcfg-btn:disabled{opacity:.45;cursor:not-allowed}
.mcpcfg-btn-primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-state-business-primary));border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}
.mcpcfg-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-state-business-primary))}
.mcpcfg-btn-danger{color:var(--dsw-alias-state-error-primary)}
.mcpcfg-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,var(--dsw-alias-interactive-bg-hover))}
.mcpcfg-switch{box-sizing:border-box;position:relative;display:inline-flex;align-items:center;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3,#0000001f);cursor:pointer;transition:background-color .12s ease}
.mcpcfg-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-button-info-fill,#4176e6))}
.mcpcfg-switch:disabled{cursor:not-allowed;opacity:.5}
.mcpcfg-switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.mcpcfg-switch-thumb{display:block;flex:none;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground,#fff);transition:transform .12s ease}
.mcpcfg-switch[aria-checked="false"] .mcpcfg-switch-thumb{background:var(--dsw-alias-switch-thumb,var(--dsw-alias-label-primary-foreground,#fff))}
.mcpcfg-switch[aria-checked="true"] .mcpcfg-switch-thumb{transform:translateX(16px)}
.mcpcfg-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:18px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:19px}
.mcpcfg-group{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;contain:content}
.mcpcfg-group-head{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;border:0;background:transparent;color:inherit;font:inherit;text-align:left;width:100%}
.mcpcfg-group-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcpcfg-group-head:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.mcpcfg-chevron{flex:none;width:12px;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}
.mcpcfg-chevron[data-open="true"]{transform:rotate(90deg)}
.mcpcfg-group-title{font-weight:600;font-size:12.5px;white-space:nowrap}
.mcpcfg-group-path{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcpcfg-group-body{display:flex;flex-direction:column;gap:7px;padding:0 12px 12px}
.mcpcfg-source-row{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base)}
.mcpcfg-warn-text{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-tertiary));font-size:11px;line-height:16px}
.mcpcfg-error-text{color:var(--dsw-alias-state-error-primary);font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word}
.mcpcfg-dialog{position:fixed;top:10vh;left:50%;transform:translateX(-50%);z-index:1200;width:min(600px,calc(100vw - 40px));max-height:min(80vh,760px);overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-popover,0 18px 50px rgba(0,0,0,.30));display:flex;flex-direction:column}
.mcpcfg-dialog-head{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1);padding:14px 18px 10px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mcpcfg-dialog-title{margin:0;font-size:16px;line-height:24px;font-weight:600}
.mcpcfg-dialog-body{padding:12px 18px;display:flex;flex-direction:column;gap:10px}
.mcpcfg-dialog-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;align-items:start}
.mcpcfg-span-2{grid-column:1/-1}
.mcpcfg-dialog-foot{position:sticky;bottom:0;z-index:1;background:var(--dsw-alias-bg-layer-1);padding:10px 18px 14px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.mcpcfg-dialog-confirm{width:min(460px,calc(100vw - 40px));top:16vh}
.mcpcfg-close{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:18px;line-height:18px;padding:2px 4px;border-radius:4px;flex:none}
.mcpcfg-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mcpcfg-close:disabled{opacity:.4;cursor:not-allowed}
.mcpcfg-close:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.mcpcfg-confirm-text{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:19px}
.mcpcfg-field{display:flex;flex-direction:column;gap:5px}
.mcpcfg-label{font-size:12px;color:var(--dsw-alias-label-secondary);font-weight:500}
.mcpcfg-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.mcpcfg-input,.mcpcfg-textarea,.mcpcfg-select{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:18px;padding:6px 9px;min-width:0}
.mcpcfg-input:focus,.mcpcfg-textarea:focus,.mcpcfg-select:focus{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;border-color:var(--dsw-alias-state-business-primary)}
.mcpcfg-textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;resize:vertical;min-height:64px}
.mcpcfg-segment{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;overflow:hidden;width:fit-content}
.mcpcfg-segment button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:5px 12px;cursor:pointer}
.mcpcfg-segment button[data-active="true"]{background:var(--dsw-alias-state-business-tertiary,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-weight:500}
.mcpcfg-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.mcpcfg-toggle-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.mcpcfg-toggle .mcpcfg-switch{margin-top:1px}
.mcpcfg-note{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px}
.mcpcfg-toast{position:fixed;right:22px;bottom:22px;z-index:1300;max-width:360px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-popover,0 10px 28px rgba(0,0,0,.22));padding:9px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);display:flex;gap:8px;align-items:flex-start}
.mcpcfg-toast[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.mcpcfg-toast-text{flex:1;min-width:0;word-break:break-word}
.mcpcfg-spin{width:11px;height:11px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;animation:mcpcfg-spin .8s linear infinite}
@keyframes mcpcfg-spin{to{transform:rotate(360deg)}}
@media (max-width:620px){.mcpcfg-dialog{top:4vh;max-height:90vh;width:calc(100vw - 24px)}.mcpcfg-dialog-grid{grid-template-columns:1fr}.mcpcfg-card,.mcpcfg-source-row{flex-direction:column}.mcpcfg-actions{justify-content:flex-start}.mcpcfg-group-path{display:none}}
@media (prefers-reduced-motion:reduce){.mcpcfg-switch,.mcpcfg-switch-thumb{transition:none}}
`

    /** Replace `{name}` placeholders in a localized string. */
    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (values && key in values ? String(values[key]) : match))
    }

    /** Format a timestamp as local `yyyy-MM-dd HH:mm:ss`. */
    function formatDateTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const pad = (part) => String(part).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }

    /** Translate a Host failure through the page dictionary. */
    function errorText(t, error) {
      const code = String(error && error.code ? error.code : '')
      const reason = code.includes('/') ? code.slice(code.lastIndexOf('/') + 1) : code
      const key = 'error.' + reason
      const template = t(key)
      const values = { message: error && error.message ? error.message : '', ...(error && error.details ? error.details : {}) }
      if (template && template !== key) return format(template, values)
      if (error && error.message) return format(t('error.internal'), values)
      return t('client.unknown')
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /** RPC facade that turns the connection envelope into values and errors. */
    function createApi(ctx) {
      async function call(endpoint, payload) {
        const result = await ctx.connection.rpc.call(RPC_CHANNEL, RPC_ENDPOINT, { endpoint, data: payload || {} })
        if (!result.ok) {
          const error = new Error(result.error.message)
          error.code = result.error.code
          error.details = result.error.details || {}
          throw error
        }
        return result.value
      }
      return {
        call,
        async state(scan) {
          let lastError
          for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
              return await call(scan === true ? 'rescan' : 'state', {})
            } catch (error) {
              lastError = error
              await sleep(150 + attempt * 120)
            }
          }
          throw lastError
        },
      }
    }

    /** One page controller shared by the settings page and its modals. */
    function createController(api, t) {
      let snapshot = {
        status: 'loading',
        data: null,
        error: '',
        refreshing: false,
        pending: [],
        editor: null,
        confirm: null,
        toast: null,
      }
      let started = false
      let disposed = false
      let toastTimer
      let toolRefreshTimer
      const listeners = new Set()
      /** id → { desired, confirmed, running }: the switch write queue. */
      const toggleState = new Map()

      function emit() {
        for (const listener of [...listeners]) listener()
      }
      function set(patch) {
        if (disposed) return
        snapshot = { ...snapshot, ...patch }
        emit()
      }
      function showToast(message, tone) {
        if (toastTimer !== undefined) clearTimeout(toastTimer)
        set({ toast: { message, tone: tone || 'success' } })
        toastTimer = setTimeout(() => {
          toastTimer = undefined
          set({ toast: null })
        }, tone === 'error' ? 5200 : 3200)
      }
      function pending(key) {
        return snapshot.pending.includes(key)
      }
      /**
       * Mark one operation as in flight, scoped to its own key. The key is
       * released when the task settles, and at the latest after the UI timeout:
       * writing profile configuration restarts this plugin's Host fiber, so a
       * request that outlives that restart must not freeze a control forever.
       */
      async function withPending(key, task) {
        if (snapshot.pending.includes(key)) return undefined
        set({ pending: [...snapshot.pending, key] })
        let released = false
        const release = () => {
          if (released) return
          released = true
          set({ pending: snapshot.pending.filter((item) => item !== key) })
        }
        const timer = setTimeout(() => {
          release()
          if (disposed) return
          // The answer may simply have been lost in the restart: reconcile with
          // whatever the Host actually recorded instead of trusting the guess.
          showToast(t('toast.slow'), 'error')
          load(false, false).catch(() => {})
        }, MUTATION_LOCK_MS)
        if (timer && typeof timer.unref === 'function') timer.unref()
        try {
          return await task()
        } finally {
          clearTimeout(timer)
          release()
        }
      }

      /** Apply one row's new state locally so a click never waits for a refetch. */
      function patchManaged(id, patch) {
        const data = snapshot.data
        if (!data || !Array.isArray(data.managed)) return
        set({
          data: {
            ...data,
            managed: data.managed.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          },
        })
      }

      /** Whether a managed row still exists in the current list. */
      function stillManaged(id) {
        const data = snapshot.data
        return Boolean(data && Array.isArray(data.managed) && data.managed.some((row) => row.id === id))
      }

      /** The visible row state for an intended `enabled` value. */
      function enabledPatch(enabled) {
        return {
          disabled: !enabled,
          status: enabled ? 'enabled' : 'disabled',
          // Tools register only after the (re)mount finishes; the quiet refresh
          // fills the real count back in.
          toolCount: 0,
        }
      }

      /** The `update` payload for one server at an intended `enabled` value. */
      function togglePayload(server, enabled) {
        return {
          name: server.name,
          transport: server.transport,
          command: server.command,
          args: server.args,
          env: server.env,
          cwd: server.cwd,
          url: server.url,
          headers: server.headers,
          toolCallTimeoutMs: server.toolCallTimeoutMs,
          failOnStartupError: server.failOnStartupError,
          disabled: !enabled,
        }
      }

      /** Reject with a translated Host-timeout failure instead of waiting forever. */
      function withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            const error = new Error('Host timeout')
            error.code = 'mcp-config/timeout'
            reject(error)
          }, ms)
          if (timer && typeof timer.unref === 'function') timer.unref()
          Promise.resolve(promise).then(
            (value) => {
              clearTimeout(timer)
              resolve(value)
            },
            (error) => {
              clearTimeout(timer)
              reject(error)
            },
          )
        })
      }

      /**
       * Drive one server's switch to its newest intent. Clicks only record a
       * new `desired` value; this loop is the single writer, so a burst of
       * clicks costs one write (or none) instead of being dropped.
       */
      async function flushToggle(id, server) {
        const state = toggleState.get(id)
        if (state === undefined) return
        let wrote = false
        for (;;) {
          try {
            while (state.desired !== state.confirmed) {
              const target = state.desired
              if (TOGGLE_SETTLE_MS > 0) await sleep(TOGGLE_SETTLE_MS)
              // A newer click may have replaced the intent while we waited.
              if (state.desired !== target) continue
              await withTimeout(api.call('update', { id, server: togglePayload(server, target) }), MUTATION_LOCK_MS)
              state.confirmed = target
              wrote = true
            }
          } catch (error) {
            const timedOut = error && error.code === 'mcp-config/timeout'
            state.desired = state.confirmed
            patchManaged(id, enabledPatch(state.confirmed))
            // The row may have been deleted while this write was in flight;
            // reporting a failure for a gone server would only confuse.
            if (stillManaged(id)) showToast(errorText(t, error), 'error')
            // A timed-out write may still have landed; let the Host decide.
            if (timedOut) load(false, false).catch(() => {})
            break
          }
          if (wrote) await refreshAfterMutation()
          if (state.desired === state.confirmed) break
          // Clicks that arrived during the refresh become the next write.
          patchManaged(id, enabledPatch(state.desired))
          wrote = false
        }
      }

      async function load(showSpinner, scan) {
        if (showSpinner) set({ refreshing: true })
        try {
          const data = await api.state(scan === true)
          set({ status: 'ready', data, error: '', refreshing: false })
          return data
        } catch (error) {
          set({
            status: snapshot.data ? 'ready' : 'error',
            error: errorText(t, error),
            refreshing: false,
          })
          throw error
        }
      }

      async function refresh(showSpinner, scan) {
        try {
          await load(showSpinner !== false, scan === true)
        } catch {
          // `load` already published the failure.
        }
      }

      async function refreshAfterMutation() {
        try {
          await load(false, false)
        } catch (error) {
          showToast(format(t('toast.refreshFailed'), { message: errorText(t, error) }), 'error')
        }
        // A newly mounted MCP server finishes its handshake asynchronously; one
        // quiet re-read picks up its tool count without polling.
        if (toolRefreshTimer !== undefined) clearTimeout(toolRefreshTimer)
        toolRefreshTimer = setTimeout(() => {
          toolRefreshTimer = undefined
          if (!disposed) load(false, false).catch(() => {})
        }, 2500)
      }

      function draftFromServer(server) {
        if (server === null || server === undefined) {
          return {
            name: '',
            transport: 'stdio',
            command: '',
            args: '',
            env: '',
            cwd: '',
            url: '',
            headers: '',
            timeout: '60000',
            failOnStartup: false,
            disabled: false,
          }
        }
        return {
          id: server.id,
          name: server.name,
          transport: server.transport,
          command: server.command || '',
          args: (server.args || []).join('\n'),
          env: Object.entries(server.env || {}).map(([key, value]) => `${key}=${value}`).join('\n'),
          cwd: server.cwd || '',
          url: server.url || '',
          headers: Object.entries(server.headers || {}).map(([key, value]) => `${key}: ${value}`).join('\n'),
          timeout: String(server.toolCallTimeoutMs || 60000),
          failOnStartup: server.failOnStartupError === true,
          disabled: server.disabled === true,
        }
      }

      function parseArgs(text) {
        const trimmed = String(text || '').trim()
        if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed)
            if (Array.isArray(parsed)) return parsed.map((item) => String(item))
          } catch {
            // Fall through to line parsing; the user may be mid-edit.
          }
        }
        return String(text || '')
          .split('\n')
          .map((line) => line.replace(/\r$/, ''))
          .filter((line) => line.trim() !== '')
      }

      function parseRecord(text, separator) {
        const record = {}
        for (const rawLine of String(text || '').split('\n')) {
          const line = rawLine.trim()
          if (line === '' || line.startsWith('#')) continue
          const index = line.indexOf(separator)
          if (index < 1) continue
          const key = line.slice(0, index).trim()
          if (key === '') continue
          record[key] = line.slice(index + separator.length).trim()
        }
        return record
      }

      function payloadFromDraft(draft) {
        const name = String(draft.name || '').trim()
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) {
          const error = new Error(t('client.name'))
          error.code = 'client/name'
          throw error
        }
        const timeout = Number(draft.timeout)
        if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600000) {
          const error = new Error(t('client.timeout'))
          error.code = 'client/timeout'
          throw error
        }
        if (draft.transport === 'stdio') {
          const command = String(draft.command || '').trim()
          if (command === '') {
            const error = new Error(t('client.command'))
            error.code = 'client/command'
            throw error
          }
          return {
            name,
            transport: 'stdio',
            command,
            args: parseArgs(draft.args),
            env: parseRecord(draft.env, '='),
            cwd: String(draft.cwd || '').trim(),
            toolCallTimeoutMs: timeout,
            failOnStartupError: draft.failOnStartup === true,
            disabled: draft.disabled === true,
          }
        }
        const url = String(draft.url || '').trim()
        if (!/^https?:\/\//i.test(url)) {
          const error = new Error(t('client.url'))
          error.code = 'client/url'
          throw error
        }
        return {
          name,
          transport: 'streamable-http',
          url,
          headers: parseRecord(draft.headers, ':'),
          toolCallTimeoutMs: timeout,
          failOnStartupError: draft.failOnStartup === true,
          disabled: draft.disabled === true,
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot() {
          return snapshot
        },
        ensureLoaded() {
          if (disposed || started) return
          started = true
          // First entry into the page performs one scan; later entries reuse it.
          refresh(true, true)
        },
        async rescan() {
          if (snapshot.refreshing) return
          await refresh(true, true)
        },
        async reload() {
          if (disposed) return
          await refresh(false, false)
        },
        isPending: pending,
        errorText(error) {
          return errorText(t, error)
        },
        openEditor(server) {
          set({ editor: { mode: server ? 'edit' : 'new', draft: draftFromServer(server) }, confirm: null })
        },
        closeEditor() {
          set({ editor: null })
        },
        closeTransient() {
          if (toastTimer !== undefined) clearTimeout(toastTimer)
          toastTimer = undefined
          // Called from the unmount cleanup: update the stored snapshot without
          // notifying an unmounting subscriber.
          snapshot = { ...snapshot, editor: null, confirm: null, toast: null }
        },
        draftFromServer,
        async saveEditor(draft) {
          const payload = payloadFromDraft(draft)
          const editing = snapshot.editor
          return withPending('save', async () => {
            try {
              if (editing.mode === 'edit') {
                await api.call('update', { id: draft.id, server: payload })
                showToast(format(t('toast.updated'), { name: payload.name }))
              } else {
                await api.call('add', { server: payload })
                showToast(format(t('toast.added'), { name: payload.name }))
              }
              set({ editor: null })
              await refreshAfterMutation()
              return payload.name
            } catch (error) {
              throw error
            }
          })
        },
        openConfirm(server) {
          set({ confirm: server, editor: null })
        },
        closeConfirm() {
          set({ confirm: null })
        },
        async remove(server) {
          // Any switch intent still queued for this server is moot once it is
          // deleted: drop it so no late write can race the removal.
          const queued = toggleState.get(server.id)
          if (queued !== undefined) {
            queued.desired = queued.confirmed
            toggleState.delete(server.id)
          }
          return withPending(`remove:${server.id}`, async () => {
            try {
              await api.call('remove', { id: server.id })
              set({ confirm: null })
              showToast(format(t('toast.removed'), { name: server.name }))
              await refreshAfterMutation()
            } catch (error) {
              showToast(errorText(t, error), 'error')
            }
          })
        },
        async setEnabled(server) {
          set({ confirm: null })
          const id = server.id
          const key = `toggle:${id}`
          let state = toggleState.get(id)
          if (state === undefined) {
            const current = server.disabled !== true
            state = { desired: current, confirmed: current, running: false }
            toggleState.set(id, state)
          }
          // Every click lands immediately: flip the row, then record the intent.
          state.desired = !state.desired
          patchManaged(id, enabledPatch(state.desired))
          if (state.running) return undefined
          state.running = true
          set({ pending: [...snapshot.pending.filter((item) => item !== key), key] })
          try {
            await flushToggle(id, server)
          } finally {
            state.running = false
            if (state.desired === state.confirmed) toggleState.delete(id)
            set({ pending: snapshot.pending.filter((item) => item !== key) })
          }
        },
        async importSource(server) {
          const key = `import:${server.key}`
          return withPending(key, async () => {
            try {
              const result = await api.call('import', { key: server.key })
              showToast(format(t(result.renamed ? 'toast.importedRenamed' : 'toast.imported'), { name: result.name }))
              await refreshAfterMutation()
            } catch (error) {
              showToast(errorText(t, error), 'error')
            }
          })
        },
        dismissToast() {
          if (toastTimer !== undefined) clearTimeout(toastTimer)
          toastTimer = undefined
          set({ toast: null })
        },
        dispose() {
          disposed = true
          listeners.clear()
          if (toastTimer !== undefined) clearTimeout(toastTimer)
          if (toolRefreshTimer !== undefined) clearTimeout(toolRefreshTimer)
        },
      }
    }

    /** Whether the page may change configuration right now. */
    function canMutate(controller) {
      const data = controller.getSnapshot().data
      return Boolean(data?.diagnostics?.canWrite && data?.diagnostics?.mcpModule?.ok)
    }

    function installStyles() {
      if (typeof document === 'undefined' || typeof document.createElement !== 'function') return () => {}
      const head = document.head
      if (!head || typeof head.appendChild !== 'function') return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = '@hexiaowu/dsh-mcp-config'
      tag.textContent = CSS
      head.appendChild(tag)
      return () => {
        if (typeof tag.remove === 'function') tag.remove()
        else if (tag.parentNode) tag.parentNode.removeChild(tag)
      }
    }

    function Spinner() {
      return h('span', { className: 'mcpcfg-spin', 'aria-hidden': true })
    }

    function Tag({ children, tone }) {
      const toneClass = tone === 'ok'
        ? ' mcpcfg-tag-ok'
        : tone === 'info'
          ? ' mcpcfg-tag-info'
          : tone === 'warn'
            ? ' mcpcfg-tag-warn'
            : tone === 'error'
              ? ' mcpcfg-tag-error'
              : ''
      return h('span', { className: 'mcpcfg-tag' + toneClass }, children)
    }

    /**
     * The one switch used everywhere on this page. Metrics mirror the DSH
     * `ui-primitives` switch; the "on" color is the product blue so an enabled
     * server reads the same way as its blue status tag.
     */
    function Switch({ checked, onChange, label, title, disabled, busy }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        className: 'mcpcfg-switch',
        'aria-checked': checked === true ? 'true' : 'false',
        'aria-label': label,
        'aria-busy': busy === true ? 'true' : undefined,
        title: title || label,
        disabled: disabled === true,
        // Clicks are never swallowed: the controller records the newest intent
        // and collapses the writes, so a fast second click still lands.
        onClick: () => { onChange(checked !== true) },
      }, h('span', { className: 'mcpcfg-switch-thumb' }))
    }

    function Banner({ tone, children, action }) {
      const toneClass = tone === 'error' ? ' mcpcfg-banner-error' : tone === 'warn' ? ' mcpcfg-banner-warn' : ''
      return h('div', { className: 'mcpcfg-banner' + toneClass, role: tone === 'error' ? 'alert' : 'status' },
        h('span', { className: 'mcpcfg-banner-text' }, children),
        action || null,
      )
    }

    function ManagedRow({ server, controller, t }) {
      const snapshot = controller.getSnapshot()
      const pending = snapshot.pending
      const canWrite = snapshot.data?.diagnostics?.canWrite === true
      // Only this row's own operations gate this row; another server's toggle
      // must never disable the whole list.
      const toggling = pending.includes(`toggle:${server.id}`)
      const removing = pending.includes(`remove:${server.id}`)
      const statusTag = server.status === 'disabled'
        ? h(Tag, { tone: 'warn' }, t('status.disabled'))
        : server.status === 'error'
          ? h(Tag, { tone: 'error' }, t('status.error'))
          : h(Tag, { tone: 'info' }, t('status.enabled'))
      return h('div', { className: 'mcpcfg-card' },
        h('div', { className: 'mcpcfg-card-main' },
          h('div', { className: 'mcpcfg-card-title' },
            h('span', { className: 'mcpcfg-name', title: server.name }, server.name),
            h(Tag, null, server.transport === 'stdio' ? t('tag.stdio') : t('tag.http')),
            statusTag,
            server.toolCount > 0 ? h(Tag, { tone: 'ok' }, format(t('toolCount'), { count: server.toolCount })) : null,
          ),
          h('code', { className: 'mcpcfg-summary', title: server.summary }, server.summary),
          h('div', { className: 'mcpcfg-meta' },
            server.origin ? h('span', null, server.origin) : null,
            Object.keys(server.env || {}).length > 0 ? h('span', null, `${Object.keys(server.env).length} env`) : null,
            Object.keys(server.headers || {}).length > 0 ? h('span', null, `${Object.keys(server.headers).length} headers`) : null,
            server.status === 'enabled' && server.toolCount === 0 ? h('span', null, t('dsh.connecting')) : null,
            server.mountError ? h('span', { className: 'mcpcfg-error-text' }, server.mountError) : null,
          ),
        ),
        h('div', { className: 'mcpcfg-actions' },
          h(Switch, {
            checked: server.disabled !== true,
            label: t(server.disabled ? 'enable' : 'disable'),
            busy: toggling,
            disabled: removing || !canWrite,
            onChange: () => { controller.setEnabled(server) },
          }),
          h('button', {
            type: 'button',
            className: 'mcpcfg-btn',
            disabled: removing || !canWrite,
            onClick: () => { controller.openEditor(server) },
          }, t('edit')),
          h('button', {
            type: 'button',
            className: 'mcpcfg-btn mcpcfg-btn-danger',
            disabled: removing || !canWrite,
            onClick: () => { controller.openConfirm(server) },
          }, t('delete')),
        ),
      )
    }

    function ProfileRow({ row, t }) {
      return h('div', { className: 'mcpcfg-card' },
        h('div', { className: 'mcpcfg-card-main' },
          h('div', { className: 'mcpcfg-card-title' },
            h('span', { className: 'mcpcfg-name', title: row.name }, row.name),
            h(Tag, null, row.transport === 'stdio' ? t('tag.stdio') : t('tag.http')),
            h(Tag, { tone: 'muted' }, t('tag.profile')),
            row.enabled ? null : h(Tag, { tone: 'warn' }, t('status.disabled')),
          ),
          row.summary ? h('code', { className: 'mcpcfg-summary', title: row.summary }, row.summary) : null,
          h('div', { className: 'mcpcfg-meta' },
            h('span', null, t('dsh.profileNote')),
            row.error ? h('span', { className: 'mcpcfg-error-text' }, row.error) : null,
          ),
        ),
      )
    }

    function SourceRow({ server, controller, t }) {
      const pending = controller.getSnapshot().pending
      const importKey = `import:${server.key}`
      const busy = pending.includes(importKey)
      const blocked = server.imported || server.unsupported !== ''
      let label = t('import.action')
      if (server.imported) label = t('import.imported')
      else if (server.unsupported !== '') label = t('import.unsupported')
      else if (pending.includes(importKey)) label = t('import.importing')
      const warnings = (server.warnings || []).map((warning) => {
        if (warning.startsWith('placeholder:')) {
          return format(t('import.placeholder'), { value: warning.slice('placeholder:'.length) })
        }
        if (warning.startsWith('env_vars-missing:')) {
          return format(t('import.envMissing'), { value: warning.slice('env_vars-missing:'.length) })
        }
        return warning
      })
      return h('div', { className: 'mcpcfg-source-row' },
        h('div', { className: 'mcpcfg-card-main' },
          h('div', { className: 'mcpcfg-card-title' },
            h('span', { className: 'mcpcfg-name', title: server.name }, server.name),
            server.transport ? h(Tag, null, server.transport === 'stdio' ? t('tag.stdio') : t('tag.http')) : null,
            server.envCount > 0 ? h(Tag, null, format(t('envCount'), { count: server.envCount })) : null,
            server.enabled ? null : h(Tag, { tone: 'warn' }, t('external.disabled')),
          ),
          server.summary ? h('code', { className: 'mcpcfg-summary', title: server.summary }, server.summary) : null,
          server.renamed && !server.imported && server.unsupported === ''
            ? h('div', { className: 'mcpcfg-warn-text' }, format(t('import.renamed'), { name: server.suggestedName }))
            : null,
          warnings.length > 0 ? h('div', { className: 'mcpcfg-warn-text' }, warnings.join(' · ')) : null,
          server.unsupported !== ''
            ? h('div', { className: 'mcpcfg-warn-text' }, t('unsupported.' + server.unsupported))
            : null,
        ),
        h('div', { className: 'mcpcfg-actions' },
          h('button', {
            type: 'button',
            className: blocked ? 'mcpcfg-btn' : 'mcpcfg-btn mcpcfg-btn-primary',
            disabled: blocked || busy || !canMutate(controller),
            title: server.imported ? t('import.imported') : undefined,
            onClick: () => { controller.importSource(server) },
          }, pending.includes(importKey) ? h(Spinner) : null, label),
        ),
      )
    }

    function SourceGroup({ group, controller, t }) {
      const [open, setOpen] = React.useState(false)
      const servers = group.servers || []
      return h('div', { className: 'mcpcfg-group' },
        h('button', {
          type: 'button',
          className: 'mcpcfg-group-head',
          'aria-expanded': open ? 'true' : 'false',
          title: group.error || undefined,
          onClick: () => { setOpen((value) => !value) },
        },
          h('svg', { className: 'mcpcfg-chevron', 'data-open': open ? 'true' : 'false', viewBox: '0 0 12 12', width: 12, height: 12, 'aria-hidden': true },
            h('path', { d: 'M4 2l4 4-4 4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
          ),
          h('span', { className: 'mcpcfg-group-title' }, group.label),
          h('span', { className: 'mcpcfg-group-path', title: group.path }, group.path),
          group.error ? h(Tag, { tone: 'error' }, t('external.errorTag')) : null,
          h(Tag, null, String(servers.length)),
        ),
        open ? h('div', { className: 'mcpcfg-group-body' },
          group.error ? h('div', { className: 'mcpcfg-error-text' }, t('external.error') + '：' + group.error) : null,
          servers.length === 0 ? h('div', { className: 'mcpcfg-empty' }, t('empty')) : null,
          servers.map((server) => h(SourceRow, { key: server.key, server, controller, t })),
        ) : null,
      )
    }

    function Page({ controller, t }) {
      const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      React.useEffect(() => {
        controller.ensureLoaded()
        return () => controller.closeTransient()
      }, [controller])
      const data = snapshot.data
      const canWrite = data ? data.diagnostics.canWrite : false
      const canEdit = canWrite && data ? data.diagnostics.mcpModule.ok : false
      const groups = data ? data.groups : []
      const managed = data ? data.managed : []
      const profileRows = data ? data.profileRows : []
      const dshCount = managed.length + profileRows.length
      const externalCount = groups.reduce((sum, group) => sum + (group.servers ? group.servers.length : 0), 0)
      const scannedAt = data?.diagnostics?.scannedAt ? formatDateTime(data.diagnostics.scannedAt) : ''

      return h('div', { className: 'mcpcfg-root' },
        h('div', { className: 'mcpcfg-header' },
          h('div', null,
            h('h2', { className: 'mcpcfg-heading' }, t('title')),
            h('p', { className: 'mcpcfg-intro' }, t('intro')),
          ),
          h('div', { className: 'mcpcfg-header-actions' },
            h('button', {
              type: 'button',
              className: 'mcpcfg-btn',
              disabled: snapshot.refreshing,
              onClick: () => { controller.rescan() },
            }, snapshot.refreshing ? h(Spinner) : null, t('refresh')),
            h('button', {
              type: 'button',
              className: 'mcpcfg-btn mcpcfg-btn-primary',
              disabled: !canEdit,
              onClick: () => { controller.openEditor(null) },
            }, t('add')),
          ),
        ),

        !data && snapshot.status === 'loading' ? h('div', { className: 'mcpcfg-empty' }, t('loading')) : null,
        snapshot.error ? h(Banner, {
          tone: 'error',
          action: h('button', { type: 'button', className: 'mcpcfg-btn', onClick: () => { controller.rescan() } }, t('retry')),
        }, snapshot.error) : null,
        data && !canWrite ? h(Banner, { tone: 'warn' }, t('error.config-unavailable')) : null,
        data && !data.diagnostics.mcpModule.ok ? h(Banner, { tone: 'error' }, t('error.mcp-module-unavailable') + '\n' + data.diagnostics.mcpModule.error) : null,
        data && data.configErrors && data.configErrors.length > 0
          ? h(Banner, { tone: 'error' }, data.configErrors.map((error) => `${error.name || `#${error.index + 1}`}: ${error.message}`).join('\n'))
          : null,
        data && data.diagnostics.scanFailure ? h(Banner, { tone: 'warn' }, format(t('external.scanFailed'), { message: data.diagnostics.scanFailure })) : null,

        data ? h('section', { className: 'mcpcfg-section' },
          h('div', { className: 'mcpcfg-section-head' },
            h('h3', { className: 'mcpcfg-section-title' }, t('dsh.title'), h('span', { className: 'mcpcfg-count' }, String(dshCount))),
          ),
          dshCount === 0
            ? h('div', { className: 'mcpcfg-empty' }, t('dsh.empty'))
            : h('div', { className: 'mcpcfg-list' },
              managed.map((server) => h(ManagedRow, { key: server.id, server, controller, t })),
              profileRows.length > 0
                ? h('div', { className: 'mcpcfg-section-sub' }, t('dsh.profileRows'))
                : null,
              profileRows.map((row) => h(ProfileRow, { key: `profile:${row.id}`, row, t })),
            ),
        ) : null,

        data ? h('section', { className: 'mcpcfg-section' },
          h('div', { className: 'mcpcfg-section-head' },
            h('h3', { className: 'mcpcfg-section-title' }, t('external.title'), h('span', { className: 'mcpcfg-count' }, String(externalCount))),
            h('span', { className: 'mcpcfg-section-sub' },
              format(t('external.scanned'), { count: data.diagnostics.checkedFiles || 0 }),
              scannedAt ? ' · ' + format(t('external.scannedAt'), { time: scannedAt }) : '',
            ),
          ),
          groups.length === 0
            ? h('div', { className: 'mcpcfg-empty' }, t('external.empty'))
            : h('div', { className: 'mcpcfg-list' }, groups.map((group) => h(SourceGroup, {
              key: group.id,
              group,
              controller,
              t,
            }))),
          h('div', { className: 'mcpcfg-note' }, t('external.secretNote')),
        ) : null,

        snapshot.editor ? h(ServerDialog, {
          key: snapshot.editor.mode === 'edit' ? snapshot.editor.draft.id : 'new',
          controller,
          t,
          mode: snapshot.editor.mode,
          initial: snapshot.editor.draft,
        }) : null,
        snapshot.confirm ? h(ConfirmDialog, { controller, t, server: snapshot.confirm }) : null,
        snapshot.toast ? h(Toast, { controller, t, toast: snapshot.toast }) : null,
      )
    }

    function ServerDialog({ controller, t, mode, initial }) {
      const [draft, setDraft] = React.useState(initial)
      const [error, setError] = React.useState('')
      const nameRef = React.useRef(null)
      const saving = controller.getSnapshot().pending.includes('save')
      React.useEffect(() => {
        if (nameRef.current && typeof nameRef.current.focus === 'function') nameRef.current.focus()
      }, [])
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape' || controller.getSnapshot().pending.includes('save')) return
          event.preventDefault()
          event.stopImmediatePropagation()
          controller.closeEditor()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [controller])
      function update(patch) {
        setDraft((current) => ({ ...current, ...patch }))
      }
      async function submit(event) {
        event.preventDefault()
        if (saving) return
        setError('')
        try {
          await controller.saveEditor(draft)
        } catch (failure) {
          setError(controller.errorText(failure))
        }
      }
      function field(label, control, hint, className) {
        return h('label', { className: 'mcpcfg-field' + (className ? ' ' + className : '') },
          h('span', { className: 'mcpcfg-label' }, label),
          control,
          hint ? h('span', { className: 'mcpcfg-hint' }, hint) : null,
        )
      }
      /** A labelled on/off row that uses the same switch as the server list. */
      function toggleRow({ label, hint, checked, onChange, disabled }) {
        return h('div', { className: 'mcpcfg-toggle mcpcfg-span-2' },
          h('div', { className: 'mcpcfg-toggle-text' },
            h('span', { className: 'mcpcfg-label' }, label),
            hint ? h('span', { className: 'mcpcfg-hint' }, hint) : null,
          ),
          h(Switch, { checked, label, disabled, onChange }),
        )
      }
      const stdio = draft.transport === 'stdio'
      return ReactDOM.createPortal(h('form', {
        className: 'mcpcfg-dialog',
        role: 'dialog',
        'aria-label': t(mode === 'edit' ? 'form.editTitle' : 'form.newTitle'),
        onSubmit: submit,
      },
        h('div', { className: 'mcpcfg-dialog-head' },
          h('h3', { className: 'mcpcfg-dialog-title' }, t(mode === 'edit' ? 'form.editTitle' : 'form.newTitle')),
          h('button', {
            type: 'button',
            className: 'mcpcfg-close',
            'aria-label': t('close'),
            disabled: saving,
            onClick: () => controller.closeEditor(),
          }, '×'),
        ),
        h('div', { className: 'mcpcfg-dialog-body' },
          error ? h(Banner, { tone: 'error' }, error) : null,
          h('div', { className: 'mcpcfg-dialog-grid' },
            field(t('form.name'), h('input', {
              ref: nameRef,
              className: 'mcpcfg-input',
              value: draft.name,
              spellCheck: false,
              placeholder: 'context7',
              onChange: (event) => update({ name: event.target.value }),
            }), t('form.nameHint')),
            field(t('form.transport'), h('div', { className: 'mcpcfg-segment', role: 'group' },
              h('button', {
                type: 'button',
                'data-active': stdio ? 'true' : 'false',
                'aria-pressed': stdio ? 'true' : 'false',
                onClick: () => update({ transport: 'stdio' }),
              }, t('tag.stdio')),
              h('button', {
                type: 'button',
                'data-active': stdio ? 'false' : 'true',
                'aria-pressed': stdio ? 'false' : 'true',
                onClick: () => update({ transport: 'streamable-http' }),
              }, t('tag.http')),
            ), null),
            stdio ? h(React.Fragment, null,
              field(t('form.command'), h('input', {
                className: 'mcpcfg-input',
                value: draft.command,
                spellCheck: false,
                placeholder: 'npx',
                onChange: (event) => update({ command: event.target.value }),
              }), t('form.commandHint'), 'mcpcfg-span-2'),
              field(t('form.args'), h('textarea', {
                className: 'mcpcfg-textarea',
                value: draft.args,
                rows: 3,
                spellCheck: false,
                placeholder: '-y\n@upstash/context7-mcp',
                onChange: (event) => update({ args: event.target.value }),
              }), t('form.argsHint')),
              field(t('form.env'), h('textarea', {
                className: 'mcpcfg-textarea',
                value: draft.env,
                rows: 3,
                spellCheck: false,
                placeholder: 'Z_AI_API_KEY=...',
                onChange: (event) => update({ env: event.target.value }),
              }), t('form.envHint')),
              field(t('form.cwd'), h('input', {
                className: 'mcpcfg-input',
                value: draft.cwd,
                spellCheck: false,
                placeholder: '/Users/me/project',
                onChange: (event) => update({ cwd: event.target.value }),
              }), t('form.cwdHint')),
              field(t('form.timeout'), h('input', {
                className: 'mcpcfg-input',
                type: 'number',
                min: 1,
                max: 3600000,
                step: 1000,
                value: draft.timeout,
                onChange: (event) => update({ timeout: event.target.value }),
              }), null),
            ) : h(React.Fragment, null,
              field(t('form.url'), h('input', {
                className: 'mcpcfg-input',
                value: draft.url,
                spellCheck: false,
                placeholder: 'https://example.com/mcp',
                onChange: (event) => update({ url: event.target.value }),
              }), t('form.urlHint'), 'mcpcfg-span-2'),
              field(t('form.headers'), h('textarea', {
                className: 'mcpcfg-textarea',
                value: draft.headers,
                rows: 3,
                spellCheck: false,
                placeholder: 'Authorization: Bearer ...',
                onChange: (event) => update({ headers: event.target.value }),
              }), t('form.headersHint'), 'mcpcfg-span-2'),
              field(t('form.timeout'), h('input', {
                className: 'mcpcfg-input',
                type: 'number',
                min: 1,
                max: 3600000,
                step: 1000,
                value: draft.timeout,
                onChange: (event) => update({ timeout: event.target.value }),
              }), null),
            ),
            toggleRow({
              label: t('form.failFast'),
              hint: t('form.failFastHint'),
              checked: draft.failOnStartup === true,
              disabled: saving,
              onChange: (next) => update({ failOnStartup: next }),
            }),
            mode === 'edit' ? toggleRow({
              label: t('form.enabled'),
              hint: t('form.enabledHint'),
              checked: draft.disabled !== true,
              disabled: saving,
              onChange: (next) => update({ disabled: !next }),
            }) : null,
            h('div', { className: 'mcpcfg-note mcpcfg-span-2' }, t('form.secretsNote')),
          ),
        ),
        h('div', { className: 'mcpcfg-dialog-foot' },
          h('button', {
            type: 'button',
            className: 'mcpcfg-btn',
            disabled: saving,
            onClick: () => controller.closeEditor(),
          }, t('form.cancel')),
          h('button', {
            type: 'submit',
            className: 'mcpcfg-btn mcpcfg-btn-primary',
            disabled: saving,
          }, saving ? h(Spinner) : null, t(saving ? 'form.saving' : 'form.save')),
        ),
      ), document.body)
    }

    function ConfirmDialog({ controller, t, server }) {
      const deleting = controller.getSnapshot().pending.includes(`remove:${server.id}`)
      const cancelRef = React.useRef(null)
      React.useEffect(() => {
        if (cancelRef.current && typeof cancelRef.current.focus === 'function') cancelRef.current.focus()
      }, [])
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape' || deleting) return
          event.preventDefault()
          event.stopImmediatePropagation()
          controller.closeConfirm()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [controller, deleting])
      return ReactDOM.createPortal(h('div', {
        className: 'mcpcfg-dialog mcpcfg-dialog-confirm',
        role: 'alertdialog',
        'aria-label': t('confirm.title'),
      },
        h('div', { className: 'mcpcfg-dialog-head' },
          h('h3', { className: 'mcpcfg-dialog-title' }, t('confirm.title')),
          h('button', {
            type: 'button',
            className: 'mcpcfg-close',
            'aria-label': t('close'),
            disabled: deleting,
            onClick: () => controller.closeConfirm(),
          }, '×'),
        ),
        h('div', { className: 'mcpcfg-dialog-body' },
          h('div', { className: 'mcpcfg-confirm-text' }, format(t('confirm.body'), { name: server.name })),
          server.summary ? h('code', { className: 'mcpcfg-summary' }, server.summary) : null,
        ),
        h('div', { className: 'mcpcfg-dialog-foot' },
          h('button', {
            ref: cancelRef,
            type: 'button',
            className: 'mcpcfg-btn',
            disabled: deleting,
            onClick: () => controller.closeConfirm(),
          }, t('confirm.cancel')),
          h('button', {
            type: 'button',
            className: 'mcpcfg-btn mcpcfg-btn-danger',
            disabled: deleting,
            onClick: () => controller.remove(server),
          }, deleting ? h(Spinner) : null, t(deleting ? 'confirm.deleting' : 'confirm.delete')),
        ),
      ), document.body)
    }

    function Toast({ controller, t, toast }) {
      return ReactDOM.createPortal(h('div', { className: 'mcpcfg-toast', 'data-tone': toast.tone, role: 'status' },
        h('span', { className: 'mcpcfg-toast-text' }, toast.message),
        h('button', {
          type: 'button',
          className: 'mcpcfg-close',
          'aria-label': t('close'),
          onClick: () => controller.dismissToast(),
        }, '×'),
      ), document.body)
    }

    function McpIcon({ size }) {
      const dimension = Number.isFinite(size) ? size : 16
      return h('svg', { viewBox: '0 0 24 24', width: dimension, height: dimension, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M3.5 7h3.9' }),
        h('path', { d: 'M11.6 7h8.9' }),
        h('path', { d: 'M3.5 12h9.4' }),
        h('path', { d: 'M17.1 12h3.4' }),
        h('path', { d: 'M3.5 17h2.4' }),
        h('path', { d: 'M10.1 17h10.4' }),
        h('circle', { cx: 9.5, cy: 7, r: 2.2 }),
        h('circle', { cx: 15, cy: 12, r: 2.2 }),
        h('circle', { cx: 8, cy: 17, r: 2.2 }),
      )
    }

    function apply(ctx) {
      ctx.effect(installStyles, 'mcp-config: styles')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcp-config: dictionaries')
      const t = ctx.locale.bind(NS)
      const api = createApi(ctx)
      const controller = createController(api, t)
      ctx.effect(() => () => controller.dispose(), 'mcp-config: controller')
      ctx.effect(() => ctx.on('connection/reset', () => {
        controller.reload()
      }), 'mcp-config: reconnect refresh')

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'mcp-config',
        order: 18,
        label: () => t('nav'),
        locale: NS,
        inject: () => ({ controller, t }),
      }, Page))

      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: 'mcp-config',
        locale: NS,
      }, McpIcon))
    }

    return {
      inject: ['slots', 'locale', 'connection'],
      apply,
      // Test-only access to the view components, controller factory, and stylesheet;
      // the module loader ignores all of it.
      __components: { Page, ManagedRow, ProfileRow, SourceRow, SourceGroup, ServerDialog, ConfirmDialog, Toast, Switch },
      __internals: { createApi, createController },
      __limits: { mutationLockMs: MUTATION_LOCK_MS, toggleSettleMs: TOGGLE_SETTLE_MS },
      __css: CSS,
    }
  },
})
