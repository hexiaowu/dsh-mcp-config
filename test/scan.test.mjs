import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { defaultSources, scanExternal } from '../lib/scan.js'

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'mcp-config-scan-'))
  const write = async (relative, content) => {
    const path = join(home, relative)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content, 'utf8')
  }
  return { home, write, cleanup: () => rm(home, { recursive: true, force: true }) }
}

test('scanExternal finds Claude global and project servers', async () => {
  const dir = await fixture()
  try {
    await dir.write('.claude.json', JSON.stringify({
      numStartups: 4,
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'], type: 'stdio' },
        remote: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer t' } },
      },
      projects: {
        '/Users/me/project': {
          mcpServers: {
            projectServer: { command: 'uvx', args: ['pkg'] },
          },
        },
      },
    }))
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    assert.equal(result.errors.length, 0)
    const global = result.groups.find((group) => group.id === 'claude-code::global')
    assert.ok(global)
    assert.equal(global.servers.length, 2)
    assert.equal(global.servers[0].transport, 'stdio')
    assert.equal(global.servers[1].transport, 'streamable-http')
    assert.match(global.servers[1].fingerprint, /https:\/\/example\.com\/mcp/)
    const project = result.groups.find((group) => group.id.startsWith('claude-code::project:'))
    assert.ok(project)
    assert.equal(project.servers[0].name, 'projectServer')
    assert.match(project.label, /project/)
  } finally {
    await dir.cleanup()
  }
})

test('scanExternal reads Codex TOML and keeps disabled/enablement state', async () => {
  const dir = await fixture()
  try {
    await dir.write('.codex/config.toml', `model = "x"

[mcp_servers.context7]
type = "stdio"
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.disabled]
command = "node"
args = []
enabled = false

[mcp_servers.remote]
url = "https://example.com/mcp"
`)
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    const codex = result.groups.find((group) => group.id === 'codex::default')
    assert.ok(codex)
    assert.equal(codex.servers.length, 3)
    assert.equal(codex.servers.find((server) => server.name === 'disabled').enabled, false)
    assert.equal(codex.servers.find((server) => server.name === 'remote').transport, 'streamable-http')
  } finally {
    await dir.cleanup()
  }
})

test('scanExternal reports JSONC configs and SSE entries', async () => {
  const dir = await fixture()
  try {
    await dir.write('.config/github-copilot/intellij/mcp.json', `{
      // comment
      "servers": {
        "local": { "type": "stdio", "command": "npx", "args": ["-y", "pkg"], },
        "legacy": { "type": "sse", "url": "https://example.com/sse" },
      },
    }`)
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    const copilot = result.groups.find((group) => group.id.startsWith('copilot-intellij'))
    assert.ok(copilot)
    assert.equal(copilot.servers.length, 2)
    assert.equal(copilot.servers.find((server) => server.name === 'legacy').unsupported, 'sse')
  } finally {
    await dir.cleanup()
  }
})

test('scanExternal records a parse failure but keeps scanning other files', async () => {
  const dir = await fixture()
  try {
    await dir.write('.cursor/mcp.json', '{ this is not json ')
    await dir.write('.gemini/settings.json', '{"mcpServers":{"ok":{"command":"node"}}}')
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    assert.ok(result.groups.some((group) => group.id === 'cursor::error' && typeof group.error === 'string'))
    assert.ok(result.groups.some((group) => group.id === 'gemini-cli::default' && group.servers.length === 1))
  } finally {
    await dir.cleanup()
  }
})

test('scanExternal skips files with an empty MCP map but counts them as checked', async () => {
  const dir = await fixture()
  try {
    await dir.write('.lingma/lingma_mcp.json', '{"mcpServers":{}}')
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    assert.equal(result.groups.length, 0)
    assert.ok(result.checkedFiles >= 1)
  } finally {
    await dir.cleanup()
  }
})

test('scanExternal flags unresolved placeholders and missing env_vars', async () => {
  const dir = await fixture()
  try {
    await dir.write('.gemini/settings.json', JSON.stringify({
      mcpServers: {
        templated: { command: 'npx', args: ['${input:token}'] },
      },
    }))
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    const gemini = result.groups.find((group) => group.id === 'gemini-cli::default')
    assert.ok(gemini.servers[0].warnings.some((warning) => warning === 'placeholder:${input:token}'))
  } finally {
    await dir.cleanup()
  }
})

test('defaultSources includes the common agent locations', () => {
  const ids = defaultSources({ home: '/Users/me', platform: 'darwin', env: {} }).map((source) => source.id)
  for (const expected of ['claude-code', 'claude-desktop', 'codex', 'gemini-cli', 'cursor', 'vscode', 'zed', 'opencode', 'zcode']) {
    assert.ok(ids.includes(expected), `missing source ${expected}`)
  }
})

test('scanExternal reads ZCode mcp.servers entries', async () => {
  const dir = await fixture()
  try {
    await dir.write('.zcode/cli/config.json', JSON.stringify({
      mcp: {
        servers: {
          'db-test': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@sakura0v0/any-db-mcp'],
            env: { DB_HOST: '127.0.0.1', DB_PASSWORD: 'secret' },
            timeoutMs: 60000,
          },
          'db-http': {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer t' },
          },
        },
      },
    }))
    const result = await scanExternal({ home: dir.home, platform: 'darwin', env: {} })
    const zcode = result.groups.find((group) => group.id === 'zcode::default')
    assert.ok(zcode)
    assert.equal(zcode.path, join(dir.home, '.zcode', 'cli', 'config.json'))
    assert.equal(zcode.servers.length, 2)
    const sql = zcode.servers.find((server) => server.name === 'db-test')
    assert.equal(sql.transport, 'stdio')
    assert.equal(sql.spec.env.DB_HOST, '127.0.0.1')
    assert.equal(sql.spec.toolCallTimeoutMs, 60000)
    assert.equal(zcode.servers.find((server) => server.name === 'db-http').transport, 'streamable-http')
  } finally {
    await dir.cleanup()
  }
})
