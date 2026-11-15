import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseJsonc, parseJsonLike } from '../lib/jsonc.js'

test('parseJsonc accepts comments and trailing commas', () => {
  const value = parseJsonc(`{
    // line comment
    "mcpServers": {
      "a": { "command": "npx", }, /* block comment */
    },
  }`)
  assert.equal(value.mcpServers.a.command, 'npx')
})

test('parseJsonc does not treat comment markers inside strings as comments', () => {
  const value = parseJsonc('{"url":"https://example.com/a//b","note":"/* keep */","list":[1,2,]}')
  assert.equal(value.url, 'https://example.com/a//b')
  assert.equal(value.note, '/* keep */')
  assert.deepEqual(value.list, [1, 2])
})

test('parseJsonc preserves escaped quotes and braces', () => {
  const value = parseJsonc('{"text":"a \\"quoted\\" } value","flag":true,}')
  assert.equal(value.text, 'a "quoted" } value')
  assert.equal(value.flag, true)
})

test('parseJsonc rejects genuinely malformed JSON', () => {
  assert.throws(() => parseJsonc('{"a": }'), SyntaxError)
})

test('parseJsonLike prefers plain JSON and falls back to JSONC', () => {
  assert.deepEqual(parseJsonLike('{"a":1}'), { a: 1 })
  assert.deepEqual(parseJsonLike('{/* c */"a":1,}'), { a: 1 })
})

test('parseJsonc strips a BOM', () => {
  assert.deepEqual(parseJsonc('\uFEFF{"a":1}'), { a: 1 })
})
