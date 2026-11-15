/**
 * Host half of MCP Config.
 *
 * It owns the plugin's `servers` config, mounts each one as a child
 * `@deepseek-ai/dsh-mcp-client` instance (the same bridge native profile rows
 * use), discovers MCP servers already configured in other tools, and exposes a
 * small owner-only RPC channel to the settings page.
 *
 * @module @hexiaowu/dsh-mcp-config/lib/plugin
 */

import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { homedir, platform } from 'node:os'
import { pathToFileURL } from 'node:url'

import {
  McpConfigError,
  MCP_CLIENT_MODULE,
  fingerprintOf,
  normalizeManagedServer,
  readManagedServers,
  summarizeServer,
  toMcpClientConfig,
  uniqueServerName,
} from './model.js'
import { scanExternal } from './scan.js'

/** The profile plugins this plugin needs. */
export const inject = ['loader']

/** Exact `/api` route used by the page; the connection service authenticates it. */
const RPC_PATH = '/api/mcp-config.rpc'

/** Cached import of the shipped MCP client, shared by every plugin generation. */
let mcpClientModule
let mcpClientFailure

/**
 * External-tool scan results for the current process and home. They survive a
 * plugin generation restart so a config write does not silently force a disk
 * rescan; only the first page entry or an explicit rescan refreshes them.
 */
let externalScanCache
let externalScanHome
let externalScanFailure = ''

/** Drop the scan cache when the scanner points at a different home. */
function resetExternalScanCache(home) {
  if (externalScanHome === home) return
  externalScanHome = home
  externalScanCache = undefined
  externalScanFailure = ''
}

/** Reuse the cached external scan unless asked to re-read files. */
async function ensureExternalScan(instance, force) {
  resetExternalScanCache(instance.home)
  if (!force && externalScanCache !== undefined) return externalScanCache
  try {
    const scan = await scanExternal({ home: instance.home, platform: platform(), env: process.env })
    externalScanCache = scan
    externalScanFailure = ''
    return scan
  } catch (error) {
    externalScanFailure = error instanceof Error ? error.message : String(error)
    if (externalScanCache !== undefined) return externalScanCache
    return { groups: [], checkedFiles: 0, errors: [], scannedAt: 0 }
  }
}

/**
 * Load the shipped `@deepseek-ai/dsh-mcp-client` module from the installation
 * that owns this profile. The installation is the only place the package is
 * guaranteed to exist; the profile itself does not depend on it.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
async function loadMcpClient(ctx) {
  if (mcpClientModule !== undefined) return mcpClientModule
  if (mcpClientFailure !== undefined) throw mcpClientFailure
  try {
    const profile = ctx.get('profileContext')
    const anchor = profile?.installAnchor
    if (typeof anchor !== 'string' || anchor === '') {
      throw new McpConfigError(
        'mcp-config/mcp-module-unavailable',
        'Cannot locate the DSH installation (profileContext.installAnchor is missing)',
      )
    }
    const require = createRequire(anchor)
    const resolved = require.resolve(MCP_CLIENT_MODULE)
    const namespace = await import(pathToFileURL(resolved).href)
    if (typeof namespace.apply !== 'function') {
      throw new McpConfigError('mcp-config/mcp-module-unavailable', `${MCP_CLIENT_MODULE} does not export apply()`)
    }
    mcpClientModule = namespace
    return namespace
  } catch (error) {
    mcpClientFailure = error
    throw error
  }
}

/** Compact persisted shape: defaults and empty values stay out of the profile patch. */
function serializeServer(server) {
  /** @type {Record<string, unknown>} */
  const out = {
    id: server.id,
    name: server.name,
    transport: server.transport,
  }
  if (server.transport === 'stdio') {
    out.command = server.command
    out.args = [...server.args]
    out.env = { ...server.env }
    if (server.cwd !== '') out.cwd = server.cwd
  } else {
    out.url = server.url
    out.headers = { ...server.headers }
  }
  if (server.toolCallTimeoutMs !== 60_000) out.toolCallTimeoutMs = server.toolCallTimeoutMs
  if (server.failOnStartupError) out.failOnStartupError = true
  if (server.disabled) out.disabled = true
  if (server.origin !== '') out.origin = server.origin
  return out
}

/** Current MCP server rows the profile declares directly through the shipped client. */
function listProfileRows(ctx) {
  const loader = ctx.get('loader')
  if (loader === undefined || typeof loader.entries !== 'function') return []
  const rows = []
  try {
    for (const entry of loader.entries()) {
      if (entry?.options?.name !== MCP_CLIENT_MODULE) continue
      const raw = entry.options.config ?? {}
      const entryId = String(entry.options.id ?? '')
      const name = typeof raw.serverName === 'string' && raw.serverName !== '' ? raw.serverName : entryId
      let server
      let error = ''
      try {
        server = normalizeManagedServer({ ...raw, name, id: entryId || `profile-${name}` })
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure)
      }
      rows.push({
        id: entryId,
        name,
        transport: server?.transport ?? String(raw.transport ?? ''),
        summary: server === undefined ? '' : summarizeServer(server),
        fingerprint: server === undefined ? '' : fingerprintOf(server),
        enabled: entry.fiber?.state === 2 && entry.options.disabled !== true,
        error,
        source: 'profile',
      })
    }
  } catch {
    // A loader that cannot enumerate entries leaves the section empty rather
    // than taking the whole page down.
  }
  return rows
}

/** Count live tools per known MCP server namespace from the tool registry. */
function toolCounts(ctx, names) {
  const counts = new Map()
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools.definitions !== 'function') return counts
  try {
    for (const name of names) counts.set(name, 0)
    for (const definition of tools.definitions()) {
      const toolName = typeof definition?.name === 'string' ? definition.name : ''
      if (!toolName.startsWith('mcp__')) continue
      for (const name of names) {
        if (toolName.startsWith(`mcp__${name}__`)) {
          counts.set(name, (counts.get(name) ?? 0) + 1)
          break
        }
      }
    }
  } catch {
    // Counting is presentation only.
  }
  return counts
}

/** Build the complete page snapshot from the current generation. */
async function buildState(instance, options = {}) {
  const { ctx, servers, configErrors, mountErrors, mcpLoadError } = instance
  const profileRows = listProfileRows(ctx)
  const counts = toolCounts(ctx, [...servers.map((server) => server.name), ...profileRows.map((row) => row.name)])
  const managed = servers.map((server) => ({
    ...server,
    summary: summarizeServer(server),
    toolCount: counts.get(server.name) ?? 0,
    mountError: mountErrors.get(server.id) ?? '',
    status: server.disabled ? 'disabled' : mountErrors.has(server.id) ? 'error' : 'enabled',
  }))
  const takenNames = new Set([...managed.map((server) => server.name), ...profileRows.map((row) => row.name)])
  const fingerprints = new Set([
    ...servers.map((server) => fingerprintOf(server)),
    ...profileRows.map((row) => row.fingerprint).filter((value) => value !== ''),
  ])

  const scan = await ensureExternalScan(instance, options.forceScan === true)
  const scanFailure = externalScanFailure

  const groups = scan.groups.map((group) => ({
    ...group,
    servers: group.servers.map((server) => {
      const imported = server.fingerprint !== '' && fingerprints.has(server.fingerprint)
      const suggestedName = uniqueServerName(server.importName, takenNames)
      // The import is looked up by key on the Host; never send raw env values or
      // fingerprints (which embed them) to the browser for external entries.
      return {
        key: server.key,
        name: server.name,
        transport: server.transport,
        summary: server.summary,
        enabled: server.enabled,
        unsupported: server.unsupported,
        warnings: server.warnings,
        scope: server.scope,
        envCount: server.spec === null ? 0 : Object.keys(server.spec.env ?? {}).length,
        headerCount: server.spec === null ? 0 : Object.keys(server.spec.headers ?? {}).length,
        imported,
        nameTaken: takenNames.has(server.importName),
        suggestedName,
        renamed: suggestedName !== server.importName,
      }
    }),
  }))

  const editor = ctx.get('configEditor')
  const profile = ctx.get('profileContext')
  return {
    managed,
    profileRows: profileRows.map(({ fingerprint, ...row }) => row),
    groups,
    configErrors,
    diagnostics: {
      canWrite: editor !== undefined && ctx.fiber?.entry !== undefined,
      profileDir: profile?.dir ?? '',
      mcpModule: {
        ok: mcpLoadError === '',
        error: mcpLoadError,
      },
      checkedFiles: scan.checkedFiles,
      scannedAt: scan.scannedAt ?? 0,
      scanFailure,
      scanErrors: scan.errors,
      rpcPath: RPC_PATH,
      generatedAt: Date.now(),
    },
  }
}

/** The names a new or edited server may not take. */
function takenNamesFor(instance, exceptId) {
  const names = new Set()
  for (const server of instance.servers) {
    if (server.id !== exceptId) names.add(server.name)
  }
  for (const row of listProfileRows(instance.ctx)) names.add(row.name)
  return names
}

/** Reject a name already reserved by another managed or profile server. */
function assertNameFree(instance, name, exceptId) {
  if (takenNamesFor(instance, exceptId).has(name)) {
    throw new McpConfigError('mcp-config/duplicate-name', `MCP server name already in use: ${name}`, { name })
  }
}

/** Persist the whole managed list through the profile config editor. */
async function saveServers(instance, servers) {
  const ctx = instance.ctx
  const editor = ctx.get('configEditor')
  const entry = ctx.fiber?.entry
  if (editor === undefined || entry === undefined) {
    throw new McpConfigError(
      'mcp-config/config-unavailable',
      'This deployment cannot persist profile plugin configuration (configEditor is unavailable)',
    )
  }
  const serialized = servers.map(serializeServer)
  await editor.edit(entry, (current) => ({ ...(current ?? {}), servers: serialized }))
}

/** Add one server and persist the new generation. */
async function addServer(instance, payload) {
  const raw = payload?.server
  const server = normalizeManagedServer({ ...(raw ?? {}), id: randomUUID() })
  assertNameFree(instance, server.name)
  await saveServers(instance, [...instance.servers, server])
  return { saved: true, name: server.name }
}

/** Replace one server and persist the new generation. */
async function updateServer(instance, payload) {
  const id = typeof payload?.id === 'string' ? payload.id : ''
  const index = instance.servers.findIndex((server) => server.id === id)
  if (index < 0) throw new McpConfigError('mcp-config/not-found', `No managed MCP server with id ${JSON.stringify(id)}`, { id })
  const existing = instance.servers[index]
  const server = normalizeManagedServer({ ...(payload?.server ?? {}), id, origin: existing.origin })
  assertNameFree(instance, server.name, id)
  const next = [...instance.servers]
  next[index] = server
  await saveServers(instance, next)
  return { saved: true, name: server.name }
}

/** Remove one server and persist the new generation. */
async function removeServer(instance, payload) {
  const id = typeof payload?.id === 'string' ? payload.id : ''
  const next = instance.servers.filter((server) => server.id !== id)
  if (next.length === instance.servers.length) {
    throw new McpConfigError('mcp-config/not-found', `No managed MCP server with id ${JSON.stringify(id)}`, { id })
  }
  await saveServers(instance, next)
  return { saved: true }
}

/** Import one server discovered in another tool, choosing a free name. */
async function importServer(instance, payload) {
  const key = typeof payload?.key === 'string' ? payload.key : ''
  const scan = await ensureExternalScan(instance, false)
  let entry
  for (const group of scan.groups) {
    for (const server of group.servers) {
      if (server.key === key) {
        entry = { group, server }
        break
      }
    }
    if (entry !== undefined) break
  }
  if (entry === undefined) {
    throw new McpConfigError('mcp-config/import-not-found', 'The external MCP server no longer exists; rescan and try again', { key })
  }
  if (entry.server.spec === null) {
    throw new McpConfigError('mcp-config/unsupported-transport', `Cannot import ${entry.server.name}: ${entry.server.unsupported}`, {
      name: entry.server.name,
      reason: entry.server.unsupported,
    })
  }
  const fingerprint = fingerprintOf(entry.server.spec)
  const profileRows = listProfileRows(instance.ctx)
  const duplicate = instance.servers.some((server) => fingerprintOf(server) === fingerprint)
    || profileRows.some((row) => row.fingerprint === fingerprint)
  if (duplicate) {
    throw new McpConfigError('mcp-config/already-imported', `${entry.server.name} is already configured in DSH`, {
      name: entry.server.name,
    })
  }
  const names = new Set([
    ...instance.servers.map((server) => server.name),
    ...profileRows.map((row) => row.name),
  ])
  const name = uniqueServerName(entry.server.importName, names)
  const origin = `${entry.group.label} · ${basename(entry.group.path)}`
  const server = normalizeManagedServer({
    ...entry.server.spec,
    id: randomUUID(),
    name,
    origin,
    disabled: entry.server.enabled === false,
  })
  await saveServers(instance, [...instance.servers, server])
  return { saved: true, name, renamed: name !== entry.server.importName }
}

/** Mount one managed server as a child MCP client instance. */
function mountServer(instance, namespace, server) {
  if (server.disabled) return
  const profileNames = new Set(listProfileRows(instance.ctx).map((row) => row.name))
  if (profileNames.has(server.name)) {
    instance.mountErrors.set(server.id, `名称已被 profile 中的 MCP 服务占用：${server.name}`)
    return
  }
  let config
  try {
    const candidate = toMcpClientConfig(server)
    config = typeof namespace.Config?.parse === 'function' ? namespace.Config.parse(candidate) : candidate
  } catch (error) {
    instance.mountErrors.set(server.id, error instanceof Error ? error.message : String(error))
    return
  }
  try {
    const fiber = instance.ctx.plugin(namespace, config)
    Promise.resolve(fiber).then(
      () => {
        instance.mountErrors.delete(server.id)
      },
      (error) => {
        instance.mountErrors.set(server.id, error instanceof Error ? error.message : String(error))
        instance.ctx.logger?.error(`mcp-config: MCP server ${server.name} failed to start: ${String(error)}`)
      },
    )
  } catch (error) {
    instance.mountErrors.set(server.id, error instanceof Error ? error.message : String(error))
    instance.ctx.logger?.error(`mcp-config: cannot mount MCP server ${server.name}: ${String(error)}`)
  }
}

/** Import the client and mount every enabled managed server without blocking activation. */
async function mountManaged(instance) {
  let namespace
  try {
    namespace = await loadMcpClient(instance.ctx)
  } catch (error) {
    instance.mcpLoadError = error instanceof Error ? error.message : String(error)
    instance.ctx.logger?.error(`mcp-config: ${MCP_CLIENT_MODULE} is unavailable: ${String(error)}`)
    return
  }
  for (const server of instance.servers) mountServer(instance, namespace, server)
}

/** Route one browser call, turning every failure into the RPC result envelope. */
async function dispatch(instance, endpoint, payload) {
  try {
    switch (endpoint) {
      case 'state':
        return { ok: true, value: await buildState(instance, { forceScan: false }) }
      case 'rescan':
        return { ok: true, value: await buildState(instance, { forceScan: true }) }
      case 'add':
        return { ok: true, value: await addServer(instance, payload) }
      case 'update':
        return { ok: true, value: await updateServer(instance, payload) }
      case 'remove':
        return { ok: true, value: await removeServer(instance, payload) }
      case 'import':
        return { ok: true, value: await importServer(instance, payload) }
      default:
        throw new McpConfigError('mcp-config/unknown-endpoint', `Unknown MCP Config endpoint: ${endpoint}`, { endpoint })
    }
  } catch (error) {
    if (error instanceof McpConfigError) {
      return {
        ok: false,
        error: { code: error.code, message: error.message, details: error.details ?? {} },
      }
    }
    return {
      ok: false,
      error: {
        code: 'mcp-config/internal',
        message: error instanceof Error ? error.message : String(error),
        details: {},
      },
    }
  }
}

/**
 * Answer one connection RPC envelope posted to {@link RPC_PATH}. Using the
 * generic connection envelope (rather than a page-specific protocol) keeps the
 * call on the same transport the API gateway uses, including Desktop's bridge.
 * @param {object} instance
 * @param {Request} request
 */
async function serveRpc(instance, request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return new Response('content type must be application/json', { status: 415 })
  let body
  try {
    body = await request.json()
  } catch {
    return new Response('body is not JSON', { status: 400 })
  }
  const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : ''
  if (rpcId === '') return new Response('invalid client-request envelope', { status: 400 })
  const endpoint = typeof body?.payload?.endpoint === 'string' ? body.payload.endpoint : ''
  const data = body?.payload?.data ?? {}
  const result = await dispatch(instance, endpoint, data)
  return Response.json({ type: 'server-response', rpcId, result })
}

/**
 * Mount MCP Config with explicit scan roots. Exported so tests can point the
 * scanner at a fixture home instead of the process user's home.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ servers?: unknown }} [config]
 * @param {{ home?: string }} [options]
 */
export async function start(ctx, config, options = {}) {
  // A failed module load is retried on the next plugin generation; a successful
  // one stays cached for the process.
  if (mcpClientModule === undefined) mcpClientFailure = undefined
  const { servers, errors } = readManagedServers(config)
  const instance = {
    ctx,
    servers,
    configErrors: errors,
    mountErrors: new Map(),
    mcpLoadError: '',
    home: options.home ?? homedir(),
  }
  resetExternalScanCache(instance.home)

  // Register the page bridge before importing anything slow, so a config write's
  // restart never leaves the browser without a route for longer than necessary.
  ctx.inject(['connection'], (scope) => {
    scope.effect(
      () => scope.connection.fetch.register({
        path: RPC_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => serveRpc(instance, request),
      }),
      'mcp-config: browser RPC',
    )
  })

  await mountManaged(instance)
}

/**
 * Mount MCP Config in the current profile.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ servers?: unknown }} [config]
 */
export async function apply(ctx, config) {
  return start(ctx, config, { home: homedir() })
}

