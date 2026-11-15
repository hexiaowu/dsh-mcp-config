import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSpecFromRaw,
  fingerprintOf,
  normalizeManagedServer,
  readManagedServers,
  sanitizeServerName,
  splitCommandLine,
  summarizeServer,
  toMcpClientConfig,
  uniqueServerName,
} from '../lib/model.js'

test('sanitizeServerName keeps the client name grammar', () => {
  assert.equal(sanitizeServerName('Z.ai MCP Server'), 'Z-ai-MCP-Server')
  assert.equal(sanitizeServerName('  '), 'mcp')
  assert.equal(sanitizeServerName('a'.repeat(50)).length, 32)
  assert.ok(!sanitizeServerName('大模型').includes('大'))
})

test('uniqueServerName appends suffixes without exceeding the budget', () => {
  assert.equal(uniqueServerName('context7', []), 'context7')
  assert.equal(uniqueServerName('context7', ['context7']), 'context7-2')
  assert.equal(uniqueServerName('context7', ['context7', 'context7-2']), 'context7-3')
  const long = 'x'.repeat(32)
  assert.equal(uniqueServerName(long, [long]).length, 32)
  assert.ok(uniqueServerName(long, [long]).endsWith('-2'))
})

test('splitCommandLine honors quotes and escapes', () => {
  assert.deepEqual(splitCommandLine('npx -y "@scope/pkg"'), ['npx', '-y', '@scope/pkg'])
  assert.deepEqual(splitCommandLine("node 'a b.js' --flag"), ['node', 'a b.js', '--flag'])
  assert.deepEqual(splitCommandLine('a\\ b c'), ['a b', 'c'])
})

test('fingerprint ignores name, timeout, enablement, and map order', () => {
  const left = normalizeManagedServer({
    name: 'one',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { B: '2', A: '1' },
    toolCallTimeoutMs: 1000,
    disabled: true,
  })
  const right = normalizeManagedServer({
    name: 'two',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { A: '1', B: '2' },
    toolCallTimeoutMs: 90000,
  })
  assert.equal(fingerprintOf(left), fingerprintOf(right))
})

test('fingerprint separates stdio from HTTP and normalizes URL slashes', () => {
  const stdio = fingerprintOf({ transport: 'stdio', command: 'npx', args: [], env: {} })
  const http = fingerprintOf({ transport: 'streamable-http', url: 'https://example.com/mcp/', headers: {} })
  const httpSlash = fingerprintOf({ transport: 'streamable-http', url: 'https://example.com/mcp', headers: {} })
  assert.notEqual(stdio, http)
  assert.equal(http, httpSlash)
})

test('buildSpecFromRaw reads a Claude-style stdio entry', () => {
  const built = buildSpecFromRaw({
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    env: { TOKEN: 'secret' },
    type: 'stdio',
  })
  assert.equal(built.unsupported, '')
  assert.equal(built.spec.transport, 'stdio')
  assert.equal(built.spec.command, 'npx')
  assert.deepEqual(built.spec.args, ['-y', '@upstash/context7-mcp'])
  assert.equal(built.spec.env.TOKEN, 'secret')
})

test('buildSpecFromRaw reads an HTTP entry with requestInit headers', () => {
  const built = buildSpecFromRaw({
    url: 'https://api.githubcopilot.com/mcp/',
    requestInit: { headers: { Authorization: 'Bearer t' } },
  })
  assert.equal(built.spec.transport, 'streamable-http')
  assert.equal(built.spec.headers.Authorization, 'Bearer t')
})

test('buildSpecFromRaw supports OpenCode command arrays and environment', () => {
  const built = buildSpecFromRaw({
    type: 'local',
    command: ['npx', '-y', 'pkg'],
    environment: { A: '1' },
    enabled: false,
  })
  assert.equal(built.spec.transport, 'stdio')
  assert.equal(built.spec.command, 'npx')
  assert.deepEqual(built.spec.args, ['-y', 'pkg'])
  assert.equal(built.spec.env.A, '1')
  assert.equal(built.enabled, false)
})

test('buildSpecFromRaw supports Zed command objects', () => {
  const built = buildSpecFromRaw({
    command: { path: 'npx', args: ['-y', 'pkg'], env: { A: '1' } },
  })
  assert.equal(built.spec.command, 'npx')
  assert.deepEqual(built.spec.args, ['-y', 'pkg'])
  assert.equal(built.spec.env.A, '1')
})

test('buildSpecFromRaw refuses SSE and records why', () => {
  const built = buildSpecFromRaw({ type: 'sse', url: 'https://example.com/sse' })
  assert.equal(built.spec, null)
  assert.equal(built.unsupported, 'sse')
})

test('buildSpecFromRaw resolves a relative cwd against the config directory', () => {
  const built = buildSpecFromRaw({ command: 'node', args: ['server.mjs'], cwd: '.' }, { baseDir: '/tmp/project' })
  assert.equal(built.spec.cwd, '/tmp/project')
})

test('buildSpecFromRaw reports missing env_vars but keeps the entry', () => {
  const saved = process.env.MCP_CONFIG_TEST_ENV
  delete process.env.MCP_CONFIG_TEST_ENV
  const built = buildSpecFromRaw({
    command: 'node',
    env_vars: ['MCP_CONFIG_TEST_ENV'],
  })
  assert.equal(built.spec.command, 'node')
  assert.deepEqual(built.warnings, ['env_vars-missing:MCP_CONFIG_TEST_ENV'])
  if (saved !== undefined) process.env.MCP_CONFIG_TEST_ENV = saved
})

test('normalizeManagedServer validates names and transports', () => {
  assert.throws(() => normalizeManagedServer({ name: 'bad name', transport: 'stdio', command: 'x' }), /invalid-name|Invalid MCP server name/)
  assert.throws(() => normalizeManagedServer({ name: 'ok', transport: 'stdio' }), /missing-command|needs a command/)
  assert.throws(() => normalizeManagedServer({ name: 'ok', transport: 'streamable-http', url: 'ftp://x' }), /missing-url|http/)
  assert.throws(() => normalizeManagedServer({ name: 'ok', transport: 'sse', url: 'https://x' }), /Unsupported MCP transport/)
})

test('toMcpClientConfig emits exactly the shipped client fields', () => {
  const stdio = normalizeManagedServer({
    name: 's',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { A: '1' },
    cwd: '/tmp',
    toolCallTimeoutMs: 1200,
    failOnStartupError: true,
  })
  assert.deepEqual(toMcpClientConfig(stdio), {
    serverName: 's',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { A: '1' },
    cwd: '/tmp',
    toolCallTimeoutMs: 1200,
    failOnStartupError: true,
  })
  const http = normalizeManagedServer({
    name: 'h',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { A: '1' },
  })
  assert.deepEqual(toMcpClientConfig(http), {
    serverName: 'h',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { A: '1' },
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
  })
})

test('readManagedServers reports malformed entries without losing valid ones', () => {
  const { servers, errors } = readManagedServers({
    servers: [
      { name: 'good', transport: 'stdio', command: 'npx' },
      { name: 'bad name', transport: 'stdio', command: 'npx' },
      { name: 'good', transport: 'stdio', command: 'other' },
      { name: 'http', transport: 'streamable-http', url: 'https://x/mcp' },
    ],
  })
  assert.equal(servers.length, 2)
  assert.equal(errors.length, 2)
  assert.match(errors[0].code, /invalid-name/)
  assert.match(errors[1].code, /duplicate-name/)
})

test('summarizeServer is stable for both transports', () => {
  assert.equal(summarizeServer({ transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }), 'npx -y pkg')
  assert.equal(summarizeServer({ transport: 'streamable-http', url: 'https://x/mcp', headers: {} }), 'https://x/mcp')
  assert.equal(
    summarizeServer({ transport: 'streamable-http', url: 'https://x/mcp', headers: { A: '1' } }),
    'https://x/mcp  ·  1 headers',
  )
})

test('buildSpecFromRaw maps external timeouts to tool-call milliseconds', () => {
  assert.equal(buildSpecFromRaw({ command: 'node', timeout: 60 }).spec.toolCallTimeoutMs, 60000)
  assert.equal(buildSpecFromRaw({ command: 'node', timeout: 60000 }).spec.toolCallTimeoutMs, 60000)
  assert.equal(buildSpecFromRaw({ command: 'node', toolCallTimeoutMs: 1200 }).spec.toolCallTimeoutMs, 1200)
  assert.equal(buildSpecFromRaw({ command: 'node', timeoutMs: 30000 }).spec.toolCallTimeoutMs, 30000)
  assert.equal(buildSpecFromRaw({ command: 'node' }).spec.toolCallTimeoutMs, undefined)
})
