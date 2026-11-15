/**
 * Discovery of MCP servers configured in other agents and IDEs.
 *
 * Every source is an explicit, testable entry with candidate user-level paths,
 * one document format, and an extractor. The scanner never runs another tool:
 * it reads the same files those tools read, so the browser can show a reliable
 * inventory without guessing at an application's internal store.
 *
 * @module @hexiaowu/dsh-mcp-config/lib/scan
 */

import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { parseJsonLike } from './jsonc.js'
import { parseToml } from './toml.js'
import {
  buildSpecFromRaw,
  findPlaceholders,
  fingerprintOf,
  sanitizeServerName,
  summarizeServer,
} from './model.js'

/** Refuse to parse documents larger than this; agent configs are far smaller. */
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

/**
 * Candidate paths and a document-to-entries extractor for one external tool.
 * @typedef {object} Source
 * @property {string} id
 * @property {string} label
 * @property {'cli' | 'app' | 'ide' | 'extension'} kind
 * @property {string[]} paths
 * @property {'json' | 'toml'} format
 * @property {(doc: Record<string, unknown>, path: string) => { key?: string, label?: string, servers: { name: string, raw: Record<string, unknown> }[] }[]} extract
 */

/** Turn a record-shaped MCP map into extractor scopes. */
function scopesFromKey(key, fallbackServers = []) {
  return (doc) => {
    const value = doc?.[key]
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fallbackServers.length === 0 ? [] : [{ servers: fallbackServers }]
    }
    return [{
      servers: Object.entries(value).map(([name, raw]) => ({ name, raw: raw ?? {} })),
    }]
  }
}

/** Claude Code stores MCP servers globally and per project in one file. */
function extractClaudeCode(doc) {
  const scopes = []
  const global = doc?.mcpServers
  if (global !== null && typeof global === 'object' && !Array.isArray(global)) {
    scopes.push({
      key: 'global',
      label: 'Claude Code',
      servers: Object.entries(global).map(([name, raw]) => ({ name, raw: raw ?? {} })),
    })
  }
  const projects = doc?.projects
  if (projects !== null && typeof projects === 'object' && !Array.isArray(projects)) {
    let seen = 0
    for (const [projectPath, project] of Object.entries(projects)) {
      if (seen >= 50) break
      const servers = project?.mcpServers
      if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) continue
      const entries = Object.entries(servers).map(([name, raw]) => ({ name, raw: raw ?? {} }))
      if (entries.length === 0) continue
      seen += 1
      const short = basename(projectPath) || projectPath
      scopes.push({
        key: `project:${projectPath}`,
        label: `Claude Code · ${short}`,
        servers: entries,
      })
    }
  }
  return scopes
}

/** Continue allows either an object map or an array of named servers. */
function extractContinue(doc) {
  const value = doc?.mcpServers
  if (Array.isArray(value)) {
    return [{
      servers: value.flatMap((raw, index) => {
        if (raw === null || typeof raw !== 'object') return []
        const name = typeof raw.name === 'string' && raw.name !== '' ? raw.name : `server-${index + 1}`
        return [{ name, raw }]
      }),
    }]
  }
  if (value !== null && typeof value === 'object') {
    return [{
      servers: Object.entries(value).map(([name, raw]) => ({ name, raw: raw ?? {} })),
    }]
  }
  return []
}

/** Build the default catalog of external tools. */
export function defaultSources({ home, platform = process.platform, env = process.env }) {
  const mac = platform === 'darwin'
  const win = platform === 'win32'
  const appSupport = mac
    ? join(home, 'Library/Application Support')
    : win
      ? join(env.APPDATA ?? join(home, 'AppData', 'Roaming'))
      : join(env.XDG_CONFIG_HOME ?? join(home, '.config'))
  const configHome = env.XDG_CONFIG_HOME ?? join(home, '.config')
  const vscodeUser = mac
    ? join(appSupport, 'Code', 'User')
    : win
      ? join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Code', 'User')
      : join(configHome, 'Code', 'User')

  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      kind: 'cli',
      format: 'json',
      paths: [join(home, '.claude.json')],
      extract: extractClaudeCode,
    },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      kind: 'app',
      format: 'json',
      paths: [join(appSupport, 'Claude', 'claude_desktop_config.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'codex',
      label: 'Codex',
      kind: 'cli',
      format: 'toml',
      paths: [join(home, '.codex', 'config.toml')],
      extract: scopesFromKey('mcp_servers'),
    },
    {
      id: 'gemini-cli',
      label: 'Gemini CLI',
      kind: 'cli',
      format: 'json',
      paths: [join(home, '.gemini', 'settings.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'cursor',
      label: 'Cursor',
      kind: 'ide',
      format: 'json',
      paths: [
        join(home, '.cursor', 'mcp.json'),
        join(appSupport, 'Cursor', 'User', 'mcp.json'),
        join(configHome, 'Cursor', 'User', 'mcp.json'),
      ],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'windsurf',
      label: 'Windsurf',
      kind: 'ide',
      format: 'json',
      paths: [
        join(home, '.codeium', 'windsurf', 'mcp_config.json'),
        join(appSupport, 'Codeium', 'windsurf', 'mcp_config.json'),
      ],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'cline',
      label: 'Cline',
      kind: 'extension',
      format: 'json',
      paths: [join(vscodeUser, 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'roo-code',
      label: 'Roo Code',
      kind: 'extension',
      format: 'json',
      paths: [join(vscodeUser, 'globalStorage', 'rooveteranking.roo-cline', 'settings', 'mcp_settings.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'kilo-code',
      label: 'Kilo Code',
      kind: 'extension',
      format: 'json',
      paths: [join(vscodeUser, 'globalStorage', 'kilocode.kilo-code', 'settings', 'mcp_settings.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'vscode',
      label: 'VS Code',
      kind: 'ide',
      format: 'json',
      paths: [join(vscodeUser, 'mcp.json')],
      extract: (doc) => {
        const fromServers = scopesFromKey('servers')(doc)
        if (fromServers.length > 0) return fromServers
        return scopesFromKey('mcpServers')(doc)
      },
    },
    {
      id: 'vscode-insiders',
      label: 'VS Code Insiders',
      kind: 'ide',
      format: 'json',
      paths: [join(appSupport, 'Code - Insiders', 'User', 'mcp.json')],
      extract: scopesFromKey('servers'),
    },
    {
      id: 'zed',
      label: 'Zed',
      kind: 'ide',
      format: 'json',
      paths: [
        join(configHome, 'zed', 'settings.json'),
        join(appSupport, 'Zed', 'settings.json'),
      ],
      extract: scopesFromKey('context_servers'),
    },
    {
      id: 'continue',
      label: 'Continue',
      kind: 'extension',
      format: 'json',
      paths: [join(home, '.continue', 'config.json')],
      extract: extractContinue,
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      kind: 'cli',
      format: 'json',
      paths: [
        join(configHome, 'opencode', 'opencode.json'),
        join(appSupport, 'opencode', 'opencode.json'),
      ],
      extract: scopesFromKey('mcp'),
    },
    {
      id: 'crush',
      label: 'Crush',
      kind: 'cli',
      format: 'json',
      paths: [
        join(configHome, 'crush', 'crush.json'),
        join(appSupport, 'crush', 'crush.json'),
      ],
      extract: scopesFromKey('mcp'),
    },
    {
      id: 'factory-droid',
      label: 'Factory Droid',
      kind: 'cli',
      format: 'json',
      paths: [join(home, '.factory', 'mcp.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'lingma',
      label: 'Lingma',
      kind: 'ide',
      format: 'json',
      paths: [
        join(home, '.lingma', 'lingma_mcp.json'),
        join(home, '.lingma', 'extension', 'local', 'mcp.json'),
      ],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'kiro',
      label: 'Kiro',
      kind: 'ide',
      format: 'json',
      paths: [join(home, '.kiro', 'settings', 'mcp.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'amazon-q',
      label: 'Amazon Q',
      kind: 'cli',
      format: 'json',
      paths: [join(home, '.aws', 'amazonq', 'mcp.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'copilot-intellij',
      label: 'GitHub Copilot (JetBrains)',
      kind: 'ide',
      format: 'json',
      paths: [
        join(configHome, 'github-copilot', 'intellij', 'mcp.json'),
        join(appSupport, 'github-copilot', 'intellij', 'mcp.json'),
      ],
      extract: scopesFromKey('servers'),
    },
    {
      id: 'trae',
      label: 'Trae',
      kind: 'ide',
      format: 'json',
      paths: [join(appSupport, 'Trae', 'User', 'mcp.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'qoder',
      label: 'Qoder',
      kind: 'ide',
      format: 'json',
      paths: [join(appSupport, 'Qoder', 'User', 'mcp.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'codebuddy',
      label: 'CodeBuddy',
      kind: 'ide',
      format: 'json',
      paths: [join(appSupport, 'CodeBuddy', 'User', 'mcp.json')],
      extract: scopesFromKey('mcpServers'),
    },
    {
      id: 'zcode',
      label: 'ZCode',
      kind: 'app',
      format: 'json',
      paths: [
        join(home, '.zcode', 'cli', 'config.json'),
        join(home, '.zcode', 'v2', 'config.json'),
        join(home, '.zcode', 'config.json'),
      ],
      extract: (doc) => {
        const servers = doc?.mcp?.servers ?? doc?.mcpServers
        if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) return []
        return [{
          servers: Object.entries(servers).map(([name, raw]) => ({ name, raw: raw ?? {} })),
        }]
      },
    },
    {
      id: 'grok-cli',
      label: 'Grok CLI',
      kind: 'cli',
      format: 'toml',
      paths: [join(home, '.grok', 'config.toml')],
      extract: scopesFromKey('mcp_servers'),
    },
  ]
}

/** Find the first candidate path that exists. */
async function firstExisting(paths) {
  for (const path of paths) {
    try {
      const info = await stat(path)
      if (info.isFile()) return { path, size: info.size, mtimeMs: info.mtimeMs }
    } catch {
      // A missing candidate is the normal case.
    }
  }
  return undefined
}

/** Build one external entry from a raw tool entry. */
function buildExternalEntry(source, path, scope, name, raw) {
  const value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const built = buildSpecFromRaw(value, { baseDir: dirname(path) })
  const warnings = [...built.warnings]
  if (built.spec !== null) {
    for (const placeholder of findPlaceholders(built.spec)) {
      warnings.push(`placeholder:${placeholder}`)
    }
  }
  return {
    key: `${source.id}::${path}::${scope.key ?? ''}::${name}`,
    name,
    importName: sanitizeServerName(name),
    transport: built.spec?.transport ?? '',
    summary: built.spec === null ? '' : summarizeServer(built.spec),
    spec: built.spec,
    enabled: built.enabled,
    unsupported: built.unsupported,
    warnings,
    fingerprint: built.spec === null ? '' : fingerprintOf(built.spec),
    scope: scope.label ?? '',
    sourcePath: path,
    sourceId: source.id,
    sourceLabel: source.label,
  }
}

/**
 * Read every known external tool and return normalized groups.
 * @param {{ home: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, sources?: Source[] }} options
 * @returns {Promise<{ groups: object[], checkedFiles: number, errors: { source: string, path: string, message: string }[] }>}
 */
export async function scanExternal(options) {
  const sources = options.sources ?? defaultSources(options)
  const groups = []
  const errors = []
  let checkedFiles = 0

  for (const source of sources) {
    const found = await firstExisting(source.paths)
    if (found === undefined) continue
    checkedFiles += 1
    try {
      if (found.size > MAX_DOCUMENT_BYTES) {
        throw new Error(`配置文件超过 ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB，已跳过`)
      }
      const text = await readFile(found.path, 'utf8')
      const document = source.format === 'toml' ? parseToml(text) : parseJsonLike(text)
      if (document === null || typeof document !== 'object' || Array.isArray(document)) {
        throw new Error('配置根节点不是对象')
      }
      const scopes = source.extract(document, found.path)
      for (const scope of scopes) {
        const servers = scope.servers.map(({ name, raw }) => buildExternalEntry(source, found.path, scope, name, raw))
        if (servers.length === 0) continue
        groups.push({
          id: `${source.id}::${scope.key ?? 'default'}`,
          sourceId: source.id,
          label: scope.label ?? source.label,
          kind: source.kind,
          format: source.format,
          path: found.path,
          modifiedAt: found.mtimeMs,
          servers,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ source: source.id, path: found.path, message })
      groups.push({
        id: `${source.id}::error`,
        sourceId: source.id,
        label: source.label,
        kind: source.kind,
        format: source.format,
        path: found.path,
        modifiedAt: found.mtimeMs,
        servers: [],
        error: message,
      })
    }
  }

  groups.sort((left, right) => {
    if (left.error !== undefined && right.error === undefined) return -1
    if (right.error !== undefined && left.error === undefined) return 1
    return left.label.localeCompare(right.label)
  })
  return { groups, checkedFiles, errors, scannedAt: Date.now() }
}
