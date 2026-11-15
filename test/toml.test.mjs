import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseToml } from '../lib/toml.js'

const CODEX = `# Codex-like configuration
notify = [
  "/Applications/Computer Use.app/Contents/MacOS/Client",
  "turn-ended",
]
model = "gpt-5.6-terra"

[features]
js_repl = false

[mcp_servers.node_repl]
args = []
command = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl"
env_vars = ["BROWSER_USE_ACCESS_EXECUTOR_ID", "BROWSER_USE_ACCESS_PIPE_PATH"]
startup_timeout_sec = 120

[mcp_servers.node_repl.env]
BROWSER_USE_ENABLED = "1"
TRUSTED = '{"browser": "/tmp/browser.mjs"}'

[mcp_servers.context7]
type = "stdio"
command = "npx"
args = [
  "-y",
  "@upstash/context7-mcp",
]

[mcp_servers."dot.name"]
url = "https://example.com/mcp"
headers = { Authorization = "Bearer t", X = "1" }

[[profiles]]
name = "one"

[[profiles]]
name = "two"

[ui]
note = """
line one
line two # not a comment
"""
`

test('parseToml reads tables, arrays, nested tables, and array-of-tables', () => {
  const doc = parseToml(CODEX)
  assert.equal(doc.model, 'gpt-5.6-terra')
  assert.deepEqual(doc.notify, ['/Applications/Computer Use.app/Contents/MacOS/Client', 'turn-ended'])
  assert.equal(doc.features.js_repl, false)
  assert.equal(doc.mcp_servers.node_repl.command, '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl')
  assert.deepEqual(doc.mcp_servers.node_repl.args, [])
  assert.deepEqual(doc.mcp_servers.node_repl.env_vars, ['BROWSER_USE_ACCESS_EXECUTOR_ID', 'BROWSER_USE_ACCESS_PIPE_PATH'])
  assert.equal(doc.mcp_servers.node_repl.startup_timeout_sec, 120)
  assert.equal(doc.mcp_servers.node_repl.env.BROWSER_USE_ENABLED, '1')
  assert.equal(doc.mcp_servers.node_repl.env.TRUSTED, '{"browser": "/tmp/browser.mjs"}')
  assert.deepEqual(doc.mcp_servers.context7.args, ['-y', '@upstash/context7-mcp'])
  assert.equal(doc.mcp_servers['dot.name'].url, 'https://example.com/mcp')
  assert.deepEqual(doc.mcp_servers['dot.name'].headers, { Authorization: 'Bearer t', X: '1' })
  assert.deepEqual(doc.profiles, [{ name: 'one' }, { name: 'two' }])
  assert.match(doc.ui.note, /line one\nline two # not a comment/)
})

test('parseToml handles comments and escapes', () => {
  const doc = parseToml(`
# top
url = "https://example.com/#fragment" # trailing
escaped = "a\\tb\\nc"
literal = 'C:\\Users\\name'
`)
  assert.equal(doc.url, 'https://example.com/#fragment')
  assert.equal(doc.escaped, 'a\tb\nc')
  assert.equal(doc.literal, 'C:\\Users\\name')
})

test('parseToml keeps dotted bare keys nested', () => {
  const doc = parseToml('[mcp_servers."a.b"]\ncommand = "node"\nenv.KEY = "v"\n')
  assert.equal(doc.mcp_servers['a.b'].command, 'node')
  assert.equal(doc.mcp_servers['a.b'].env.KEY, 'v')
})

test('parseToml tolerates empty input and unknown scalars', () => {
  assert.deepEqual(parseToml(''), {})
  const doc = parseToml('a = 2026-11-15\nb = +3\nc = 1_000\n')
  assert.equal(doc.a, '2026-11-15')
  assert.equal(doc.b, 3)
  assert.equal(doc.c, 1000)
})
