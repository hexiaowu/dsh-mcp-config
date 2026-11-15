import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { start } from '../lib/plugin.js'

/**
 * Post a connection RPC envelope to the plugin's exact `/api` route and unwrap
 * the server response.
 */
async function callRoute(fetchRoutes, endpoint, payload = {}) {
  const handler = fetchRoutes.get('/api/mcp-config.rpc')
  assert.ok(handler, 'RPC route was registered')
  const request = new Request('http://localhost/api/mcp-config.rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'test-request',
      method: 'mcp-config.rpc',
      payload: { endpoint, data: payload },
    }),
  })
  const response = await handler(request)
  const body = await response.json()
  assert.equal(body.rpcId, 'test-request')
  return body.result
}

/**
 * Build a fake Host context around the real plugin. The MCP client package is a
 * tiny local stand-in, so the integration test exercises our configuration,
 * discovery, import, and RPC paths without spawning anything.
 */
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'mcp-config-plugin-'))
  const home = join(root, 'home')
  const profile = join(root, 'profile')
  const fakePackage = join(root, 'node_modules', '@deepseek-ai', 'dsh-mcp-client')
  await mkdir(home, { recursive: true })
  await mkdir(profile, { recursive: true })
  await mkdir(fakePackage, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'fake-profile', version: '1.0.0' }))
  await writeFile(join(fakePackage, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-mcp-client',
    version: '0.0.0-test',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }))
  await writeFile(join(fakePackage, 'index.js'), `
export const name = 'mcp-client'
export const Config = {
  parse(value) {
    if (typeof value !== 'object' || typeof value.serverName !== 'string') throw new Error('serverName is required')
    if (value.transport !== 'stdio' && value.transport !== 'streamable-http') throw new Error('bad transport')
    return value
  },
}
export const apply = () => {}
`)

  await writeFile(join(home, '.claude.json'), JSON.stringify({
    mcpServers: {
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      zai: { command: 'npx', args: ['-y', '@z_ai/mcp-server'], env: { Z_AI_API_KEY: 'secret' } },
      timed: { command: 'node', args: ['timed.js'], timeout: 120 },
    },
  }))
  await mkdir(join(home, '.codex'), { recursive: true })
  await writeFile(join(home, '.codex', 'config.toml'), `[mcp_servers.off]
command = "node"
args = ["off.js"]
enabled = false
`)
  await mkdir(join(home, '.gemini'), { recursive: true })
  await writeFile(join(home, '.gemini', 'settings.json'), JSON.stringify({
    mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  }))

  let saved = { servers: [] }
  const mounted = []
  const cleanup = []

  function makeContext() {
    const entry = {
      id: 'mcp-config',
      name: '@hexiaowu/dsh-mcp-config',
      options: { id: 'mcp-config', name: '@hexiaowu/dsh-mcp-config', config: structuredClone(saved) },
      fiber: { state: 2 },
    }
    const editor = {
      async edit(target, change) {
        const next = change(structuredClone(target.options.config ?? {}))
        saved = structuredClone(next)
        target.options.config = structuredClone(next)
      },
    }
    const fetchRoutes = new Map()
    const ctx = {
      get(name) {
        if (name === 'profileContext') return { dir: profile, installAnchor: join(profile, 'package.json') }
        if (name === 'configEditor') return editor
        if (name === 'loader') return { entries: () => [] }
        if (name === 'tools') return { definitions: () => [] }
        return undefined
      },
      fiber: { entry },
      effect(fn) {
        const disposer = fn()
        cleanup.push(disposer)
        return disposer
      },
      inject(_services, callback) {
        const scope = {
          connection: {
            fetch: {
              register(route) {
                fetchRoutes.set(route.path, route.fetch)
                return () => fetchRoutes.delete(route.path)
              },
            },
          },
          effect(fn) {
            const disposer = fn()
            cleanup.push(disposer)
            return disposer
          },
        }
        callback(scope)
      },
      plugin(namespace, config) {
        mounted.push({ namespace, config })
        return Promise.resolve()
      },
      logger: { error() {} },
    }
    return { ctx, fetchRoutes }
  }

  async function mount(config = saved) {
    saved = structuredClone(config)
    for (const dispose of cleanup.splice(0)) {
      try {
        if (typeof dispose === 'function') dispose()
      } catch {
        // ignored
      }
    }
    mounted.length = 0
    const { ctx, fetchRoutes } = makeContext()
    await start(ctx, saved, { home })
    return {
      call: (endpoint, payload = {}) => callRoute(fetchRoutes, endpoint, payload),
      mounted,
    }
  }

  return {
    home,
    saved: () => saved,
    mount,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

test('state, add, import, update, remove, and profile rows through the RPC surface', async () => {
  const fixture = await harness()
  try {
    let client = await fixture.mount()
    const initial = await client.call('state')
    assert.equal(initial.ok, true)
    assert.equal(initial.value.managed.length, 0)
    assert.equal(initial.value.diagnostics.canWrite, true)
    assert.equal(initial.value.diagnostics.mcpModule.ok, true)
    const claude = initial.value.groups.find((group) => group.id === 'claude-code::global')
    assert.ok(claude)
    assert.equal(claude.servers.length, 3)
    assert.equal(claude.servers[0].spec, undefined)
    assert.equal(claude.servers[0].fingerprint, undefined)
    assert.equal(claude.servers[0].imported, false)

    const added = await client.call('add', {
      server: { name: 'manual', transport: 'stdio', command: 'node', args: ['server.js'], env: { A: '1' } },
    })
    assert.equal(added.ok, true)
    assert.equal(added.value.name, 'manual')
    assert.equal(fixture.saved().servers.length, 1)

    client = await fixture.mount()
    const afterAdd = await client.call('state')
    assert.equal(afterAdd.value.managed.length, 1)
    assert.equal(afterAdd.value.managed[0].name, 'manual')
    assert.equal(afterAdd.value.managed[0].env.A, '1')
    assert.equal(afterAdd.value.managed[0].fingerprint, undefined)
    assert.equal(client.mounted.length, 1)
    assert.equal(client.mounted[0].config.serverName, 'manual')

    const context7 = afterAdd.value.groups
      .find((group) => group.id === 'claude-code::global')
      .servers.find((server) => server.name === 'context7')
    assert.ok(context7)
    const imported = await client.call('import', { key: context7.key })
    assert.equal(imported.ok, true)
    assert.equal(imported.value.name, 'context7')
    assert.equal(fixture.saved().servers.length, 2)

    client = await fixture.mount()
    const afterImport = await client.call('state')
    const claudeAfter = afterImport.value.groups.find((group) => group.id === 'claude-code::global')
    assert.equal(claudeAfter.servers.find((server) => server.name === 'context7').imported, true)
    assert.equal(claudeAfter.servers.find((server) => server.name === 'timed').imported, false)
    const geminiAfter = afterImport.value.groups.find((group) => group.id === 'gemini-cli::default')
    assert.equal(geminiAfter.servers[0].imported, true)
    assert.equal(client.mounted.length, 2)

    const again = await client.call('import', { key: context7.key })
    assert.equal(again.ok, false)
    assert.equal(again.error.code, 'mcp-config/already-imported')

    const timedKey = claudeAfter.servers.find((server) => server.name === 'timed').key
    const timedImport = await client.call('import', { key: timedKey })
    assert.equal(timedImport.ok, true)
    assert.equal(fixture.saved().servers.find((server) => server.name === 'timed').toolCallTimeoutMs, 120000)

    const offKey = afterImport.value.groups
      .find((group) => group.id === 'codex::default')
      .servers.find((server) => server.name === 'off').key
    const offImport = await client.call('import', { key: offKey })
    assert.equal(offImport.ok, true)
    assert.equal(fixture.saved().servers.find((server) => server.name === 'off').disabled, true)

    const manual = afterImport.value.managed.find((server) => server.name === 'manual')
    const updated = await client.call('update', {
      id: manual.id,
      server: { name: 'manual-renamed', transport: 'stdio', command: 'node', args: ['server.js'], env: { A: '2' } },
    })
    assert.equal(updated.ok, true)
    assert.equal(fixture.saved().servers.find((server) => server.id === manual.id).name, 'manual-renamed')

    const removed = await client.call('remove', { id: manual.id })
    assert.equal(removed.ok, true)
    assert.equal(fixture.saved().servers.some((server) => server.id === manual.id), false)
  } finally {
    await fixture.cleanup()
  }
})

test('add rejects duplicate names and invalid transports', async () => {
  const fixture = await harness()
  try {
    const client = await fixture.mount({ servers: [{ name: 'taken', transport: 'stdio', command: 'node' }] })
    const duplicate = await client.call('add', { server: { name: 'taken', transport: 'stdio', command: 'node' } })
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.error.code, 'mcp-config/duplicate-name')

    const invalid = await client.call('add', { server: { name: 'bad', transport: 'sse', url: 'https://x' } })
    assert.equal(invalid.ok, false)
    assert.equal(invalid.error.code, 'mcp-config/unsupported-transport')
  } finally {
    await fixture.cleanup()
  }
})

test('profile-declared MCP rows are listed read-only and block duplicate support', async () => {
  const fixture = await harness()
  try {
    const saved = { servers: [] }
    const entry = {
      id: 'mcp-config',
      name: '@hexiaowu/dsh-mcp-config',
      options: { id: 'mcp-config', name: '@hexiaowu/dsh-mcp-config', config: saved },
      fiber: { state: 2 },
    }
    const profileRow = {
      options: {
        id: 'mcp-context7',
        name: '@deepseek-ai/dsh-mcp-client',
        config: { serverName: 'context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
      fiber: { state: 2 },
    }
    const editor = { async edit(target, change) { saved.servers = change(target.options.config ?? {}).servers } }
    const fetchRoutes = new Map()
    const context = {
      get(name) {
        if (name === 'profileContext') return { dir: join(fixture.home, '..', 'profile'), installAnchor: join(fixture.home, '..', 'profile', 'package.json') }
        if (name === 'configEditor') return editor
        if (name === 'loader') return { entries: () => [entry, profileRow] }
        if (name === 'tools') return { definitions: () => [] }
        return undefined
      },
      fiber: { entry },
      effect(fn) { return fn() },
      inject(_services, callback) {
        callback({
          connection: { fetch: { register(route) { fetchRoutes.set(route.path, route.fetch); return () => fetchRoutes.delete(route.path) } } },
          effect(fn) { return fn() },
        })
      },
      plugin() { return Promise.resolve() },
      logger: { error() {} },
    }
    await start(context, saved, { home: fixture.home })
    const state = await callRoute(fetchRoutes, 'state', {})
    assert.equal(state.ok, true)
    assert.equal(state.value.profileRows.length, 1)
    assert.equal(state.value.profileRows[0].name, 'context7')
    assert.equal(state.value.profileRows[0].fingerprint, undefined)
    assert.equal(state.value.diagnostics.canWrite, true)

    const context7Key = state.value.groups
      .find((group) => group.id === 'claude-code::global')
      .servers.find((server) => server.name === 'context7').key
    const importAttempt = await callRoute(fetchRoutes, 'import', { key: context7Key })
    assert.equal(importAttempt.ok, false)
    assert.equal(importAttempt.error.code, 'mcp-config/already-imported')
    assert.equal(entry.options.config.servers.length, 0)
  } finally {
    await fixture.cleanup()
  }
})

test('external scan runs on first state and manual rescan, not on every state', async () => {
  const fixture = await harness()
  try {
    const client = await fixture.mount()
    const first = await client.call('state')
    assert.equal(first.ok, true)
    const claude = first.value.groups.find((group) => group.id === 'claude-code::global')
    assert.ok(claude)
    assert.equal(claude.servers.length, 3)
    assert.ok(first.value.diagnostics.scannedAt > 0)
    const firstScannedAt = first.value.diagnostics.scannedAt

    const path = join(fixture.home, '.claude.json')
    const document = JSON.parse(await readFile(path, 'utf8'))
    document.mcpServers.added = { command: 'node', args: ['added.js'] }
    await writeFile(path, JSON.stringify(document, null, 2))

    const cached = await client.call('state')
    assert.equal(cached.ok, true)
    assert.equal(cached.value.groups.find((group) => group.id === 'claude-code::global').servers.length, 3)
    assert.equal(cached.value.diagnostics.scannedAt, firstScannedAt)

    const rescanned = await client.call('rescan')
    assert.equal(rescanned.ok, true)
    assert.equal(rescanned.value.groups.find((group) => group.id === 'claude-code::global').servers.length, 4)
    assert.ok(rescanned.value.diagnostics.scannedAt >= firstScannedAt)
  } finally {
    await fixture.cleanup()
  }
})
