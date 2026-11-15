/**
 * Core MCP server model shared by the Host plugin and its tests.
 *
 * A managed server is the portable description of one MCP connection. It is
 * deliberately independent from `@deepseek-ai/dsh-mcp-client`'s config schema:
 * the scanner only ever needs this shape, and {@link toMcpClientConfig} is the
 * one place that translates it into the shipped client's vocabulary.
 *
 * @module @hexiaowu/dsh-mcp-config/lib/model
 */

import { resolve as resolvePath } from 'node:path'

/** Package that owns the actual MCP transports and tool bridge. */
export const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** The `serverName` grammar accepted by `@deepseek-ai/dsh-mcp-client`. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Default per-call timeout documented by the MCP client. */
export const DEFAULT_TOOL_TIMEOUT_MS = 60_000

/** Longest server name, kept in sync with the client's public tool-name budget. */
export const MAX_SERVER_NAME_LENGTH = 32

/** A failure with a stable code the browser translates into localized copy. */
export class McpConfigError extends Error {
  /**
   * @param {string} code - stable `mcp-config/*` reason.
   * @param {string} message - developer-facing diagnostic; never rendered raw for known codes.
   * @param {Record<string, unknown>} [details] - structured context for the caller.
   */
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'McpConfigError'
    this.code = code
    this.details = details
  }
}

/** Coerce a scalar to a trimmed string, or the fallback. */
export function asString(value, fallback = '') {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

/** Coerce an array-like of scalars to string values, dropping structured items. */
export function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (typeof item === 'number' || typeof item === 'boolean') return [String(item)]
    return []
  })
}

/** Coerce a record of scalars to a string dictionary, dropping non-scalars. */
export function asStringRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === '') continue
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      out[key] = String(item)
    }
  }
  return out
}

/**
 * Split a shell-ish argument string without invoking a shell.
 * Supports single and double quotes plus backslash escapes.
 * @param {string} input
 * @returns {string[]}
 */
export function splitCommandLine(input) {
  const text = asString(input)
  /** @type {string[]} */
  const parts = []
  let current = ''
  let quote = ''
  let escaped = false
  let started = false
  for (const character of text) {
    if (escaped) {
      current += character
      escaped = false
      started = true
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote !== '') {
      if (character === quote) quote = ''
      else current += character
      started = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (/\s/.test(character)) {
      if (started) {
        parts.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += character
    started = true
  }
  if (escaped) current += '\\'
  if (started) parts.push(current)
  return parts
}

/**
 * Turn any human label into a valid MCP `serverName`.
 * @param {string} input
 * @param {string} [fallback]
 * @returns {string}
 */
export function sanitizeServerName(input, fallback = 'mcp') {
  const cleaned = asString(input)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  const candidate = cleaned === '' ? fallback : cleaned
  return candidate.slice(0, MAX_SERVER_NAME_LENGTH)
}

/**
 * Find the first free name derived from `base`, appending `-2`, `-3`, ...
 * @param {string} base
 * @param {Iterable<string>} takenNames
 * @returns {string}
 */
export function uniqueServerName(base, takenNames) {
  const taken = new Set(takenNames)
  const root = sanitizeServerName(base)
  if (!taken.has(root)) return root
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const marker = `-${suffix}`
    const head = root.slice(0, MAX_SERVER_NAME_LENGTH - marker.length)
    const candidate = `${head}${marker}`
    if (!taken.has(candidate)) return candidate
  }
  return `${root.slice(0, MAX_SERVER_NAME_LENGTH - 5)}-9999`
}

/** Normalize a URL for equality checks without changing its stored form. */
export function normalizeUrl(input) {
  const text = asString(input).trim()
  if (text === '') return ''
  try {
    const url = new URL(text)
    url.hash = ''
    let href = url.href
    href = href.replace(/\/+$/, '')
    return href
  } catch {
    return text.replace(/\/+$/, '')
  }
}

/** Sort a string dictionary so environment/header order never affects identity. */
function sortedRecord(record) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const key of Object.keys(record).sort()) out[key] = record[key]
  return out
}

/**
 * Map a loose transport label onto one of the two transports DSH supports.
 * Returns `'sse'` or `''` for values that need a caller decision.
 * @param {unknown} value
 * @returns {'stdio' | 'streamable-http' | 'sse' | ''}
 */
export function normalizeTransportLabel(value) {
  const label = asString(value).trim().toLowerCase()
  if (label === '') return ''
  if (label === 'stdio' || label === 'local' || label === 'command' || label === 'child_process') return 'stdio'
  if (label === 'http' || label === 'https' || label === 'streamable-http' || label === 'streamablehttp' || label === 'streamable_http' || label === 'remote') return 'streamable-http'
  if (label === 'sse' || label === 'http+sse' || label === 'server-sent-events') return 'sse'
  return ''
}

/**
 * Whether a connection description names a stdio server.
 * @param {Record<string, unknown>} raw
 */
export function looksLikeStdio(raw) {
  if (raw.command !== undefined && raw.command !== null) return true
  const label = asString(raw.type ?? raw.transport).trim().toLowerCase()
  return label === 'stdio' || label === 'local' || label === 'command'
}

/** Extract the command, args, and env from a command that may be an array or an object. */
function readCommandShape(raw) {
  const command = raw.command
  let executable = ''
  let args = []
  let env = {}
  if (Array.isArray(command)) {
    executable = asString(command[0])
    args = asStringArray(command.slice(1))
  } else if (command !== null && typeof command === 'object') {
    executable = asString(command.path ?? command.command ?? command.executable)
    args = asStringArray(command.args)
    env = asStringRecord(command.env)
  } else {
    executable = asString(command)
  }
  return { executable, args, env }
}

/** Read a tool-call timeout, treating small values as seconds. */
function readToolTimeout(raw) {
  const declared = Number(raw.toolCallTimeoutMs ?? raw.timeoutMs ?? raw.timeout)
  if (!Number.isFinite(declared) || declared <= 0) return 0
  const milliseconds = declared < 1000 ? declared * 1000 : declared
  return Math.min(Math.round(milliseconds), 3_600_000)
}

/**
 * Build a normalized connection spec from an external tool's entry.
 * The caller supplies the display name separately.
 * @param {Record<string, unknown>} raw
 * @param {{ baseDir?: string }} [options]
 * @returns {{ spec: Record<string, unknown>, enabled: boolean, unsupported: string, warnings: string[] }}
 */
export function buildSpecFromRaw(raw, options = {}) {
  const baseDir = options.baseDir ?? ''
  const warnings = []
  const declared = normalizeTransportLabel(raw.type ?? raw.transport)
  const commandShape = readCommandShape(raw)
  const url = asString(raw.url ?? raw.httpUrl ?? raw.serverUrl ?? raw.endpoint ?? raw.uri).trim()
  const hasCommand = commandShape.executable !== ''
  let transport = declared
  if (transport === '') transport = hasCommand ? 'stdio' : url !== '' ? 'streamable-http' : ''

  if (transport === 'sse') {
    return {
      spec: null,
      enabled: raw.disabled !== true && raw.enabled !== false,
      unsupported: 'sse',
      warnings,
    }
  }
  if (transport === '') {
    return {
      spec: null,
      enabled: raw.disabled !== true && raw.enabled !== false,
      unsupported: 'unknown',
      warnings,
    }
  }

  const enabled = raw.disabled !== true && raw.enabled !== false

  if (transport === 'stdio') {
    if (!hasCommand) {
      return { spec: null, enabled, unsupported: 'missing-command', warnings }
    }
    const args = commandShape.args.length > 0 ? commandShape.args : Array.isArray(raw.args) ? asStringArray(raw.args) : typeof raw.args === 'string' ? splitCommandLine(raw.args) : []
    const env = { ...commandShape.env, ...asStringRecord(raw.env), ...asStringRecord(raw.environment) }
    const rawCwd = asString(raw.cwd ?? raw.workingDirectory ?? raw.working_dir).trim()
    const cwd = rawCwd === '' ? '' : resolvePath(baseDir === '' ? '.' : baseDir, rawCwd)
    const envVars = asStringArray(raw.env_vars ?? raw.envVars)
    if (envVars.length > 0) {
      const missing = []
      for (const key of envVars) {
        if (Object.hasOwn(env, key)) continue
        const value = process.env[key]
        if (value !== undefined) env[key] = value
        else missing.push(key)
      }
      if (missing.length > 0) warnings.push(`env_vars-missing:${missing.join(',')}`)
    }
    return {
      spec: {
        transport: 'stdio',
        command: commandShape.executable,
        args,
        env,
        cwd,
        ...(readToolTimeout(raw) === 0 ? {} : { toolCallTimeoutMs: readToolTimeout(raw) }),
      },
      enabled,
      unsupported: '',
      warnings,
    }
  }

  if (url === '') {
    return { spec: null, enabled, unsupported: 'missing-url', warnings }
  }
  const requestInit = raw.requestInit !== null && typeof raw.requestInit === 'object' ? raw.requestInit : {}
  const headers = {
    ...asStringRecord(raw.headers),
    ...asStringRecord(raw.httpHeaders),
    ...asStringRecord(requestInit.headers),
  }
  return {
    spec: {
      transport: 'streamable-http',
      url,
      headers,
      ...(readToolTimeout(raw) === 0 ? {} : { toolCallTimeoutMs: readToolTimeout(raw) }),
    },
    enabled,
    unsupported: '',
    warnings,
  }
}

/**
 * The identity of a connection: everything that determines which server it is.
 * Names, ids, timeouts, and enablement are deliberately excluded, so the same
 * server imported under another name is still recognised as already present.
 * @param {{ transport: string, command?: string, args?: string[], env?: Record<string,string>, cwd?: string, url?: string, headers?: Record<string,string> }} spec
 * @returns {string}
 */
export function fingerprintOf(spec) {
  if (spec.transport === 'streamable-http') {
    return JSON.stringify({
      transport: 'streamable-http',
      url: normalizeUrl(spec.url),
      headers: sortedRecord(asStringRecord(spec.headers)),
    })
  }
  return JSON.stringify({
    transport: 'stdio',
    command: asString(spec.command),
    args: asStringArray(spec.args),
    env: sortedRecord(asStringRecord(spec.env)),
    cwd: asString(spec.cwd),
  })
}

/**
 * Validate and normalize one managed server read from plugin config or sent by
 * the browser. Throws {@link McpConfigError} with a translatable code.
 * @param {Record<string, unknown>} raw
 * @param {{ fallbackId?: string }} [options]
 * @returns {{ id: string, name: string, transport: string, command: string, args: string[], env: Record<string,string>, cwd: string, url: string, headers: Record<string,string>, toolCallTimeoutMs: number, failOnStartupError: boolean, disabled: boolean, origin: string }}
 */
export function normalizeManagedServer(raw, options = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new McpConfigError('mcp-config/invalid-server', 'MCP server must be an object')
  }
  const name = asString(raw.name).trim()
  if (!SERVER_NAME_PATTERN.test(name)) {
    throw new McpConfigError('mcp-config/invalid-name', `Invalid MCP server name: ${JSON.stringify(name)}`, { name })
  }
  const transport = normalizeTransportLabel(raw.transport ?? raw.type)
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw new McpConfigError('mcp-config/unsupported-transport', `Unsupported MCP transport: ${JSON.stringify(raw.transport)}`, {
      transport: asString(raw.transport),
    })
  }
  const id = asString(raw.id).trim() || options.fallbackId || `auto-${name}`
  const declaredTimeout = Number(raw.toolCallTimeoutMs)
  const toolCallTimeoutMs = Number.isFinite(declaredTimeout) && declaredTimeout > 0
    ? Math.min(Math.round(declaredTimeout), 3_600_000)
    : DEFAULT_TOOL_TIMEOUT_MS
  const base = {
    id,
    name,
    transport,
    command: '',
    args: [],
    env: {},
    cwd: '',
    url: '',
    headers: {},
    toolCallTimeoutMs,
    failOnStartupError: raw.failOnStartupError === true,
    disabled: raw.disabled === true,
    origin: asString(raw.origin).slice(0, 240),
  }
  if (transport === 'stdio') {
    const command = asString(raw.command).trim()
    if (command === '') {
      throw new McpConfigError('mcp-config/missing-command', 'A stdio MCP server needs a command', { name })
    }
    return {
      ...base,
      command,
      args: asStringArray(raw.args),
      env: asStringRecord(raw.env),
      cwd: asString(raw.cwd).trim(),
    }
  }
  const url = asString(raw.url).trim()
  if (!/^https?:\/\//i.test(url)) {
    throw new McpConfigError('mcp-config/missing-url', 'A Streamable HTTP MCP server needs an http(s) URL', { name })
  }
  return {
    ...base,
    url,
    headers: asStringRecord(raw.headers),
  }
}

/**
 * Read the managed servers out of a raw plugin config, collecting per-entry
 * problems instead of failing the whole plugin.
 * @param {{ servers?: unknown } | undefined} config
 * @returns {{ servers: ReturnType<typeof normalizeManagedServer>[], errors: { index: number, code: string, message: string, name: string }[] }}
 */
export function readManagedServers(config) {
  const list = Array.isArray(config?.servers) ? config.servers : []
  /** @type {ReturnType<typeof normalizeManagedServer>[]} */
  const servers = []
  const errors = []
  const ids = new Set()
  const names = new Set()
  list.forEach((raw, index) => {
    try {
      const server = normalizeManagedServer(raw, { fallbackId: `auto-${index + 1}` })
      let id = server.id
      for (let suffix = 2; ids.has(id); suffix += 1) id = `${server.id}-${suffix}`
      server.id = id
      if (names.has(server.name)) {
        throw new McpConfigError('mcp-config/duplicate-name', `Duplicate MCP server name: ${server.name}`, { name: server.name })
      }
      ids.add(id)
      names.add(server.name)
      servers.push(server)
    } catch (error) {
      errors.push({
        index,
        code: error instanceof McpConfigError ? error.code : 'mcp-config/invalid-server',
        message: error instanceof Error ? error.message : String(error),
        name: asString(raw?.name),
      })
    }
  })
  return { servers, errors }
}

/**
 * Remove fields that only exist for the browser, producing the exact config
 * `@deepseek-ai/dsh-mcp-client` expects.
 * @param {ReturnType<typeof normalizeManagedServer>} server
 */
export function toMcpClientConfig(server) {
  const common = {
    serverName: server.name,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
  }
  if (server.transport === 'stdio') {
    return {
      ...common,
      command: server.command,
      args: [...server.args],
      env: { ...server.env },
      ...(server.cwd === '' ? {} : { cwd: server.cwd }),
    }
  }
  return {
    ...common,
    url: server.url,
    headers: { ...server.headers },
  }
}

/**
 * One-line presentation of a connection for list rows.
 * @param {ReturnType<typeof normalizeManagedServer> | { transport: string, command?: string, args?: string[], url?: string, headers?: Record<string,string> }} server
 * @returns {string}
 */
export function summarizeServer(server) {
  if (server.transport === 'streamable-http') {
    const headers = Object.keys(asStringRecord(server.headers)).length
    return headers === 0 ? asString(server.url) : `${asString(server.url)}  ·  ${headers} headers`
  }
  const full = [asString(server.command), ...asStringArray(server.args)].filter((part) => part !== '').join(' ')
  return full
}

/**
 * Find template placeholders such as `${input:token}` that need a manual edit
 * after import.
 * @param {Record<string, unknown>} spec
 * @returns {string[]}
 */
export function findPlaceholders(spec) {
  const found = new Set()
  const visit = (value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\$\{[^}]+\}/g)) found.add(match[0])
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item)
    }
  }
  visit(spec)
  return [...found]
}
